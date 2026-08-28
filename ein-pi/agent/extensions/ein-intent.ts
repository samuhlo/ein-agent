// =============================================================================
// ein-intent — superficie Pi del canal de intención (`/ein:intent`, `/ein:eh`)
// -----------------------------------------------------------------------------
// El protocolo entero vive en la skill `intent-channel` (SKILL.md); este
// extension es un despachador delgado: valida que el agente esté libre y
// inyecta el kickoff via `pi.sendUserMessage()` (precedente: ein-skill-registry.ts:505).
// =============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	CANONICAL_COMMANDS,
	EH_COMMAND,
	INTENT_COMMAND,
	buildEhKickoff,
	buildIntentKickoff,
	SKILL_NAME,
} from "../lib/intent-channel.ts";

export { CANONICAL_COMMANDS };

const BUSY_MESSAGE = `El agente está ocupado. Vuelve a lanzar el comando cuando termine (skill: ${SKILL_NAME}).`;

function guardIdleAndInject(
	pi: Pick<ExtensionAPI, "sendUserMessage">,
	ctx: Pick<ExtensionContext, "isIdle" | "ui">,
	kickoff: { text: string },
): void {
	if (!ctx.isIdle()) {
		ctx.ui.notify(BUSY_MESSAGE, "warning");
		return;
	}
	pi.sendUserMessage(kickoff.text);
}

export default function einIntent(pi: ExtensionAPI): void {
	pi.registerCommand(INTENT_COMMAND, {
		description: "Interroga la petición en rondas y cierra a disco en intent.md.",
		handler: async (_args, ctx: ExtensionContext): Promise<void> => {
			guardIdleAndInject(pi, ctx, buildIntentKickoff());
		},
	});

	pi.registerCommand(EH_COMMAND, {
		description: "Restata el último mensaje en lenguaje llano, sin actuar.",
		handler: async (_args, ctx: ExtensionContext): Promise<void> => {
			guardIdleAndInject(pi, ctx, buildEhKickoff());
		},
	});
}
