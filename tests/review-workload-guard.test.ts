// =============================================================================
// TESTS: Review Workload — forecast determinista vía tool
// =============================================================================
// El pathspec de exclusión vive en UN sitio (review-forecast.ts), ya no
// triplicado en prompts. El parent llama a `ein_review_forecast` en vez de
// ejecutar git inline; ein-git CONFÍA en el número reenviado y no re-mide.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewForecast } from "../ein-pi/agent/lib/review-forecast";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const einGit = readFileSync(join(CORE, "agents/ein-git.md"), "utf8");
const orchestrator = readFileSync(join(CORE, "assets/orchestrator.md"), "utf8");
const einAi = readFileSync(join(AGENT, "extensions/ein-ai.ts"), "utf8");
const { renderSddPreflightPrompt } = await import("../ein-pi/agent/lib/sdd-preflight");

const PREFS = {
	executionMode: "auto",
	memoryMode: "off",
	reviewBudgetLines: 400,
	tddMode: "off",
	engramAvailable: false,
	prompted: true,
} as const;

function git(cwd: string, ...args: string[]): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("reviewForecast — medición determinista", () => {
	test("cuenta producción y separa tests (el pathspec excluye *.test.*)", () => {
		const dir = mkdtempSync(join(tmpdir(), "review-forecast-"));
		try {
			git(dir, "init", "-q");
			git(dir, "config", "user.email", "t@t.t");
			git(dir, "config", "user.name", "t");
			writeFileSync(join(dir, "base.txt"), "base\n");
			git(dir, "add", "-A");
			git(dir, "commit", "-qm", "base");
			const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
			// 3 líneas de producción + 5 de test: las de test NO cuentan en producción.
			writeFileSync(join(dir, "feature.ts"), "a\nb\nc\n");
			writeFileSync(join(dir, "feature.test.ts"), "t1\nt2\nt3\nt4\nt5\n");
			git(dir, "add", "-A");
			git(dir, "commit", "-qm", "work");
			const f = reviewForecast(dir, base);
			expect(f.ok).toBe(true);
			expect(f.production).toBe(3);
			expect(f.tests).toBe(5);
			expect(f.range).toBe(`${base}..HEAD`);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fuera de un repo git → ok:false, no revienta", () => {
		const dir = mkdtempSync(join(tmpdir(), "review-forecast-nogit-"));
		try {
			expect(reviewForecast(dir, "main").ok).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("los ficheros bajo openspec/ NO cuentan como producción (ni como tests)", () => {
		const dir = mkdtempSync(join(tmpdir(), "review-forecast-openspec-"));
		try {
			git(dir, "init", "-q");
			git(dir, "config", "user.email", "t@t.t");
			git(dir, "config", "user.name", "t");
			writeFileSync(join(dir, "base.txt"), "base\n");
			git(dir, "add", "-A");
			git(dir, "commit", "-qm", "base");
			const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
			// 3 líneas de producción; el resto vive bajo openspec/ (config raíz + design anidado).
			writeFileSync(join(dir, "feature.ts"), "a\nb\nc\n");
			mkdirSync(join(dir, "openspec/changes/x"), { recursive: true });
			writeFileSync(join(dir, "openspec/config.yaml"), "mode: solo\n");
			writeFileSync(join(dir, "openspec/changes/x/design.md"), "# design\nlinea 2\nlinea 3\n");
			git(dir, "add", "-A");
			git(dir, "commit", "-qm", "work");
			const f = reviewForecast(dir, base);
			expect(f.ok).toBe(true);
			expect(f.production).toBe(3);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("el pathspec vive en UN sitio (anti-drift eliminado)", () => {
	test("los prompts ya NO llevan el pathspec ni el git diff inline", () => {
		const preflight = renderSddPreflightPrompt(PREFS);
		for (const text of [orchestrator, einGit, preflight]) {
			expect(text).not.toContain(":(exclude)*.test.*");
			expect(text).not.toContain("git diff --shortstat");
		}
	});

	test("el pathspec vive en review-forecast.ts", () => {
		expect(readFileSync(join(AGENT, "lib/review-forecast.ts"), "utf8")).toContain(":(exclude)*.test.*");
	});
});

describe("el parent llama la tool; ein-git confía en el número", () => {
	test("la tool ein_review_forecast está registrada", () => {
		expect(einAi).toContain('name: "ein_review_forecast"');
	});

	test("el orchestrator llama la tool (no ejecuta git) y pregunta antes de delegar", () => {
		expect(orchestrator).toContain("ein_review_forecast");
		expect(orchestrator).toContain("do NOT run `git diff` yourself");
		expect(orchestrator).toContain("ask_user_question");
		expect(orchestrator.toLowerCase()).toContain("production");
	});

	test("ein-git confía en el número reenviado, no re-mide", () => {
		expect(einGit).toContain("Review Workload Gate");
		expect(einGit).toContain("TRUST the forwarded number");
		expect(einGit).toContain("do NOT re-measure");
		expect(einGit).toContain("`auto` execution mode does **not** bypass this gate");
	});

	test("el preflight apunta a la tool con el budget", () => {
		const out = renderSddPreflightPrompt(PREFS);
		expect(out).toContain("ein_review_forecast");
		expect(out).toContain("400-line review budget");
	});
});
