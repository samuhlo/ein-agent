// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAdvisoryTools } from "./internal/ein-advisory-tools.ts";
import { registerGeneralCommands } from "./internal/ein-general-commands.ts";
import { registerAgentPromptHook } from "./internal/ein-agent-prompt-hook.ts";
import { registerDelegationResultHook } from "./internal/ein-delegation-results.ts";
import { createPiIntentGate } from "./internal/ein-pi-intent-gate.ts";
import { registerToolCallGate } from "./internal/ein-tool-call-gate.ts";
import { registerOpenSpecWriteTools } from "./internal/ein-openspec-write-tools.ts";
import { registerRuntimeCommands } from "./internal/ein-runtime-commands.ts";
import { registerSessionLifecycle } from "./internal/ein-session-lifecycle.ts";
import { registerSddLifecycleTools } from "./internal/ein-sdd-lifecycle-tools.ts";
import { registerSddChangeSettings } from "./internal/ein-sdd-change-settings.ts";
import { registerSddReadSurface } from "./internal/ein-sdd-read-surface.ts";
import { registerStatusCommands } from "./internal/ein-status-commands.ts";
import { createEinToolRegistrar } from "./internal/ein-tool-registration.ts";
import type { ScoutTracking } from "../lib/scout-contract.ts";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

const scoutTracking: ScoutTracking = new Map();

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	const intentGate = createPiIntentGate();
	const delegationResults = registerDelegationResultHook(pi, scoutTracking);
	const toolCallGate = registerToolCallGate(pi, {
		intentGate,
		scoutTracking,
		rememberPhaseSnapshot: delegationResults.rememberPhaseSnapshot,
	});
	const sessionLifecycle = registerSessionLifecycle(pi, {
		intentGate,
		scoutTracking,
		recordDeliveryIntent: toolCallGate.recordDeliveryIntent,
	});
	registerAgentPromptHook(pi, intentGate);
	registerRuntimeCommands(pi, sessionLifecycle.runSddPreflight);

	const registerEinTool = createEinToolRegistrar(pi);

	registerAdvisoryTools(registerEinTool);

	registerGeneralCommands(pi);

	registerSddReadSurface(pi, registerEinTool);

	registerSddChangeSettings(registerEinTool);

	registerOpenSpecWriteTools(registerEinTool);

	registerSddLifecycleTools(pi, registerEinTool);

	registerStatusCommands(pi);
}
