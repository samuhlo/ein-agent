import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	OVERLAY_KEY,
	overlayWidth,
	phaseStates,
	renderSddOverlay,
	selectVisibleTasks,
} from "../ein-pi/agent/lib/sdd-overlay.ts";
import { createPalette, stripAnsi } from "../ein-pi/agent/lib/theme.ts";
import type { SddChangeStatus, SddTaskItem } from "../ein-pi/agent/lib/sdd-router.ts";

// =============================================================================
// El aspecto exacto se fija aquí. Una interfaz sin test se degrada sin que nadie
// lo note: cambia un ancho, se descuadra una fila, y no falla nada.
// =============================================================================

function items(count: number, doneCount: number): SddTaskItem[] {
	return Array.from({ length: count }, (_, index) => ({
		id: String(index + 1).padStart(3, "0"),
		title: `tarea ${index + 1}`,
		done: index < doneCount,
	}));
}

function status(overrides: Partial<SddChangeStatus> = {}, taskItems = items(4, 1)): SddChangeStatus {
	const pending = taskItems.find((item) => !item.done) ?? null;
	return {
		change: "carril-rapido",
		lane: "micro",
		currentPhase: "apply",
		nextRecommended: "apply",
		verify: "absent",
		verifyStale: false,
		present: { scope: true, map: false, design: true, tasks: true, apply: false, verify: false, close: false },
		tasks: {
			present: true,
			status: "ready",
			blockedBy: null,
			items: taskItems,
			nextPending: pending,
			counts: {
				done: taskItems.filter((item) => item.done).length,
				pending: taskItems.filter((item) => !item.done).length,
				ready: 0,
				blocked: 0,
			},
			problems: [],
		},
		...overrides,
	} as SddChangeStatus;
}

describe("overlay del cambio activo", () => {
	test("keeps the started task visible after counting group headings and completed summaries", () => {
		for (const groupSize of [1, 2, 7]) {
			for (const activeIndex of [0, 3, 6]) {
				const grouped = items(7, activeIndex).map((item, index) => ({
					...item, groupTitle: `grupo ${Math.floor(index / groupSize)}`, started: index === activeIndex,
				}));
				for (const maxLines of [3, 4, 5, 8]) {
					for (const width of [40, 72]) {
						const lines = renderSddOverlay(status({ lane: "standard" }, grouped), { maxLines, width, palette: createPalette(true) }).map(stripAnsi);
						expect(lines.join("\n")).toContain(`iniciada · tarea ${activeIndex + 1}`);
						expect(lines.length).toBeLessThanOrEqual(maxLines);
						for (const [index, line] of lines.entries()) {
							if (line.includes("grupo ")) expect(lines[index + 1]).toContain("tarea ");
						}
					}
				}
			}
		}
	});

	test("fits the header to its actual metadata width while preserving phase and progress", () => {
		for (const total of [12, 120]) {
			const state = status({ change: "validar-fecha-inicio-generacion", lane: "standard", nextRecommended: "verify" }, items(total, total));
			for (const width of [40, 41, 50, 72]) {
				for (const enabled of [false, true]) {
					const lines = renderSddOverlay(state, { width, collapsed: true, palette: createPalette(enabled) });
					expect(overlayWidth(lines)).toBeLessThanOrEqual(width);
					expect(stripAnsi(lines[0]!)).toContain("standard");
					expect(stripAnsi(lines[0]!)).toContain(`▸ verify   ${total}/${total}`);
				}
			}
		}
	});

	test("retains a visible focus marker without painting a background", () => {
		const lines = renderSddOverlay(status(), { palette: createPalette(true) });
		expect(lines.join("\n")).toContain("▸");
		expect(lines.join("\n")).not.toMatch(/\u001b\[(?:4[0-8]|10[0-7])(?:;|m)/);
	});

	test("sin cambio activo no roba ni una línea", () => {
		expect(renderSddOverlay(status({ change: null, selection: { kind: "none" } }))).toEqual([]);
	});

	// Callarse ante la ambigüedad la haría indistinguible de un repo limpio, que
	// es otra mentira distinta: hay trabajo abierto, solo que sin elegir.
	test("con varios cambios sin elegir lo dice, en vez de desaparecer", () => {
		const lines = renderSddOverlay(status({
			change: null,
			selection: { kind: "ambiguous", candidates: ["feat-a", "feat-b"] },
		}));
		expect(lines.length).toBeGreaterThan(0);
		const text = lines.join(" ");
		expect(text).toContain("feat-a");
		expect(text).toContain("feat-b");
	});

	// Dos anclas, no una tira de metadatos: QUÉ a la izquierda con su carril
	// pegado, DÓNDE a la derecha. La fase lleva el acento y su `▸` porque es el
	// único dato de la cabecera que contesta «y ahora qué».
	test("la cabecera lleva cambio, carril, fase y progreso — sin marco ni placa", () => {
		const [header] = renderSddOverlay(status());
		expect(header).toContain("carril-rapido");
		expect(header).toContain("micro");
		expect(header).toContain("▸ apply");
		expect(header!.indexOf("micro")).toBeLessThan(header!.indexOf("▸ apply"));
		expect(header).toContain("1/4");
		// La gramática nueva no dibuja contornos: ni caja, ni pestaña, ni ■.
		expect(header).not.toContain("■");
		expect(header).not.toContain("╔");
		expect(header).not.toContain("═");
	});

	// El arreglo: el carril completo, no solo las tareas. Antes no había forma de
	// saber desde el widget que después de `apply` aún quedaba `verify`.
	test("el raíl pinta todas las fases del carril, con su estado", () => {
		const rail = renderSddOverlay(status())[1];
		// micro = scope, design, apply, verify, close. `map` y `tasks` no son suyas.
		// La marca ABRE la celda: todas las fases arrancan en la misma columna de
		// texto, así que el carril se lee como una fila y no como cinco etiquetas.
		expect(rail).toContain("✓ scope");
		expect(rail).toContain("✓ design");
		expect(rail).toContain("▸ apply");
		expect(rail).toContain("verify");
		expect(rail).toContain("close");
		expect(rail).not.toContain("map");
	});

	test("cada tarea muestra su estado, y la actual se distingue", () => {
		const state = status();
		const pending = renderSddOverlay(state);
		expect(pending[3]).toContain("siguiente");
		expect(pending[3]).not.toContain("▸");
		state.tasks.items[1]!.started = true;
		const lines = renderSddOverlay(state);
		expect(lines[2]).toContain("✓");
		expect(lines[3]).toContain("▸");
		expect(lines[3]).toContain("tarea 2");
		expect(lines[3]).toContain("iniciada");
		// Una pendiente que no es la actual no lleva marca.
		expect(lines[4]).not.toContain("▸");
		expect(lines[4]).not.toContain("✓");
	});

	// EL GRUPO TIENE LÍNEA PROPIA, y la tarea dice siempre su título.
	//
	// Antes el grupo no tenía sitio: se colaba en la primera fila del grupo
	// SUSTITUYENDO al título de su tarea, así que esa fila no decía qué tarea
	// era. Costaba una fila igual — solo que a cambio de perder un dato.
	test("el grupo se nombra en su línea y ninguna tarea pierde su título", () => {
		const taskItems: SddTaskItem[] = [
			{ id: "1.1", title: "Long checkbox sentence for router semantics", groupTitle: "Prerelease-aware selection", done: false },
			{ id: "2.1", title: "Fallback checkbox title", done: false },
		];
		const body = renderSddOverlay(status({}, taskItems)).join("\n");
		expect(body).toContain("Prerelease-aware selection");
		expect(body).toContain("Long checkbox sentence");
		expect(body).toContain("Fallback checkbox title");
		// El encabezado va en su propia línea, nunca compartiendo la de una tarea.
		const groupLine = body.split("\n").find((line) => line.includes("Prerelease-aware selection"))!;
		expect(groupLine).not.toContain("1.1");
		expect(groupLine).toContain("0 de 1");
	});

	// El sitio concedido manda sobre la composición: un encabezado de grupo cuesta
	// una fila como cualquier otra, y no puede empujar al widget fuera de su alto.
	test("los encabezados de grupo entran en el presupuesto de altura", () => {
		const grouped: SddTaskItem[] = Array.from({ length: 8 }, (_, index) => ({
			id: String(index + 1).padStart(3, "0"),
			title: `tarea ${index + 1}`,
			groupTitle: `grupo ${Math.floor(index / 2)}`,
			done: false,
		}));
		for (const maxLines of [3, 5, 8]) {
			expect(renderSddOverlay(status({}, grouped), { maxLines }).length).toBeLessThanOrEqual(maxLines);
		}
	});

	test("un grupo visible se nombra una vez y luego enseña cada tarea real", () => {
		const taskItems: SddTaskItem[] = [
			{ id: "3.3", title: "Audit the final diff", groupTitle: "Verify automated behavior and scope", done: true },
			{ id: "3.4", title: "Reproduce the corpus mismatch", groupTitle: "Verify automated behavior and scope", done: true },
			{ id: "3.5", title: "Re-run the composite gate", groupTitle: "Verify automated behavior and scope", done: false },
		];
		const body = renderSddOverlay(status({}, taskItems)).join("\n");
		expect(body.split("Verify automated behavior and scope")).toHaveLength(2);
		expect(body).toContain("Reproduce the corpus mismatch");
		expect(body).toContain("Re-run the composite gate");
	});

	// Este era el hallazgo: con todo marcado el widget enseñaba `4/4` y se callaba.
	test("con las tareas completas enseña las fases que faltan, no un 4/4 mudo", () => {
		const lines = renderSddOverlay(
			status({ nextRecommended: "verify", present: { scope: true, map: false, design: true, tasks: true, apply: true, verify: false, close: false } }, items(4, 4)),
		);
		const body = lines.join("\n");
		expect(body).toContain("4/4");
		expect(body).toContain("re-ejecutar la suite");
		expect(body).toContain("archivar el cambio");
		// Y ya no lista tareas hechas: no informan de nada.
		expect(body).not.toContain("tarea 1");
	});

	// Fail-closed: un verify obsoleto no es un aprobado (manifiesto § 002).
	test("un verify rancio se dibuja desconocido, nunca como hecho", () => {
		const states = phaseStates(
			status({
				verify: "pass",
				verifyStale: true,
				nextRecommended: "close",
				present: { scope: true, map: false, design: true, tasks: true, apply: true, verify: true, close: false },
			}),
		);
		expect(states.find((entry) => entry.phase === "verify")?.state).toBe("unknown");
	});

	// El coste real de este widget es la pantalla, no la CPU.
	test("nunca pasa de la altura concedida", () => {
		for (const total of [1, 4, 12, 40]) {
			for (const maxLines of [2, 5, 8]) {
				const lines = renderSddOverlay(status({}, items(total, Math.floor(total / 2))), { maxLines });
				expect(lines.length).toBeLessThanOrEqual(maxLines);
			}
		}
	});

	test("cuando no caben, se ocultan las completadas y se dice cuántas", () => {
		const lines = renderSddOverlay(status({}, items(12, 8)), { maxLines: 6 });
		// [0] cabecera, [1] raíl, [2] el resumen de lo oculto.
		expect(lines[2]).toContain("completadas");
		// La actual sobrevive al recorte: es la única fila que no se puede perder.
		expect(lines.some((line) => line.includes("tarea 9"))).toBe(true);
	});

	test("una sola oculta concuerda en singular", () => {
		const lines = renderSddOverlay(status({}, items(5, 1)), { maxLines: 5 });
		const summary = lines.find((line) => line.includes("…"));
		expect(summary).toContain("1 completada");
		expect(summary).not.toContain("completadas");
	});

	test("plegado deja solo la cabecera", () => {
		expect(renderSddOverlay(status(), { collapsed: true })).toHaveLength(1);
	});

	test("en un terminal estrecho se calla en vez de descuadrarse", () => {
		expect(renderSddOverlay(status(), { width: 30 })).toEqual([]);
	});

	// Con color, el ancho VISIBLE no debe cambiar: si se midiera con los códigos
	// ANSI dentro, la cabecera se descuadraría solo al encender el color.
	test("el color no altera el ancho visible", () => {
		const plain = renderSddOverlay(status(), { width: 72 });
		const painted = renderSddOverlay(status(), { width: 72, palette: createPalette(true) });
		expect(overlayWidth(painted)).toBe(overlayWidth(plain));
		expect(painted[0]).toContain("[");
		expect(plain[0]).not.toContain("[");
	});

	// Antes de que exista `tasks.md` el widget ya sirve: el raíl enseña por dónde
	// va el cambio y qué queda, que es justo lo que una lista vacía no podía decir.
	test("sin tareas todavía, el raíl informa de la fase que toca y de lo que queda", () => {
		const lines = renderSddOverlay(status({ nextRecommended: "design" }, []));
		expect(lines[0]).toContain("design");
		expect(lines[1]).toContain("▸ design");
		expect(lines.join("\n")).toContain("decidir el mecanismo");
	});
});

describe("recorte de la lista", () => {
	test("conserva la actual y lo que viene, no lo ya hecho", () => {
		const list = items(10, 6);
		const { visible, hiddenDone } = selectVisibleTasks(list, "007", 4);
		expect(visible.map((item) => item.id)).toEqual(["007", "008", "009", "010"]);
		expect(hiddenDone).toBe(6);
	});

	test("si todo cabe no oculta nada", () => {
		const list = items(3, 1);
		expect(selectVisibleTasks(list, "002", 5)).toEqual({ visible: list, hiddenDone: 0 });
	});

	test("sin tarea actual muestra la cola", () => {
		const list = items(6, 6);
		expect(selectVisibleTasks(list, null, 2).visible.map((i) => i.id)).toEqual(["005", "006"]);
	});
});

test("la clave del widget es estable: el refresco reemplaza, no acumula", () => {
	expect(OVERLAY_KEY).toBe("ein-sdd");
});

// El overlay solo existe si el manifiesto lo despliega. Un fichero suelto o una
// entrada con un nombre mal escrito no fallan en ningún sitio: simplemente la
// extensión no carga y nadie se entera.
describe("el manifiesto de extensiones y el directorio no se separan", () => {
	const dir = join(import.meta.dir, "..", "ein-pi", "agent", "extensions");
	const manifest = JSON.parse(
		readFileSync(join(import.meta.dir, "..", "ein-pi", "agent", "extensions-manifest.json"), "utf8"),
	) as { core: string[] };

	test("cada extensión declarada existe", () => {
		for (const file of manifest.core) expect(existsSync(join(dir, file))).toBe(true);
	});

	test("el overlay está declarado", () => {
		expect(manifest.core).toContain("ein-sdd-overlay.ts");
	});
});
