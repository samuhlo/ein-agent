// =============================================================================
// PI RUNTIME COMPATIBILITY
// Exact versions verified together for one Ein release. Pi treats exact npm
// specs as pinned, so this contract prevents a package update from silently
// changing the runtime under an unchanged Ein installer.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PI_HOST_PACKAGE = "@earendil-works/pi-coding-agent";
export const PI_HOST_VERSION = "0.84.3";
export const PI_HOST_SPEC = `${PI_HOST_PACKAGE}@${PI_HOST_VERSION}`;
export const PI_NODE_MIN_VERSION = "22.19.0";

const packageContract = <const Name extends string, const Version extends string>(
  name: Name,
  version: Version,
) => ({ name, version, spec: `npm:${name}@${version}` as const });

export const REQUIRED_PI_PACKAGES = [
  packageContract("pi-subagents", "0.57.0"),
  packageContract("pi-mcp-adapter", "2.28.0"),
  packageContract("context-mode", "1.0.169"),
  packageContract("@juicesharp/rpiv-ask-user-question", "2.7.1"),
  packageContract("@juicesharp/rpiv-i18n", "2.7.1"),
] as const;

export const REQUIRED_PI_PACKAGE_SPECS: readonly string[] = REQUIRED_PI_PACKAGES.map(
  ({ spec }) => spec,
);

/**
 * Returns a stable npm package identity without its version selector.
 * Non-npm declarations are intentionally left opaque so user-owned file/git
 * packages survive settings reconciliation byte-for-byte.
 */
export function piNpmPackageIdentity(spec: string): string | null {
  if (!spec.startsWith("npm:")) return null;
  const source = spec.slice(4);
  if (!source) return null;

  let versionSeparator = -1;
  if (source.startsWith("@")) {
    const slash = source.indexOf("/");
    if (slash <= 1) return null;
    versionSeparator = source.indexOf("@", slash + 1);
  } else {
    versionSeparator = source.indexOf("@");
  }

  const name = versionSeparator === -1 ? source : source.slice(0, versionSeparator);
  const validName = name.startsWith("@")
    ? /^@[^/@]+\/[^/@]+$/.test(name)
    : /^[^/@]+$/.test(name);
  return validName ? `npm:${name}` : null;
}

export function readInstalledPiPackageVersion(agentDir: string, packageName: string): string | null {
  try {
    const manifest = join(agentDir, "npm", "node_modules", ...packageName.split("/"), "package.json");
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}
