// =============================================================================
// TESTS: contrato del flujo SDD por fases (router + gatekeeper + close)
// El orquestador debe enrutar por el router determinista, gatekeepear cada fase,
// y cerrar con close. Los tools deterministas deben estar cableados en ein-ai.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { specStateRemedy } from "../ein-pi/agent/lib/sdd-remedies.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
// Contenido portable (agents/, assets/, AGENTS.md) vive en runtime/; el
// adaptador Pi (lib/, extensions/) sigue en agent/.
const read = (p: string) =>
	readFileSync(join(p.startsWith("agents/") || p.startsWith("assets/") || p === "AGENTS.md" ? CORE : AGENT, p), "utf8");

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

	test("ein-scout es agente de apoyo, nunca una fase del router ni de la chain de 7", () => {
		const chain = readFileSync(join(AGENT, "chains/ein-sdd.chain.md"), "utf8");
		// scout SÍ puede aparecer en el orquestador como agente de investigación
		// de solo lectura (dieta de contexto: la exploración pesada se delega a
		// scout en vez de tragarla el padre). Lo que NUNCA debe pasar es que se
		// cuele como una de las siete fases SDD. El invariante fuerte (router no
		// lo conoce) lo blindan sdd-reconcile.test.ts (phaseForAgent → null) y
		// sdd-phase-runtime-contract.test.ts; aquí protegemos la secuencia y la chain.
		const sevenPhase = "scope → map → design → tasks → apply → verify → close";
		expect(orch).toContain(sevenPhase);
		expect(sevenPhase).not.toContain("scout");
		expect(chain).not.toMatch(/ein-scout/);
		expect(chain.match(/^## sdd-/gm)).toHaveLength(7);
	});

	test("conserva la chain como fallback (no como ruta primaria)", () => {
		expect(orch.toLowerCase()).toContain("fallback");
		expect(orch).toContain("ein-sdd` chain");
	});

	test("documenta sdd-next como traspaso manual sin sustituir el router interno", () => {
		expect(orch).toContain("/ein:sdd-next <change>");
		expect(orch).not.toContain("/ein:sdd-next <change> [--auto]");
		expect(orch).toContain("hands it to you as a user message");
		expect(orch).toContain("you still route with `ein_sdd_status`");
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

describe("sdd-scope: persisted-delta retry preflight", () => {
	const scope = read("agents/sdd-scope.md");

	test("valid persisted deltas are validated before every destructive retry path", () => {
		const preflight = scope.indexOf("## Persisted-delta preflight");
		expect(preflight).toBeGreaterThan(-1);

		const validation = scope.indexOf("validate the active canonical change's persisted delta", preflight);
		const preflightText = scope.slice(preflight);
		expect(validation).toBeGreaterThan(preflight);
		expect(preflightText).toContain("exact bytes");
		expect(preflightText).toContain("byte-for-byte");

		const destructiveOperationAnchors = [
			"spec_delta: none",
			"invoke `ein_openspec_delta_write`",
			"replace a persisted delta",
			"regenerate delta content",
		];
		for (const operation of destructiveOperationAnchors) {
			expect(scope.indexOf(operation)).toBeGreaterThan(validation);
		}
	});

	test("missing or invalid provenance keeps the existing fallback without repair instructions", () => {
		const fallback = scope.indexOf("Missing or invalid persisted-delta provenance");
		expect(fallback).toBeGreaterThan(-1);
		const fallbackText = scope.slice(fallback);
		expect(fallbackText).toMatch(/missing.*invalid/i);
		expect(fallbackText).toContain("existing validation and declaration path");
		expect(fallbackText).toContain(
			"MUST NOT define partial-delta preservation, repair, reconciliation, staging, or rollback behavior",
		);
	});

	test("the valid branch explicitly excludes none, replacement, and regeneration", () => {
		const preflight = scope.indexOf("## Persisted-delta preflight");
		const fallback = scope.indexOf("Missing or invalid persisted-delta provenance", preflight);
		const validBranch = scope.slice(preflight, fallback);

		expect(validBranch).toContain("MUST NOT declare `spec_delta: none`");
		expect(validBranch).toContain("MUST NOT replace a persisted delta");
		expect(validBranch).toContain("MUST NOT regenerate delta content");
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

	test("la política Engram canónica vive UNA vez en AGENTS.md", () => {
		const agentsMd = read("AGENTS.md");
		expect(agentsMd).toContain("Engram is optional, advisory, and untrusted");
		expect(agentsMd).toContain("Current filesystem, Git, ProjectState/stateRef, and OpenSpec evidence outrank memory");
		// La política cambió a un cuaderno único; el guard sigue el contrato nuevo.
		expect(agentsMd).toContain("ONE notebook shared by both runtimes");
		expect(agentsMd).toContain("actual operation result");
	});

	test("los agentes de fase ya no repiten la taxonomía E0/E1/E2", () => {
		for (const agent of agents) {
			expect(agent).not.toContain("## Notebook Contract");
			expect(agent).not.toContain("E2 adapter");
			expect(agent).not.toContain("E1 prompt advice do not prove retrieval");
		}
	});

	test("status y doctor son factuales, sin jerga E0/E2", () => {
		const presentation = read("extensions/internal/ein-sdd-presentation.ts");
		const doctor = read("extensions/ein-doctor.ts");
		expect(presentation).toContain("optional project notebook: Engram");
		expect(presentation).toContain("OpenSpec is the canonical full record");
		expect(doctor).not.toContain("E0");
		expect(doctor).toContain("configurado no prueba");
	});
});

describe("ein-ai: tools deterministas cableados", () => {
	const ai = [
		read("extensions/ein-ai.ts"),
		read("extensions/internal/ein-openspec-write-tools.ts"),
		read("extensions/internal/ein-sdd-read-surface.ts"),
	].join("\n");
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
		expect(ai).toContain('import { synchronizeOpenSpecFilesystem } from "../../lib/openspec-spec-sync-fs.ts";');
		expect(ai).toContain("synchronizeOpenSpecFilesystem(ctx.cwd, change)");
	});
	// `ok` describe el RESULTADO, no que el tool corriera. Un conflicto devolvía
	// `ok: true`: el cierre lo seguía bloqueando, pero un consumidor automático
	// que solo mire `ok` concluiría que la sincronización terminó bien.
	test("un conflicto de specs NO se reporta como ok", () => {
		expect(ai).toContain('ok: plan.state !== "conflict"');
	});
	// Antes esto exigía que el PROMPT documentara la salida de cada estado. Ahora
	// la dice la herramienta con el estado en la mano, que es donde el dato ya
	// estaba calculado. El prompt solo conserva lo que no se deduce del estado:
	// que `force` nunca archiva sobre un conflicto.
	test("cada estado bloqueante de specs trae su salida, y nombra el comando real", () => {
		for (const state of ["pending", "unresolved", "conflict"] as const) {
			expect(specStateRemedy(state, "pi")).not.toBeNull();
			expect(specStateRemedy(state, "claude")).not.toBeNull();
		}
		expect(specStateRemedy("synchronized", "pi")).toBeNull();

		// El remedio nombra la herramienta de SU runtime: un "sincroniza" genérico
		// obliga a adivinar cuál, que es lo que la prosa ya evitaba.
		expect(specStateRemedy("pending", "pi")?.fix).toContain("ein_openspec_sync");
		expect(specStateRemedy("pending", "claude")?.fix).toContain("ein-cc-sdd sync");

		expect(read("assets/orchestrator.md")).toContain("NUNCA archiva sobre un conflicto");
	});
	test("sdd-scope enseña a declarar el spec delta (nadie lo hacía)", () => {
		const scope = read("agents/sdd-scope.md");
		expect(scope).toContain("## Spec delta declaration");
		expect(scope).toContain("spec_delta: none");
		expect(scope).toContain("spec_delta_reason:");
	});
});

describe("adapter Pi: un solo iniciador de intención", () => {
	const ai = read("extensions/ein-ai.ts");

	test("el hook input arma y resuelve intención mediante el contrato compartido", () => {
		expect(ai).toContain("resolveSddIntentPreflight");
		expect(ai).toContain("await runPiIntentPreflight(event.text, ctx)");
		expect(ai).toContain('if (intent === "pending") return { action: "handled" }');
	});

	test("normal usa un único mensaje textual y no abre un modal paralelo", () => {
		expect(ai).toContain("outcome.interaction.text");
		expect(ai).not.toContain("ctx.ui.input");
		expect(ai).not.toContain("ctx.ui.confirm");
	});

	test("los hooks secundarios nunca inician interacción y bloquean construcción pendiente", () => {
		const beforeStart = ai.match(/pi\.on\("before_agent_start"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		const toolCall = ai.match(/pi\.on\("tool_call"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		expect(beforeStart).not.toContain("runPiIntentPreflight(");
		expect(beforeStart).not.toContain("runSddPreflight(ctx)");
		expect(beforeStart).toContain("adoptPiIntentGate");
		expect(beforeStart).toContain("piIntentGateDirective");
		expect(toolCall).not.toContain("runPiIntentPreflight(");
		expect(toolCall).toContain("adoptPiIntentGate");
		expect(toolCall).toContain("piIntentToolBlockReason");
	});
});

describe("sdd-init conserva el comando manual mediante el bootstrap compartido", () => {
	const init = read("extensions/sdd-init.ts");
	test("mantiene registro y distingue creación de preservación sin abrir otra interacción", () => {
		expect(init).toContain('pi.registerCommand("sdd-init"');
		expect(init).toContain('import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";');
		expect(init).toContain('result.kind === "preserved"');
		expect(init).toContain("Wrote openspec/config.yaml");
		expect(init).not.toContain("ensureSddPreflight");
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
