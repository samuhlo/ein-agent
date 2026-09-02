// =============================================================================
// EIN SDD CHANGE SETTINGS
// Owns the two filesystem-backed tools that declare how a change is driven:
// phase lane and TDD stance.
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	LANE_LABEL,
	laneSkips,
	normalizeLane,
	readChangeLane,
	writeChangeLane,
} from "../../lib/sdd-lane.ts";
import {
	changeStanceDirective,
	normalizeTddStance,
	readChangeStance,
	renderChangeStanceLine,
	writePreflightRecord,
} from "../../lib/sdd-preflight-record.ts";
import {
	changeUnavailableMessage,
	isSafeChangeName,
	resolveChangesDir,
	resolveSddStatus,
} from "../../lib/sdd-router.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

/** Register the lane and TDD stance tools for one SDD change. */
export function registerSddChangeSettings(
	registerEinTool: EinToolRegistrar,
): void {
	registerEinTool({
		name: "ein_sdd_lane",
		label: "Ein SDD Lane",
		description: "Declare or read how many phases a change is driven with. `standard` is the full seven; `micro` skips map and tasks for a genuinely small change, and skips NOTHING else — verify and close stay hard gates. Call it WITHOUT `lane` to read. The user decides the lane: there is no deterministic signal before planning, so never pick it on their behalf — ask when a change looks small. Reads and writes only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				lane: { type: "string", enum: ["micro", "standard"], description: "Omit to read the current lane without changing it." },
			},
		} as const,
		async execute(_id, params: { change?: string; lane?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change || !isSafeChangeName(change)) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "lane", params?.change) ?? "// sdd lane — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const changeDir = join(resolveChangesDir(ctx.cwd), change);
			if (!existsSync(changeDir)) {
				return { content: [{ type: "text", text: `// sdd lane — '${change}' no existe.` }], details: { ok: false, reason: "unknown change" } };
			}
			const requested = normalizeLane(params?.lane);
			if (requested) writeChangeLane(changeDir, requested);
			const lane = readChangeLane(changeDir);
			const skipped = laneSkips(lane);
			const detail = skipped.length
				? ` Se salta: ${skipped.join(", ")}. Verify y close siguen siendo puertas duras.`
				: "";
			return {
				content: [{ type: "text", text: `// sdd lane — '${change}': ${LANE_LABEL[lane]}.${detail}` }],
				details: { ok: true, change, lane, skipped },
			};
		},
	});

	registerEinTool({
		name: "ein_sdd_preflight",
		label: "Ein SDD Preflight",
		description: "Read (or record) how this change is driven: strict TDD stance and lane. Call it WITHOUT arguments to read the decision the preflight already stored — it is authoritative over `openspec/config.yaml` `strict_tdd`. A stance already decided is never replaced without `force`. Reads and writes only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				tdd: { type: "string", enum: ["off", "strict"], description: "Omit to read without deciding." },
				lane: { type: "string", enum: ["micro", "standard"], description: "Omit to leave the declared lane untouched." },
				force: { type: "boolean", description: "Replace a stance that was already decided." },
			},
		} as const,
		async execute(_id, params: { change?: string; tdd?: string; lane?: string; force?: boolean }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "preflight", params?.change) ?? "// sdd preflight — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const stance = readChangeStance(ctx.cwd, change);
			if (!stance) {
				return { content: [{ type: "text", text: `// sdd preflight — '${change}' no existe.` }], details: { ok: false, reason: "unknown change" } };
			}
			const requested = normalizeTddStance(params?.tdd);
			if (params?.tdd !== undefined && !requested) {
				return { content: [{ type: "text", text: `// sdd preflight — postura de TDD desconocida: ${JSON.stringify(params.tdd)}.` }], details: { ok: false, reason: "unknown stance" } };
			}
			if (requested) {
				if (stance.tdd && !params?.force) {
					return {
						content: [{ type: "text", text: `// sdd preflight — '${change}' ya decidido: TDD ${stance.tdd} (por ${stance.decidedBy ?? "pi"}). Usa force para reemplazarlo.` }],
						details: { ok: false, reason: "already decided", tdd: stance.tdd },
					};
				}
				writePreflightRecord(stance.changeDir, { tdd: requested, decidedBy: "pi" });
			}
			const lane = normalizeLane(params?.lane);
			if (lane) writeChangeLane(stance.changeDir, lane);
			const current = readChangeStance(ctx.cwd, change);
			const text = [
				`// sdd preflight — '${change}'`,
				renderChangeStanceLine(current),
				changeStanceDirective(current),
			].filter((part) => part.length > 0).join("\n");
			return {
				content: [{ type: "text", text }],
				details: { ok: true, change, tdd: current?.tdd ?? null, lane: current?.lane ?? "standard" },
			};
		},
	});
}
