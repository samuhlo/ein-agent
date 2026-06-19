// =============================================================================
// TESTS: lintDesignArtifact (P4 — guardrail determinista de design.md)
// Higiene del artefacto de planificacion: secciones A/B/C, tareas accionables,
// sin planificacion de delivery prohibida, sin placeholders, aviso de tamaño.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { lintDesignArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

const GOOD = `# design.md

## A. Proposal
- **Intent:** add X.
- **Scope:** only Y.

## B. Spec
- The system MUST do Z.

## C. Tasks
- [ ] Implement Z in foo.ts
- [ ] Add focused test
`;

describe("lintDesignArtifact", () => {
	test("un design completo pasa sin issues", () => {
		const r = lintDesignArtifact(GOOD);
		expect(r.ok).toBe(true);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBe(0);
	});

	test("vacio => error", () => {
		const r = lintDesignArtifact("   ");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "empty")).toBe(true);
	});

	test("falta una seccion obligatoria => error", () => {
		const noSpec = GOOD.replace("## B. Spec", "## B. Otra cosa");
		const r = lintDesignArtifact(noSpec);
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-spec")).toBe(true);
	});

	test("sin tareas accionables => error", () => {
		const noTasks = GOOD.replace(/- \[ \].*\n/g, "");
		const r = lintDesignArtifact(noTasks);
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "no-tasks")).toBe(true);
	});

	test("planificacion de delivery prohibida => warning (no bloquea)", () => {
		const withForecast = `${GOOD}\n## Review Workload Forecast\nchained PRs recommended.\n`;
		const r = lintDesignArtifact(withForecast);
		expect(r.ok).toBe(true); // warnings no rompen el ok
		expect(r.issues.some((i) => i.code === "forbidden-forecast")).toBe(true);
		expect(r.issues.some((i) => i.code === "forbidden-chained-pr")).toBe(true);
	});

	test("placeholders sin rellenar => warning", () => {
		const withPlaceholder = GOOD.replace("add X.", "add <number> things in {change}.");
		const r = lintDesignArtifact(withPlaceholder);
		expect(r.issues.some((i) => i.code === "placeholder-angle-number")).toBe(true);
		expect(r.issues.some((i) => i.code === "placeholder-change-token")).toBe(true);
	});

	test("oversize => warning con umbral configurable", () => {
		const big = `${GOOD}\n${"linea\n".repeat(50)}`;
		const r = lintDesignArtifact(big, { oversizeLineThreshold: 20 });
		expect(r.issues.some((i) => i.code === "oversize")).toBe(true);
		expect(r.lineCount).toBeGreaterThan(20);
	});
});
