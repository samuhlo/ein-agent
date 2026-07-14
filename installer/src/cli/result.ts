import type { ResolvedRelease, UpdateOutcome } from "../core/release-types.ts";

export const EXIT_UPDATED = 0;
export const EXIT_ALREADY_CURRENT = 0;
export const EXIT_DRY_RUN = 0;
export const EXIT_BLOCKED_EXTERNAL_OWNER = 2;
export const EXIT_FAILED = 1;

export type RenderedOutcome = { lines: string[]; exitCode: number };

function releaseVersion(tag: string): string {
  return tag.slice("installer-v".length);
}

function releaseLines(release: ResolvedRelease): string[] {
  return [
    `Solicitud: ${release.selector.raw}`,
    `Release resuelto: ${release.release.tag}`,
  ];
}

function safeMessage(message: string): string {
  return message.replace(/(?:token|authorization|bearer|password|secret)[^\s]*/gi, "[redacted]");
}

/** Formats the terminal contract without performing output or exposing capability details. */
export function renderOutcome(outcome: UpdateOutcome): RenderedOutcome {
  switch (outcome.type) {
    case "updated":
      return {
        lines: [...releaseLines(outcome.release), `Instalado verificado: v${releaseVersion(outcome.release.release.tag)}`, "Actualizacion completada."],
        exitCode: EXIT_UPDATED,
      };
    case "already-current":
      return {
        lines: [...releaseLines(outcome.release), `Instalado verificado: v${releaseVersion(outcome.release.release.tag)}`, "Ya esta actualizado."],
        exitCode: EXIT_ALREADY_CURRENT,
      };
    case "dry-run":
      return {
        lines: [
          ...releaseLines(outcome.release),
          outcome.owner.type === "package-manager"
            ? `Gestionado por ${outcome.owner.manager}: no se reemplazaria el binario.`
            : "Dry-run: se verificaria y reemplazaria solo el binario administrado por Ein.",
          "Dry-run completado: no se modifico ningun archivo.",
        ],
        exitCode: EXIT_DRY_RUN,
      };
    case "blocked-external-owner":
      return {
        lines: [
          ...(outcome.release ? releaseLines(outcome.release) : []),
          `Instalacion gestionada por ${outcome.owner.manager}: Ein no reemplazo el binario.`,
          `Actualiza mediante tu gestor de paquetes (${outcome.owner.manager}) y vuelve a ejecutar \`ein update\`.`,
        ],
        exitCode: EXIT_BLOCKED_EXTERNAL_OWNER,
      };
    case "failed":
      return {
        lines: [
          `Solicitud: ${outcome.selector?.raw ?? "desconocida"}`,
          ...(outcome.release ? [`Release resuelto: ${outcome.release.release.tag}`] : []),
          `Actualizacion fallida en ${outcome.stage}: ${safeMessage(outcome.message)}`, 
          outcome.stage === "recovering" ? "Se requiere recuperacion antes de iniciar otra actualizacion." : "No se confirmo una nueva instalacion.",
        ],
        exitCode: EXIT_FAILED,
      };
  }
}
