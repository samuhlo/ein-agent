// =============================================================================
// TESTS: pertenencia y congelado del corpus de evaluación (`apply-corpus/v1`)
//   La pertenencia se CALCULA desde hechos comprobables. Una selección a mano no
//   es reproducible, y una exclusión sin motivo es un corpus que miente sobre su
//   cobertura.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	APPLY_CORPUS_FORMAT,
	type ArchivedChangeFacts,
	applyCorpusDigest,
	buildApplyCorpus,
	serializeApplyCorpus,
} from "../ein-pi/agent/lib/apply-corpus";

const TASKS = [
	"# Tasks — demo",
	"",
	"## // 001. Primer grupo",
	"",
	"- [x] 1.1 Hacer algo verificable.",
	"  - verify: `bun test tests/demo.test.ts`",
	"",
	"## // 002. Segundo grupo",
	"",
	"- [x] 2.1 Hacer otra cosa.",
	"  - verify: `bun test tests/otro.test.ts`",
	"",
].join("\n");

const VERIFY = "status: pass\n\n# Verify — demo\n";

const BASE = "abc1234";

function build(input: readonly ArchivedChangeFacts[]) {
	return buildApplyCorpus(input, BASE);
}

function facts(overrides: Partial<ArchivedChangeFacts> = {}): ArchivedChangeFacts {
	return {
		change: "demo",
		deliveringCommits: ["abc1234"],
		touchedFiles: ["ein-pi/agent/lib/demo.ts", "tests/demo.test.ts", "openspec/changes/archive/demo/summary.md"],
		tasksText: TASKS,
		verifyText: VERIFY,
		...overrides,
	};
}

describe("pertenencia calculada", () => {
	test("un cambio con los cuatro hechos entra, con su verdad de git", () => {
		const corpus = build([facts()]);
		expect(corpus.format).toBe(APPLY_CORPUS_FORMAT);
		expect(corpus.baseCommit).toBe(BASE);
		expect(corpus.exclusions).toEqual([]);
		expect(corpus.items).toHaveLength(1);
		const item = corpus.items[0];
		expect(item.change).toBe("demo");
		expect(item.commit).toBe("abc1234");
		expect(item.outcome).toBe("pass");
		expect(item.productionFiles).toEqual(["ein-pi/agent/lib/demo.ts"]);
		expect(item.testFiles).toEqual(["tests/demo.test.ts"]);
		expect(item.focusedChecks).toEqual(["bun test tests/demo.test.ts", "bun test tests/otro.test.ts"]);
		expect(item.groups).toBe(2);
	});

	test("el summary compacto aporta verificación y grupos sin conservar artefactos de fase", () => {
		const summary = [
			"status: complete",
			"work_groups: 2",
			"verification_status: pass",
			"- verify: `bun test tests/demo.test.ts`",
		].join("\n");
		const corpus = build([facts({ tasksText: summary, verifyText: summary })]);
		expect(corpus.exclusions).toEqual([]);
		expect(corpus.items[0]).toEqual(expect.objectContaining({
			groups: 2,
			focusedChecks: ["bun test tests/demo.test.ts"],
		}));
	});

	test("los artefactos de proceso no cuentan como ficheros tocados", () => {
		const corpus = build([facts()]);
		const item = corpus.items[0];
		expect([...item.productionFiles, ...item.testFiles]).not.toContain(
			"openspec/changes/archive/demo/summary.md",
		);
	});
});

describe("exclusiones, cada una con su motivo", () => {
	test("ningun commit de entrega → sin-commit", () => {
		const corpus = build([facts({ deliveringCommits: [] })]);
		expect(corpus.items).toEqual([]);
		expect(corpus.exclusions).toEqual([{ change: "demo", reason: "sin-commit" }]);
	});

	test("varios commits de entrega tampoco dan verdad unica → sin-commit", () => {
		const corpus = build([facts({ deliveringCommits: ["a1", "b2"] })]);
		expect(corpus.exclusions[0].reason).toBe("sin-commit");
	});

	test("commit que solo mueve artefactos → solo-artefactos", () => {
		const corpus = build([
			facts({ touchedFiles: ["openspec/changes/archive/demo/summary.md", "openspec/changes/archive/demo/tasks.md"] }),
		]);
		expect(corpus.exclusions[0].reason).toBe("solo-artefactos");
	});

	test("sin tasks.md, o con tasks.md sin comando enfocado → sin-tasks", () => {
		expect(build([facts({ tasksText: null })]).exclusions[0].reason).toBe("sin-tasks");
		expect(build([facts({ tasksText: "# Tasks\n\n- [x] 1.1 Algo.\n" })]).exclusions[0].reason).toBe("sin-tasks");
	});

	test("verify que no declara pass → verify-sin-status", () => {
		expect(build([facts({ verifyText: null })]).exclusions[0].reason).toBe("verify-sin-status");
		expect(build([facts({ verifyText: "# Verify\n" })]).exclusions[0].reason).toBe("verify-sin-status");
		expect(build([facts({ verifyText: "status: fail\n" })]).exclusions[0].reason).toBe("verify-sin-status");
	});

	test("FAIL CLOSED: se aplica el primer motivo, no se adivina el mejor", () => {
		const corpus = build([facts({ deliveringCommits: [], tasksText: null, verifyText: null })]);
		expect(corpus.exclusions).toEqual([{ change: "demo", reason: "sin-commit" }]);
	});
});

describe("congelado: mismos bytes en cada lectura", () => {
	test("dos serializaciones del mismo corpus son identicas", () => {
		const corpus = build([facts(), facts({ change: "otro" })]);
		expect(serializeApplyCorpus(corpus)).toBe(serializeApplyCorpus(corpus));
	});

	test("el orden de entrada no cambia el resultado", () => {
		const a = build([facts({ change: "zeta" }), facts({ change: "alfa" })]);
		const b = build([facts({ change: "alfa" }), facts({ change: "zeta" })]);
		expect(serializeApplyCorpus(a)).toBe(serializeApplyCorpus(b));
		expect(a.items.map((item) => item.change)).toEqual(["alfa", "zeta"]);
	});

	test("las exclusiones tambien van ordenadas", () => {
		const corpus = build([
			facts({ change: "zeta", tasksText: null }),
			facts({ change: "alfa", deliveringCommits: [] }),
		]);
		expect(corpus.exclusions.map((exclusion) => exclusion.change)).toEqual(["alfa", "zeta"]);
	});

	test("un corpus vacio es valido y estable", () => {
		const corpus = build([]);
		expect(corpus.items).toEqual([]);
		expect(serializeApplyCorpus(corpus)).toBe(serializeApplyCorpus(build([])));
	});

	test("cambiar un solo hecho cambia el digest", () => {
		const base = applyCorpusDigest(build([facts()]));
		const moved = applyCorpusDigest(build([facts({ deliveringCommits: ["otro999"] })]));
		expect(base).not.toBe(moved);
		expect(base).toBe(applyCorpusDigest(build([facts()])));
	});
});
