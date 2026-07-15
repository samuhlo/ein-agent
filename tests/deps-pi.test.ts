// =============================================================================
// TESTS: installer deps — pi (agente subyacente)
// Fija el contrato: toda referencia al comando de instalación de pi nombra el
// paquete con scope. El `pi` pelado en npm es una librería matemática ajena
// cuyo bin pisa al agente y rompe `pi`; una pista truncada es un footgun.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDeps } from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";

const DEPS_SOURCE = readFileSync(join(import.meta.dir, "..", "installer", "src", "core", "deps.ts"), "utf8");
const SCOPED = "@earendil-works/pi-coding-agent";

describe("deps — pi siempre con scope", () => {
	const pi = checkDeps(detectPlatform()).find((d) => d.id === "pi");

	test("el hint de pi usa el paquete con scope, no el `pi` pelado", () => {
		expect(pi?.hint).toContain(SCOPED);
	});

	test("ninguna cadena de deps.ts sugiere `install -g pi` sin scope", () => {
		expect(DEPS_SOURCE).not.toContain("install -g pi");
		expect(DEPS_SOURCE).toContain(`install", "-g", "${SCOPED}`);
	});
});
