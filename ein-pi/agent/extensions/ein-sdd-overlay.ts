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

import { isSafeChangeName, listActiveChanges, resolveSddStatus, type SddChangeStatus } from "../lib/sdd-router.ts";
import { OVERLAY_KEY, renderSddOverlay } from "../lib/sdd-overlay.ts";
import {
	EIN_SDD_SESSION_BINDING_ENV_KEY,
	SDD_SESSION_BINDING_CUSTOM_TYPE,
	SDD_SESSION_BINDING_EVENT_CHANNEL,
	parseSessionBindingEntryV1,
	parseSessionBindingEventV1,
	parseSessionBindingLaunchMetadataV1,
	restoreSessionBinding,
	revalidateSessionBinding,
	type SessionBinding,
	type SessionBindingLaunchMetadataV1,
	type SessionBindingValidation,
} from "../lib/sdd-session-binding.ts";
import { createPalette, shouldUseColor } from "../lib/theme.ts";
import { watchSddArtifacts } from "../lib/sdd-artifact-watch.ts";

const COLLAPSE_KEY = "ctrl+shift+e";

export default function (pi: ExtensionAPI): void {
	let collapsed = false;
	// Última pintura, para no repintar lo idéntico: el widget se refresca en
	// cada herramienta y un setWidget por llamada es trabajo y parpadeo gratis.
	//
	// RUIDO -> esto registra lo ENVIADO, no lo que llegó a la pantalla, y no hay
	// forma de saber lo segundo. Si un envío se pierde —la TUI montándose aún al
	// abrir sobre una sesión con historial—, el widget se queda mudo hasta que el
	// contenido cambie por su cuenta. Por eso la caché no sobrevive a un arranque.
	let painted: string | null = null;
	let binding: SessionBinding = { kind: "unbound" };
	let launchIntentCaptured = false;
	let activeContext: ExtensionContext | null = null;
	let unsubscribeBindingEvent: (() => void) | null = null;
	let stopWatching: (() => void) | undefined;

	const palette = createPalette(
		shouldUseColor({ isTTY: process.stdout.isTTY === true, env: process.env }),
	);

	// El ancho REAL del terminal, no uno fijo. Con 72 clavado, un título de tarea
	// se cortaba a mitad de palabra en una pantalla ancha que tenía sitio de
	// sobra: el recorte no era un límite del sitio, era una constante olvidada.
	function overlayWidth(): number {
		const columns = process.stdout.columns;
		return Number.isFinite(columns) && columns > 0 ? Math.min(columns - 2, 120) : 72;
	}

	function inspectBinding(cwd: string, change: string): {
		validation: SessionBindingValidation;
		status: SddChangeStatus | null;
	} {
		if (!isSafeChangeName(change)) return { validation: { change, active: false }, status: null };
		try {
			if (!listActiveChanges(cwd).includes(change)) {
				return { validation: { change, active: false }, status: null };
			}
			const status = resolveSddStatus(cwd, change);
			return status.change === change
				? { validation: { change, active: true }, status }
				: { validation: { change, active: false }, status: null };
		} catch {
			return { validation: { change, active: false }, status: null };
		}
	}

	function persist(entry: { version: 1; state: "bound"; change: string } | { version: 1; state: "unbound" }): void {
		pi.appendEntry(SDD_SESSION_BINDING_CUSTOM_TYPE, entry);
	}

	function newestEntryChange(entries: readonly unknown[]): string | null {
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
			const candidate = entry as Record<string, unknown>;
			if (candidate.type !== "custom" || candidate.customType !== SDD_SESSION_BINDING_CUSTOM_TYPE) continue;
			const parsed = parseSessionBindingEntryV1(candidate.data);
			return parsed?.state === "bound" ? parsed.change : null;
		}
		return null;
	}

	function captureLaunchIntent(): SessionBindingLaunchMetadataV1 | null {
		if (launchIntentCaptured) return null;
		launchIntentCaptured = true;
		const source = process.env[EIN_SDD_SESSION_BINDING_ENV_KEY];
		delete process.env[EIN_SDD_SESSION_BINDING_ENV_KEY];
		return typeof source === "string" ? parseSessionBindingLaunchMetadataV1(source) : null;
	}

	function refresh(ctx: ExtensionContext): void {
		let status: SddChangeStatus | null = null;
		if (binding.kind === "bound") {
			const inspection = inspectBinding(ctx.cwd, binding.change);
			const transition = revalidateSessionBinding(binding, inspection.validation);
			binding = transition.binding;
			if (transition.persist) persist(transition.persist);
			if (binding.kind === "bound") status = inspection.status;
		}
		// Sin foco de sesión, el estado del proyecto sigue siendo verdad: un único
		// cambio se puede mostrar sin elegir y varios deben declarar la ambigüedad.
		if (!status && binding.kind === "unbound") {
			try {
				status = resolveSddStatus(ctx.cwd);
			} catch {
				status = null;
			}
		}
		let lines: readonly string[] = [];
		if (status) {
			try {
				lines = renderSddOverlay(status, { collapsed, palette, width: overlayWidth() });
			} catch {
				// Rendering failure removes stale UI without inventing another focus.
				lines = [];
			}
		}
		if (!ctx.hasUI) return;
		const next = lines.join("\n");
		if (next === painted) return;
		painted = next;
		ctx.ui.setWidget(OVERLAY_KEY, lines.length > 0 ? [...lines] : undefined, { placement: "aboveEditor" });
	}

	function rebindEventListener(ctx: ExtensionContext): void {
		stopWatching?.();
		stopWatching = ctx.hasUI ? watchSddArtifacts(() => refresh(ctx)) : undefined;
		unsubscribeBindingEvent?.();
		activeContext = ctx;
		unsubscribeBindingEvent = pi.events.on(SDD_SESSION_BINDING_EVENT_CHANNEL, (payload) => {
			const event = parseSessionBindingEventV1(payload);
			const current = activeContext;
			if (!event || !current) return;

			if (event.action === "bind") {
				if (binding.kind === "bound" && binding.change === event.change) return;
				const inspection = inspectBinding(current.cwd, event.change);
				if (!inspection.validation.active) return;
				binding = { kind: "bound", change: event.change };
				persist({ version: 1, state: "bound", change: event.change });
			} else {
				if (binding.kind === "unbound") return;
				if (event.action === "invalidate" && event.change !== binding.change) return;
				binding = { kind: "unbound" };
				persist({ version: 1, state: "unbound" });
			}

			painted = null;
			refresh(current);
		});
	}

	function unbindEventListener(): void {
		stopWatching?.();
		stopWatching = undefined;
		activeContext = null;
		unsubscribeBindingEvent?.();
		unsubscribeBindingEvent = null;
	}

	// Se refresca donde el estado PUEDE haber cambiado: al abrir, al terminar un
	// turno, y al acabar una herramienta o un subagente — que es cuando una fase
	// escribe su artefacto o `sdd-apply` marca una tarea. Cuesta 0,12 ms medidos.
	// Cuatro llamadas y no un bucle: cada `on` tiene su propia sobrecarga tipada,
	// y recorrer los nombres las colapsa a la última.
	// CORTE -> al arrancar, la UI es nueva aunque el contenido sea el mismo. Dar
	// por pintado lo que quizá nunca llegó a la pantalla es lo que dejaba el
	// widget mudo el resto de la sesión. El atajo de plegar ya hacía esto mismo.
	pi.on("session_start", (_event, ctx) => {
		painted = null;
		binding = { kind: "unbound" };
		rebindEventListener(ctx);
		const launchIntent = captureLaunchIntent();
		let entries: readonly unknown[];
		try {
			entries = ctx.sessionManager.getEntries();
		} catch {
			entries = [{ type: "custom", customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: null }];
		}
		const candidate = newestEntryChange(entries) ?? launchIntent?.change;
		const validation = candidate ? inspectBinding(ctx.cwd, candidate).validation : null;
		const usableIntent = launchIntent?.projectCwd === ctx.cwd ? launchIntent : null;
		const transition = restoreSessionBinding({ entries, validation, launchIntent: usableIntent });
		binding = transition.binding;
		if (transition.persist) persist(transition.persist);
		refresh(ctx);
	});
	pi.on("turn_end", (_event, ctx) => refresh(ctx));
	pi.on("tool_execution_end", (_event, ctx) => refresh(ctx));
	pi.on("agent_end", (_event, ctx) => refresh(ctx));
	pi.on("session_shutdown", () => unbindEventListener());

	pi.registerShortcut(COLLAPSE_KEY, {
		description: "Plegar o desplegar el overlay del cambio activo",
		handler: (ctx) => {
			collapsed = !collapsed;
			painted = null;
			refresh(ctx);
		},
	});
}
