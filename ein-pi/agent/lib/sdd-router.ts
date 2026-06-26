// =============================================================================
// SDD ROUTER (deterministic state)
// Calcula en qué punto está un cambio SDD leyendo SOLO el filesystem — cero IA,
// cero inferencia de texto. El orquestador enruta por esto en vez de fiarse de
// lo que el modelo crea recordar. Análogo al dispatcher en Go de gentle-ai,
// pero como módulo TS puro expuesto luego como tool de Pi.
//
// Artefactos por fase (ver chains/ein-sdd.chain.md):
//   init → init.md · explore → exploration.md · design → design.md
//   apply → apply-progress.md · verify → verify-report.md · archive → summary.md
// Un cambio terminado se mueve a openspec/changes/archive/<change>/ (ver
// lib/sdd-archive.ts), así que `openspec/changes/` solo contiene cambios vivos.
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SddPhase = "init" | "explore" | "design" | "apply" | "verify" | "archive";
export type SddNext = SddPhase | "done";
export type VerifyOutcome = "pass" | "fail" | "unknown" | "absent";

export type SddChangeStatus = {
	change: string | null;
	present: Record<SddPhase, boolean>;
	verify: VerifyOutcome;
	nextRecommended: SddNext;
	blocked: string[];
};

// Fase → fichero que la marca como hecha.
const PHASE_ARTIFACT: Record<SddPhase, string> = {
	init: "init.md",
	explore: "exploration.md",
	design: "design.md",
	apply: "apply-progress.md",
	verify: "verify-report.md",
	archive: "summary.md",
};

function changesDir(cwd: string): string {
	return join(cwd, "openspec", "changes");
}

// Cambios activos = subdirectorios de openspec/changes/ excepto `archive/`.
export function listActiveChanges(cwd: string): string[] {
	const dir = changesDir(cwd);
	if (!existsSync(dir)) return [];
	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const out: string[] = [];
	for (const entry of entries) {
		if (entry === "archive") continue;
		try {
			if (statSync(join(dir, entry)).isDirectory()) out.push(entry);
		} catch {
			// ignorar entradas ilegibles
		}
	}
	return out.sort();
}

function readVerifyOutcome(changePath: string): VerifyOutcome {
	const path = join(changePath, PHASE_ARTIFACT.verify);
	if (!existsSync(path)) return "absent";
	let content = "";
	try {
		content = readFileSync(path, "utf8").toLowerCase();
	} catch {
		return "unknown";
	}
	// Busca una línea explícita `status: pass|fail` (o "result: ...").
	const match = content.match(/\b(?:status|result|resultado)\s*[:=]\s*(pass|fail|passed|failed|ok|pasa|falla)\b/);
	if (match) {
		return /pass|passed|ok|pasa/.test(match[1]) ? "pass" : "fail";
	}
	// Heurística suave: marcas claras de fallo sin línea de status.
	if (/\bfail\b|\bfailed\b|\bcritical\b|\bblocker\b/.test(content)) return "fail";
	return "unknown";
}

// Estado determinista de UN cambio. Si no se pasa `change`, usa el único activo
// (o el primero alfabético si hay varios; el caller decide si desambiguar).
export function resolveSddStatus(cwd: string, change?: string): SddChangeStatus {
	const active = listActiveChanges(cwd);
	const target = change ?? active[0] ?? null;

	const present: Record<SddPhase, boolean> = {
		init: false,
		explore: false,
		design: false,
		apply: false,
		verify: false,
		archive: false,
	};
	const blocked: string[] = [];

	if (!target) {
		return { change: null, present, verify: "absent", nextRecommended: "done", blocked };
	}

	const changePath = join(changesDir(cwd), target);
	for (const phase of Object.keys(present) as SddPhase[]) {
		present[phase] = existsSync(join(changePath, PHASE_ARTIFACT[phase]));
	}

	const verify = readVerifyOutcome(changePath);

	// Siguiente fase: la primera no presente en orden, con la verificación como
	// gate antes de archivar.
	let nextRecommended: SddNext;
	if (!present.init) nextRecommended = "init";
	else if (!present.explore) nextRecommended = "explore";
	else if (!present.design) nextRecommended = "design";
	else if (!present.apply) nextRecommended = "apply";
	else if (!present.verify) nextRecommended = "verify";
	else if (verify === "fail") {
		nextRecommended = "verify";
		blocked.push("verify-report indica fallo: remediar antes de archivar.");
	} else if (verify === "pass") nextRecommended = "archive";
	else {
		// verify presente pero sin status legible → re-verificar para refrescar evidencia.
		nextRecommended = "verify";
		blocked.push("verify-report sin línea `status: pass|fail` clara.");
	}

	return { change: target, present, verify, nextRecommended, blocked };
}
