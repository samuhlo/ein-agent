import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOpenSpecDeltaTool } from "./ein-openspec-write-tools.ts";

// Foreground children load explicit providers, not the parent's extensions.
export default function scopeChild(pi: ExtensionAPI): void {
	registerOpenSpecDeltaTool((spec) => pi.registerTool(spec));
}
