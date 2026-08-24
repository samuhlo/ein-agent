// =============================================================================
// TESTS: compilador de Apply Packet desde `tasks.md` + `design.md`
//   El defecto medido no es que falte un extractor: es que el existente
//   (`extractProductionFiles`) IGNORA la etiqueta y barre el cuerpo del grupo
//   entero. Un grupo que declaraba `none` daba nueve ficheros. Aquí la frontera
//   sale de la etiqueta o no sale.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { compileApplyPacket } from "../ein-pi/agent/lib/apply-packet-compile";
import { validateApplyPacket } from "../ein-pi/agent/lib/apply-packet";

const SOURCES = { "design.md": "dd", "tasks.md": "tt" };

function tasksDoc(label: string, files: string, body = ""): string {
	return [
		"# Tasks — demo",
		"",
		"status: ready",
		"blocked_by: none",
		"",
		"## // 001. Grupo de demostracion",
		"",
		`${label} ${files}`,
		"",
		body,
		"- [ ] 1.1 Dejar el validador rechazando lo que no se puede ejecutar.",
		"  - architecture: Modulo [CORE] sin estado.",
		"  - avoid: No editar el router.",
		"  - verify: `bun test tests/demo.test.ts`",
		"",
	].join("\n");
}

function compile(tasksText: string, taskId = "1.1") {
	return compileApplyPacket({ change: "demo", designText: "# Design", tasksText, taskId, sources: SOURCES });
}

describe("la frontera sale de la etiqueta, no del cuerpo", () => {
	test("las diez grafias medidas en el archivo compilan al mismo campo", () => {
		const labels = [
			"Production files:",
			"**Production files:**",
			"- production paths:",
			"production-files:",
			"production_files:",
			"production files:",
			"- production files:",
			"- Production allowlist:",
			"- production/doc paths:",
			"Production files (apply touches):",
		];
		for (const label of labels) {
			const result = compile(tasksDoc(label, "`ein-pi/agent/lib/demo.ts`."));
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(result.draft.allowedFiles).toEqual(["ein-pi/agent/lib/demo.ts"]);
			expect(result.provenance.allowedFilesLabel).toBe(label);
		}
	});

	test("REGRESION: rutas en el cuerpo pero no en la etiqueta NO son frontera", () => {
		const body = [
			"El grupo menciona `ein-pi/agent/lib/sdd-router.ts` y `cc-ein/sync.ts`",
			"como evidencia de solo lectura, y no debe tocarlos.",
		].join("\n");
		const result = compile(tasksDoc("Production files (apply touches):", "none.", body));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.draft.allowedFiles).toEqual([]);
	});

	test("una grafia fuera del conjunto cerrado → unknown-grammar, sin caer al cuerpo", () => {
		const result = compile(tasksDoc("Ficheros de produccion:", "`ein-pi/agent/lib/demo.ts`."));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("unknown-grammar");
	});

	test("sin etiqueta de frontera no hay packet", () => {
		const text = tasksDoc("Production files (apply touches):", "`x/y.ts`.").replace(
			"Production files (apply touches): `x/y.ts`.",
			"Este grupo no declara su frontera.",
		);
		const result = compile(text);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("unknown-grammar");
	});

	test("un basename sin carpeta es ambiguo, no una frontera", () => {
		const result = compile(tasksDoc("Production files (apply touches):", "`demo.ts`."));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("ambiguous-path");
	});
});

describe("campos que el packet toma de la tarea", () => {
	test("outcome, comando enfocado e invariantes salen de la tarea y su grupo", () => {
		const result = compile(tasksDoc("Production files (apply touches):", "`ein-pi/agent/lib/demo.ts`."));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.draft.outcome).toBe("Dejar el validador rechazando lo que no se puede ejecutar.");
		expect(result.draft.focusedCheck).toBe("bun test tests/demo.test.ts");
		expect(result.draft.invariants).toEqual(["Modulo [CORE] sin estado.", "No editar el router."]);
		expect(result.draft.group).toBe("// 001. Grupo de demostracion");
		expect(result.draft.sources).toEqual(SOURCES);
	});

	test("una tarea inexistente no compila", () => {
		const result = compile(tasksDoc("Production files (apply touches):", "`x/y.ts`."), "9.9");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("task-not-found");
	});

	test("un tasks.md sin grupos no compila", () => {
		const result = compile("# Tasks — demo\n\nstatus: ready\n");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("task-not-found");
	});
});

describe("contra el archivo real: que le falta hoy a un packet historico", () => {
	test("un grupo archivado compila pero NO es ejecutable, y se dice por que", async () => {
		const path = "openspec/changes/archive/fix-cleaner-participant-slicing/tasks.md";
		const tasksText = await Bun.file(path).text();
		const result = compileApplyPacket({
			change: "fix-cleaner-participant-slicing",
			designText: "# Design",
			tasksText,
			taskId: "2.1",
			sources: SOURCES,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// La frontera es produccion UNION tests: bajo TDD estricto el ejecutor
		// escribe el test antes que el codigo, asi que excluirlo lo bloquearia.
		expect(result.draft.allowedFiles).toEqual([
			"ein-pi/agent/lib/continuity-checkpoint.ts",
			"tests/continuity-checkpoint.test.ts",
		]);
		expect(result.draft.allowedFilesGrammar).toEqual([
			"Production files (apply touches):",
			"Test files (apply touches):",
		]);

		const validation = validateApplyPacket(result.draft, SOURCES);
		expect(validation.ok).toBe(false);
		if (validation.ok) return;
		const missing = validation.issues.map((issue) => `${issue.code}:${issue.field}`).sort();
		expect(missing).toEqual(["missing-field:expectedEvidence", "missing-stop:stopConditions"]);
	});
});

// ─── TRIANGULACIÓN ───────────────────────────────────────────────────────────

describe("TRIANGULATE: precedencia y aislamiento entre tareas", () => {
	const twoTasks = [
		"## // 001. Grupo con dos tareas",
		"",
		"Production files (apply touches): `ein-pi/agent/lib/grupo.ts`.",
		"",
		"- [ ] 1.1 Primera tarea.",
		"  - production: `ein-pi/agent/lib/propio.ts`",
		"  - verify: `bun test tests/propio.test.ts`",
		"  - stop: Parar si el fichero propio no existe.",
		"- [ ] 1.2 Segunda tarea.",
		"  - verify: `bun test tests/otro.test.ts`",
		"",
	].join("\n");

	test("la frontera de la tarea gana sobre la del grupo", () => {
		const result = compile(twoTasks, "1.1");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.draft.allowedFiles).toEqual(["ein-pi/agent/lib/propio.ts"]);
		expect(result.draft.stopConditions).toEqual(["Parar si el fichero propio no existe."]);
	});

	test("una tarea sin frontera propia hereda la del grupo", () => {
		const result = compile(twoTasks, "1.2");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.draft.allowedFiles).toEqual(["ein-pi/agent/lib/grupo.ts"]);
	});

	test("los campos de una tarea no contaminan a su hermana", () => {
		const result = compile(twoTasks, "1.2");
		if (!result.ok) return;
		expect(result.draft.focusedCheck).toBe("bun test tests/otro.test.ts");
		expect(result.draft.stopConditions).toEqual([]);
	});

	test("`> Test runner:` no es una frontera de escritura", () => {
		const text = tasksDoc("> Test runner:", "bun test.");
		const result = compile(text);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("unknown-grammar");
	});
});

describe("TRIANGULATE: medida sobre el corpus congelado", () => {
	test("ningun packet del corpus es ejecutable, y siempre por la misma razon", async () => {
		// La medida va sobre los ITEMS DEL CORPUS, no sobre la carpeta de archivo.
		// Medir la carpeta hacia que el numero se moviera cada vez que se archivaba
		// un cambio nuevo — incluido este, cuyo tasks.md SI declara `stop:`. Un
		// examen que se mueve solo no mide nada.
		const { readFileSync } = await import("node:fs");
		const { join } = await import("node:path");
		const root = join(import.meta.dir, "..");
		const corpus = JSON.parse(readFileSync(join(root, "evals", "apply-corpus.json"), "utf8"));

		let compiled = 0;
		const reasons = new Map<string, number>();

		for (const item of corpus.items as { change: string }[]) {
			const tasksText = readFileSync(
				join(root, "openspec", "changes", "archive", item.change, "tasks.md"),
				"utf8",
			);
			const ids = [...tasksText.matchAll(/^\s*-\s*\[(?: |x|X)\]\s+(\d+(?:\.\d+)*)\s+/gm)].map((m) => m[1]);
			for (const taskId of new Set(ids)) {
				const result = compileApplyPacket({ change: item.change, designText: "#", tasksText, taskId, sources: SOURCES });
				if (!result.ok) continue;
				compiled += 1;
				const validation = validateApplyPacket(result.draft, SOURCES);
				if (validation.ok) {
					reasons.set("EJECUTABLE", (reasons.get("EJECUTABLE") ?? 0) + 1);
					continue;
				}
				for (const issue of validation.issues) reasons.set(issue.code, (reasons.get(issue.code) ?? 0) + 1);
			}
		}

		expect(compiled).toBeGreaterThan(50);
		expect(reasons.get("EJECUTABLE")).toBeUndefined();
		// El hallazgo de 2A, medido y no supuesto: la condicion de parada falta en
		// TODOS los packets que compilan. Es la brecha que justifica cambiar lo que
		// `sdd-tasks` escribe — trabajo posterior, no de este cambio.
		expect(reasons.get("missing-stop")).toBe(compiled);
	});
});
