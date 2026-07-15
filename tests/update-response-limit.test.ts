// =============================================================================
// TESTS: límite de tamaño de respuesta del updater
// -----------------------------------------------------------------------------
// El asset descargado por `ein update` es un binario Bun standalone que empaqueta
// el runtime: las builds de Linux rondan los 90-95 MB. El cap de respuesta debe
// quedar MUY por encima o el update revienta en la descarga con "Response
// exceeds size limit" (con 64 MB, `ein update` nunca funcionó en Linux/darwin-x64).
// Este test ancla la intención: el cap cabe el binario real con holgura.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { updateCapsLimits } from "../installer/src/core/update-caps.ts";

const MB = 1024 * 1024;

describe("updateCapsLimits.MAX_RESPONSE_BYTES", () => {
	test("supera con holgura el binario Bun más grande (~95 MB hoy)", () => {
		// El linux-x64 pesaba ~91 MB; exige al menos 128 MB para dejar margen de
		// crecimiento sin volver a bloquear el update.
		expect(updateCapsLimits.MAX_RESPONSE_BYTES).toBeGreaterThanOrEqual(128 * MB);
	});

	test("sigue acotado (no ilimitado): rechaza una respuesta descomunal", () => {
		expect(updateCapsLimits.MAX_RESPONSE_BYTES).toBeLessThanOrEqual(1024 * MB);
	});
});

describe("timeouts del updater", () => {
	test("el asset (binario grande) tiene un timeout generoso, mayor que el de metadata", () => {
		// Bajar ~90 MB tarda ~40 s en buena red y minutos en mala: 15 s abortaba la
		// descarga. El del asset debe superar al de metadata y dar al menos ~2 min.
		expect(updateCapsLimits.ASSET_TIMEOUT_MS).toBeGreaterThan(updateCapsLimits.REQUEST_TIMEOUT_MS);
		expect(updateCapsLimits.ASSET_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
	});

	test("metadata falla rápido (deadline corto), pero no tanto como para cortar en redes lentas", () => {
		expect(updateCapsLimits.REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
		expect(updateCapsLimits.REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
	});
});
