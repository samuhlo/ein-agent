import { describe, expect, test } from "bun:test";

import { compileApplyPacketV2 } from "../ein-pi/agent/lib/apply-packet-compile";
import { validateApplyPacketV2 } from "../ein-pi/agent/lib/apply-packet";

const SOURCES = { "design.md": "design", "tasks.md": "tasks" } as const;

function document(): string {
	return [
		"# Tasks — demo",
		"",
		"status: ready",
		"blocked_by: none",
		"",
		"## // 001. Grupo anterior",
		"",
		"- outcome: El grupo anterior ya terminó.",
		"",
		"- [x] 1.1 Paso terminado.",
		"  - architecture: No altera el grupo siguiente.",
		"  - avoid: No repetirlo.",
		"  - read: `src/anterior.ts`",
		"  - edit: `src/anterior.ts` | modify | Terminar el trabajo anterior.",
		"  - behavior: El trabajo anterior queda terminado.",
		"  - stop: Parar si reaparece como pendiente.",
		"  - verify: `bun test tests/anterior.test.ts`",
		"",
		"## // 002. Grupo ejecutable",
		"",
		"- outcome: El grupo actual aplica dos pasos sin salir de su frontera.",
		"",
		"- [ ] 2.1 Modificar el núcleo.",
		"  - architecture: V1 permanece estable.",
		"  - avoid: No inferir permisos desde el check.",
		"  - read: `src/core.ts`, `src/types.ts`",
		"  - edit: `src/core.ts` | modify | Añadir el contrato nuevo.",
		"  - behavior: El núcleo rechaza un grupo sin pasos.",
		"  - stop: Parar si hay que cambiar V1.",
		"  - verify: `bun test tests/core.test.ts`",
		"",
		"- [ ] 2.2 Añadir la fachada.",
		"  - architecture: La fachada no reimplementa validación.",
		"  - avoid: No leer el corpus vivo.",
		"  - read: `src/core.ts`, `src/facade.ts`",
		"  - edit: `src/facade.ts` | create | Exponer la observación compacta.",
		"  - behavior: La fachada conserva el nivel del núcleo.",
		"  - stop: Parar si no hay un único grupo activo.",
		"  - verify: `bun test tests/facade.test.ts`",
		"",
		"## // 003. Grupo posterior",
		"",
		"- outcome: El grupo posterior no contamina al actual.",
		"",
		"- [ ] 3.1 Cambiar otro fichero.",
		"  - architecture: Aislado.",
		"  - avoid: No mezclarlo.",
		"  - read: `src/otro.ts`",
		"  - edit: `src/otro.ts` | modify | Cambiar otra cosa.",
		"  - behavior: Otro comportamiento.",
		"  - stop: Parar siempre.",
		"  - verify: `bun test tests/otro.test.ts`",
	].join("\n");
}

describe("compilación apply-packet/v2 por grupo", () => {
	test("agrega todos y solo los pasos pendientes del grupo en orden", () => {
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: document(),
			groupTitle: "Grupo ejecutable",
			sources: SOURCES,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.draft.group).toBe("Grupo ejecutable");
		expect(result.draft.steps.map((step) => [step.taskId, step.path, step.operation])).toEqual([
			["2.1", "src/core.ts", "modify"],
			["2.2", "src/facade.ts", "create"],
		]);
		expect(result.draft.readContext).toEqual(["src/core.ts", "src/types.ts", "src/facade.ts"]);
		expect(result.draft.writeAllowlist).toEqual(["src/core.ts", "src/facade.ts"]);
		expect(result.draft.behaviorSeams).toEqual([
			"El núcleo rechaza un grupo sin pasos.",
			"La fachada conserva el nivel del núcleo.",
		]);
		expect(result.draft.checks).toEqual([
			{ command: "bun test tests/core.test.ts", covers: ["El núcleo rechaza un grupo sin pasos."] },
			{ command: "bun test tests/facade.test.ts", covers: ["La fachada conserva el nivel del núcleo."] },
		]);
		expect(validateApplyPacketV2(result.draft, SOURCES).ok).toBe(true);
	});

	test("acepta el heading completo que conserva el parser de artifacts", () => {
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: document(),
			groupTitle: "// 002. Grupo ejecutable",
			sources: SOURCES,
		});
		expect(result.ok).toBe(true);
	});

	test("un grupo inexistente falla sin elegir otro", () => {
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: document(),
			groupTitle: "No existe",
			sources: SOURCES,
		});
		expect(result).toMatchObject({ ok: false, code: "group-not-found" });
	});

	test("un grupo completo no se vuelve a delegar", () => {
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: document(),
			groupTitle: "Grupo anterior",
			sources: SOURCES,
		});
		expect(result).toMatchObject({ ok: false, code: "no-pending-tasks" });
	});

	test("un edit con gramática ambigua falla antes de inventar un paso", () => {
		const broken = document().replace(
			"`src/core.ts` | modify | Añadir el contrato nuevo.",
			"`src/core.ts` — cambiar lo necesario",
		);
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: broken,
			groupTitle: "Grupo ejecutable",
			sources: SOURCES,
		});
		expect(result).toMatchObject({ ok: false, code: "invalid-edit-grammar" });
	});

	test("campos de grupos y tareas hermanas no contaminan el packet", () => {
		const result = compileApplyPacketV2({
			change: "demo",
			designText: "# Design",
			tasksText: document(),
			groupTitle: "Grupo ejecutable",
			sources: SOURCES,
		});
		if (!result.ok) throw new Error(result.detail);
		expect(result.draft.readContext).not.toContain("src/anterior.ts");
		expect(result.draft.readContext).not.toContain("src/otro.ts");
		expect(result.draft.outcome).toBe("El grupo actual aplica dos pasos sin salir de su frontera.");
	});
});
