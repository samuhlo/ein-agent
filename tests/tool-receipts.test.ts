// =============================================================================
// TESTS: recibos humanos de las 18 herramientas de Ein
//   Cada frase de aquí la LEE UNA PERSONA en el chat. Se fijan antes de existir
//   porque un texto sin prueba se degrada solo: basta un refactor para que un
//   recibo empiece a decir `verification-passed` en vez de "verificada".
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	type ToolReceipt,
	TOOL_LABELS,
	TOOL_RECEIPTS,
	receiptFor,
} from "../ein-pi/agent/lib/tool-receipts";

const TOOLS = [
	"ein_sdd_status",
	"ein_sdd_check",
	"ein_sdd_preflight",
	"ein_sdd_lane",
	"ein_sdd_close",
	"ein_sdd_participants",
	"ein_openspec_sync",
	"ein_openspec_delta_write",
	"ein_review_forecast",
	"ein_cleaner_audit",
	"ein_cleaner_evidence",
	"ein_cleaner_active_evidence",
	"ein_cleaner_improve_admit",
	"ein_cleaner_improve_apply",
	"ein_cleaner_improve_complete",
	"ein_architect_evidence",
	"ein_architect_plan_bind",
	"ein_architect_validate",
] as const;

// Basura con la que se golpea TODO recibo: ninguno puede lanzar ni inventar.
const RUBBISH: unknown[] = [undefined, null, 42, "texto", [], {}, { ok: "quizá" }, { details: null }];

describe("cobertura: las 18 herramientas tienen recibo", () => {
	test("no falta ninguna y no sobra ninguna", () => {
		expect(Object.keys(TOOL_RECEIPTS).sort()).toEqual([...TOOLS].sort());
		expect(Object.keys(TOOL_LABELS).sort()).toEqual([...TOOLS].sort());
	});

	test("el nombre visible es castellano, no un identificador", () => {
		for (const tool of TOOLS) {
			const label = TOOL_LABELS[tool];
			expect(label.length).toBeGreaterThan(2);
			expect(label).not.toMatch(/_|ein_/);
			expect(label).not.toMatch(/^[a-z]/);
		}
	});
});

describe("reglas de voz, sobre todos los recibos", () => {
	function everyReceipt(): ToolReceipt[] {
		const out: ToolReceipt[] = [];
		for (const tool of TOOLS) for (const input of RUBBISH) out.push(receiptFor(tool, input));
		return out;
	}

	test("ningun recibo lanza, pase lo que pase", () => {
		expect(() => everyReceipt()).not.toThrow();
		for (const receipt of everyReceipt()) {
			expect(typeof receipt.line).toBe("string");
			expect(Array.isArray(receipt.detail)).toBe(true);
			expect(typeof receipt.bad).toBe("boolean");
		}
	});

	test("la linea visible cabe en 60 caracteres", () => {
		for (const receipt of everyReceipt()) {
			expect(receipt.line.length).toBeLessThanOrEqual(60);
			expect(receipt.line.trim().length).toBeGreaterThan(0);
		}
	});

	test("no se cuela ningun identificador de codigo", () => {
		for (const receipt of everyReceipt()) {
			for (const text of [receipt.line, ...receipt.detail]) {
				expect(text).not.toMatch(/\b\w+_\w+\b/);
				expect(text).not.toMatch(/\b[a-záéíóúñ]+[A-Z]\w*\b/);
			}
		}
	});

	test("FAIL CLOSED: una forma inesperada lo dice, no se la inventa", () => {
		for (const tool of TOOLS) {
			const receipt = receiptFor(tool, { forma: "que nadie espera" });
			expect(receipt.bad).toBe(true);
			expect(receipt.line).toMatch(/no se pudo leer/i);
		}
	});

	test("una herramienta desconocida tampoco revienta", () => {
		const receipt = receiptFor("herramienta-que-no-existe", { algo: 1 });
		expect(receipt.bad).toBe(true);
		expect(receipt.line).toMatch(/no se pudo leer/i);
	});
});

describe("lo que dice cada recibo", () => {
	test("estado del cambio: fase siguiente, tareas y bloqueos", () => {
		const status = {
			change: "demo",
			nextRecommended: "design",
			lane: "standard",
			tasks: { items: [{}, {}, {}], counts: { done: 1 } },
			blocked: ["algo"],
		};
		const receipt = receiptFor("ein_sdd_status", { status });
		expect(receipt.line).toBe("siguiente: diseño · 1 de 3 tareas · 1 bloqueo");
		expect(receipt.bad).toBe(true);
	});

	test("estado sin cambio activo", () => {
		const receipt = receiptFor("ein_sdd_status", { status: {} });
		expect(receipt.line).toBe("sin cambio activo");
		expect(receipt.bad).toBe(false);
	});

	test("revision del plan: bloquea con errores, informa con avisos", () => {
		const malo = receiptFor("ein_sdd_check", { change: "demo", errors: 2, warnings: 1, phases: [] });
		expect(malo.line).toBe("2 errores · 1 aviso");
		expect(malo.bad).toBe(true);

		const bueno = receiptFor("ein_sdd_check", {
			change: "demo",
			errors: 0,
			warnings: 0,
			phases: [{ phase: "scope", present: true }, { phase: "design", present: true }],
		});
		expect(bueno.line).toBe("2 fases revisadas, sin problemas");
		expect(bueno.bad).toBe(false);
	});

	test("como se trabaja el cambio: pruebas primero y cuantas fases", () => {
		const estricto = receiptFor("ein_sdd_preflight", { ok: true, change: "demo", tdd: "strict", lane: "standard" });
		expect(estricto.line).toBe("pruebas primero · siete fases");
		expect(estricto.detail.join(" ")).toMatch(/prueba que falla/i);

		const corto = receiptFor("ein_sdd_preflight", { ok: true, change: "demo", tdd: "off", lane: "micro" });
		expect(corto.line).toBe("sin pruebas primero · versión corta");

		const sinDecidir = receiptFor("ein_sdd_preflight", { ok: true, change: "demo", tdd: null, lane: "standard" });
		expect(sinDecidir.line).toBe("sin decidir · siete fases");
	});

	test("carril: dice cuantas fases se saltan", () => {
		const micro = receiptFor("ein_sdd_lane", { ok: true, change: "demo", lane: "micro", skipped: ["map", "tasks"] });
		expect(micro.line).toBe("versión corta · se saltan 2 fases");

		const completo = receiptFor("ein_sdd_lane", { ok: true, change: "demo", lane: "standard", skipped: [] });
		expect(completo.line).toBe("siete fases");
	});

	test("cierre: archivado, o el motivo de que no", () => {
		const ok = receiptFor("ein_sdd_close", { ok: true, from: "a", to: "b" });
		expect(ok.line).toBe("cambio archivado");
		expect(ok.bad).toBe(false);

		const no = receiptFor("ein_sdd_close", { ok: false, from: "a", to: "b", reason: "verify no pasa" });
		expect(no.line).toBe("no se pudo cerrar: verify no pasa");
		expect(no.bad).toBe(true);
	});

	test("tamano de la PR: la consecuencia antes que el numero", () => {
		const cabe = receiptFor("ein_review_forecast", {
			ok: true,
			production: 312,
			productionBytes: 12_400,
			productionFiles: 4,
			tests: 88,
			range: "main..HEAD",
			budget: 400,
			byteBudget: 20_000,
			densityNotices: [],
			overLines: false,
			overBytes: false,
			overBudget: false,
		});
		expect(cabe.line).toBe("312 líneas de producción, dentro del presupuesto");
		expect(cabe.bad).toBe(false);
		expect(cabe.detail.join(" ")).toContain("88");
		expect(cabe.detail.join(" ")).toContain("12.400 bytes");
		expect(cabe.detail.join(" ")).toContain("4 ficheros");
		expect(cabe.detail.join(" ")).toContain("20.000");

		const nocabe = receiptFor("ein_review_forecast", {
			ok: true,
			production: 980,
			productionBytes: 18_000,
			productionFiles: 5,
			tests: 120,
			range: "main..HEAD",
			budget: 400,
			byteBudget: 20_000,
			densityNotices: [],
			overLines: true,
			overBytes: false,
			overBudget: true,
		});
		expect(nocabe.line).toBe("980 líneas de producción, se pasa del presupuesto");
		expect(nocabe.bad).toBe(true);
		expect(nocabe.detail.join(" ")).toMatch(/partir|dividir/i);

		const porBytes = receiptFor("ein_review_forecast", {
			ok: true,
			production: 30,
			productionBytes: 29_000,
			productionFiles: 1,
			tests: 2,
			range: "main..HEAD",
			budget: 400,
			byteBudget: 20_000,
			densityNotices: [{ path: "packed.ts" }],
			overLines: false,
			overBytes: true,
			overBudget: true,
		});
		expect(porBytes.bad).toBe(true);
		expect(porBytes.detail.join(" ")).toContain("bytes");
		expect(porBytes.detail.join(" ")).toContain("packed.ts");
	});

	test("specs: cuantos dominios se movieron", () => {
		const uno = receiptFor("ein_openspec_sync", { ok: true, state: "synchronized", changed: true, domains: ["apply-packet"] });
		expect(uno.line).toBe("1 contrato actualizado");

		const ninguno = receiptFor("ein_openspec_sync", { ok: true, state: "synchronized", changed: false, domains: [] });
		expect(ninguno.line).toBe("los contratos ya estaban al día");

		const conflicto = receiptFor("ein_openspec_sync", { ok: false, state: "conflict", changed: false, domains: ["x"] });
		expect(conflicto.bad).toBe(true);
	});

	test("cambio de contrato: cuantos escenarios y donde", () => {
		const receipt = receiptFor("ein_openspec_delta_write", { ok: true, change: "demo", domain: "apply-packet", path: "p", operations: 2 });
		expect(receipt.line).toBe("2 escenarios escritos");
		expect(receipt.detail.join(" ")).toContain("apply-packet");
	});

	test("participantes: quien revisa despues de aplicar", () => {
		const listo = receiptFor("ein_sdd_participants", {
			status: "ready",
			slices: [{}, {}],
			planningBlockers: [],
			order: ["ein-cleaner"],
			next: { agent: "ein-cleaner", task: "revisar" },
		});
		expect(listo.line).toBe("después de aplicar revisa el limpiador");

		const bloqueado = receiptFor("ein_sdd_participants", { status: "blocked", slices: [], planningBlockers: [{}], order: [], blocker: "sin plan" });
		expect(bloqueado.bad).toBe(true);
		expect(bloqueado.line).toMatch(/bloquead/i);
	});

	test("auditoria del codigo: hallazgos y cuantos bloquean", () => {
		const receipt = receiptFor("ein_cleaner_audit", {
			assessments: [
				{ evaluation: { severity: "error" } },
				{ evaluation: { severity: "warning" } },
				{ evaluation: { severity: "info" } },
			],
		});
		expect(receipt.line).toBe("3 hallazgos, 1 bloquea");
		expect(receipt.bad).toBe(true);

		const limpio = receiptFor("ein_cleaner_audit", { assessments: [] });
		expect(limpio.line).toBe("sin hallazgos");
		expect(limpio.bad).toBe(false);
	});

	test("mejora verificada: dice si quedo verificada o que falta", () => {
		const ok = receiptFor("ein_cleaner_improve_complete", { status: "complete", reason: "verification-passed" });
		expect(ok.line).toBe("mejora verificada");
		expect(ok.line).not.toMatch(/verification/);

		const falta = receiptFor("ein_cleaner_improve_complete", { status: "verification-required", reason: "verification-required" });
		expect(falta.bad).toBe(true);
		expect(falta.line).toMatch(/falta verificarla/i);
	});

	test("lectura de arquitectura: cuanto se leyo", () => {
		const receipt = receiptFor("ein_architect_evidence", {
			mode: "read-only",
			evidenceId: "e1",
			repository: { branch: "main", dirty: false, files: 12, sourceBytes: 4096 },
			files: [{}, {}],
			modules: ["a", "b", "c"],
		});
		expect(receipt.line).toBe("12 ficheros leídos, 3 módulos");
		expect(receipt.bad).toBe(false);
	});
});

describe("el detalle expandido habla como una persona", () => {
	test("explica que se hizo, no volca datos", () => {
		const receipt = receiptFor("ein_review_forecast", { ok: true, production: 312, tests: 88, range: "main..HEAD", budget: 400, overBudget: false });
		expect(receipt.detail.length).toBeGreaterThanOrEqual(2);
		for (const line of receipt.detail) expect(line.length).toBeLessThanOrEqual(80);
		expect(receipt.detail[0]).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
	});

	test("un recibo de fallo explica que hacer, no solo que fallo", () => {
		const receipt = receiptFor("ein_sdd_close", { ok: false, from: "a", to: "b", reason: "verify no pasa" });
		expect(receipt.detail.join(" ").length).toBeGreaterThan(20);
	});
});

// ─── TRIANGULACIÓN: el registro contra el código real ────────────────────────

describe("TRIANGULATE: ninguna herramienta se queda sin recibo por olvido", () => {
	const SOURCES = [
		new URL("../ein-pi/agent/extensions/internal/ein-tool-registration.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/internal/ein-advisory-tools.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/internal/ein-openspec-write-tools.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/internal/ein-sdd-change-settings.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts", import.meta.url).pathname,
		new URL("../ein-pi/agent/extensions/ein-ai.ts", import.meta.url).pathname,
	];

	async function source(): Promise<string> {
		return (await Promise.all(SOURCES.map((path) => Bun.file(path).text()))).join("\n");
	}

	test("ninguna herramienta se registra saltandose la puerta", async () => {
		const text = await source();
		// El ayudante SI llama a `pi.registerTool` — una vez, y con `...spec`.
		// Lo que no puede existir es una tool registrada directamente, que es lo
		// que se reconoce porque su `name:` viene pegado al registro.
		expect([...text.matchAll(/\bpi\.registerTool\(/g)]).toHaveLength(1);
		expect(text).not.toMatch(/\bpi\.registerTool\(\s*\{[\s\S]{0,200}?name:\s*"ein_/);
	});

	test("las herramientas registradas son exactamente las que tienen recibo", async () => {
		const registered = [...(await source()).matchAll(/registerEinTool\(\{\s*\n\s*name: "(ein_[a-z_]+)"/g)].map((m) => m[1]);
		expect(registered.length).toBe(TOOLS.length);
		expect(registered.sort()).toEqual([...TOOLS].sort());
	});

	test("el modulo de recibos no participa en lo que recibe el modelo", async () => {
		// R5: `content` es intocable. Si una frase de pantalla se colara ahí,
		// estariamos cambiando el comportamiento del agente, no su presentacion.
		const text = await source();
		const contentLines = text.split("\n").filter((line) => line.includes("content:"));
		for (const line of contentLines) {
			expect(line).not.toMatch(/receiptFor|TOOL_LABELS|TOOL_RECEIPTS/);
		}
	});

	test("el expandido pinta el detalle humano, no el volcado", async () => {
		const text = await source();
		expect(text).toMatch(/if \(expanded\) return new Text\(theme\.fg\("toolOutput", receipt\.detail\.join/);
		expect(text).not.toMatch(/firstText\(result\)/);
	});
});
