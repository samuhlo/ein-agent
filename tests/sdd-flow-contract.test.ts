// =============================================================================
// TESTS: contrato del flujo SDD por fases (router + gatekeeper + close)
// El orquestador debe enrutar por el router determinista, gatekeepear cada fase,
// y cerrar con close. Los tools deterministas deben estar cableados en ein-ai.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../ein-pi/core");
// Contenido portable (agents/, AGENTS.md) vive en core/; el runtime Pi
// (assets/, lib/, extensions/) sigue en agent/.
const read = (p: string) =>
	readFileSync(join(p.startsWith("agents/") || p === "AGENTS.md" ? CORE : AGENT, p), "utf8");

describe("orchestrator: flujo por fases determinista", () => {
	const orch = read("assets/orchestrator.md");

	test("enruta por ein_sdd_status, no por memoria", () => {
		expect(orch).toContain("ein_sdd_status");
		expect(orch.toLowerCase()).toContain("do not trust your memory");
	});

	test("gatekeepea cada fase con ein_sdd_check", () => {
		expect(orch).toContain("ein_sdd_check");
	});

	test("expone ein_sdd_close como tool model-callable (no solo comando) y veta el hack bun -e", () => {
		const ext = read("extensions/ein-ai.ts");
		expect(ext).toContain('name: "ein_sdd_close"');
		expect(orch).toContain("ein_sdd_close");
		expect(orch).toContain("NEVER shell out to the SDD libraries");
	});

	test("no usa sdd-map como explorador pre-SDD (fuga de artefacto)", () => {
		expect(orch).toContain("PHASE: it **writes `map.md`**");
		expect(orch).toContain("out-of-order artifact");
	});

	test("el gate pre-apply presenta un brief docente con qué se toca determinista", () => {
		expect(orch).toContain("present a short TEACHING brief");
		expect(orch).toContain("## // PLAN —");
		expect(orch).toContain("QUÉ SE TOCA");
		// La lista de ficheros viene del preview determinista, no de la paráfrasis.
		expect(orch).toContain("plan preview");
		expect(orch).toContain("MUST come from the deterministic preview");
	});

	test("incluye tasks y close en el flujo de 7", () => {
		expect(orch).toContain("scope → map → design → tasks → apply → verify → close");
	});

	test("conserva la chain como fallback (no como ruta primaria)", () => {
		expect(orch.toLowerCase()).toContain("fallback");
		expect(orch).toContain("ein-sdd` chain");
	});

	test("documenta sdd-next como ruta manual sin sustituir el router interno", () => {
		expect(orch).toContain("/ein:sdd-next <change> [--auto]");
		expect(orch).toContain("read-only slash command for humans");
		expect(orch).toContain("the orchestrator still routes with `ein_sdd_status`");
	});

	test("limita contexto canónico de scope/design a hints explícitos y referencias reutilizables", () => {
		const scope = read("agents/sdd-scope.md");
		const design = read("agents/sdd-design.md");
		expect(orch).toContain("canonical_spec_domains");
		expect(orch).toContain("3 files and 32 KiB UTF-8");
		expect(orch).toContain("design reuses those references");
		expect(scope).toContain("path`, SHA-256, and byte count");
		expect(design).toContain("Reuse the canonical spec references recorded in `scope.md`");
		expect(design).toContain("never truncate the selection");
	});

	test("entra en scope tras bootstrap sin debilitar los gates posteriores", () => {
		expect(orch).toContain("create-if-absent bootstrap");
		expect(orch).toContain("sdd-scope");
		expect((orch.match(/\| `sdd-scope` \|/g) ?? []).length).toBe(1);
		// Modo interactivo redefinido (Fase 3): planificación continua, UNA compuerta
		// antes de apply, verify/close automáticos si pasan pero STOP ante fallo.
		expect(orch).toContain("ONE human gate, before apply");
		expect(orch).toContain("single confirmation before the first `sdd-apply`");
		expect(orch).toContain("STOPS the flow with the exact cause");
	});

	test("enseña primero en lenguaje humano y conserva la profundidad técnica", () => {
		const agents = read("AGENTS.md");
		expect(agents).toContain("everyday human language");
		expect(agents).toContain("without software knowledge");
		expect(agents).toContain("never stack unexplained jargon or acronyms");
		expect(agents).toContain("Never infantilize the reader or lose technical correctness");
		expect(orch).toContain("**Human-first teaching.** Every answer, especially an important change");
		expect(orch).toContain("reconcile/supersede OpenSpec artifacts");
		expect(orch).toContain("guardar el trabajo terminado y apartar el plan antiguo");
		const human = orch.indexOf("EN LENGUAJE HUMANO:");
		const inside = orch.indexOf("POR DENTRO:");
		expect(human).toBeGreaterThan(-1);
		expect(inside).toBeGreaterThan(human);
	});
});

describe("contrato interno de notebook Engram", () => {
	const agents = [
		"agents/sdd-scope.md",
		"agents/sdd-map.md",
		"agents/sdd-design.md",
		"agents/sdd-tasks.md",
		"agents/sdd-apply.md",
		"agents/sdd-verify.md",
		"agents/sdd-close.md",
	].map(read);

	test("OpenSpec permanece como registro canonico y Engram es un cuaderno opcional", () => {
		const ai = read("extensions/ein-ai.ts");
		expect(ai).toContain("optional project notebook: Engram");
		expect(ai).toContain("OpenSpec is the canonical full record");
	});

	test("rechaza que E1 de prompt se haga pasar por E2", () => {
		const orch = read("assets/orchestrator.md");
		expect(orch).toContain("E0 means configured/diagnosable only");
		expect(orch).toContain("E1 means prompt/advice or tool availability only");
		expect(orch).toContain("E2 requires a named deterministic adapter invocation plus its truthful receipt");
		for (const agent of agents) {
			expect(agent).toContain("E1 prompt advice do not prove retrieval or persistence");
			expect(agent).toContain("must not claim deterministic retrieval or saving yourself");
		}
	});

	test("preflight, status y doctor no elevan disponibilidad E0 a E2", () => {
		const preflight = read("lib/sdd-preflight.ts");
		const ai = read("extensions/ein-ai.ts");
		const doctor = read("extensions/ein-doctor.ts");
		expect(preflight).toContain("OpenSpec: canonical full SDD record");
		expect(ai).toContain("configured; no retrieval or save is implied");
		expect(doctor).toContain("disponibilidad es solo E0; no prueba recuperación ni persistencia");
		expect(doctor).not.toContain("La memoria persiste en Engram");
	});
});

describe("ein-ai: tools deterministas cableados", () => {
	const ai = read("extensions/ein-ai.ts");
	test("registra ein_sdd_status y ein_sdd_check", () => {
		expect(ai).toContain('name: "ein_sdd_status"');
		expect(ai).toContain('name: "ein_sdd_check"');
	});
	test("registra los comandos sdd-status, sdd-next y sdd-close", () => {
		expect(ai).toContain('"ein:sdd-status"');
		expect(ai).toContain('"ein:sdd-next"');
		expect(ai).toContain('"ein:sdd-close"');
		expect(ai).not.toContain(`"ein:sdd-${"archive"}"`);
	});
	test("cablea el escape legacy con motivo auditado sin anunciar force como bypass", () => {
		expect(ai).toContain("legacyReason: reason");
		expect(ai).toContain('reason: { type: "string"');
		expect(ai).toContain('--force --reason "<audit reason>"');
		expect(ai).toContain("It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs.");
		expect(ai).toContain("Closed through legacy escape (spec state remained unresolved):");
		expect(ai).toContain("Verified change '${change}' closed.");
		expect(ai).not.toContain("Bypass the readiness guard");
	});
	test("prepara config antes de continuar el SDD solicitado", () => {
		expect(ai).toContain('import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";');
		expect(ai).toContain("bootstrapOpenSpecConfig(ctx.cwd)");
		expect(ai).toContain('return { action: "continue" };');
	});
	// BLINDAJE -> El motor de sincronización OpenSpec nació como CÓDIGO MUERTO:
	// existía, tenía tests, y no lo llamaba nadie en producción. El cierre exigía
	// `sync-report.md` y nada sabía generarlo, así que un cambio con deltas se
	// quedaba en `pending` para siempre. Un motor sin tool no es una feature.
	test("cablea el motor de sincronización OpenSpec a un tool invocable", () => {
		expect(ai).toContain('name: "ein_openspec_sync"');
		expect(ai).toContain('import { synchronizeOpenSpecFilesystem } from "../lib/openspec-spec-sync-fs.ts";');
		expect(ai).toContain("synchronizeOpenSpecFilesystem(ctx.cwd, change)");
	});
	// `ok` describe el RESULTADO, no que el tool corriera. Un conflicto devolvía
	// `ok: true`: el cierre lo seguía bloqueando, pero un consumidor automático
	// que solo mire `ok` concluiría que la sincronización terminó bien.
	test("un conflicto de specs NO se reporta como ok", () => {
		expect(ai).toContain('ok: plan.state !== "conflict"');
	});
	test("el orquestador sabe cómo desbloquear cada estado de specs", () => {
		const orch = read("assets/orchestrator.md");
		expect(orch).toContain("ein_openspec_sync");
		// Cada estado necesita una salida documentada; `conflict` es el único sin ella.
		for (const state of ["synchronized", "pending", "unresolved", "conflict"]) {
			expect(orch).toContain(state);
		}
		expect(orch).toContain("`force` will NOT archive over a conflict");
	});
	test("sdd-scope enseña a declarar el spec delta (nadie lo hacía)", () => {
		const scope = read("agents/sdd-scope.md");
		expect(scope).toContain("## Spec delta declaration");
		expect(scope).toContain("spec_delta: none");
		expect(scope).toContain("spec_delta_reason:");
	});
});

describe("sdd-init conserva el comando manual mediante el bootstrap compartido", () => {
	const init = read("extensions/sdd-init.ts");
	test("mantiene registro y distingue creación de preservación", () => {
		expect(init).toContain('pi.registerCommand("sdd-init"');
		expect(init).toContain('import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";');
		expect(init).toContain('result.kind === "preserved"');
		expect(init).toContain("Wrote openspec/config.yaml");
	});
});

describe("sdd-close agent existe (summary + índice EIN.md acotado)", () => {
	const close = read("agents/sdd-close.md");
	test("nombre y output primario", () => {
		expect(close).toContain("name: sdd-close");
		expect(close).toContain("summary.md");
	});
	test("no mueve ficheros (eso lo hace el parent determinista)", () => {
		expect(close.toLowerCase()).toContain("do not move or delete files");
	});
	test("edición secundaria acotada al ## Índice de EIN.md", () => {
		expect(close).toContain("## Índice");
		expect(close.toLowerCase()).toContain("never rewrite");
	});
});

describe("sdd-tasks agent existe y produce tasks.md", () => {
	const tasks = read("agents/sdd-tasks.md");
	test("nombre y contrato", () => {
		expect(tasks).toContain("name: sdd-tasks");
		expect(tasks).toContain("tasks.md");
		expect(tasks).toContain("status: ready | blocked");
	});
	test("no remapea ni edita source code", () => {
		expect(tasks.toLowerCase()).toContain("do not remap");
		expect(tasks.toLowerCase()).toContain("do not write or edit source code");
	});
});
