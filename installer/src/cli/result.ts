import type { InstallerArtifactEvidence, InstallerUpdateReadEvidence } from "../core/update-advisor-read.ts";
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

function preferenceLabel(evidence: InstallerUpdateReadEvidence): string {
  switch (evidence.preference.status) {
    case "defaulted":
      return `predeterminada (${evidence.preference.channel})`;
    case "explicit":
      return `persistida (${evidence.preference.channel})`;
    case "unavailable":
      return `no disponible (${evidence.preference.reason})`;
  }
}

function artifactLabel(artifact: InstallerArtifactEvidence): string {
  if (artifact.status === "verified" && artifact.artifactId) return artifact.artifactId;
  return `${artifact.status === "pending" ? "pendiente" : "no disponible"} (${artifact.reason})`;
}

function freshnessLabel(evidence: InstallerUpdateReadEvidence): string {
  if ("reason" in evidence.freshness) return `${evidence.freshness.status} (${evidence.freshness.reason})`;
  return evidence.freshness.status;
}

function advisorLines(evidence: InstallerUpdateReadEvidence): string[] {
  return [
    `Preferencia de canal: ${preferenceLabel(evidence)}`,
    `Canal efectivo: ${evidence.effectiveChannel ?? "no disponible"}`,
    `Versión instalada: ${evidence.installed.version ? `v${evidence.installed.version}` : "no disponible"}`,
    `Artifact ID instalado: ${artifactLabel(evidence.installed.artifact)}`,
    `Artifact ID del release: ${artifactLabel(evidence.release.artifact)}`,
    `Freshness: ${freshnessLabel(evidence)}`,
  ];
}

/** Formats the terminal contract without performing output or exposing capability details. */
export function renderOutcome(outcome: UpdateOutcome, evidence?: InstallerUpdateReadEvidence): RenderedOutcome {
  const statusLines = evidence ? advisorLines(evidence) : [];
  switch (outcome.type) {
    case "updated":
      return {
        lines: [...releaseLines(outcome.release), ...statusLines, `Instalado verificado: v${releaseVersion(outcome.release.release.tag)}`, "Actualización completada."],
        exitCode: EXIT_UPDATED,
      };
    case "already-current":
      return {
        lines: [...releaseLines(outcome.release), ...statusLines, `Instalado verificado: v${releaseVersion(outcome.release.release.tag)}`, "Ya está actualizado."],
        exitCode: EXIT_ALREADY_CURRENT,
      };
    case "dry-run":
      return {
        lines: [
          ...releaseLines(outcome.release),
          ...statusLines,
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
          ...statusLines,
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
          ...statusLines,
          `Actualizacion fallida en ${outcome.stage}: ${safeMessage(outcome.message)}`,
          outcome.stage === "recovering" ? "Se requiere recuperación antes de iniciar otra actualización." : "No se confirmó una nueva instalación.",
          ...(outcome.stage === "recovering" ? ["Rollback local: solo restaura el estado administrado por Ein; no modifica ningún canal remoto."] : []),
        ],
        exitCode: EXIT_FAILED,
      };
  }
}
