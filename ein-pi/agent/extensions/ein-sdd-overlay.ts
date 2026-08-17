// =============================================================================
// OVERLAY SDD
// Pinta el cambio activo y su lista de tareas como un widget vivo sobre el
// editor. Pegamento fino: toda la decisión de qué se ve vive en
// `lib/sdd-overlay.ts`, que es puro y está fijado por tests.
//
// Fuente: `resolveSddStatus`, o sea `tasks.md` en disco. NUNCA la conversación.
// Esta extensión no escribe nada del cambio; solo lee y dibuja.
// =============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { resolveSddStatus } from "../lib/sdd-router.ts";
import { OVERLAY_KEY, renderSddOverlay } from "../lib/sdd-overlay.ts";
import { createPalette, shouldUseColor } from "../lib/theme.ts";

const COLLAPSE_KEY = "ctrl+shift+e";

export default function (pi: ExtensionAPI): void {
	let collapsed = false;
	// Última pintura, para no repintar lo idéntico: el widget se refresca en
	// cada herramienta y un setWidget por llamada es trabajo y parpadeo gratis.
	let painted: string | null = null;

	const palette = createPalette(
		shouldUseColor({ isTTY: process.stdout.isTTY === true, env: process.env }),
	);

	function refresh(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		let lines: readonly string[];
		try {
			lines = renderSddOverlay(resolveSddStatus(ctx.cwd), { collapsed, palette });
		} catch {
			// Un estado ilegible no puede tumbar la sesión ni dejar basura en
			// pantalla: se retira el widget y se sigue.
			lines = [];
		}
		const next = lines.join("\n");
		if (next === painted) return;
		painted = next;
		ctx.ui.setWidget(OVERLAY_KEY, lines.length > 0 ? [...lines] : undefined, { placement: "aboveEditor" });
	}

	// Se refresca donde el estado PUEDE haber cambiado: al abrir, al terminar un
	// turno, y al acabar una herramienta o un subagente — que es cuando una fase
	// escribe su artefacto o `sdd-apply` marca una tarea. Cuesta 0,12 ms medidos.
	// Cuatro llamadas y no un bucle: cada `on` tiene su propia sobrecarga tipada,
	// y recorrer los nombres las colapsa a la última.
	pi.on("session_start", (_event, ctx) => refresh(ctx));
	pi.on("turn_end", (_event, ctx) => refresh(ctx));
	pi.on("tool_execution_end", (_event, ctx) => refresh(ctx));
	pi.on("agent_end", (_event, ctx) => refresh(ctx));

	pi.registerShortcut(COLLAPSE_KEY, {
		description: "Plegar o desplegar el overlay del cambio activo",
		handler: (ctx) => {
			collapsed = !collapsed;
			painted = null;
			refresh(ctx);
		},
	});
}
