import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { confirmCommand } from "../../lib/guardrails.ts";
import { evaluateStaging } from "../../lib/git-staging.ts";
import { maybeWrapBashInput } from "../../lib/hypa.ts";

// Ambient and explicit child extensions can coexist. Pi shares the event across
// handlers; evaluate an unchanged invocation once so a delivery grant is not
// consumed twice. A changed command or directory must be checked again.
const checked = new WeakMap<object, { command: string; cwd: string; result: Promise<ToolCallEventResult | undefined> }>();

export function guardChildCommand(event: ToolCallEvent, ctx: ExtensionContext): Promise<ToolCallEventResult | undefined> {
	if (event.toolName !== "bash" || typeof event.input.command !== "string") return Promise.resolve(undefined);
	const command = event.input.command;
	const previous = checked.get(event);
	if (previous?.command === command && previous.cwd === ctx.cwd) return previous.result;
	const result = (async () => {
		const guard = await confirmCommand(command, ctx);
		if (guard) return guard;
		const staging = evaluateStaging(ctx.cwd, command);
		return staging.kind === "blocked" ? { block: true, reason: staging.reason } : undefined;
	})();
	checked.set(event, { command, cwd: ctx.cwd, result });
	return result;
}

export default function commandGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		const guard = await guardChildCommand(event, ctx);
		if (guard) return guard;
		if (event.toolName === "bash" && typeof event.input.command === "string") {
			maybeWrapBashInput(event.input as { command: string }, ctx.cwd);
		}
	});
}
