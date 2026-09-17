import { describe, expect, test } from "bun:test";

import { parseVerificationReport } from "../shared/sdd/sdd-verification-outcome.ts";

describe("parseVerificationReport", () => {
	test("conserva un pass sano y los comandos exactos", () => {
		const parsed = parseVerificationReport([
			"# Verify",
			"status: pass",
			"behavior_coverage: verified",
			"required_check: {\"command\":\"bun test --filter x  \",\"exitCode\":0}",
			"## Notes",
			"A historical test failed before the fix.",
		].join("\r\n"));

		expect(parsed.outcome).toBe("pass");
		expect(parsed.status).toBe("pass");
		expect(parsed.coverage).toBe("verified");
		expect(parsed.requiredChecks).toEqual([{ command: "bun test --filter x  ", exitCode: 0 }]);
	});

	test("un fail global vence a un ejemplo pass posterior", () => {
		const parsed = parseVerificationReport([
			"# Verify",
			"status: fail",
			"behavior_coverage: verified",
			"## Example",
			"Example expected result: pass",
		].join("\n"));
		expect(parsed.outcome).toBe("fail");
		expect(parsed.status).toBe("fail");
	});

	test("un pass y un fail globales producen fail; dos pass producen unknown", () => {
		expect(parseVerificationReport("status: pass\nresult: fail\nbehavior_coverage: verified\n").outcome).toBe("fail");
		const duplicate = parseVerificationReport("status: pass\nresult: ok\nbehavior_coverage: verified\n");
		expect(duplicate.outcome).toBe("unknown");
		expect(duplicate.status).toBeNull();
		expect(duplicate.issues.map((issue) => issue.code)).toContain("duplicate-status");
	});

	test("ignora estados en fences anidados por longitud, citas, listas y tablas", () => {
		const report = [
			"# Verify",
			"status: pass",
			"behavior_coverage: n-a",
			"````md",
			"```",
			"status: fail",
			"```",
			"````",
			"> status: fail",
			"- status: fail",
			"| status: fail |",
			"## History",
			"result: fail",
		].join("\n");
		expect(parseVerificationReport(report).outcome).toBe("pass");
	});

	test("no interpreta frontmatter YAML como metadatos de verificación", () => {
		const parsed = parseVerificationReport([
			"---",
			"status: pass",
			"behavior_coverage: verified",
			"---",
			"# Verify",
			"status: fail",
			"behavior_coverage: verified",
		].join("\n"));
		expect(parsed.outcome).toBe("fail");
	});

	test("mantiene los alias globales admitidos", () => {
		expect(parseVerificationReport("Resultado = PASA\n").outcome).toBe("pass");
		expect(parseVerificationReport("result=FAILED\n").outcome).toBe("fail");
	});

	test("estado ausente o metadatos inválidos nunca pasan", () => {
		expect(parseVerificationReport("todo bien\nbehavior_coverage: verified\n").outcome).toBe("unknown");
		expect(parseVerificationReport("status: perhaps\nbehavior_coverage: verified\n").outcome).toBe("unknown");
		expect(parseVerificationReport("status: pass\nbehavior_coverage: quizá\n").outcome).toBe("unknown");
		expect(parseVerificationReport("status: pass\nbehavior_coverage: verified\nbehavior_coverage: verified\n").outcome).toBe("unknown");
	});

	for (const coverage of ["partial", "none"] as const) {
		test(`coverage ${coverage} impide pass`, () => {
			expect(parseVerificationReport(`status: pass\nbehavior_coverage: ${coverage}\n`).outcome).toBe("fail");
		});
	}

	test("checks nulo, no cero o roto impiden pass y explican el fallo", () => {
		const prefix = "status: pass\nbehavior_coverage: verified\n";
		for (const check of [
			"required_check: {\"command\":\"a\",\"exitCode\":null}",
			"- required_check: {\"command\":\"a\",\"exitCode\":2}",
			"required_check: nope",
		]) {
			const parsed = parseVerificationReport(`${prefix}${check}\n`);
			expect(parsed.outcome).toBe("fail");
			expect(parsed.issues.some((issue) => issue.code.includes("required-check"))).toBe(true);
		}
	});

	test("ignora required_check dentro de fences, citas y tablas", () => {
		const parsed = parseVerificationReport([
			"status: pass",
			"behavior_coverage: verified",
			"```json",
			"required_check: nope",
			"```",
			"> required_check: nope",
			"| required_check: nope |",
		].join("\n"));
		expect(parsed.outcome).toBe("pass");
	});

	test("palabras de fallo en prosa no inventan un veredicto", () => {
		expect(parseVerificationReport("A test failed yesterday.\n").outcome).toBe("unknown");
	});
});
