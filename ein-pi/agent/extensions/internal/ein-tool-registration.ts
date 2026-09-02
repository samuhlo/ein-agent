// =============================================================================
// EIN TOOL REGISTRATION
// Routes every Ein tool through the same compact human receipt while leaving
// model-facing content untouched.
// =============================================================================

import type {
	AgentToolResult,
	ExtensionAPI,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { GLYPH } from "../../lib/chrome.ts";
import { TOOL_LABELS, receiptFor } from "../../lib/tool-receipts.ts";

type ToolTheme = Readonly<{
	fg(token: string, text: string): string;
	bold(text: string): string;
}>;

function receiptCall(label: string, theme: ToolTheme): Text {
	return new Text(
		`${theme.fg("dim", `ein ${GLYPH.sep} `)}${theme.fg("toolTitle", label)}`,
		0,
		0,
	);
}

export function createEinToolRegistrar(pi: ExtensionAPI) {
	return (spec: Parameters<typeof pi.registerTool>[0]): void =>
		pi.registerTool({
			...spec,
			renderCall(_args: unknown, theme: ToolTheme): Text {
				return receiptCall(TOOL_LABELS[spec.name] ?? spec.name, theme);
			},
			renderResult(
				result: AgentToolResult<unknown>,
				{ expanded }: ToolRenderResultOptions,
				theme: ToolTheme,
			): Text {
				const receipt = receiptFor(spec.name, result.details);
				if (expanded) return new Text(theme.fg("toolOutput", receipt.detail.join("\n")), 0, 0);
				return new Text(
					theme.fg(receipt.bad ? "warning" : "dim", receipt.line),
					0,
					0,
				);
			},
		});
}

export type EinToolRegistrar = ReturnType<typeof createEinToolRegistrar>;
