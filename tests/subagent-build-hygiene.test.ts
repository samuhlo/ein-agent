// =============================================================================
// TESTS: higiene de comandos pesados en subagentes (anti-regresión de prompt)
// El cuelgue: sdd-apply lanzó `bun run build 2>&1 | tail -60`. El pipe a tail
// RETIENE toda la salida hasta que el build termina → el runtime ve "no
// activity" y lo marca colgado. Fix: apply nunca corre un build de produccion
// como gate; la regla de streaming/timeout vive en apply y verify; el
// orquestador no le pide build al apply.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const sddApply = readFileSync(join(CORE, "agents/sdd-apply.md"), "utf8");
const sddVerify = readFileSync(join(CORE, "agents/sdd-verify.md"), "utf8");
const orchestrator = readFileSync(join(AGENT, "assets/orchestrator.md"), "utf8");

describe("sdd-apply no corre build de produccion como gate", () => {
	test("prohíbe explícitamente el build completo", () => {
		expect(sddApply).toContain("NEVER run a full production build");
		expect(sddApply).toContain("nuxt build");
	});

	test("regla anti-piping: no tuberiar comandos largos por tail/head", () => {
		expect(sddApply).toContain("Never pipe a long-running command");
		expect(sddApply).toContain("tail");
		expect(sddApply).toContain("timeout 120");
	});
});

describe("el orquestador no le pide build al apply", () => {
	test("verificación del apply = type-check + tests, no build", () => {
		expect(orchestrator).toContain("never a full production build");
		expect(orchestrator).toContain("bun run build");
	});
});

describe("sdd-verify (donde el build es legítimo) tiene higiene de comandos", () => {
	test("stream en vez de buffer + timeout + env del build", () => {
		expect(sddVerify).toContain("Stream, don't buffer");
		expect(sddVerify).toContain("timeout");
		expect(sddVerify).toContain("DATABASE_URL");
	});
});
