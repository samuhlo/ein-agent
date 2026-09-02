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
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetNameFor, selectAsset, type AssetPlatform } from "../installer/src/core/asset-selector.ts";
import { parseChecksums } from "../installer/src/core/checksum.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "installer-release.yml");
const BUILD_SCRIPT_PATH = join(REPO_ROOT, "installer", "scripts", "build-all.ts");
const INSTALLER_PACKAGE_PATH = join(REPO_ROOT, "installer", "package.json");
const INSTALLER_VERSION_SOURCE_PATH = join(REPO_ROOT, "installer", "src", "core", "version.ts");
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const E2E_SCRIPT_PATH = join(REPO_ROOT, "e2e", "docker-test.sh");
const RELEASE_UPDATE_E2E_SCRIPT_PATH = join(REPO_ROOT, "e2e", "release-update-test.sh");

// [CONTRACT] Cuatro assets publicados y la línea "checksums.txt" deben
// casar exactamente con `assetNameFor` y `assetNameFor`'s strict shape.
const DOCUMENTED_ASSETS = [
  "ein-installer-darwin-arm64",
  "ein-installer-darwin-x64",
  "ein-installer-linux-arm64",
  "ein-installer-linux-x64",
] as const;

// `satisfies` and not an annotation: AssetPlatform widens os/arch to string,
// and assetNameFor takes the narrower literals.
const DOCUMENTED_PLATFORMS = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
] as const satisfies readonly AssetPlatform[];

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

function workflowRunScript(step: string): string {
  const runStart = step.indexOf("\n        run: |\n");
  if (runStart === -1) throw new Error("Workflow run script not found");
  return step
    .slice(runStart + "\n        run: |\n".length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

function runWorkflowScript(script: string, env: Record<string, string>, cwd?: string): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", ["-e", "-u", "-o", "pipefail", "-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
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
  const expansionOptions = new Set(["$release_prerelease_flag"]);
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
    if (expansionOptions.has(token)) continue;
    assets.push(token);
  }
  return assets;
}

function sha256(hexChars: string): string {
  return hexChars.repeat(64).slice(0, 64);
}

function runResolver(workflow: string, eventName: "push" | "workflow_dispatch", tag: string): { code: number | null; outputs: Record<string, string>; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "ein-release-resolver-"));
  const outputPath = join(root, "github-output");
  writeFileSync(outputPath, "");
  try {
    const result = runWorkflowScript(
      workflowRunScript(workflowStep(workflow, "- name: Resolve release tag")),
      {
        EVENT_NAME: eventName,
        INPUT_RELEASE_TAG: eventName === "workflow_dispatch" ? tag : "",
        PUSH_TAG: eventName === "push" ? tag : "",
        GITHUB_OUTPUT: outputPath,
      },
      REPO_ROOT,
    );
    const outputs = Object.fromEntries(
      readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    return { code: result.code, outputs, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runMetadataGate(
  workflow: string,
  tag: string,
  pointers: { packageVersion: string; sourceVersion: string; changelogVersion: string },
): { code: number | null; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "ein-release-metadata-"));
  mkdirSync(join(root, "installer", "src", "core"), { recursive: true });
  writeFileSync(join(root, "installer", "package.json"), JSON.stringify({ version: pointers.packageVersion }));
  writeFileSync(
    join(root, "installer", "src", "core", "version.ts"),
    `export const INSTALLER_VERSION = "${pointers.sourceVersion}";\n`,
  );
  writeFileSync(join(root, "CHANGELOG.md"), `# Changelog\n\n## [${pointers.changelogVersion}] - 2026-08-23\n`);
  try {
    const result = runWorkflowScript(
      workflowRunScript(workflowStep(workflow, "- name: Verify release metadata coherence")),
      { RELEASE_TAG: tag },
      root,
    );
    return { code: result.code, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPublish(workflow: string, channel: "stable" | "alpha"): { code: number | null; args: string[]; notes: string } {
  const root = mkdtempSync(join(tmpdir(), "ein-release-publish-"));
  const binDir = join(root, "bin");
  const capturePath = join(root, "gh-args");
  mkdirSync(binDir);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.82.0" }));
  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$GH_CAPTURE"\n');
  chmodSync(ghPath, 0o755);
  try {
    const result = runWorkflowScript(
      workflowRunScript(workflowStep(workflow, "- name: Publish release")),
      {
        GH_TOKEN: "fixture-token",
        RELEASE_TAG: "installer-v0.82.0",
        RELEASE_CHANNEL: channel,
        GH_CAPTURE: capturePath,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
      root,
    );
    return {
      code: result.code,
      args: existsSync(capturePath) ? readFileSync(capturePath, "utf8").trim().split("\n").filter(Boolean) : [`stderr:${result.stderr}`],
      notes: existsSync("/tmp/release-notes.md") ? readFileSync("/tmp/release-notes.md", "utf8") : "",
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("release asset contract", () => {
  // Antes este test fijaba la versión como literal —tres veces, más el nombre
  // del test— y había que editarlo en cada release. Ya se había desincronizado
  // solo: su nombre decía 0.70.0 mientras verificaba 0.71.0, y nadie lo notó.
  // El contrato no necesita saber CUÁL es la versión, sino que los tres
  // punteros digan la misma y que tenga forma de versión publicable.
  test("release preparation keeps the three authorized version pointers in sync", () => {
    const packageJson = JSON.parse(readFileSync(INSTALLER_PACKAGE_PATH, "utf8")) as { version?: unknown };
    const versionSource = readFileSync(INSTALLER_VERSION_SOURCE_PATH, "utf8");
    const changelog = readFileSync(CHANGELOG_PATH, "utf8");
    const pointers = {
      "installer/package.json": packageJson.version,
      "installer/src/core/version.ts": versionSource.match(/export const INSTALLER_VERSION = [\"']([^\"']+)[\"']/)?.[1],
      "CHANGELOG.md": changelog.match(/^## \[([^\]]+)\]/m)?.[1],
    };

    // El workflow solo acepta un tag `installer-v<SemVer>`: un puntero con
    // otra forma publicaría un release que el instalador no sabe pedir. Se
    // compara como "fichero: valor" para que el fallo nombre al culpable.
    for (const [file, version] of Object.entries(pointers)) {
      expect(`${file}: ${version}`).toMatch(
        /: (0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
      );
    }
    expect(Object.entries(pointers)).toEqual(
      Object.keys(pointers).map((file) => [file, packageJson.version]),
    );
  });

  test("workflow publishes exactly the documented asset argument set", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const buildScript = readFileSync(BUILD_SCRIPT_PATH, "utf8");
    const publishedAssets = publishedAssetArguments(workflow);

    expect(workflow.match(/^[ \t]*gh release create\b/gm) ?? []).toHaveLength(1);
    expect(publishedAssets).toHaveLength(EXPECTED_PUBLISHED_ASSETS.length);
    expect(publishedAssets).toEqual([...EXPECTED_PUBLISHED_ASSETS]);
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
    expect(smoke).toContain("stageEinCcPayload");
    expect(smoke).toContain("EIN_CC_PAYLOAD_REQUIRED_PATHS");
    expect(smoke).toContain("process.chdir(unrelatedCwd)");
    expect(smoke).toContain("runClaudeInstall");
    expect(smoke).toContain("EIN_CC_ORCHESTRATOR_ASSET");
    expect(smoke).toContain("payload staging cleanup failed");
    expect(publishedAssetArguments(workflow).filter((asset) => asset.includes("smoke"))).toEqual([]);
  });

  test("installer E2E installs root dependencies before building the embedded app", () => {
    const script = readFileSync(E2E_SCRIPT_PATH, "utf8");
    const rootInstall = '(cd "$ROOT" && bun install --frozen-lockfile)';
    const installerBuild = '(cd "$ROOT/installer" && bun install --frozen-lockfile && bun run build:all -- "$TARGET")';

    expect(script).toContain(rootInstall);
    expect(script).toContain(installerBuild);
    expect(script.indexOf(rootInstall)).toBeLessThan(script.indexOf(installerBuild));
  });

  test("installer E2E validates the current manifest-backed backup format", () => {
    const script = readFileSync(E2E_SCRIPT_PATH, "utf8");
    const legacyArchiveAssertion = '"$pi_agent/backups/installer/"*.tar.gz';

    expect(script).toContain("-name '*.snapshot'");
    expect(script).toContain('assert_present "$snapshot_dir/manifest.json"');
    expect(script).toContain('assert_present "$snapshot_dir/metadata.json"');
    expect(script).toContain('assert_present "$snapshot_dir/content"');
    expect(script).not.toContain(legacyArchiveAssertion);
  });

  test("installer E2E treats every runtime-compiled Claude binary as byte-unstable", () => {
    const script = readFileSync(E2E_SCRIPT_PATH, "utf8");

    expect(script).toContain('! -path "$root/bin/ein-cc-sdd"');
    expect(script).toContain('! -path "$root/bin/ein-surface-runner"');
    expect(script).toContain('! -path "$root/bin/ein-continuity"');
    expect(script).not.toContain('! -path "$root/bin/*"');
    expect(script).toContain("for executable in ein-cc-sdd ein-surface-runner ein-continuity");
    expect(script).toContain('diff -u "$first" "$second"');
  });

  test("installer E2E recognizes the current lowercase completion receipts", () => {
    const script = readFileSync(E2E_SCRIPT_PATH, "utf8");

    expect(script).toContain("tolower($0) ~ /pi: ein listo/");
    expect(script).toContain("tolower($0) ~ /claude code: ein listo/");
    expect(script).not.toContain("awk '/Pi:/'");
    expect(script).not.toContain("awk '/Claude Code:/'");
  });

  test("installer E2E gates rollback, launcher, preservation, and recoverable uninstall", () => {
    const script = readFileSync(E2E_SCRIPT_PATH, "utf8");

    expect(script).toContain("tests/release-update-integration.test.ts");
    expect(script).toContain("tests/installer-uninstall.test.ts");
    expect(script).toContain("tests/beta-launcher-e2e-hardening.test.ts");
    expect(script).toContain("uninstall-preservation");
    expect(script).toContain("omarchy-bun-global-bin");
    expect(script).toContain("BUN_INSTALL_GLOBAL_DIR");
    expect(script).toContain("BUN_INSTALL_BIN");
    expect(script).toContain("seed_preserved_state");
    expect(script).toContain("assert_preserved_state");
    expect(script).toContain('ein-install uninstall --yes --runtime both');
    expect(script).toContain('assert_present "$HOME/.pi-ein/agent/auth.json"');
    expect(script).toContain('assert_present "$HOME/.claude-ein/history.jsonl"');
    expect(script).toContain('assert_present "$HOME/.config/opencode-secrets/token"');
  });

  test("release workflow performs a real previous-to-published upgrade smoke", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const script = readFileSync(RELEASE_UPDATE_E2E_SCRIPT_PATH, "utf8");
    const publishStart = workflow.indexOf("- name: Publish release");
    const smokeStart = workflow.indexOf("- name: Published release upgrade smoke");
    const smokeStep = workflowStep(workflow, "- name: Published release upgrade smoke");

    expect(publishStart).toBeGreaterThanOrEqual(0);
    expect(smokeStart).toBeGreaterThan(publishStart);
    expect(smokeStep).toContain("../e2e/release-update-test.sh");
    expect(smokeStep).toContain("installer-v0.93.0-alpha.1");
    expect(smokeStep).toContain('"$RELEASE_TAG"');
    expect(script).toContain("gh release download");
    expect(script).toContain("ein-install update --yes latest");
    expect(script).toContain("assert_preserved_state");
    expect(script).toContain("E2E_RELEASE_UPDATE_RESULT=OK");
  });

  test("push and dispatch share canonical final/alpha classification and reject unsupported prereleases", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const resolver = workflowStep(workflow, "- name: Resolve release tag");
    const resolverScript = workflowRunScript(resolver);

    expect(resolverScript).toContain('if [[ "$EVENT_NAME" == "workflow_dispatch" ]]');
    expect(resolverScript).toContain('release_tag="$INPUT_RELEASE_TAG"');
    expect(resolverScript).toContain('release_tag="$PUSH_TAG"');
    expect(resolverScript).toContain('release_channel="stable"');
    expect(resolverScript).toContain('release_channel="alpha"');
    expect(resolverScript).toContain('echo "release_channel=$release_channel" >> "$GITHUB_OUTPUT"');

    for (const eventName of ["push", "workflow_dispatch"] as const) {
      for (const [tag, channel] of [
        ["installer-v0.82.0", "stable"],
        ["installer-v0.82.0+build.7", "stable"],
        ["installer-v0.82.0-alpha.1", "alpha"],
        ["installer-v0.82.0-alpha.1+build.7", "alpha"],
      ] as const) {
        const result = runResolver(workflow, eventName, tag);
        expect(result.code).toBe(0);
        expect(result.outputs).toEqual({ release_tag: tag, release_channel: channel });
      }

      for (const rejected of [
        "installer-v01.82.0",
        "installer-v0.82.0-beta.1",
        "installer-v0.82.0-rc.1",
        "installer-v0.82.0-alpha.01",
        "installer-v0.82.0-alpha..1",
      ]) {
        expect(runResolver(workflow, eventName, rejected).code).not.toBe(0);
      }
    }
  });

  test("workflow gates tag, package, runtime, and leading changelog metadata before build", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const metadataStart = workflow.indexOf("- name: Verify release metadata coherence");
    const buildStart = workflow.indexOf("- name: Build all targets (bundles template + cross-compiles)");
    const metadata = workflowStep(workflow, "- name: Verify release metadata coherence");

    expect(metadataStart).toBeGreaterThanOrEqual(0);
    expect(metadataStart).toBeLessThan(buildStart);
    expect(metadata).toContain('RELEASE_TAG: ${{ steps.resolve_release_tag.outputs.release_tag }}');
    expect(metadata).toContain('release_version="${RELEASE_TAG#installer-v}"');
    expect(metadata).toContain("installer/package.json");
    expect(metadata).toContain("installer/src/core/version.ts");
    expect(metadata).toContain("CHANGELOG.md");
    expect(metadata).toContain("INSTALLER_VERSION");
    expect(metadata).toContain("exit 1");
    expect(metadata).toContain("package_version");
    expect(metadata).toContain("source_version");
    expect(metadata).toContain("changelog_version");

    const tag = "installer-v0.82.0-alpha.1";
    expect(runMetadataGate(workflow, tag, {
      packageVersion: "0.82.0-alpha.1",
      sourceVersion: "0.82.0-alpha.1",
      changelogVersion: "0.82.0-alpha.1",
    }).code).toBe(0);
    for (const mismatch of ["packageVersion", "sourceVersion", "changelogVersion"] as const) {
      const pointers = {
        packageVersion: "0.82.0-alpha.1",
        sourceVersion: "0.82.0-alpha.1",
        changelogVersion: "0.82.0-alpha.1",
      };
      pointers[mismatch] = "0.82.0-alpha.0";
      expect(runMetadataGate(workflow, tag, pointers).code).not.toBe(0);
    }
  });

  test("only alpha publication adds prerelease metadata", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const publish = workflowStep(workflow, "- name: Publish release");
    const resolver = workflowStep(workflow, "- name: Resolve release tag");
    const publishStart = workflow.indexOf("- name: Publish release");
    const buildStart = workflow.indexOf("- name: Build all targets (bundles template + cross-compiles)");

    expect(publishStart).toBeGreaterThan(buildStart);
    expect(publish).toContain('RELEASE_CHANNEL: ${{ steps.resolve_release_tag.outputs.release_channel }}');
    expect(publish).toContain('if [[ "$RELEASE_CHANNEL" == "alpha" ]]');
    expect(publish).toContain('release_prerelease_flag="--prerelease"');
    expect(publish).toContain("$release_prerelease_flag");
    expect(publish).not.toContain("--prerelease=true");
    expect(resolver).toContain('echo "release_channel=$release_channel" >> "$GITHUB_OUTPUT"');

    const stableArgs = runPublish(workflow, "stable");
    expect(stableArgs).toEqual(expect.objectContaining({ code: 0 }));
    expect(stableArgs.args).not.toContain("--prerelease");
    expect(stableArgs.notes).toContain("installer/install.sh | bash");
    expect(stableArgs.notes).not.toContain("--release-channel alpha");
    const alphaArgs = runPublish(workflow, "alpha");
    expect(alphaArgs).toEqual(expect.objectContaining({ code: 0 }));
    expect(alphaArgs.args).toContain("--prerelease");
    expect(alphaArgs.notes).toContain('--release-channel alpha --release-tag installer-v0.82.0');
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
    expect(validation).toBe("$semver_re");
    expect(resolver).toContain("semver_re='^installer-v(0|[1-9][0-9]*)");
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

  // El release `installer-v0.73.0` se publicó vacío: el tag apuntaba a un
  // commit que era ancestro de `main`, no su punta, y el workflow no lo
  // detectó (la versión del commit SÍ coincidía con el tag). Este test fija
  // que exista un paso que compare el commit etiquetado contra `origin/main`
  // ANTES de construir, con una vía de escape explícita para hotfixes.
  test("workflow rejects a tagged commit that is not the tip of main before building", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const checkoutStart = workflow.indexOf("- uses: actions/checkout@v5");
    const buildStart = workflow.indexOf("- name: Build all targets (bundles template + cross-compiles)");
    const guardStart = workflow.indexOf("- name: Verify tagged commit is the tip of main");

    expect(checkoutStart).toBeGreaterThanOrEqual(0);
    expect(buildStart).toBeGreaterThanOrEqual(0);
    expect(guardStart).toBeGreaterThan(checkoutStart);
    expect(guardStart).toBeLessThan(buildStart);

    const guardStep = workflowStep(workflow, "- name: Verify tagged commit is the tip of main");
    expect(guardStep).toContain("git fetch origin main");
    expect(guardStep).toMatch(/git rev-parse (origin\/main|HEAD)/);
    expect(guardStep).toContain("ALLOW_NON_MAIN_TAG: ${{ inputs.allow_non_main_tag }}");
    expect(guardStep).toContain("allow_non_main_tag=true");
    expect(guardStep).toContain("main");
    expect(guardStep.toLowerCase()).toContain("hotfix");
    expect(guardStep).toContain("exit 1");
    expect(workflow.indexOf("- name: Verify tagged commit is the tip of main")).toBeLessThan(
      workflow.indexOf("- name: Verify release metadata coherence"),
    );
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
