import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const READ_TOOLS = ["read", "grep", "find"];

export default function scoutChild(pi: ExtensionAPI): void {
	pi.on("session_start", () => { pi.setActiveTools(READ_TOOLS); });
	pi.on("tool_call", (event) => {
		if (!READ_TOOLS.includes(event.toolName)) return { block: true, reason: "ein-scout is read-only: only read, grep, and find are allowed" };
		return undefined;
	});
}
