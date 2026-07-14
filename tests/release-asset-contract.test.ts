// =============================================================================
// ASSET CONTRACT — PIN WORKFLOW AND BUILD-SCRIPT SHAPE
// El contrato entre `.github/workflows/installer-release.yml` + `installer/
// scripts/build-all.ts` y `asset-selector.ts` + `checksum.ts` debe
// permanecer estable: los nombres de asset publicados y el formato exacto de
// `checksums.txt` se leen como texto, sin ejecutar el workflow ni
// `build:all`. Si el workflow cambiara, este test rompe y obliga a revisar
// `parseChecksums` y `selectAsset` deliberadamente.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetNameFor, selectAsset, type AssetPlatform } from "../installer/src/core/asset-selector.ts";
import { parseChecksums } from "../installer/src/core/checksum.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "installer-release.yml");
const BUILD_SCRIPT_PATH = join(REPO_ROOT, "installer", "scripts", "build-all.ts");

// [CONTRACT] Cuatro assets publicados y la línea "checksums.txt" deben
// casar exactamente con `assetNameFor` y `assetNameFor`'s strict shape.
const DOCUMENTED_ASSETS = [
  "ein-installer-darwin-arm64",
  "ein-installer-darwin-x64",
  "ein-installer-linux-arm64",
  "ein-installer-linux-x64",
] as const;

const DOCUMENTED_PLATFORMS: AssetPlatform[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
];

function sha256(hexChars: string): string {
  return hexChars.repeat(64).slice(0, 64);
}

describe("release asset contract", () => {
  test("workflow + build script still reference exactly the four documented assets", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const buildScript = readFileSync(BUILD_SCRIPT_PATH, "utf8");
    for (const asset of DOCUMENTED_ASSETS) {
      expect(workflow).toContain(asset);
      expect(buildScript).toContain(asset);
    }
    expect(workflow).toContain("checksums.txt");
    expect(workflow).toMatch(/sha256sum ein-installer-\*/);
    expect(buildScript).toMatch(/bunTarget:\s*"bun-(darwin|linux)-(arm64|x64)"/);
  });

  test("selectAsset accepts only the documented platform names", () => {
    for (const platform of DOCUMENTED_PLATFORMS) {
      const selection = selectAsset(platform, {
        assets: [{ name: assetNameFor(platform.os, platform.arch), downloadUrl: "https://example.test" }],
      });
      expect(selection.ok).toBe(true);
      if (selection.ok) expect(selection.value.assetName).toBe(assetNameFor(platform.os, platform.arch));
    }
    for (const undocumented of ["ein-installer-windows-arm64", "ein-installer-linux-armv7", "ein-installer-0.20.0"]) {
      const selection = selectAsset({ os: "linux", arch: "x64" }, { assets: [{ name: undocumented, downloadUrl: "https://example.test" }] });
      expect(selection).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "missing-asset-on-release" }) }));
    }
  });

  test("WSL maps to the linux-x64 asset but never to a darwin build", () => {
    const selection = selectAsset({ os: "darwin", arch: "x64", isWsl: true }, { assets: [{ name: "ein-installer-linux-x64", downloadUrl: "https://example.test" }] });
    expect(selection).toEqual({ ok: true, value: { assetName: "ein-installer-linux-x64", os: "linux", arch: "x64", wsl: true } });
  });

  test("parses the GNU sha256sum line shape that the workflow emits", () => {
    const digest = sha256("a");
    const line = `${digest}  ein-installer-linux-x64\n`;
    expect(parseChecksums(line, "ein-installer-linux-x64")).toEqual({
      ok: true,
      value: { assetName: "ein-installer-linux-x64", sha256: digest },
    });
  });

  test("rejects BSD-style binary marker because the workflow does not emit it", () => {
    const digest = sha256("b");
    // BSD shasum precede el nombre con `*`; si el workflow adoptara ese
    // formato, este test avisaría y exigiría una decisión de diseño antes de
    // debilitar `parseChecksums`.
    const parsed = parseChecksums(`${digest} *ein-installer-linux-x64\n`, "ein-installer-linux-x64");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe("malformed");
  });

  test("rejects duplicate entries, malformed hashes, and unrelated targets", () => {
    const digest = sha256("c");
    expect(parseChecksums(`${digest}  ein-installer-linux-x64\n${digest}  ein-installer-linux-x64\n`, "ein-installer-linux-x64"))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "duplicate-entry" }) }));
    expect(parseChecksums(`zzz  ein-installer-linux-x64\n`, "ein-installer-linux-x64"))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "malformed" }) }));
    expect(parseChecksums(`${digest}  ein-installer-darwin-arm64\n`, "ein-installer-linux-x64"))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "missing-entry" }) }));
    expect(parseChecksums("", "ein-installer-linux-x64"))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "missing-entry" }) }));
  });
});
