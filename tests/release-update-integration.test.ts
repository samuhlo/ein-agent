// =============================================================================
// INTEGRATION — END-TO-END AGREEMENT VIA FAKE SEAMS
// El invariante de diseño §D exige que selector, release resuelto, asset
// seleccionado, digest adquirido, binario desplegado, template desplegado,
// marker y banner coincidan en cada escenario. Esta capa de tests compone
// los módulos de // 001–005 sobre caps falsos; nada toca red real ni
// reemplaza el proceso de test activo.
// =============================================================================

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdate } from "../installer/src/cli/update.ts";
import {
  EXIT_ALREADY_CURRENT,
  EXIT_BLOCKED_EXTERNAL_OWNER,
  EXIT_FAILED,
  EXIT_UPDATED,
} from "../installer/src/cli/result.ts";
import { bannerStatic, bannerVersionLabel, readBannerState } from "../installer/src/tui/banner.ts";
import { INSTALLER_VERSION } from "../installer/src/core/version.ts";
import { defaultUpdateCaps, type HttpResponse, type UpdateCaps } from "../installer/src/core/update-caps.ts";
import { recoverPendingTransaction, runUpdateTransaction } from "../installer/src/core/transaction.ts";

const roots: string[] = [];
const encoder = new TextEncoder();
const TARGET_VERSION = "0.20.0";
const TARGET_TAG = `installer-v${TARGET_VERSION}` as const;
const ASSET_NAME = "ein-installer-linux-x64";
const PRIOR_VERSION = "0.19.0";
const PRIOR_TAG = `installer-v${PRIOR_VERSION}` as const;

const assetBytes = encoder.encode(`verified-release-${TARGET_VERSION}`);
const assetDigest = createHash("sha256").update(assetBytes).digest("hex");
const apiLatest = `https://api.github.com/repos/samuhlo/ein-agent/releases/latest`;
const explicitUrl = `https://api.github.com/repos/samuhlo/ein-agent/releases/tags/${TARGET_TAG}`;
const assetUrl = `https://github.com/samuhlo/ein-agent/releases/download/${TARGET_TAG}/${ASSET_NAME}`;
const checksumsUrl = `https://github.com/samuhlo/ein-agent/releases/download/${TARGET_TAG}/checksums.txt`;

const beforeExecPath = process.execPath;
const beforeArgv0 = process.argv0;

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "ein-release-integration-"));
  roots.push(dir);
  return dir;
}

function releasePayload(options: { tag?: string } = {}): Uint8Array {
  return encoder.encode(JSON.stringify({
    tag_name: options.tag ?? TARGET_TAG,
    html_url: `https://github.com/samuhlo/ein-agent/releases/tag/${options.tag ?? TARGET_TAG}`,
    assets: [
      { name: ASSET_NAME, browser_download_url: assetUrl },
      { name: "checksums.txt", browser_download_url: checksumsUrl },
    ],
  }));
}

function scriptedHttp(responses: Record<string, HttpResponse | Uint8Array | Error>): UpdateCaps["http"] {
  return {
    async get(url: string): Promise<HttpResponse> {
      const scripted = responses[url];
      if (scripted === undefined) throw new Error(`Unscripted URL: ${url}`);
      if (scripted instanceof Error) throw scripted;
      if (scripted instanceof Uint8Array) return { status: 200, url, headers: {}, body: scripted };
      return scripted;
    },
  };
}

type ChildScript = (args: string[]) => { stdout: string; exitCode: number } | undefined;

function scriptedChild(script: ChildScript): { child: UpdateCaps["child"]; calls: Array<{ command: string; args: string[]; env?: Record<string, string> }> } {
  const calls: Array<{ command: string; args: string[]; env?: Record<string, string> }> = [];
  return {
    calls,
    child: {
      async spawn(command, args, options) {
        calls.push({ command, args, env: options?.env });
        const result = script(args) ?? { stdout: "", exitCode: 0 };
        return { code: result.exitCode, stdout: result.stdout };
      },
    },
  };
}

function scriptedTemplate(templateVersion: string): UpdateCaps["template"] {
  return {
    async deploy(_binary, agentDir) {
      mkdirSync(join(agentDir, "agents"), { recursive: true });
      writeFileSync(join(agentDir, "template-manifest.json"), JSON.stringify({ templateVersion }));
      writeFileSync(join(agentDir, "agents", "new.md"), "new");
    },
    async readManifest(agentDir) {
      const path = join(agentDir, "template-manifest.json");
      return JSON.parse(readFileSync(path, "utf8")) as { templateVersion?: string };
    },
  };
}

function markerBytes(version: string, owner: object, assetSha = "old"): Uint8Array {
  return encoder.encode(JSON.stringify({
    schemaVersion: 2,
    version,
    releaseTag: `installer-v${version}`,
    binaryVersion: version,
    templateVersion: version,
    installedAt: "2026-01-01T00:00:00.000Z",
    channel: "stable",
    owner,
    asset: { assetName: ASSET_NAME, sha256: assetSha },
  }));
}

function priorBytes(version: string): Uint8Array {
  return encoder.encode(`prior-${version}`);
}

function verifyAgreement(options: {
  selectorRaw: string;
  markerPath: string;
  journalPath: string;
  agentDir: string;
  destinationPath: string;
  caps: UpdateCaps;
}): void {
  const markerRaw = readFileSync(options.markerPath, "utf8");
  const marker = JSON.parse(markerRaw) as Record<string, unknown>;
  expect(marker.version).toBe(TARGET_VERSION);
  expect(marker.releaseTag).toBe(TARGET_TAG);
  expect(marker.asset).toMatchObject({ assetName: ASSET_NAME, sha256: assetDigest });
  const manifest = JSON.parse(readFileSync(join(options.agentDir, "template-manifest.json"), "utf8")) as { templateVersion?: string };
  expect(manifest.templateVersion).toBe(TARGET_VERSION);
  const installed = readFileSync(options.destinationPath);
  expect(createHash("sha256").update(installed).digest("hex")).toBe(assetDigest);
  // El banner identifica el binario que corre (INSTALLER_VERSION), no el marker.
  const banner = readBannerState(options.caps, options.markerPath, options.journalPath);
  expect(bannerVersionLabel(banner)).toBe(`v${INSTALLER_VERSION}`);
  expect(bannerStatic(banner)).toContain(`v${INSTALLER_VERSION}`);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("release update integration", () => {
  test("latest selector produces full agreement across every artifact in the verified transaction", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, priorBytes(PRIOR_VERSION));
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    const child = scriptedChild((args) => {
      if (args.includes("--version")) return { stdout: `ein-installer ${TARGET_VERSION}\ntemplate-version ${TARGET_VERSION}\n`, exitCode: 0 };
      if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
        const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
        return { stdout: JSON.stringify({ txId, releaseTag: TARGET_TAG, binaryVersion: TARGET_VERSION, templateVersion: TARGET_VERSION, status: "ok" }), exitCode: 0 };
      }
      return undefined;
    });
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
      template: scriptedTemplate(TARGET_VERSION),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_UPDATED);
    expect(output.join("\n")).toContain("Instalado verificado: v0.20.0");
    verifyAgreement({
      selectorRaw: "latest",
      markerPath,
      journalPath,
      agentDir,
      destinationPath,
      caps,
    });
    // [BLINDAJE] El proceso de test nunca se reemplaza.
    expect(process.execPath).toBe(beforeExecPath);
    expect(process.argv0).toBe(beforeArgv0);
  });

  test("explicit selector resolves to the same release identity as latest and reaches agreement", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, priorBytes(PRIOR_VERSION));
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    const child = scriptedChild((args) => {
      if (args.includes("--version")) return { stdout: `ein-installer ${TARGET_VERSION}\ntemplate-version ${TARGET_VERSION}\n`, exitCode: 0 };
      if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
        const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
        return { stdout: JSON.stringify({ txId, releaseTag: TARGET_TAG, binaryVersion: TARGET_VERSION, templateVersion: TARGET_VERSION, status: "ok" }), exitCode: 0 };
      }
      return undefined;
    });
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [explicitUrl]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
      template: scriptedTemplate(TARGET_VERSION),
    };
    const output: string[] = [];
    const code = await runUpdate([TARGET_VERSION], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_UPDATED);
    expect(output.join("\n")).toContain(`Release resuelto: ${TARGET_TAG}`);
    verifyAgreement({
      selectorRaw: TARGET_VERSION,
      markerPath,
      journalPath,
      agentDir,
      destinationPath,
      caps,
    });
  });

  test("already-current returns without mutating when marker, binary, template and digest already agree", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, assetBytes);
    chmodSync(destinationPath, 0o755);
    writeFileSync(join(agentDir, "template-manifest.json"), JSON.stringify({ templateVersion: TARGET_VERSION }));
    writeFileSync(markerPath, markerBytes(TARGET_VERSION, { type: "standalone" }, assetDigest));

    const base = defaultUpdateCaps();
    const child = scriptedChild((args) => args.includes("--version") ? { stdout: `ein-installer ${TARGET_VERSION}\ntemplate-version ${TARGET_VERSION}\n`, exitCode: 0 } : undefined);
    // [NOTE] La transacción actual adquiere antes de evaluar coherencia; se
    // aportan las respuestas de bytes para que la verificación pueda cerrarse.
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
      template: scriptedTemplate(TARGET_VERSION),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_ALREADY_CURRENT);
    expect(output.join("\n")).toContain("Ya está actualizado.");
    expect(createHash("sha256").update(readFileSync(destinationPath)).digest("hex")).toBe(assetDigest);
    expect(JSON.parse(readFileSync(join(agentDir, "template-manifest.json"), "utf8"))).toMatchObject({ templateVersion: TARGET_VERSION });
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: TARGET_VERSION, asset: { sha256: assetDigest } });
  });

  test("marker mismatch proceeds through the verified transaction and lands on full agreement", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, priorBytes(PRIOR_VERSION));
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes("0.18.0", { type: "standalone" }, "stale-digest"));

    const base = defaultUpdateCaps();
    const child = scriptedChild((args) => {
      if (args.includes("--version")) return { stdout: `ein-installer ${TARGET_VERSION}\ntemplate-version ${TARGET_VERSION}\n`, exitCode: 0 };
      if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
        const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
        return { stdout: JSON.stringify({ txId, releaseTag: TARGET_TAG, binaryVersion: TARGET_VERSION, templateVersion: TARGET_VERSION, status: "ok" }), exitCode: 0 };
      }
      return undefined;
    });
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
      template: scriptedTemplate(TARGET_VERSION),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_UPDATED);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: TARGET_VERSION, asset: { sha256: assetDigest } });
    verifyAgreement({
      selectorRaw: "latest",
      markerPath,
      journalPath,
      agentDir,
      destinationPath,
      caps,
    });
  });

  test("external-owner installation blocks the transaction and leaves binary, template and marker untouched", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "package-manager", manager: "homebrew" }, "external-digest"));

    const base = defaultUpdateCaps();
    // [CONTRACT] La transacción actual adquiere primero y luego bloquea por
    // owner; el script HTTP cubre las llamadas que ocurrirían si no fuera
    // externo, y la respuesta nunca se usa tras el bloqueo.
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_BLOCKED_EXTERNAL_OWNER);
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: PRIOR_VERSION, owner: { type: "package-manager", manager: "homebrew" } });
    expect(output.join("\n")).toContain("homebrew");
  });

  test("checksum mismatch preserves prior identity across binary, template and marker", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    const wrongDigest = "0".repeat(64);
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${wrongDigest}  ${ASSET_NAME}\n`),
      }),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_FAILED);
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: PRIOR_VERSION });
    expect(output.join("\n")).toMatch(/verifying|acquiring-metadata/);
  });

  test("transaction failure during child continuation rolls back and preserves prior identity", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    const child = scriptedChild((args) => {
      if (args.includes("--version")) return { stdout: `ein-installer ${TARGET_VERSION}\ntemplate-version ${TARGET_VERSION}\n`, exitCode: 0 };
      // [GUARD] El continuation falla; el binario hijo nunca confirma la identidad.
      if (args.some((arg) => arg.startsWith("--ein-continuation="))) return { stdout: "", exitCode: 1 };
      return undefined;
    });
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
      template: scriptedTemplate(TARGET_VERSION),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_FAILED);
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: PRIOR_VERSION });
    expect(output.join("\n")).toMatch(/continuing|recovering/);
  });

  test("interruption during a prepared transaction is detected as recovery-required on the next invocation", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, priorBytes(PRIOR_VERSION));
    chmodSync(destinationPath, 0o755);

    // Journal pendiente válido: el parent murió tras binary-replaced pero antes de marker-committed.
    writeFileSync(journalPath, encoder.encode(`${JSON.stringify({
      schemaVersion: 1,
      txId: "tx-stuck",
      target: TARGET_TAG,
      owner: { type: "standalone" },
      state: "binary-replaced",
      artifacts: { binary: join(dir, "ein.backup"), template: join(dir, "snapshot") },
    })}\n`));

    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, template: scriptedTemplate(TARGET_VERSION) };
    const recovery = await recoverPendingTransaction({ caps, journalPath });
    expect(recovery.ok).toBe(false);
    if (!recovery.ok) {
      expect(recovery.error.code).toBe("recovery-required");
      expect(recovery.error.stage).toBe("recovering");
    }
    // Sin journal pendiente el flujo vuelve a estar limpio.
    rmSync(journalPath);
    expect((await recoverPendingTransaction({ caps, journalPath })).ok).toBe(true);
  });

  test("pending journal present at start blocks any new update attempt with recovery-required", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, priorBytes(PRIOR_VERSION));
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));
    writeFileSync(journalPath, encoder.encode(`${JSON.stringify({
      schemaVersion: 1,
      txId: "tx-stuck",
      target: TARGET_TAG,
      owner: { type: "standalone" },
      state: "binary-replaced",
      artifacts: { binary: join(dir, "ein.backup"), template: join(dir, "snapshot") },
    })}\n`));

    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, http: scriptedHttp({}) };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("recuperación");
  });

  test("acquisition failure with missing checksums preserves prior identity", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const releaseWithoutChecksums = encoder.encode(JSON.stringify({
      tag_name: TARGET_TAG,
      html_url: `https://github.com/samuhlo/ein-agent/releases/tag/${TARGET_TAG}`,
      assets: [{ name: ASSET_NAME, browser_download_url: assetUrl }],
    }));
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releaseWithoutChecksums,
        [assetUrl]: assetBytes,
      }),
    };
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_FAILED);
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: PRIOR_VERSION });
  });

  test("identity mismatch between staged bytes and selected release fails before any replacement", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    // El probe devuelve 0.21.0 aunque la release es 0.20.0 → mismatch.
    const child = scriptedChild((args) => args.includes("--version") ? { stdout: "ein-installer 0.21.0\ntemplate-version 0.21.0\n", exitCode: 0 } : undefined);
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({
        [apiLatest]: releasePayload(),
        [assetUrl]: assetBytes,
        [checksumsUrl]: encoder.encode(`${assetDigest}  ${ASSET_NAME}\n`),
      }),
      child: child.child,
    };
    const outcome = await runUpdateTransaction({
      caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
    });
    expect(outcome.type).toBe("failed");
    if (outcome.type === "failed") {
      expect(outcome.stage).toBe("verifying");
      expect(outcome.message.toLowerCase()).toContain("does not match");
    }
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
  });

  test("dry-run returns without mutating any artifact even when release and binary already agree", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    const priorBinary = priorBytes(PRIOR_VERSION);
    writeFileSync(destinationPath, priorBinary);
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, markerBytes(PRIOR_VERSION, { type: "standalone" }));

    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: scriptedHttp({ [apiLatest]: releasePayload() }),
    };
    const outcome = await runUpdateTransaction({
      caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath,
      destinationPath,
      dryRun: true,
    });
    expect(outcome.type).toBe("dry-run");
    expect(readFileSync(destinationPath)).toEqual(priorBinary);
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({ version: PRIOR_VERSION });
  });
});
