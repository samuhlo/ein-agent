// =============================================================================
// VERSION MARKER
// Tracks what the installer deployed, at ~/.pi/agent/.ein-install.json.
// GitHub latest-release lookup for `update` is added in the update phase.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { INSTALL_MARKER } from "./paths.ts";

export const INSTALLER_VERSION = "0.1.0";

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
