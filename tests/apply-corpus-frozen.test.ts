// =============================================================================
// TESTS: el corpus congelado en disco y su aislamiento del runtime
//   Dos garantías distintas: (1) `evals/apply-corpus.json` es reproducible desde
//   el árbol real, y (2) ninguna herramienta de fase lo consume. La segunda es
//   la que impide que el dato de evaluación se convierta en una segunda fuente
//   de estado.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildApplyCorpus, serializeApplyCorpus, applyCorpusDigest, APPLY_CORPUS_FORMAT } from "../ein-pi/agent/lib/apply-corpus";
import { collectArchivedFacts, resolveBaseCommit } from "../evals/build-corpus";

const ROOT = join(import.meta.dir, "..");
const FROZEN = join(ROOT, "evals", "apply-corpus.json");

// El mismo predicado para el escaneo real y para su triangulacion: si el test
// probara una copia del regex, probaria la copia.
function consumesCorpus(source: string): boolean {
	return /from\s+"[^"]*(?:apply-corpus|apply-packet)/.test(source) || source.includes("evals/apply-corpus.json");
}

function frozenText(): string {
	return readFileSync(FROZEN, "utf8");
}

describe("el corpus congelado describe el archivo real", () => {
	test("el fichero existe, con formato, commit base y recuentos coherentes", () => {
		const corpus = JSON.parse(frozenText());
		expect(corpus.format).toBe(APPLY_CORPUS_FORMAT);
		expect(corpus.baseCommit).toMatch(/^[0-9a-f]{7,40}$/);
		expect(corpus.items).toHaveLength(40);
		expect(corpus.exclusions).toHaveLength(16);
	});

	test("cada exclusion lleva un motivo declarado", () => {
		const corpus = JSON.parse(frozenText());
		const reasons = new Set(corpus.exclusions.map((exclusion: { reason: string }) => exclusion.reason));
		expect([...reasons].sort()).toEqual(["sin-commit", "sin-tasks", "solo-artefactos", "verify-sin-status"]);
		for (const exclusion of corpus.exclusions) {
			expect(typeof exclusion.change).toBe("string");
			expect(exclusion.reason.length).toBeGreaterThan(0);
		}
	});

	test("cada item lleva su verdad de git y su comando enfocado", () => {
		const corpus = JSON.parse(frozenText());
		for (const item of corpus.items) {
			expect(item.commit).toMatch(/^[0-9a-f]{7,40}$/);
			expect(item.outcome).toBe("pass");
			expect(item.focusedChecks.length).toBeGreaterThan(0);
			expect(item.groups).toBeGreaterThan(0);
			expect([...item.productionFiles, ...item.testFiles].length).toBeGreaterThan(0);
		}
	});

	test("regenerar desde el commit base produce los MISMOS bytes", () => {
		const { baseCommit } = JSON.parse(frozenText());
		const regenerated = serializeApplyCorpus(buildApplyCorpus(collectArchivedFacts(ROOT, baseCommit), baseCommit));
		expect(regenerated).toBe(frozenText());
	});

	test("archivar un cambio nuevo NO mueve el corpus congelado", () => {
		const { baseCommit } = JSON.parse(frozenText());
		// Este mismo cambio ya está en `openspec/changes/` del árbol de trabajo. Si
		// el recolector mirara el árbol en vez del commit base, aparecería aquí y el
		// congelado dejaria de serlo.
		const changes = collectArchivedFacts(ROOT, baseCommit).map((fact) => fact.change);
		expect(changes).not.toContain("freeze-apply-corpus-and-packet-schema");
		expect(changes).toHaveLength(56);
	});

	test("el digest del fichero congelado es estable", () => {
		const corpus = JSON.parse(frozenText());
		expect(applyCorpusDigest(corpus)).toBe(applyCorpusDigest(JSON.parse(frozenText())));
	});
});

describe("BLINDAJE: el corpus no es una segunda fuente de verdad", () => {
	test("ningun modulo de runtime importa el corpus ni el packet", async () => {
		const { Glob } = await import("bun");
		const owned = new Set([
			"ein-pi/agent/lib/apply-packet.ts",
			"ein-pi/agent/lib/apply-packet-compile.ts",
			"ein-pi/agent/lib/apply-corpus.ts",
		]);
		const offenders: string[] = [];

		for (const pattern of ["ein-pi/**/*.ts", "cc-ein/**/*.ts"]) {
			for await (const relative of new Glob(pattern).scan(ROOT)) {
				if (owned.has(relative)) continue;
				if (consumesCorpus(readFileSync(join(ROOT, relative), "utf8"))) offenders.push(relative);
			}
		}

		expect(offenders).toEqual([]);
	});
});

// ─── TRIANGULACIÓN ───────────────────────────────────────────────────────────

describe("TRIANGULATE: el escaneo detecta de verdad", () => {
	test("una importacion simulada seria detectada", () => {
		expect(consumesCorpus('import { x } from "./apply-corpus.ts";')).toBe(true);
		expect(consumesCorpus('import corpus from "../evals/apply-corpus.json";')).toBe(true);
		expect(consumesCorpus('const path = "evals/apply-corpus.json";')).toBe(true);
	});

	test("una mencion inocente no dispara falsos positivos", () => {
		expect(consumesCorpus('// el corpus de apply vive fuera del runtime')).toBe(false);
		expect(consumesCorpus('import { sha256 } from "./openspec-spec-contract.ts";')).toBe(false);
	});
});

describe("TRIANGULATE: bordes del recolector", () => {
	test("la abreviatura del commit congelado no depende de core.abbrev", () => {
		const dir = mkdtempSync(join(tmpdir(), "apply-corpus-abbrev-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
		try {
			git("init", "-q");
			git("config", "user.email", "tests@example.invalid");
			git("config", "user.name", "Ein tests");
			git("config", "core.abbrev", "8");
			const archive = join(dir, "openspec", "changes", "archive", "demo");
			mkdirSync(archive, { recursive: true });
			writeFileSync(join(archive, "summary.md"), "# Summary\n");
			writeFileSync(join(archive, "tasks.md"), "## Group\n- verify: bun test tests/demo.test.ts\n");
			writeFileSync(join(archive, "verify-report.md"), "status: pass\n");
			writeFileSync(join(dir, "demo.ts"), "export const demo = true;\n");
			git("add", ".");
			git("commit", "-qm", "archive demo");
			const fullCommit = git("rev-parse", "HEAD");

			expect(resolveBaseCommit(dir)).toBe(fullCommit.slice(0, 7));
			const [facts] = collectArchivedFacts(dir, fullCommit);
			expect(facts.deliveringCommits).toEqual([fullCommit.slice(0, 7)]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("un commit base inexistente devuelve cero hechos, no revienta", () => {
		expect(collectArchivedFacts(ROOT, "0000000")).toEqual([]);
	});

	test("quitarle el commit de entrega a un item real lo saca del corpus", () => {
		const { baseCommit } = JSON.parse(frozenText());
		const facts = collectArchivedFacts(ROOT, baseCommit);
		const incluido = buildApplyCorpus(facts, baseCommit).items[0].change;
		const mutilados = facts.map((fact) =>
			fact.change === incluido ? { ...fact, deliveringCommits: [] } : fact,
		);
		const corpus = buildApplyCorpus(mutilados, baseCommit);
		expect(corpus.items.map((item) => item.change)).not.toContain(incluido);
		expect(corpus.exclusions).toContainEqual({ change: incluido, reason: "sin-commit" });
	});
});
