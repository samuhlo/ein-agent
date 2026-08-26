// =============================================================================
// BANNER — la marca de arranque del instalador
// Un wordmark `ein` con la `i` en amarillo, y debajo qué es esto y qué versión
// corre. Nada más.
//
// ANTES había un logo de bloque de 54x10 con una animación «materialize» que
// hacía fraguar cada celda. Salió del brutalismo que se retira: un logo enorme
// y una pantalla con el 85% de aire son cosas distintas, y el gesto de marca
// —un solo elemento amarillo sobre neutro— sobrevive entero a tamaño de texto.
// La regla 8 de STYLE.md // 002 dice que el vacío es la decisión de diseño; una
// animación de 10 filas es lo contrario.
//
// El estado (marker, recuperación) y la etiqueta de versión no cambian: son
// datos, y hay tests que dependen de ellos.
// =============================================================================

import { readMarkerV2 } from "../core/marker-v2.ts";
import { BACKUP_DIR, INSTALL_MARKER } from "../core/paths.ts";
import type { MarkerV1, MarkerV2 } from "../core/release-types.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { INSTALLER_VERSION } from "../core/version.ts";
import { colorEnabled, concrete, gold, rgb, structure } from "./theme.ts";
// El installer duplica la PALETA porque corre antes de que exista el template
// desplegado, pero la geometría de la marca la comparte: al empaquetar, el
// bundler la resuelve desde el repo. Es el mismo camino que ya usa el doctor.
import { renderTv, tvRowWidth, TV_WIDTH, type TvCut, type TvTone } from "../../../ein-pi/agent/lib/ein-tv.ts";

const BASE_SUBTITLE = "gestor del workbench";

export type BannerState = {
  marker: MarkerV1 | MarkerV2 | null;
  recoveryRequired: boolean;
};

// La versión del banner es la del binario que corre (INSTALLER_VERSION), no la
// del marker: el marker refleja lo instalado antes de arrancar, no lo que se
// ejecuta ahora. El marker queda para recuperación y estado instalado.
export function bannerVersionLabel(state: BannerState): string {
  if (state.recoveryRequired) return "recovery required";
  return `v${INSTALLER_VERSION}`;
}

export function readBannerState(
  caps: UpdateCaps = defaultUpdateCaps(),
  markerPath = INSTALL_MARKER,
  journalPath = `${BACKUP_DIR}/.ein-update-journal.json`,
): BannerState {
  return {
    marker: readMarkerV2(caps, markerPath),
    recoveryRequired: caps.fs.exists(journalPath),
  };
}

export function renderBanner(state: BannerState = readBannerState()): string {
  return `${BASE_SUBTITLE} · ${bannerVersionLabel(state)}`;
}

// El material del mueble: tres tonos de plástico para que el aparato tenga
// volumen. Fuera de los cuatro de marca a propósito — no son colores del
// producto, son de un objeto dibujado.
const TONE: Record<TvTone, (text: string) => string> = {
  edge: (t) => rgb(138, 129, 117, t),
  body: (t) => rgb(110, 103, 92, t),
  shadow: (t) => rgb(74, 68, 58, t),
  knob: (t) => rgb(196, 183, 158, t),
  screen: concrete,
  accent: gold,
  danger: (t) => rgb(217, 108, 95, t),
  dim: (t) => rgb(90, 90, 90, t),
};

/** Un televisor cortado por la derecha no es un televisor: se baja de corte. */
function cutFor(columns: number): TvCut {
  if (columns >= TV_WIDTH.cabinet + 4) return "cabinet";
  if (columns >= TV_WIDTH.compact + 4) return "compact";
  return "minimal";
}

export function bannerStatic(state: BannerState = readBannerState()): string {
  const cut = cutFor(process.stdout.columns ?? 80);
  const rows = renderTv({ cut });
  const width = Math.max(...rows.map(tvRowWidth));
  const subtitle = renderBanner(state);
  const pad = " ".repeat(Math.max(0, Math.floor((width - subtitle.length) / 2)));
  const art = rows.map((row) =>
    `  ${row.map((span) => (colorEnabled() ? TONE[span.tone](span.text) : span.text)).join("")}`,
  );
  return ["", ...art, "", `  ${pad}${structure(subtitle)}`, ""].join("\n");
}

/**
 * Se imprime una sola vez por proceso. Sin animación: `STYLE.md // 001` permite
 * un reveal único, pero lo que había era un bucle de fraguado de diez filas.
 */
let bannerPrinted = false;

export async function playBanner(state: BannerState = readBannerState()): Promise<void> {
  if (bannerPrinted) return;
  bannerPrinted = true;
  process.stdout.write(`${bannerStatic(state)}\n`);
}
