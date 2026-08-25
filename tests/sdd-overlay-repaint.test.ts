// =============================================================================
// TESTS: la cache de pintura del overlay no sobrevive a un arranque
//   El overlay marcaba `painted` ANTES de saber si el dibujo habia llegado a la
//   pantalla. Si el primer `setWidget` se perdia —la TUI montandose todavia al
//   abrir sobre una sesion con historial—, cualquier refresco posterior con el
//   mismo contenido salia por la puerta de arriba y no repintaba NUNCA. Solo se
//   recuperaba cuando el contenido cambiaba de verdad, o al pulsar una tecla.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import createOverlayExtension from "../ein-pi/agent/extensions/ein-sdd-overlay.ts";

type Handler = (event: unknown, ctx: unknown) => void;
type WidgetPaint = {
	key: string;
	lines: string[];
	options: { placement?: string } | undefined;
};

/** Doble minimo de la API de extension: captura los handlers por evento. */
function fakePi(): { pi: unknown; fire: (event: string, ctx: unknown) => void } {
	const handlers = new Map<string, Handler[]>();
	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerShortcut() {},
	};
	return {
		pi,
		fire: (event, ctx) => {
			for (const handler of handlers.get(event) ?? []) handler({}, ctx);
		},
	};
}

function sandbox(): { cwd: string; cleanup: () => void } {
	const cwd = mkdtempSync(join(tmpdir(), "ein-overlay-repaint-"));
	const change = join(cwd, "openspec", "changes", "un-cambio");
	mkdirSync(change, { recursive: true });
	writeFileSync(join(change, "scope.md"), "# Scope\n");
	writeFileSync(join(change, "design.md"), "# Design\n");
	writeFileSync(join(change, "tasks.md"), "## Grupo 001\n- [ ] 001 una tarea\n");
	return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function fakeCtx(cwd: string, painted: WidgetPaint[]): unknown {
	return {
		cwd,
		hasUI: true,
		ui: {
			setWidget(key: string, lines: readonly string[] | undefined, options?: { placement?: string }) {
				painted.push({ key, lines: lines ? [...lines] : [], options });
			},
		},
	};
}

describe("la cache de pintura del overlay", () => {
	test("pinta TODO bajo el editor con una identidad estable y deduplica dentro de la sesion", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);

			fire("session_start", ctx);
			const afterStart = painted.length;
			fire("tool_execution_end", ctx);
			fire("tool_execution_end", ctx);

			// Sin cambio de contenido no hay trabajo ni parpadeo: eso se conserva.
			expect(painted.length).toBe(afterStart);
			expect(afterStart).toBeGreaterThan(0);
			expect(painted.every(({ key }) => key === "ein-sdd")).toBe(true);
			expect(painted.every(({ options }) => options?.placement === "belowEditor")).toBe(true);
		} finally {
			box.cleanup();
		}
	});

	test("un arranque nuevo repinta aunque el contenido sea el mismo", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);

			fire("session_start", ctx);
			const afterFirst = painted.length;

			// La UI puede haberse reconstruido debajo del widget. Dar por pintado lo
			// que quiza nunca llego a la pantalla es lo que dejaba el overlay mudo
			// hasta que el contenido cambiara solo.
			fire("session_start", ctx);

			expect(painted.length).toBeGreaterThan(afterFirst);
		} finally {
			box.cleanup();
		}
	});

	test("sin UI no se pinta nada", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", {
				cwd: box.cwd,
				hasUI: false,
				ui: { setWidget() { painted.push({ key: "unexpected", lines: [], options: undefined }); } },
			});

			expect(painted).toEqual([]);
		} finally {
			box.cleanup();
		}
	});
});
