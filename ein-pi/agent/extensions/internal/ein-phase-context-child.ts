import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentPromptHook } from "./ein-agent-prompt-hook.ts";

// The same role-aware context builder serves foreground and ambient children.
export default function phaseContext(pi: ExtensionAPI): void {
	registerAgentPromptHook(pi);
}
