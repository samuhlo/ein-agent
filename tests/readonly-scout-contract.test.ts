import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acceptTrackedScoutResult, normalizeScoutLaunch, SCOUT_REPORT_MAX_BYTES, validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";
import { scoutStaticContract } from "../ein-pi/agent/extensions/ein-doctor.ts";
const SCOUT_FRONTMATTER = join(import.meta.dir, "../runtime/agents/ein-scout.md");
const SCOUT_SPEC = join(import.meta.dir, "../openspec/specs/scout-routing/spec.md");

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "ein-scout-"));
	writeFileSync(join(root, "evidence.ts"), "one\ntwo\nthree\n");
	return root;
}
function report(overrides: Record<string, unknown> = {}) {
	return { version: "ein-scout-report/v1", summary: "Evidence found", summaryReferenceIds: ["R1"], findings: [{ claim: "The file has three lines", referenceIds: ["R1"] }], references: [{ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "lines 1 through 3" }], uncertainties: [{ level: "none", statement: "No uncertainty for this narrow observation." }], ...overrides };
}

describe("readonly scout launch contract", () => {
	test("overwrites caller controls with the exact direct foreground contract", () => {
		const tracked = new Map<string, string>();
		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", context: "fork", extensions: ["leak"], maxRuntimeMs: 1, turnBudget: { maxTurns: 99 }, toolBudget: { hard: 99 }, acceptance: { level: "verified" } }, "call-1", tracked)!;
		expect(launch.context).toBe("fresh");
		expect(launch).not.toHaveProperty("extensions");
		expect(launch.maxRuntimeMs).toBe(120000);
		expect(launch.turnBudget).toEqual({ maxTurns: 12, graceTurns: 2 });
		expect(launch.toolBudget).toEqual({ hard: 30, soft: 24, block: "*" });
		expect(launch).not.toHaveProperty("outputSchema");
		expect(launch.acceptance).toEqual({ level: "none", reason: "Ein validates the scout report through its deterministic local adapter" });
		expect(tracked.has("call-1")).toBe(true);
	});

	test("blocks alternate invocation forms before tracking", () => {
		for (const input of [{ agent: "ein-scout", chain: [] }, { agent: "ein-scout", tasks: [] }, { agent: "ein-scout", background: true }, { agent: "ein-scout", resume: "x" }, { agent: "ein-scout", parallel: true }]) {
			expect(() => normalizeScoutLaunch(input, "call", new Map())).toThrow("unsupported");
		}
		expect(normalizeScoutLaunch({ agent: "other" }, "call", new Map())).toBeUndefined();
	});

	test("uses canonical empty frontmatter and rejects caller extension overrides", () => {
		const scout = readFileSync(SCOUT_FRONTMATTER, "utf8");
		expect(scout).toMatch(/^extensions:\s*$/m);

		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", extensions: ["leak"] }, "call-extensions", new Map())!;
		expect(launch).not.toHaveProperty("extensions");
	});

	test("keeps the defined blank extensions declaration canonical and doctor-readable", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-scout-doctor-"));
		try {
			const agentsDir = join(root, "agents");
			const source = readFileSync(SCOUT_FRONTMATTER, "utf8");
			const launcherSource = 'input.extensions !== undefined\nargs.push("--no-extensions")\n';
			mkdirSync(agentsDir);
			writeFileSync(join(agentsDir, "ein-scout.md"), source);

			expect(readFileSync(SCOUT_SPEC, "utf8")).toContain("defined but blank `extensions:`");
			expect(scoutStaticContract(agentsDir, launcherSource).extensions).toBe(true);

			writeFileSync(join(agentsDir, "ein-scout.md"), source.replace(/^extensions:\s*$/m, "extensions: []"));
			expect(scoutStaticContract(agentsDir, launcherSource).extensions).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// R4. La puerta "un scout pendiente por turno" se retira. Su causa declarada
	// ("un reporte se ata a una tool call, no sé de qué hijo es") dejó de ser
	// cierta: el runtime devuelve un SingleResult por hijo dentro de
	// `details.results[]` (`sdd-participants.ts:159-172`).
	test("R4: un segundo scout en el mismo turno ya no se rechaza", () => {
		const tracked = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked);
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect B" }, "call-2", tracked)).not.toThrow();
	});

	test("R4: acepta el fan-out en workflowScript y lo deja en foreground", () => {
		const script = 'runs.all([{ agent: "ein-scout", task: "angulo A" }, { agent: "ein-scout", task: "angulo B" }])';
		const launch = normalizeScoutLaunch({ workflowScript: script }, "call-fanout", new Map())!;
		expect(launch.async).toBe(false);
		expect(launch.context).toBe("fresh");
		// En forma script el agente vive DENTRO del script: escribirlo arriba no
		// lanzaría nada.
		expect(launch).not.toHaveProperty("agent");
	});

	test("does not reject a relaunch that reuses the same toolCallId (R6, idempotent re-normalization)", () => {
		const tracked = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked);
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked)).not.toThrow();
	});

	test("forces async: false on the direct form too (R7)", () => {
		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect" }, "call-direct", new Map())!;
		expect(launch.async).toBe(false);
	});

	// Cinturón y tirantes. Forzar el foreground mutando el input del hook es UNA
	// vía; el runtime lee `async` del frontmatter por su cuenta. Si la mutación
	// no llegara, el lanzamiento seguiría siendo foreground en vez de irse a
	// background y perder el reporte, que es el fallo medido en producción.
	test("el frontmatter canónico declara async: false, no solo el normalizador (R7)", () => {
		const scout = readFileSync(SCOUT_FRONTMATTER, "utf8");
		const frontmatter = scout.slice(0, scout.indexOf("\n---", 3));
		expect(frontmatter).toMatch(/^async: false$/m);
		expect(readFileSync(SCOUT_SPEC, "utf8")).toContain("MUST declare `async: false`");
	});

	// El riesgo residual de R6 se cierra solo al retirar la exclusividad: un
	// scout muerto ya no puede bloquear a los siguientes, porque nunca hubo
	// exclusividad que heredar. La limpieza por turno se conserva para el
	// contador de fuera-de-contrato.
	test("R4: un scout cancelado o muerto ya no bloquea los lanzamientos siguientes", () => {
		const tracking = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-orphan", tracking);
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect B" }, "call-next", tracking)).not.toThrow();
	});

	test("the session owner clears scoutTracking at the start of every user turn, not only at session_shutdown (R6 residual risk)", () => {
		const sessionLifecycle = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-session-lifecycle.ts"), "utf8");
		const inputHook = sessionLifecycle.slice(sessionLifecycle.indexOf('pi.on("input"'), sessionLifecycle.indexOf('pi.on("input"') + 800);
		expect(inputHook).toMatch(/scoutTracking\.clear\(\)/);
	});

	test("el scout queda excluido de la inyección de skills (aislado, inheritSkills:false)", () => {
		// Inyectar paths de SKILL.md (absolutos, fuera del repo) a un scout aislado
		// produce "Skills not found" y una ejecución degradada. El dueño del prompt
		// debe excluir explícitamente al scout.
		const agentPrompt = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts"), "utf8");
		expect(agentPrompt).toMatch(/const isScout\s*=\s*startNames\.includes\("ein-scout"\)/);
		expect(agentPrompt).toMatch(/\(isNamedAgent \|\| isSddAgent\) && !isScout/);
	});
});

describe("readonly scout report validation", () => {
	test("accepts exactly one cited structured report", () => {
		expect(validateScoutReport([report()], fixture())).toEqual(report());
	});

	// Regresión real de 0.30.0: al quitar el outputSchema, un modelo barato emite
	// `uncertainties` como strings y `references` con un `lines` "N-M" en vez de
	// startLine/endLine. El scout hacía el trabajo bien pero el reporte se
	// descartaba. Se aceptan ambas formas normalizándolas a la canónica.
	test("acepta uncertainties como strings y references con `lines` (regresión 0.30.0)", () => {
		const root = fixture();
		const validated = validateScoutReport([report({
			references: [{ id: "R1", path: "evidence.ts", lines: "1-3", supports: "lines 1 through 3" }],
			uncertainties: ["No tests were run in this read-only pass."],
		})], root);
		expect(validated.references[0]).toEqual({ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "lines 1 through 3" });
		expect(validated.uncertainties).toEqual([{ level: "material", statement: "No tests were run in this read-only pass." }]);
	});

	test("acepta `lines` de una sola línea pero no relaja la validación de citas", () => {
		const root = fixture();
		expect(validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "2", supports: "line two" }] })], root).references[0])
			.toEqual({ id: "R1", path: "evidence.ts", startLine: 2, endLine: 2, supports: "line two" });
		// El oro sigue estricto donde el modelo no puede tener razón: un `lines` no
		// numérico no es una cita, es otra cosa.
		expect(() => validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "abc", supports: "x" }] })], root)).toThrow("invalid reference");
	});

	// R1. El fallo medido en producción: dos reportes buenos descartados enteros
	// porque UNA cita "el fichero entero" pasaba el final por 2 y por 4 líneas
	// (`server/api/cursos/index.post.ts` 1-105 sobre 101 líneas). El final se
	// recorta; el principio, que es lo que dice de dónde salió la evidencia, no.
	test("R1: recorta el final del rango que se pasa de EOF en vez de tirar el reporte", () => {
		const root = fixture();
		const clamped = validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "1-99", supports: "x" }] })], root);
		expect(clamped.references[0]).toEqual({ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "x" });

		const clampedCanonical = validateScoutReport([report({ references: [{ ...report().references[0], endLine: 99 }] })], root);
		expect(clampedCanonical.references[0].endLine).toBe(3);
	});

	// Un `startLine` fuera del fichero no es un redondeo: no hay nada que
	// recortar y la cita no apunta a ninguna evidencia. El oro no se relaja.
	test("R1: un startLine fuera del fichero sigue siendo una cita inválida", () => {
		const root = fixture();
		expect(() => validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "50-60", supports: "x" }] })], root)).toThrow("past the last line");
	});

	// R2. El segundo intento falló idéntico al primero porque el mensaje no
	// nombraba nada: "reference line range is invalid" y nada más. Sin la cita
	// concreta no hay corrección posible, solo relanzamiento a ciegas.
	test("R2: el rechazo nombra id, path, rango citado y líneas reales", () => {
		const root = fixture();
		let message = "";
		try { validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "50-60", supports: "x" }] })], root); }
		catch (error) { message = error instanceof Error ? error.message : String(error); }
		expect(message).toContain("R1");
		expect(message).toContain("evidence.ts");
		expect(message).toContain("50");
		expect(message).toContain("3");
	});

	test("fails closed for missing, multiple, malformed, oversized, and uncertain reports", () => {
		const root = fixture();
		expect(() => validateScoutReport([], root)).toThrow("missing");
		expect(() => validateScoutReport([report(), report()], root)).toThrow("multiple");
		expect(() => validateScoutReport(["{"], root)).toThrow("malformed");
		expect(() => validateScoutReport(["x".repeat(SCOUT_REPORT_MAX_BYTES + 1)], root)).toThrow("exceeds");
		expect(() => validateScoutReport([report({ uncertainties: [] })], root)).toThrow("invalid report schema");
	});

	// La coherencia INTERNA sigue estricta: es determinista, gratis, y es
	// responsabilidad del modelo. Lo que se vuelve tolerante es la cita contra
	// disco, que es donde el modelo escribe un número a mano.
	test("rejects unreferenced and internally inconsistent evidence", () => {
		const root = fixture();
		expect(() => validateScoutReport([report({ findings: [{ claim: "uncited", referenceIds: [] }] })], root)).toThrow();
		expect(() => validateScoutReport([report({ references: [...report().references, { id: "R2", path: "evidence.ts", startLine: 1, endLine: 1, supports: "unused" }] })], root)).toThrow("unreferenced");
		expect(() => validateScoutReport([report({ findings: [{ claim: "ghost", referenceIds: ["R9"] }] })], root)).toThrow("unknown reference id");
	});

	// R3. Una cita irrecuperable descarta esa cita, no el reporte. 19 de 21
	// referencias eran válidas en la run medida: tirarlas todas es la burocracia
	// que este contrato existía para no ser.
	test("R3: una referencia irrecuperable descarta la cita, no el reporte", () => {
		const root = fixture();
		const salvaged = validateScoutReport([report({
			summaryReferenceIds: ["R1", "R2"],
			findings: [
				{ claim: "vive", referenceIds: ["R1"] },
				{ claim: "muere con su única cita", referenceIds: ["R2"] },
				{ claim: "sobrevive con la cita viva", referenceIds: ["R1", "R2"] },
			],
			references: [
				{ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "ok" },
				{ id: "R2", path: "no-existe.ts", startLine: 1, endLine: 5, supports: "irrecuperable" },
			],
		})], root);

		expect(salvaged.references.map((reference) => reference.id)).toEqual(["R1"]);
		expect(salvaged.findings.map((finding) => finding.claim)).toEqual(["vive", "sobrevive con la cita viva"]);
		expect(salvaged.findings[1]!.referenceIds).toEqual(["R1"]);
		expect(salvaged.summaryReferenceIds).toEqual(["R1"]);
		// El descarte viaja con procedencia (`// 002`): no se esconde, se declara.
		expect(salvaged.uncertainties.some((uncertainty) => uncertainty.statement.includes("R2") && uncertainty.statement.includes("no-existe.ts"))).toBe(true);
	});

	// El salvamento tiene suelo: sin evidencia viva no hay reporte que entregar.
	test("R3: sin evidencia viva el reporte se rechaza entero", () => {
		const root = fixture();
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], path: "../escape" }] })], root)).toThrow();
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], path: "no-existe.ts" }] })], root)).toThrow("no valid evidence");
	});

	// Un finding con UNA cita viva sobrevive con esa cita, aunque pierda las
	// demás. Es el invariante que hace imposible la "referencia huérfana
	// sobrevenida" que el diseño preveía podar: una referencia viva siempre
	// mantiene vivo a su finding.
	test("R3: un finding conserva sus citas vivas y pierde solo las muertas", () => {
		const root = fixture();
		const salvaged = validateScoutReport([report({
			summaryReferenceIds: ["R1"],
			findings: [{ claim: "mixto", referenceIds: ["R1", "R2", "R3"] }],
			references: [
				{ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "ok" },
				{ id: "R2", path: "no-existe.ts", startLine: 1, endLine: 5, supports: "irrecuperable" },
				{ id: "R3", path: "evidence.ts", startLine: 2, endLine: 2, supports: "ok" },
			],
		})], root);
		expect(salvaged.findings[0]!.referenceIds).toEqual(["R1", "R3"]);
		expect(salvaged.references.map((reference) => reference.id)).toEqual(["R1", "R3"]);
	});

	test("rejects symlink escapes", () => {
		const root = fixture();
		const outside = mkdtempSync(join(tmpdir(), "ein-scout-outside-"));
		writeFileSync(join(outside, "secret.txt"), "secret\n");
		symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], path: "escape.txt" }] })], root)).toThrow();
	});
});

describe("readonly scout result handoff", () => {
	function tracked(): Map<string, string> {
		return new Map([["scout-call", "pending"]]);
	}
	// El scout entrega su reporte como su SALIDA FINAL (finalOutput), igual que
	// cualquier subagente — ya no por el canal structuredOutput. El modelo lo
	// emite como texto (lo hizo 3 de 4 veces en el run real); antes se descartaba.
	function result(finalOutput: unknown = JSON.stringify(report())): unknown {
		return { mode: "single", results: [{ agent: "ein-scout", finalOutput }] };
	}
	function wrappedResult(finalOutput: string = JSON.stringify(report()), overrides: Record<string, unknown> = {}): unknown {
		const note = "Turn budget wrap-up was requested after 12 assistant turns (soft limit 12, grace 2). Process-mode live steering is unavailable, so the child was warned at launch to wrap up by this budget. Output may be partial.";
		return { mode: "single", results: [{
			agent: "ein-scout",
			exitCode: 0,
			wrapUpRequested: true,
			turnBudget: { maxTurns: 12, graceTurns: 2, turnCount: 22, outcome: "wrap-up-requested", wrapUpRequestedAtTurn: 12 },
			finalOutput: `${note}\n\n${finalOutput}`,
			...overrides,
		}] };
	}

	test("valida el reporte entregado en finalOutput como texto (el bug real de hoy)", () => {
		const tracking = tracked();
		expect(acceptTrackedScoutResult(tracking, "scout-call", result(), false, fixture())).toEqual(report());
		expect(tracking.has("scout-call")).toBe(false);
	});

	test("acepta el JSON que pi-subagents decora tras pedir cierre y conserva la procedencia", () => {
		const tracking = tracked();
		const accepted = acceptTrackedScoutResult(tracking, "scout-call", wrappedResult(), false, fixture()) as ReturnType<typeof report>;

		expect(accepted.summary).toBe(report().summary);
		expect(accepted.uncertainties).toContainEqual({
			level: "material",
			statement: "el runner pidió cierre en el turno 12 (límite 12, gracia 2); la salida puede ser parcial",
		});
		expect(tracking.has("scout-call")).toBe(false);
	});

	test("no retira preámbulos si los metadatos no prueban que los generó el runner", () => {
		const noWrap = tracked();
		expect(() => acceptTrackedScoutResult(noWrap, "scout-call", wrappedResult(undefined, { wrapUpRequested: false }), false, fixture())).toThrow("malformed structured report");

		const wrongOutcome = tracked();
		expect(() => acceptTrackedScoutResult(wrongOutcome, "scout-call", wrappedResult(undefined, { turnBudget: { maxTurns: 12, graceTurns: 2, turnCount: 22, outcome: "within-budget", wrapUpRequestedAtTurn: 12 } }), false, fixture())).toThrow("malformed structured report");

		const arbitrary = tracked();
		expect(() => acceptTrackedScoutResult(arbitrary, "scout-call", wrappedResult(`otro preámbulo\n\n${JSON.stringify(report())}`), false, fixture())).toThrow("malformed structured report");
	});

	// Antes este test exigía que la entrada se borrase. Eso ERA el agujero: un
	// resultado vacío (la forma de un lanzamiento en background) volvía al
	// instante, liberaba el turno y dejaba arrancar el siguiente scout. En una
	// run real salieron tres seguidos y los tres reportes se tiraron.
	test("un resultado fuera de contrato falla y NO libera el turno (R8)", () => {
		const cases: unknown[] = [
			undefined,
			{ mode: "single", results: [] },                                        // sin resultado in-turn
			{ mode: "single", results: [{ agent: "ein-scout" }] },                  // sin finalOutput
			{ mode: "single", results: [{ agent: "ein-scout", finalOutput: "" }] }, // vacío
		];
		for (const details of cases) {
			const tracking = tracked();
			expect(() => acceptTrackedScoutResult(tracking, "scout-call", details, false, fixture())).toThrow("ein-scout contract");
			expect(tracking.get("scout-call")).toBe("off-contract");
		}
	});

	// El mensaje describe lo que se observó. No afirma la causa: antes decía
	// "launched async or in parallel?" como si lo supiera, y mandaba a corregir
	// eso aunque el fallo real fuera otro.
	test("el mensaje nombra la forma observada, no una causa supuesta", () => {
		const zero = () => acceptTrackedScoutResult(tracked(), "scout-call", { mode: "single", results: [] }, false, fixture());
		expect(zero).toThrow("returned 0 results in this turn");
		expect(zero).not.toThrow("launched async or in parallel");

	});

	// R4. Cada rama se valida por su cuenta: una rama fuera de contrato no
	// arrastra a sus hermanas. Es la diferencia entre perder un ángulo y perder
	// la investigación entera.
	test("R4: el fan-out devuelve las ramas válidas aunque una caiga", () => {
		const details = { mode: "workflow", results: [
			{ agent: "ein-scout", task: "angulo A", finalOutput: JSON.stringify(report()) },
			{ agent: "ein-scout", task: "angulo B", finalOutput: "not json at all" },
			{ agent: "ein-scout", task: "angulo C", finalOutput: JSON.stringify(report({ summary: "otra evidencia" })) },
		] };
		const accepted = acceptTrackedScoutResult(tracked(), "scout-call", details, false, fixture()) as unknown as { version: string; branches: { task: string; report: { summary: string } }[]; dropped: string[] };
		expect(accepted.version).toBe("ein-scout-fanout/v1");
		expect(accepted.branches.map((branch) => branch.task)).toEqual(["angulo A", "angulo C"]);
		expect(accepted.branches[1]!.report.summary).toBe("otra evidencia");
		expect(accepted.dropped.join(" ")).toContain("angulo B");
	});

	test("R4: un resultado único sigue devolviendo el reporte pelado", () => {
		expect(acceptTrackedScoutResult(tracked(), "scout-call", { mode: "single", results: [{ agent: "ein-scout", finalOutput: JSON.stringify(report()) }] }, false, fixture())).toEqual(report());
	});

	test("R4: el bound de 3 ramas se aplica en el contrato, no solo en la prosa", () => {
		const branch = (task: string) => ({ agent: "ein-scout", task, finalOutput: JSON.stringify(report()) });
		const four = { mode: "workflow", results: [branch("A"), branch("B"), branch("C"), branch("D")] };
		expect(() => acceptTrackedScoutResult(tracked(), "scout-call", four, false, fixture())).toThrow("at most 3");
	});

	// R5. El contador sigue existiendo, re-apuntado: solo cuenta el fallo TOTAL
	// (el incidente de infraestructura que decía vigilar), nunca un reporte que
	// el salvamento puede rescatar.
	test("R5: un fan-out con una rama viva no cuenta como fuera de contrato", () => {
		const tracking = tracked();
		const details = { mode: "workflow", results: [
			{ agent: "ein-scout", task: "viva", finalOutput: JSON.stringify(report()) },
			{ agent: "ein-scout", task: "muerta", finalOutput: "" },
		] };
		expect(() => acceptTrackedScoutResult(tracking, "scout-call", details, false, fixture())).not.toThrow();
		expect(tracking.has("scout-call")).toBe(false);
	});

	test("R5: un fan-out con TODAS las ramas caídas sí es fuera de contrato", () => {
		const tracking = tracked();
		const details = { mode: "workflow", results: [
			{ agent: "ein-scout", task: "a", finalOutput: "not json" },
			{ agent: "ein-scout", task: "b", finalOutput: "" },
		] };
		expect(() => acceptTrackedScoutResult(tracking, "scout-call", details, false, fixture())).toThrow("ein-scout contract");
		expect(tracking.get("scout-call")).toBe("off-contract");
	});

	// R5. Una cita pasada de rango ya no gasta una de las dos vidas del turno:
	// se recorta y el reporte pasa. Sin esto, dos reportes buenos seguidos
	// cortaban la investigación, que es exactamente lo que se midió.
	test("R5: dos reportes con el rango pasado no cortan el tercer lanzamiento", () => {
		const tracking: Map<string, string> = new Map();
		const overrun = { mode: "single", results: [{ agent: "ein-scout", finalOutput: JSON.stringify(report({ references: [{ id: "R1", path: "evidence.ts", lines: "1-99", supports: "x" }] })) }] };

		for (const id of ["scout-1", "scout-2"]) {
			normalizeScoutLaunch({ agent: "ein-scout", task: "x" }, id, tracking);
			expect(() => acceptTrackedScoutResult(tracking, id, overrun, false, fixture())).not.toThrow();
		}
		expect(normalizeScoutLaunch({ agent: "ein-scout", task: "x" }, "scout-3", tracking)).toBeDefined();
	});

	// La regla "fuera de contrato dos veces es un incidente" vivía solo en la
	// prosa del orquestador. Ahora corta el tercer lanzamiento antes de gastarlo.
	test("dos resultados fuera de contrato en un turno cortan el tercer lanzamiento (R8)", () => {
		const tracking: Map<string, string> = new Map();
		const empty = { mode: "single", results: [] };

		for (const id of ["scout-1", "scout-2"]) {
			normalizeScoutLaunch({ agent: "ein-scout", task: "x" }, id, tracking);
			expect(() => acceptTrackedScoutResult(tracking, id, empty, false, fixture())).toThrow("ein-scout contract");
		}

		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "x" }, "scout-3", tracking)).toThrow("infrastructure incident");
		// El turno del usuario es la frontera: al limpiarse, el scout vuelve a estar disponible.
		tracking.clear();
		expect(normalizeScoutLaunch({ agent: "ein-scout", task: "x" }, "scout-4", tracking)).toBeDefined();
	});

	test("sigue fail-closed sobre citas/schema inválidos, malformed, y sin replay en error del runner", () => {
		const invalid = tracked();
		expect(() => acceptTrackedScoutResult(invalid, "scout-call", result(JSON.stringify(report({ summary: "" }))), false, fixture())).toThrow("invalid report schema");

		const malformed = tracked();
		expect(() => acceptTrackedScoutResult(malformed, "scout-call", result("not json at all"), false, fixture())).toThrow("malformed");

		// Un error del runner es suyo, no del contrato: libera el turno, y su
		// mensaje original llega al padre sin que Ein lo reescriba.
		const errorTracking = tracked();
		expect(acceptTrackedScoutResult(errorTracking, "scout-call", undefined, true, fixture())).toBeUndefined();
		expect(errorTracking.has("scout-call")).toBe(false);
	});
});
