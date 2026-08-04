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

const EXPECTED_PUBLISHED_ASSETS = [
  "dist/ein-installer-darwin-arm64",
  "dist/ein-installer-darwin-x64",
  "dist/ein-installer-linux-arm64",
  "dist/ein-installer-linux-x64",
  "dist/checksums.txt",
  "install.sh",
] as const;

const RELEASE_TAG_OUTPUT = "${{ steps.resolve_release_tag.outputs.release_tag }}";

function workflowStep(workflow: string, marker: string): string {
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`Workflow step not found: ${marker}`);
  const end = workflow.indexOf("\n      - ", start + marker.length);
  return workflow.slice(start, end === -1 ? workflow.length : end);
}

function workflowDispatchInput(workflow: string, name: string): string {
  const dispatchStart = workflow.indexOf("  workflow_dispatch:");
  const dispatchEnd = workflow.indexOf("\n\npermissions:", dispatchStart);
  if (dispatchStart === -1 || dispatchEnd === -1) throw new Error("workflow_dispatch block not found");

  const dispatch = workflow.slice(dispatchStart, dispatchEnd);
  const inputStart = dispatch.indexOf(`      ${name}:`);
  if (inputStart === -1) throw new Error(`workflow_dispatch input not found: ${name}`);
  const inputBody = dispatch.slice(inputStart);
  const nextInput = inputBody.search(/\n      [A-Za-z0-9_-]+:/);
  return inputBody.slice(0, nextInput === -1 ? inputBody.length : nextInput);
}

function shellTokens(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) => token.replace(/^["']|["']$/g, ""));
}

function publishedAssetArguments(workflow: string): string[] {
  const commandStart = workflow.indexOf("gh release create");
  if (commandStart === -1) throw new Error("gh release create command not found");

  const commandLines: string[] = [];
  for (const line of workflow.slice(commandStart).split("\n")) {
    const trimmed = line.trim();
    commandLines.push(trimmed.replace(/\\$/, ""));
    if (!trimmed.endsWith("\\")) break;
  }

  const tokens = shellTokens(commandLines.join(" "));
  if (tokens.slice(0, 3).join(" ") !== "gh release create") throw new Error("Unexpected release command shape");

  const assets: string[] = [];
  const valueOptions = new Set(["--title", "--notes-file"]);
  let releaseTagSeen = false;
  for (let index = 3; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!releaseTagSeen) {
      releaseTagSeen = true;
      continue;
    }
    if (token.startsWith("--")) {
      if (valueOptions.has(token)) index += 1;
      continue;
    }
    assets.push(token);
  }
  return assets;
}

function sha256(hexChars: string): string {
  return hexChars.repeat(64).slice(0, 64);
}

describe("release asset contract", () => {
  test("workflow publishes exactly the documented asset argument set", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const buildScript = readFileSync(BUILD_SCRIPT_PATH, "utf8");
    const publishedAssets = publishedAssetArguments(workflow);

    expect(workflow.match(/^[ \t]*gh release create\b/gm) ?? []).toHaveLength(1);
    expect(publishedAssets).toHaveLength(EXPECTED_PUBLISHED_ASSETS.length);
    expect(publishedAssets).toEqual(EXPECTED_PUBLISHED_ASSETS);
    for (const asset of DOCUMENTED_ASSETS) expect(buildScript).toContain(asset);
    expect(workflow).toMatch(/sha256sum ein-installer-\*/);
    expect(buildScript).toMatch(/bunTarget:\s*"bun-(darwin|linux)-(arm64|x64)"/);
  });

  test("compiled BunFS payload smoke is required before checksums and publishing", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const smoke = readFileSync(join(REPO_ROOT, "installer", "scripts", "cc-payload-smoke.ts"), "utf8");
    const smokeStep = workflowStep(workflow, "- name: Compiled BunFS payload smoke (Linux x64)");
    const buildStart = workflow.indexOf("- name: Build all targets (bundles template + cross-compiles)");
    const smokeStart = workflow.indexOf("- name: Compiled BunFS payload smoke (Linux x64)");
    const checksumsStart = workflow.indexOf("- name: Checksums");

    expect(buildStart).toBeGreaterThanOrEqual(0);
    expect(smokeStart).toBeGreaterThan(buildStart);
    expect(checksumsStart).toBeGreaterThan(smokeStart);
    expect(smokeStep).toContain("bun build scripts/cc-payload-smoke.ts");
    expect(smokeStep).toContain("--compile");
    expect(smokeStep).toContain("--target=bun-linux-x64");
    expect(smokeStep).toContain("--outfile /tmp/ein-cc-payload-smoke");
    expect(smokeStep).toContain("(cd /tmp && /tmp/ein-cc-payload-smoke)");
    expect(smoke).toContain("stageCcEinPayload");
    expect(smoke).toContain("CC_EIN_PAYLOAD_REQUIRED_PATHS");
    expect(smoke).toContain("process.chdir(unrelatedCwd)");
    expect(smoke).toContain("staged?.cleanup()");
    expect(publishedAssetArguments(workflow).filter((asset) => asset.includes("smoke"))).toEqual([]);
  });

  test("manual dispatch requires a validated release tag for checkout and publishing", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const input = workflowDispatchInput(workflow, "release_tag");
    const resolver = workflowStep(workflow, "- name: Resolve release tag");
    const checkout = workflowStep(workflow, "- uses: actions/checkout@v5");
    const publish = workflowStep(workflow, "- name: Publish release");
    const validation = resolver.match(/=~\s+(\S+)/)?.[1];

    expect(input).toMatch(/required:\s*true/);
    expect(input).toMatch(/type:\s*string/);
    expect(resolver).toContain("\n        working-directory: .\n");
    expect(resolver).toContain('if [[ "$EVENT_NAME" == "workflow_dispatch" ]]');
    expect(resolver).toContain('INPUT_RELEASE_TAG: ${{ inputs.release_tag }}');
    expect(resolver).toContain('PUSH_TAG: ${{ github.ref_name }}');
    expect(validation).toBe("^installer-v[0-9]+\\.[0-9]+\\.[0-9]+$");
    expect(resolver).toContain('release_tag="$INPUT_RELEASE_TAG"');
    expect(resolver).toContain('release_tag="$PUSH_TAG"');
    expect(resolver).toContain('echo "release_tag=$release_tag" >> "$GITHUB_OUTPUT"');
    expect(checkout).toContain(`ref: ${RELEASE_TAG_OUTPUT}`);
    expect(publish).toContain(`RELEASE_TAG: ${RELEASE_TAG_OUTPUT}`);
    expect(publish).toContain('gh release create "$RELEASE_TAG"');
    expect(publish).not.toContain('gh release create "${GITHUB_REF_NAME}"');
    expect(publish).toContain("release_version=\"$(jq -er '.version | strings' package.json)\"");
    expect(publish).toContain('--title "EIN v${release_version}"');
    expect(publish).not.toContain("einDisplayVersion");
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
