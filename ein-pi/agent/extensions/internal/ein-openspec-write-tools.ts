// =============================================================================
// EIN OPENSPEC WRITE TOOLS
// Owns deterministic delta creation and synchronization for the Pi surface.
// The underlying writers remain shared with Claude.
// =============================================================================

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { writeOpenSpecDelta } from "../../lib/openspec-delta-write.ts";
import { synchronizeOpenSpecFilesystem } from "../../lib/openspec-spec-sync-fs.ts";
import {
	changeUnavailableMessage,
	resolveSddStatus,
} from "../../lib/sdd-router.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

/** Register the two deterministic OpenSpec filesystem writers. */
export function registerOpenSpecWriteTools(
	registerEinTool: EinToolRegistrar,
): void {
	registerEinTool({
		name: "ein_openspec_sync",
		label: "Ein OpenSpec Sync",
		description: "Deterministically synchronize a change's OpenSpec deltas (openspec/changes/<change>/specs/<domain>/spec.md) into the canonical specs (openspec/specs/<domain>/spec.md) and publish sync-report.md. Idempotent: re-running with unchanged bytes reports 'already synchronized'. This is how a change leaves the `pending` spec state before close. Reads and writes only the filesystem; never commits.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
			},
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "sync", params?.change) ?? "// openspec sync — no active change.") }], details: { ok: false, reason: "no active change" } };
			}
			try {
				const { plan, changed } = await synchronizeOpenSpecFilesystem(ctx.cwd, change);
				const domains = plan.domains.map((domain) => domain.domain).join(", ") || "(ninguno)";
				const head = changed
					? `// openspec sync — '${change}': ${plan.state}. dominios: ${domains}.`
					: `// openspec sync — '${change}': ya sincronizado, sin cambios. dominios: ${domains}.`;
				const tail = plan.state === "conflict"
					? "\nCONFLICTO: los deltas se contradicen. Resuélvelo a mano; el cierre NO lo salta ni con force."
					: "\nsync-report.md publicado. `ein_sdd_status` ya puede dar el cambio por sincronizado.";
				return {
					content: [{ type: "text", text: `${head}${tail}` }],
					details: {
						ok: plan.state !== "conflict",
						state: plan.state,
						changed,
						domains: plan.domains.map((domain) => domain.domain),
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `// openspec sync — '${change}' FALLÓ: ${message}\nLos specs se restauraron a su estado previo salvo que el mensaje diga lo contrario.` }],
					details: { ok: false, reason: message },
				};
			}
		},
	});

	registerEinTool({
		name: "ein_openspec_delta_write",
		label: "Ein OpenSpec Delta Write",
		description: "Write a change's OpenSpec behaviour delta (openspec/changes/<change>/specs/<domain>/spec.md) from STRUCTURED operations — never hand-write the delta markdown. Serializes deterministically and re-parses with the strict grammar before writing; refuses (writes nothing) if the operations are malformed (e.g. requirement not starting with 'The system MUST/SHOULD/MAY', empty fields, duplicate scenario IDs, no operations). Operation order is irrelevant; output is sorted by scenario ID. Reads and writes only the filesystem; never commits.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				domain: { type: "string", description: "Canonical domain, kebab-case (e.g. scout-routing)." },
				operations: {
					type: "array",
					description: "Behaviour deltas. Each: kind ADDED|MODIFIED|REMOVED. ADDED/MODIFIED need `scenario` {id,title,requirement,given,when,then}; REMOVED needs `scenarioId` and `reason`.",
					items: {
						type: "object",
						properties: {
							kind: { type: "string", enum: ["ADDED", "MODIFIED", "REMOVED"] },
							scenario: {
								type: "object",
								properties: {
									id: { type: "string" },
									title: { type: "string" },
									requirement: { type: "string", description: "MUST begin with 'The system MUST', 'The system SHOULD', or 'The system MAY'." },
									given: { type: "string" },
									when: { type: "string" },
									then: { type: "string" },
								},
							},
							scenarioId: { type: "string" },
							reason: { type: "string" },
						},
						required: ["kind"],
					},
				},
			},
			required: ["domain", "operations"],
		} as const,
		async execute(_id, params: { change?: string; domain?: string; operations?: unknown[] }, _signal, _onUpdate, ctx: ExtensionContext) {
			const unavailable = changeUnavailableMessage(ctx.cwd, "delta", params?.change);
			if (unavailable) {
				return { content: [{ type: "text", text: unavailable }], details: { ok: false, reason: "no change selected" } };
			}
			const result = writeOpenSpecDelta({
				cwd: ctx.cwd,
				change: params?.change ?? resolveSddStatus(ctx.cwd).change ?? "",
				domain: params?.domain ?? "",
				operations: Array.isArray(params?.operations) ? params.operations : [],
			});
			if (!result.ok) {
				const text = result.code === "malformed"
					? `// openspec delta — RECHAZADO, no se escribió nada: ${result.reason}. Corrige las operaciones y reintenta; el delta se valida con la MISMA gramática que el sync.`
					: `// openspec delta — ${result.reason}.`;
				return { content: [{ type: "text", text }], details: { ok: false, reason: result.reason } };
			}
			return {
				content: [{ type: "text", text: `// openspec delta — '${result.change}': escrito openspec/changes/${result.change}/specs/${result.domain}/spec.md (${result.operations} operación(es), validado). No escribas la declaración spec_delta: none: el delta ES la declaración.` }],
				details: { ...result },
			};
		},
	});
}
