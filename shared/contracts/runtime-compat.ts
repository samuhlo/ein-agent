// =============================================================================
// PI RUNTIME COMPATIBILITY
// Pi and its managed extensions intentionally follow npm's latest dist-tag.
// Ein must adapt when upstream moves; install/update resolve the moving tag and
// CI tests against it instead of preserving an older known-good runtime.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PI_HOST_PACKAGE = "@earendil-works/pi-coding-agent";
export const PI_RUNTIME_DIST_TAG = "latest";
export const PI_HOST_SPEC = `${PI_HOST_PACKAGE}@${PI_RUNTIME_DIST_TAG}`;
export const PI_NODE_MIN_VERSION = "22.19.0";

const packageContract = <const Name extends string>(
  name: Name,
) => ({ name, spec: `npm:${name}@${PI_RUNTIME_DIST_TAG}` as const });

export const REQUIRED_PI_PACKAGES = [
  packageContract("pi-subagents"),
  packageContract("pi-mcp-adapter"),
  packageContract("context-mode"),
  packageContract("@juicesharp/rpiv-ask-user-question"),
  packageContract("@juicesharp/rpiv-i18n"),
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

export function isPublishedPackageVersion(version: string | null): boolean {
  return version !== null && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version);
}
