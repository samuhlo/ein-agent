import { applySavedModelConfig } from "../lib/model-config.ts";
import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";
import { ensureSddPreflight, installSddAssets } from "../lib/sdd-preflight.ts";
type ExtensionAPI = any;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("sdd-init", {
		description:
			"Auto-detect project stack and bootstrap openspec/config.yaml for SDD.",
		handler: async (_args: unknown, ctx: any) => {
			await ensureSddPreflight(ctx, {
				pi,
				installAssets: (cwd) => installSddAssets(cwd, false),
				applyModelConfig: () => applySavedModelConfig(ctx),
			});
			const result = bootstrapOpenSpecConfig(ctx.cwd);
			if (result.kind === "preserved") {
				ctx.ui.notify(
					"openspec/config.yaml already exists. Edit it manually or remove it before re-running /sdd-init.",
					"warning",
				);
				return;
			}

			const { detection } = result;
			const testSummary = detection.testCommand
				? `strict TDD enabled with \`${detection.testCommand}\``
				: "strict TDD disabled — no test runner detected (sdd-scope will fill it)";
			ctx.ui.notify(
				`Wrote openspec/config.yaml: package manager ${detection.packageManager || "unknown"}; ${testSummary}; commands from ${detection.source}.`,
				"info",
			);
		},
	});
}
