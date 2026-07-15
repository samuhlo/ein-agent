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
