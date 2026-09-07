import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCleanerTools } from "./ein-advisory-tools.ts";
import { createEinToolRegistrar } from "./ein-tool-registration.ts";

export default function cleanerChild(pi: ExtensionAPI): void {
	registerCleanerTools(createEinToolRegistrar(pi));
}
