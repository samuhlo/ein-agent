// =============================================================================
// VERSION MARKER
// Tracks what the installer deployed in the active isolated Pi install context
// (`~/.pi-ein/agent/.ein-install.json` by default); paths.ts selects a legacy
// marker only when an existing valid legacy install needs to remain active.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import {
  defaultPiInstallContext,
  isValidInstallMarker,
  INSTALL_MARKER,
  type PiInstallContext,
} from "./paths.ts";
import { run } from "./exec.ts";

export const INSTALLER_VERSION = "0.95.0-alpha.1";

// Keep the two machine-readable labels together so every supported binary
// exposes the same running-installer identity and independent template probe.
export function versionOutputLines(templateVersion: string): [string, string] {
  return [
    `ein-installer ${INSTALLER_VERSION}`,
    `template-version ${templateVersion}`,
  ];
}

// Repository used for release lookups; override it for a controlled test or fork.
export const INSTALLER_REPO = process.env.EIN_INSTALLER_REPO ?? "samuhlo/ein-agent";

export type InstallMarker = {
  version: string;
  installedAt: string;
  channel: string;
};

export function readMarkerAt(markerPath: string): InstallMarker | null {
  if (!isValidInstallMarker(markerPath)) return null;
  try {
    return JSON.parse(readFileSync(markerPath, "utf8")) as InstallMarker;
  } catch {
    return null;
  }
}

export function readMarker(): InstallMarker | null {
  return readMarkerAt(INSTALL_MARKER);
}

export function writeMarker(
  channel = "stable",
  context: PiInstallContext = defaultPiInstallContext(),
): InstallMarker {
  const marker: InstallMarker = {
    version: INSTALLER_VERSION,
    installedAt: new Date().toISOString(),
    channel,
  };
  writeFileSync(context.installMarker, `${JSON.stringify(marker, null, 2)}\n`);
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
