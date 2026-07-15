// =============================================================================
// TESTS: config del subagente — intercom bridge OFF para ejecutores EIN
// -----------------------------------------------------------------------------
// pi-subagents inyecta `contact_supervisor`/`intercom` por defecto
// (`intercomBridge.mode: "always"`), lo que permite a un ejecutor DESACOPLARSE
// del padre a mitad de run pidiendo una decisión — y el padre cae en polling con
// sleep esperándolo. Los agentes EIN deben devolver `status: blocked`, no
// separarse: por eso el bridge va apagado en el config, no solo pedido en el
// prompt (el runtime vence al prompt).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_PATH = join(
	import.meta.dir,
	"..",
	"ein-pi",
	"agent",
	"extensions",
	"subagent",
	"config.json",
);

describe("subagent intercom bridge", () => {
	const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
		intercomBridge?: { mode?: string };
		control?: { needsAttentionAfterMs?: number };
	};

	test("intercomBridge.mode está en 'off' (sin detach vía supervisor)", () => {
		expect(config.intercomBridge?.mode).toBe("off");
	});

	test("conserva el resto del control (needsAttentionAfterMs)", () => {
		expect(typeof config.control?.needsAttentionAfterMs).toBe("number");
	});
});
