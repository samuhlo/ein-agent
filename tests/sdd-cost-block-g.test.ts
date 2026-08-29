// =============================================================================
// TESTS: bloque G — calibrar map/verify + recomendaciones del panel de modelos
//   El coste se movió de apply a map (222k) y verify (297k). Esas fases LEEN y
//   verifican; no diseñan. Corren a thinking medium por defecto; design y
//   orchestrator (que razonan) conservan más esfuerzo. El panel /ein:models
//   recomienda esfuerzo, nunca proveedor, modelo ni categoría de precio/calidad.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	AGENT_EFFORT_RECOMMENDATIONS,
	isEffortRecommendationGapLarge,
	withDefaultThinking,
} from "../ein-pi/agent/lib/model-config";

describe("G — thinking por defecto de map/verify (lee/verifica, no diseña)", () => {
	test("sin thinking en config → map y verify a medium; apply a low", () => {
		expect(withDefaultThinking("sdd-map", { model: "x" })).toEqual({ model: "x", thinking: "medium" });
		expect(withDefaultThinking("sdd-verify", undefined)).toEqual({ thinking: "medium" });
		expect(withDefaultThinking("sdd-apply", undefined)).toEqual({ thinking: "low" });
	});

	test("design y orchestrator NO se fijan (razonan → heredan la configuración activa)", () => {
		expect(withDefaultThinking("sdd-design", { model: "gpt" })).toEqual({ model: "gpt" });
		expect(withDefaultThinking("orchestrator", undefined)).toBeUndefined();
	});

	test("un thinking explícito del usuario gana sobre el default", () => {
		expect(withDefaultThinking("sdd-map", { model: "x", thinking: "high" })).toEqual({ model: "x", thinking: "high" });
	});
});

describe("G — recomendaciones del panel de modelos", () => {
	test("design/orchestrator recomiendan high", () => {
		expect(AGENT_EFFORT_RECOMMENDATIONS["sdd-design"]?.thinking).toBe("high");
		expect(AGENT_EFFORT_RECOMMENDATIONS.orchestrator?.thinking).toBe("high");
	});

	test("map/verify recomiendan medium y apply low", () => {
		expect(AGENT_EFFORT_RECOMMENDATIONS["sdd-map"]?.thinking).toBe("medium");
		expect(AGENT_EFFORT_RECOMMENDATIONS["sdd-verify"]?.thinking).toBe("medium");
		expect(AGENT_EFFORT_RECOMMENDATIONS["sdd-apply"]?.thinking).toBe("low");
	});

	test("las recomendaciones solo contienen esfuerzo y motivo", () => {
		for (const rec of Object.values(AGENT_EFFORT_RECOMMENDATIONS)) {
			expect(Object.keys(rec).sort()).toEqual(["reason", "thinking"]);
			expect(rec.reason.length).toBeGreaterThan(0);
		}
	});

	test("solo alerta desde dos niveles de distancia", () => {
		expect(isEffortRecommendationGapLarge(undefined, "high")).toBe(false);
		expect(isEffortRecommendationGapLarge("high", "high")).toBe(false);
		expect(isEffortRecommendationGapLarge("medium", "high")).toBe(false);
		expect(isEffortRecommendationGapLarge("high", "medium")).toBe(false);
		expect(isEffortRecommendationGapLarge("low", "high")).toBe(true);
		expect(isEffortRecommendationGapLarge("high", "low")).toBe(true);
		expect(isEffortRecommendationGapLarge("medium", "xhigh")).toBe(true);
	});
});
