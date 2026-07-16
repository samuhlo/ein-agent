// =============================================================================
// VERSION MARKER
// Tracks what the installer deployed, at ~/.pi/agent/.ein-install.json.
// GitHub latest-release lookup for `update` is added in the update phase.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { INSTALL_MARKER } from "./paths.ts";
import { run } from "./exec.ts";

export const INSTALLER_VERSION = "0.20.0";

// GitHub repo that publishes installer releases. Set before Fase 6 release.
export const INSTALLER_REPO = process.env.EIN_INSTALLER_REPO ?? "samuhlo/ein-agent";

export type InstallMarker = {
  version: string;
  installedAt: string;
  channel: string;
};

export function readMarker(): InstallMarker | null {
  if (!existsSync(INSTALL_MARKER)) return null;
  try {
    return JSON.parse(readFileSync(INSTALL_MARKER, "utf8")) as InstallMarker;
  } catch {
    return null;
  }
}

export function writeMarker(channel = "stable"): InstallMarker {
  const marker: InstallMarker = {
    version: INSTALLER_VERSION,
    installedAt: new Date().toISOString(),
    channel,
  };
  writeFileSync(INSTALL_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}

// Query the latest installer release tag. Best-effort; null on any failure.
export async function latestInstallerTag(): Promise<string | null> {
  const res = await run("curl", [
    "-fsSL",
    `https://api.github.com/repos/${INSTALLER_REPO}/releases/latest`,
  ]);
  if (!res.ok) return null;
  try {
    const json = JSON.parse(res.stdout) as { tag_name?: string };
    return json.tag_name ?? null;
  } catch {
    return null;
  }
}
