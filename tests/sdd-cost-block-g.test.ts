// =============================================================================
// TESTS: bloque G — calibrar map/verify + recomendaciones del panel de modelos
//   El coste se movió de apply a map (222k) y verify (297k). Esas fases LEEN y
//   verifican; no diseñan. Corren a thinking medium por defecto; design y
//   orchestrator (que razonan) se dejan capaces. El panel /ein:models muestra la
//   recomendación por agente para elegir sin memorizar la arquitectura.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { AGENT_RECOMMENDATIONS, withDefaultThinking } from "../ein-pi/agent/lib/model-config";

describe("G — thinking por defecto de map/verify (lee/verifica, no diseña)", () => {
	test("sin thinking en config → map y verify a medium; apply a low", () => {
		expect(withDefaultThinking("sdd-map", { model: "x" })).toEqual({ model: "x", thinking: "medium" });
		expect(withDefaultThinking("sdd-verify", undefined)).toEqual({ thinking: "medium" });
		expect(withDefaultThinking("sdd-apply", undefined)).toEqual({ thinking: "low" });
	});

	test("design y orchestrator NO se fijan (razonan → heredan el modelo capaz)", () => {
		expect(withDefaultThinking("sdd-design", { model: "gpt" })).toEqual({ model: "gpt" });
		expect(withDefaultThinking("orchestrator", undefined)).toBeUndefined();
	});

	test("un thinking explícito del usuario gana sobre el default", () => {
		expect(withDefaultThinking("sdd-map", { model: "x", thinking: "high" })).toEqual({ model: "x", thinking: "high" });
	});
});

describe("G — recomendaciones del panel de modelos", () => {
	test("design/orchestrator recomendados capaces + high (no abaratar la decisión)", () => {
		expect(AGENT_RECOMMENDATIONS["sdd-design"]).toMatchObject({ tier: "capable", thinking: "high" });
		expect(AGENT_RECOMMENDATIONS.orchestrator).toMatchObject({ tier: "capable", thinking: "high" });
	});

	test("map/verify recomendados baratos + medium; apply barato + low", () => {
		expect(AGENT_RECOMMENDATIONS["sdd-map"]).toMatchObject({ tier: "cheap", thinking: "medium" });
		expect(AGENT_RECOMMENDATIONS["sdd-verify"]).toMatchObject({ tier: "cheap", thinking: "medium" });
		expect(AGENT_RECOMMENDATIONS["sdd-apply"]).toMatchObject({ tier: "cheap", thinking: "low" });
	});

	test("toda recomendación trae un porqué no vacío", () => {
		for (const rec of Object.values(AGENT_RECOMMENDATIONS)) {
			expect(rec.reason.length).toBeGreaterThan(0);
		}
	});
});
