// =============================================================================
// USER SETTINGS
// Preservación de los campos de settings.json que pertenecen al usuario (no a
// Ein) a través de `ein update`: se leen antes de extraer el tarball y se
// fusionan después. Módulo puro (sin assets embebidos) para que sea testeable
// sin compilar el template; deploy.ts lo consume.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { piNpmPackageIdentity } from "../../../ein-pi/agent/lib/runtime-compat.ts";

// Fields in settings.json that belong to the user, not to Ein.
// These survive across `ein update` re-deployments.
const USER_SETTINGS_KEYS = [
  "defaultProvider",
  "defaultModel",
  "defaultThinkingLevel",
  "lastChangelogVersion",
  "enabledModels",
  "packages",
] as const;

export type UserSettings = Partial<Record<(typeof USER_SETTINGS_KEYS)[number], unknown>>;

export function readUserSettings(agentDir: string): UserSettings {
  const path = join(agentDir, "settings.json");
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    const result: UserSettings = {};
    for (const key of USER_SETTINGS_KEYS) {
      if (key in record) result[key] = record[key];
    }
    return result;
  } catch {
    return {};
  }
}

export function mergeUserSettings(agentDir: string, saved: UserSettings): void {
  if (Object.keys(saved).length === 0) return;
  const path = join(agentDir, "settings.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const template = parsed as Record<string, unknown>;
    const { packages: savedPackages, ...savedFields } = saved;
    const merged: Record<string, unknown> = { ...template, ...savedFields };
    if (Array.isArray(template.packages) && Array.isArray(savedPackages)) {
      const templatePackages = template.packages.filter(
        (value): value is string => typeof value === "string",
      );
      const managedIdentities = new Set(
        templatePackages.map(piNpmPackageIdentity).filter((value): value is string => value !== null),
      );
      const userPackages = savedPackages.filter(
        (value): value is string =>
          typeof value === "string" &&
          !managedIdentities.has(piNpmPackageIdentity(value) ?? ""),
      );
      merged.packages = [...templatePackages, ...userPackages];
    }
    writeFileSync(path, `${JSON.stringify(merged, null, "\t")}\n`);
  } catch {
    // Leave freshly-extracted file as-is if merge fails
  }
}
