import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdate } from "../installer/src/cli/update.ts";
import { EXIT_DRY_RUN, EXIT_FAILED } from "../installer/src/cli/result.ts";
import {
  createTransaction,
  inspectPendingTransaction,
  recoverPendingTransaction,
  type Journal,
  type JournalState,
} from "../installer/src/core/transaction.ts";
import type { HttpResponse, UpdateCaps } from "../installer/src/core/update-caps.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { writeReleaseChannelPreference } from "../installer/src/core/release-channel-preference.ts";
import { deriveArtifactId } from "../installer/src/core/release-types.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";

const encoder = new TextEncoder();
const roots: string[] = [];
const journalPath = "/fake/journal.json";
const markerPath = "/fake/marker.json";

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ein-dry-run-recovery-"));
  roots.push(value);
  return value;
}

function journal(state: JournalState): Journal {
  const base: Journal = {
    schemaVersion: 1,
    txId: `tx-${state}`,
    target: "installer-v0.20.0",
    owner: { type: "standalone" },
    state,
    artifacts: {},
  };
  if (state !== "recovery-succeeded") return base;
  const artifactId = deriveArtifactId("installer-v0.20.0", "a".repeat(64));
  if (!artifactId.ok) throw new Error(artifactId.error.message);
  return {
    ...base,
    authority: "local",
    previousArtifactId: { status: "none" },
    attemptedArtifactId: { status: "present", artifactId: artifactId.value },
    managedTree: "/fake/agent",
    backupReference: "/fake/backup",
    rollbackOutcome: { status: "succeeded" },
  };
}

function bytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function marker(): Uint8Array {
  return bytes({
    schemaVersion: 2,
    version: "0.19.0",
    releaseTag: "installer-v0.19.0",
    binaryVersion: "0.19.0",
    templateVersion: "0.19.0",
    installedAt: "2026-01-01T00:00:00.000Z",
    channel: "stable",
    owner: { type: "standalone" },
    artifactId: `installer-v0.19.0@sha256:${"b".repeat(64)}`,
    asset: { assetName: "ein-installer-linux-x64", sha256: "b".repeat(64) },
  });
}

function releaseHttp(requests: string[] = []): UpdateCaps["http"] {
  return {
    async get(url): Promise<HttpResponse> {
      requests.push(url);
      return {
        status: 200,
        url,
        headers: {},
        body: bytes([{
          tag_name: "installer-v0.20.0",
          html_url: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.20.0",
          draft: false,
          prerelease: false,
          assets: [],
        }]),
      };
    },
  };
}

function mutationGuardCaps(files: Map<string, Uint8Array>, requests: string[] = []): UpdateCaps {
  const mutation = (name: string): never => { throw new Error(`unexpected mutation: ${name}`); };
  return fakeUpdateCaps({
    files,
    http: releaseHttp(requests),
    hashFile: async () => mutation("hashFile"),
    fs: {
      createTempDir: () => mutation("createTempDir"),
      writeFile: () => mutation("writeFile"),
      makeDir: () => mutation("makeDir"),
      copyDir: () => mutation("copyDir"),
      removeDir: () => mutation("removeDir"),
      createSiblingFile: () => mutation("createSiblingFile"),
      copyFile: () => mutation("copyFile"),
      chmod: () => mutation("chmod"),
      rename: () => mutation("rename"),
      removeFile: () => mutation("removeFile"),
      fsyncDir: () => mutation("fsyncDir"),
    },
    child: { spawn: async () => mutation("child.spawn") },
    template: {
      deploy: async () => mutation("template.deploy"),
      readManifest: async () => mutation("template.readManifest"),
      queryInventory: async () => mutation("template.queryInventory"),
    },
  });
}

function snapshotTree(path: string): Array<{ path: string; mode: number; bytes?: string }> {
  const entries: Array<{ path: string; mode: number; bytes?: string }> = [];
  const visit = (current: string, relative: string): void => {
    for (const name of readdirSync(current).sort()) {
      const absolute = join(current, name);
      const child = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push({ path: `${child}/`, mode: stat.mode });
        visit(absolute, child);
      } else {
        entries.push({ path: child, mode: stat.mode, bytes: readFileSync(absolute).toString("base64") });
      }
    }
  };
  visit(path, "");
  return entries;
}

async function simulate(files: Map<string, Uint8Array>, args = ["--dry-run"]): Promise<{ code: number; output: string; requests: string[] }> {
  const output: string[] = [];
  const requests: string[] = [];
  const forbidden = async (): Promise<never> => { throw new Error("unexpected package mutation"); };
  const code = await runUpdate(args, {
    caps: mutationGuardCaps(files, requests),
    platform: { os: "linux", arch: "x64" },
    agentDir: "/fake/agent",
    markerPath,
    journalPath,
    destinationPath: "/fake/ein",
    installationPath: "/fake",
    interactive: false,
    write: (line) => output.push(line),
    promote: () => { throw new Error("unexpected command promotion"); },
    updatePi: forbidden,
    syncPiPackages: forbidden,
    refreshExternalTools: forbidden,
  });
  return { code, output: output.join("\n"), requests };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("pending update journal inspection", () => {
  test("classifies every journal state through the shared read-only parser", () => {
    const activeStates: JournalState[] = [
      "prepared",
      "binary-replaced",
      "child-reexecuted",
      "template-deployed",
      "marker-committed",
      "validated",
    ];
    for (const state of activeStates) {
      const files = new Map([[journalPath, bytes(journal(state))]]);
      expect(inspectPendingTransaction({ fs: mutationGuardCaps(files).fs, journalPath })).toMatchObject({
        status: "recovery-required",
        pendingAction: "recover",
        journal: { state },
      });
    }

    expect(inspectPendingTransaction({ fs: mutationGuardCaps(new Map([[journalPath, bytes(journal("complete"))]])).fs, journalPath }))
      .toMatchObject({ status: "committed-finalization-pending", pendingAction: "finalize", journal: { state: "complete" } });
    expect(inspectPendingTransaction({ fs: mutationGuardCaps(new Map([[journalPath, bytes(journal("recovery-succeeded"))]])).fs, journalPath }))
      .toMatchObject({ status: "terminal-cleanup-pending", pendingAction: "cleanup", journal: { state: "recovery-succeeded" } });
    expect(inspectPendingTransaction({
      fs: mutationGuardCaps(new Map([[journalPath, bytes({
        ...journal("complete"),
        owner: { type: "ownership-ambiguous", reason: "legacy identity unavailable" },
      })]])).fs,
      journalPath,
    })).toMatchObject({ status: "recovery-required", pendingAction: "recover" });
    expect(inspectPendingTransaction({ fs: mutationGuardCaps(new Map()).fs, journalPath })).toEqual({ status: "absent" });
  });

  test("distinguishes malformed and failed reads from an absent journal", () => {
    expect(inspectPendingTransaction({
      fs: mutationGuardCaps(new Map([[journalPath, encoder.encode("not-json")]])).fs,
      journalPath,
    })).toEqual({ status: "unreadable", reason: "Pending transaction journal is malformed" });

    expect(inspectPendingTransaction({
      fs: { exists: () => true, readFile: () => { throw new Error("permission denied"); } },
      journalPath,
    })).toEqual({ status: "unreadable", reason: "permission denied" });
  });
});

describe("update dry-run recovery boundary", () => {
  test("keeps the complete installation tree byte-for-byte and mode-for-mode across journal states", async () => {
    const cases: Array<{ name: string; content?: Uint8Array; exitCode: number }> = [
      { name: "absent", exitCode: EXIT_DRY_RUN },
      { name: "complete", content: bytes(journal("complete")), exitCode: EXIT_DRY_RUN },
      { name: "recovery-succeeded", content: bytes(journal("recovery-succeeded")), exitCode: EXIT_DRY_RUN },
      { name: "active", content: bytes(journal("binary-replaced")), exitCode: EXIT_FAILED },
      { name: "corrupt", content: encoder.encode("corrupt"), exitCode: EXIT_FAILED },
    ];

    for (const fixture of cases) {
      const dir = root();
      const agentDir = join(dir, "agent");
      const realMarkerPath = join(agentDir, ".ein-install.json");
      const realJournalPath = join(dir, "journal.json");
      const destinationPath = join(dir, "ein");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(realMarkerPath, marker());
      writeFileSync(destinationPath, "installed-binary");
      chmodSync(destinationPath, 0o755);
      expect(writeReleaseChannelPreference(dir, "stable")).toEqual({ status: "explicit", channel: "stable" });
      if (fixture.content) {
        writeFileSync(realJournalPath, fixture.content);
        chmodSync(realJournalPath, 0o640);
      }
      const before = snapshotTree(dir);
      const base = defaultUpdateCaps();
      const mutation = (name: string): never => { throw new Error(`unexpected disk mutation: ${name}`); };
      const caps: UpdateCaps = {
        ...base,
        http: releaseHttp(),
        fs: {
          ...base.fs,
          createTempDir: () => mutation("createTempDir"),
          writeFile: () => mutation("writeFile"),
          makeDir: () => mutation("makeDir"),
          copyDir: () => mutation("copyDir"),
          removeDir: () => mutation("removeDir"),
          createSiblingFile: () => mutation("createSiblingFile"),
          copyFile: () => mutation("copyFile"),
          chmod: () => mutation("chmod"),
          rename: () => mutation("rename"),
          removeFile: () => mutation("removeFile"),
          fsyncDir: () => mutation("fsyncDir"),
        },
        child: { spawn: async () => mutation("child.spawn") },
      };
      const output: string[] = [];
      const code = await runUpdate(["--dry-run", "--channel", "alpha"], {
        caps,
        platform: { os: "linux", arch: "x64" },
        agentDir,
        markerPath: realMarkerPath,
        journalPath: realJournalPath,
        destinationPath,
        installationPath: dir,
        interactive: false,
        write: (line) => output.push(line),
        promote: () => mutation("promote"),
        updatePi: async () => mutation("updatePi"),
        syncPiPackages: async () => mutation("syncPiPackages"),
        refreshExternalTools: async () => mutation("refreshExternalTools"),
      });

      expect(code, fixture.name).toBe(fixture.exitCode);
      expect(snapshotTree(dir), fixture.name).toEqual(before);
    }
  });

  test("reports committed finalization without spawning or changing journal bytes", async () => {
    const original = bytes(journal("complete"));
    const files = new Map([[markerPath, marker()], [journalPath, original]]);
    const result = await simulate(files);

    expect(result.code).toBe(EXIT_DRY_RUN);
    expect(result.output).toContain("Finalización pendiente");
    expect(result.output).toContain("no se modificó la instalación");
    expect(files.get(journalPath)).toEqual(original);
    expect(result.requests).toHaveLength(1);
  });

  test("reports terminal cleanup without deleting or rewriting the journal", async () => {
    const original = bytes(journal("recovery-succeeded"));
    const files = new Map([[markerPath, marker()], [journalPath, original]]);
    const result = await simulate(files);

    expect(result.code).toBe(EXIT_DRY_RUN);
    expect(result.output).toContain("Recuperación pendiente");
    expect(files.get(journalPath)).toEqual(original);
  });

  test("blocks on active or unreadable recovery state without remote resolution or mutation", async () => {
    for (const pending of [bytes(journal("prepared")), encoder.encode("corrupt")]) {
      const files = new Map([[markerPath, marker()], [journalPath, pending]]);
      const result = await simulate(files);
      expect(result.code).toBe(EXIT_FAILED);
      expect(result.output).toContain("La simulación detecta una recuperación pendiente; no se ha modificado la instalación");
      expect(files.get(journalPath)).toEqual(pending);
      expect(result.requests).toEqual([]);
    }
  });

  test("rejects invalid flags and selectors before committed recovery can clean or spawn", async () => {
    for (const args of [["--channel"], ["--dry-run", "0.20"]]) {
      const original = bytes(journal("complete"));
      const files = new Map([[markerPath, marker()], [journalPath, original]]);
      const result = await simulate(files, args);
      expect(result.code).toBe(EXIT_FAILED);
      expect(files.get(journalPath)).toEqual(original);
      expect(result.requests).toEqual([]);
    }
  });

  test("keeps real terminal cleanup behavior after a dry-run", async () => {
    const dir = root();
    const realJournalPath = join(dir, "journal.json");
    writeFileSync(realJournalPath, bytes(journal("recovery-succeeded")));
    const before = readFileSync(realJournalPath);
    const mode = statSync(realJournalPath).mode;

    const inspection = inspectPendingTransaction({ fs: defaultUpdateCaps().fs, journalPath: realJournalPath });
    expect(inspection.status).toBe("terminal-cleanup-pending");
    expect(readFileSync(realJournalPath)).toEqual(before);
    expect(statSync(realJournalPath).mode).toBe(mode);

    expect(await recoverPendingTransaction({ caps: defaultUpdateCaps(), journalPath: realJournalPath }))
      .toEqual({ ok: true, value: "clean" });
    expect(existsSync(realJournalPath)).toBe(false);
  });

  test("keeps real committed finalization behavior after a dry-run", async () => {
    const dir = root();
    const realJournalPath = join(dir, "journal.json");
    writeFileSync(realJournalPath, bytes(journal("complete")));
    chmodSync(realJournalPath, 0o640);
    const before = readFileSync(realJournalPath);
    let finalized = 0;

    expect(inspectPendingTransaction({ fs: defaultUpdateCaps().fs, journalPath: realJournalPath }).status)
      .toBe("committed-finalization-pending");
    expect(readFileSync(realJournalPath)).toEqual(before);
    expect(statSync(realJournalPath).mode & 0o777).toBe(0o640);

    expect(await recoverPendingTransaction({
      caps: defaultUpdateCaps(),
      journalPath: realJournalPath,
      finalizeCommitted: () => { finalized += 1; return true; },
    })).toEqual({ ok: true, value: "clean" });
    expect(finalized).toBe(1);
    expect(existsSync(realJournalPath)).toBe(false);
  });

  test("preserves real rollback recovery for a non-terminal journal", async () => {
    const dir = root();
    const realJournalPath = join(dir, "journal.json");
    const caps = defaultUpdateCaps();
    const tx = createTransaction({ caps, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath: realJournalPath });
    expect(tx.prepare({}).ok).toBe(true);
    expect(existsSync(realJournalPath)).toBe(true);
    expect(await recoverPendingTransaction({ caps, journalPath: realJournalPath, recover: () => true }))
      .toEqual({ ok: true, value: "recovered" });
    expect(existsSync(realJournalPath)).toBe(false);
  });
});
