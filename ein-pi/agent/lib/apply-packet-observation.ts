// =============================================================================
// APPLY PACKET OBSERVATION — borde vivo de E/S para el rollout report-only
// Lee una sola vez los artefactos actuales, los sella y deja toda decisión de
// compilación/validación en los módulos puros. Nunca escribe ni bloquea.
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compileApplyPacketV2 } from "./apply-packet-compile.ts";
import { validateApplyPacketV2 } from "./apply-packet.ts";
import { resolveChangesDir, resolveSddStatus } from "./sdd-router.ts";

export type { ApplyPacketObservation } from "./apply-packet-observation-record.ts";

import type { ApplyPacketObservation } from "./apply-packet-observation-record.ts";

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/** Observe el próximo grupo sin convertir incertidumbre en una elección. */
export function observeNextApplyPacket(cwd: string): ApplyPacketObservation {
	try {
		const status = resolveSddStatus(cwd);
		if (status.selection.kind === "ambiguous") {
			return {
				status: "unavailable",
				code: "ambiguous-change",
				detail: `hay ${status.selection.candidates.length} cambios activos; no se elige uno implícitamente`,
			};
		}
		if (!status.change) {
			return { status: "unavailable", code: "no-active-change", detail: "no hay un cambio SDD activo único" };
		}
		const group = status.tasks.nextPending?.groupTitle;
		if (!group) {
			return { status: "unavailable", code: "missing-group", detail: "la próxima tarea no pertenece a un grupo legible" };
		}

		const changeDir = join(resolveChangesDir(cwd), status.change);
		let designText: string;
		let tasksText: string;
		try {
			designText = readFileSync(join(changeDir, "design.md"), "utf8");
			tasksText = readFileSync(join(changeDir, "tasks.md"), "utf8");
		} catch (error) {
			return {
				status: "unavailable",
				code: "unreadable-artifact",
				detail: error instanceof Error ? error.message : String(error),
			};
		}

		const sources = { "design.md": sha256(designText), "tasks.md": sha256(tasksText) };
		const compiled = compileApplyPacketV2({
			change: status.change,
			designText,
			tasksText,
			groupTitle: group,
			sources,
		});
		if (!compiled.ok) {
			return {
				status: compiled.code === "invalid-edit-grammar" ? "rejected" : "unavailable",
				...(compiled.code === "invalid-edit-grammar"
					? { change: status.change, group, code: compiled.code, detail: compiled.detail, sources }
					: { code: "missing-group" as const, detail: compiled.detail }),
			} as ApplyPacketObservation;
		}

		const validation = validateApplyPacketV2(compiled.draft, sources);
		if (validation.ok) {
			return { status: "executable", change: status.change, group, packet: validation.packet };
		}
		if (validation.level === "incomplete") {
			return { status: "incomplete", change: status.change, group, sources, issues: validation.issues };
		}
		return {
			status: "rejected",
			change: status.change,
			group,
			code: validation.issues[0]?.code ?? "rejected",
			detail: validation.issues[0]?.detail ?? "packet rechazado",
			sources,
			issues: validation.issues,
		};
	} catch (error) {
		return {
			status: "unavailable",
			code: "unreadable-artifact",
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Una línea para la UI: enseña el estado sin volcar el packet al contexto. */
export function formatApplyPacketObservation(observation: ApplyPacketObservation): string {
	if (observation.status === "executable") {
		return `Apply packet v2: executable · ${observation.change}/${observation.group} · ${observation.packet.steps.length} paso(s) · ${observation.packet.writeAllowlist.length} ruta(s) escribible(s)`;
	}
	if (observation.status === "incomplete") {
		const issues = observation.issues.map((issue) => `${issue.code}:${issue.field}`).join(", ");
		return `Apply packet v2: incomplete · ${observation.change}/${observation.group} · ${issues}`;
	}
	if (observation.status === "rejected") {
		return `Apply packet v2: rejected · ${observation.change}/${observation.group} · ${observation.code}`;
	}
	return `Apply packet v2: unavailable · ${observation.code}`;
}
