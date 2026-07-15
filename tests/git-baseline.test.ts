// =============================================================================
// TESTS: git baseline del preflight
//   - parseRecentReset / renderGitBaselineLine son puros (sin repo).
//   - readGitBaseline se prueba contra un repo git REAL temporal: un
//     `reset --hard` debe aparecer como recentReset (el incidente de trabajo
//     huérfano que motivó el probe).
//   - renderSddPreflightPrompt inyecta la línea baseline solo si hay gitBaseline.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type GitBaseline,
	parseRecentReset,
	readGitBaseline,
	renderGitBaselineLine,
} from "../ein-pi/agent/lib/git-baseline";
import { renderSddPreflightPrompt } from "../ein-pi/agent/lib/sdd-preflight";

const RESET_LINE = "HEAD@{2026-07-07 17:14:53 +0200}\treset: moving to HEAD";
const COMMIT_LINE = "HEAD@{2026-07-07 17:20:00 +0200}\tcommit: feat x";
const CHECKOUT_LINE = "HEAD@{2026-07-07 17:10:00 +0200}\tcheckout: moving from a to b";

describe("parseRecentReset (puro)", () => {
	test("detecta el reset más reciente y extrae la fecha del selector", () => {
		const r = parseRecentReset([COMMIT_LINE, RESET_LINE].join("\n"));
		expect(r).not.toBeNull();
		expect(r?.action).toBe("reset: moving to HEAD");
		expect(r?.date).toBe("2026-07-07 17:14:53 +0200");
	});

	test("ignora `checkout` (cambiar de rama es rutina, no huérfana trabajo)", () => {
		expect(parseRecentReset([COMMIT_LINE, CHECKOUT_LINE].join("\n"))).toBeNull();
	});

	test("respeta la ventana de lookback (un reset viejo no cuenta)", () => {
		const reflog = [COMMIT_LINE, COMMIT_LINE, RESET_LINE].join("\n");
		expect(parseRecentReset(reflog, 2)).toBeNull();
		expect(parseRecentReset(reflog, 3)?.action).toContain("reset");
	});

	test("reflog vacío o sin tabs → null, sin explotar", () => {
		expect(parseRecentReset("")).toBeNull();
		expect(parseRecentReset("linea sin tab")).toBeNull();
	});
});

describe("renderGitBaselineLine (puro)", () => {
	const base: GitBaseline = { isRepo: true, dirty: false, stashes: 0, recentReset: null };

	test("sin repo → null (no ensucia el bloque)", () => {
		expect(renderGitBaselineLine({ ...base, isRepo: false })).toBeNull();
	});

	test("árbol limpio → línea sobria, sin WARNING", () => {
		const line = renderGitBaselineLine(base);
		expect(line).toContain("clean start");
		expect(line).not.toContain("INSPECT BEFORE MUTATING");
	});

	test("reset reciente → WARNING con directiva de parar y reconciliar", () => {
		const line = renderGitBaselineLine({
			...base,
			recentReset: { selector: "HEAD@{...}", action: "reset: moving to HEAD", date: "2026-07-07 17:14:53 +0200" },
		});
		expect(line).toContain("INSPECT BEFORE MUTATING");
		expect(line).toContain("ORPHAN");
		expect(line).toContain("git reflog");
	});

	test("stashes SIN reset → información, nunca WARNING (fin del falso positivo)", () => {
		const line = renderGitBaselineLine({ ...base, stashes: 2 });
		expect(line).not.toContain("INSPECT BEFORE MUTATING");
		expect(line).toContain("clean start");
		expect(line).toContain("2 stash entries present");
		expect(line).toContain("informational only");
	});

	test("reset + stashes → WARNING (por el reset), con los stashes como nota", () => {
		const line = renderGitBaselineLine({
			...base,
			stashes: 1,
			recentReset: { selector: "HEAD@{x}", action: "reset: moving to HEAD" },
		});
		expect(line).toContain("INSPECT BEFORE MUTATING");
		expect(line).toContain("1 stash entry present");
	});
});

describe("readGitBaseline (repo real)", () => {
	let dir: string;
	function g(args: string[]): void {
		execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
	}
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "git-baseline-"));
		g(["init", "-q"]);
		g(["config", "user.email", "t@t.dev"]);
		g(["config", "user.name", "t"]);
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	test("dir sin git → isRepo false, baseline vacío", () => {
		const empty = mkdtempSync(join(tmpdir(), "no-git-"));
		try {
			const b = readGitBaseline(empty);
			expect(b.isRepo).toBe(false);
			expect(b.recentReset).toBeNull();
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	test("repo recién commiteado, sin reset → recentReset null", () => {
		writeFileSync(join(dir, "a.txt"), "a");
		g(["add", "."]);
		g(["commit", "-qm", "a"]);
		const b = readGitBaseline(dir);
		expect(b.isRepo).toBe(true);
		expect(b.recentReset).toBeNull();
	});

	test("un `reset --hard` aparece como recentReset (el incidente)", () => {
		writeFileSync(join(dir, "a.txt"), "a");
		g(["add", "."]);
		g(["commit", "-qm", "a"]);
		writeFileSync(join(dir, "b.txt"), "b");
		g(["add", "."]);
		g(["commit", "-qm", "b"]);
		g(["reset", "--hard", "HEAD~1"]);
		const b = readGitBaseline(dir);
		expect(b.recentReset).not.toBeNull();
		expect(b.recentReset?.action).toMatch(/reset/i);
	});
});

describe("integración con el preflight", () => {
	const PREFS = {
		executionMode: "auto",
		memoryMode: "off",
		chainedPrStrategy: "auto-forecast",
		reviewBudgetLines: 400,
		tddMode: "off",
		engramAvailable: false,
		prompted: true,
	} as const;

	test("sin gitBaseline → no se inyecta la línea (compat)", () => {
		expect(renderSddPreflightPrompt(PREFS)).not.toContain("Working-tree baseline");
	});

	test("con gitBaseline de reset → el bloque incluye el WARNING", () => {
		const out = renderSddPreflightPrompt({
			...PREFS,
			gitBaseline: {
				isRepo: true,
				dirty: false,
				stashes: 0,
				recentReset: { selector: "HEAD@{x}", action: "reset: moving to HEAD" },
			},
		});
		expect(out).toContain("Working-tree baseline");
		expect(out).toContain("INSPECT BEFORE MUTATING");
	});

	test("includeBaseline:false → el baseline NO llega (ejecutores SDD)", () => {
		const out = renderSddPreflightPrompt(
			{
				...PREFS,
				gitBaseline: {
					isRepo: true,
					dirty: false,
					stashes: 0,
					recentReset: { selector: "HEAD@{x}", action: "reset: moving to HEAD" },
				},
			},
			{ includeBaseline: false },
		);
		expect(out).not.toContain("Working-tree baseline");
		expect(out).toContain("## SDD Session Preflight");
	});
});
