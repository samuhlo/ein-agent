import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { probeBinaryVersion, verifyBinaryIdentity } from "../installer/src/core/binary-probe.ts";
import { runUpdateContinuation, spawnContinuation } from "../installer/src/core/child-continuation.ts";
import {
  cleanupExecutableCandidate,
  commitExecutableCandidate,
  prepareExecutableCandidate,
  replaceAndContinueExecutable,
  restoreExecutableCandidate,
} from "../installer/src/core/executable.ts";
import { defaultUpdateCaps, type FileEntry, type UpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";

const roots: string[] = [];
const beforeExecPath = process.execPath;
const beforeArgv0 = process.argv0;

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ein-release-exec-"));
  roots.push(root);
  return root;
}

function stagedFiles(): { root: string; source: string; destination: string } {
  const root = fixtureRoot();
  const source = join(root, "verified-release");
  const destination = join(root, "ein");
  writeFileSync(source, "new executable");
  writeFileSync(destination, "old executable");
  chmodSync(destination, 0o751);
  return { root, source, destination };
}

function crossFilesystemCaps(): UpdateCaps {
  const entries = new Map<string, FileEntry>([
    ["/stage/release", { kind: "file", mode: 0o755, uid: 1, dev: 1 }],
    ["/bin/ein", { kind: "file", mode: 0o755, uid: 1, dev: 1 }],
    ["/bin", { kind: "directory", mode: 0o755, uid: 1, dev: 1 }],
    ["/bin/.ein-candidate", { kind: "file", mode: 0o755, uid: 1, dev: 2 }],
  ]);
  return fakeUpdateCaps({
    fs: {
      createTempDir: () => "/unused",
      writeFile: () => undefined,
      removeDir: () => undefined,
      inspect: (path) => {
        const entry = entries.get(path);
        if (!entry) throw new Error(`missing ${path}`);
        return entry;
      },
      currentUid: () => 1,
      createSiblingFile: () => "/bin/.ein-candidate",
      copyFile: () => undefined,
      chmod: () => undefined,
      rename: () => undefined,
      removeFile: () => entries.delete("/bin/.ein-candidate"),
      fsyncDir: () => undefined,
    },
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("release executable transaction surfaces", () => {
  test("stages beside a regular owned destination, preserves mode, and retains rollback bytes", () => {
    const { source, destination } = stagedFiles();
    const caps = defaultUpdateCaps();
    const prepared = prepareExecutableCandidate({ sourcePath: source, destinationPath: destination, caps });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(dirname(prepared.value.candidatePath)).toBe(dirname(destination));
    expect(readFileSync(destination, "utf8")).toBe("old executable");
    expect(readFileSync(prepared.value.candidatePath, "utf8")).toBe("new executable");
    expect(lstatSync(prepared.value.candidatePath).mode & 0o777).toBe(0o751);

    expect(commitExecutableCandidate(prepared.value, caps).ok).toBe(true);
    expect(readFileSync(destination, "utf8")).toBe("new executable");
    expect(readFileSync(prepared.value.backupPath, "utf8")).toBe("old executable");
    expect(restoreExecutableCandidate(prepared.value, caps).ok).toBe(true);
    expect(readFileSync(destination, "utf8")).toBe("old executable");
    cleanupExecutableCandidate(prepared.value, caps);
  });

  test("rejects a symlink destination without changing its target", () => {
    const { root, source, destination } = stagedFiles();
    const target = join(root, "target");
    writeFileSync(target, "old executable");
    rmSync(destination);
    symlinkSync(target, destination);

    const prepared = prepareExecutableCandidate({ sourcePath: source, destinationPath: destination, caps: defaultUpdateCaps() });
    expect(prepared).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "destination-symlink" }) }));
    expect(readFileSync(target, "utf8")).toBe("old executable");
  });

  test("rejects a candidate on another filesystem and cleans it", () => {
    const prepared = prepareExecutableCandidate({ sourcePath: "/stage/release", destinationPath: "/bin/ein", caps: crossFilesystemCaps() });
    expect(prepared).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "EXDEV" }) }));
  });

  test("probes both identities and rejects a selected-release mismatch before commit", async () => {
    const caps = fakeUpdateCaps({
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.19.0\ntemplate-version 0.19.0\n" }) },
    });
    const identity = await probeBinaryVersion("/candidate/ein", caps);
    expect(identity).toEqual({ ok: true, value: { binaryVersion: "0.19.0", templateVersion: "0.19.0" } });
    if (identity.ok) {
      expect(verifyBinaryIdentity(identity.value, "0.20.0")).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "identity-mismatch" }) }));
    }
  });

  // LA REGRESIÓN CONCRETA: el regex de la sonda exigía fin de línea justo tras
  // `X.Y.Z`, así que con `0.90.0-alpha.1` casaba `0.90.0`, se encontraba el
  // `-alpha.1` y devolvía null. La actualización moría en `verifying` con
  // `identity-missing`, y por tanto `ein-install update` NUNCA pudo saltar a una
  // alpha: solo se entraba reinstalando.
  test("a prerelease identity is read whole, not truncated to its core", async () => {
    const caps = fakeUpdateCaps({
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.90.0-alpha.1\ntemplate-version 0.90.0-alpha.1\n" }) },
    });
    const identity = await probeBinaryVersion("/candidate/ein", caps);
    expect(identity).toEqual({ ok: true, value: { binaryVersion: "0.90.0-alpha.1", templateVersion: "0.90.0-alpha.1" } });
  });

  test("a prerelease identity matches the release it claims to be", async () => {
    const caps = fakeUpdateCaps({
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.90.0-alpha.1\ntemplate-version 0.90.0-alpha.1\n" }) },
    });
    const identity = await probeBinaryVersion("/candidate/ein", caps);
    expect(identity.ok).toBe(true);
    if (!identity.ok) return;
    // Capturar el core rompería esto en silencio: `0.90.0` nunca es `0.90.0-alpha.1`.
    expect(verifyBinaryIdentity(identity.value, "0.90.0-alpha.1")).toEqual({ ok: true, value: identity.value });
    // Y una alpha distinta sigue siendo un desajuste, no un pase libre.
    expect(verifyBinaryIdentity(identity.value, "0.90.0-alpha.2")).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "identity-mismatch" }) }));
  });

  test("build metadata rides along and a malformed line is still rejected", async () => {
    const build = fakeUpdateCaps({
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 1.0.0+sha.abc\ntemplate-version 1.0.0+sha.abc\n" }) },
    });
    expect(await probeBinaryVersion("/candidate/ein", build)).toEqual({ ok: true, value: { binaryVersion: "1.0.0+sha.abc", templateVersion: "1.0.0+sha.abc" } });

    for (const stdout of ["ein-installer 0.90\ntemplate-version 0.90\n", "ein-installer\ntemplate-version\n", "algo que no es una versión\n"]) {
      const bad = fakeUpdateCaps({ child: { spawn: async () => ({ code: 0, stdout }) } });
      expect(await probeBinaryVersion("/candidate/ein", bad)).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "identity-missing" }) }));
    }
  });

  test("spawns only the candidate in private continuation mode and parses its verified result", async () => {
    const calls: Array<{ command: string; args: string[]; env?: Record<string, string> }> = [];
    const caps = fakeUpdateCaps({
      child: {
        spawn: async (command, args, options) => {
          calls.push({ command, args, env: options?.env });
          return {
            code: 0,
            stdout: JSON.stringify({ txId: "tx-1", releaseTag: "installer-v0.19.0", binaryVersion: "0.19.0", templateVersion: "0.19.0", status: "ok" }),
          };
        },
      },
    });
    const continued = await spawnContinuation({ candidatePath: "/candidate/ein", txId: "tx-1", releaseTag: "installer-v0.19.0", caps });
    expect(continued.ok).toBe(true);
    expect(calls).toEqual([expect.objectContaining({
      command: "/candidate/ein",
      args: ["--ein-continuation=tx-1", "--ein-release=installer-v0.19.0"],
      env: expect.objectContaining({ EIN_UPDATE_RELEASE_TAG: "installer-v0.19.0" }),
    })]);
    expect(process.execPath).toBe(beforeExecPath);
    expect(process.argv0).toBe(beforeArgv0);
  });

  test("rolls back a failed continuation without replacing the active test executable", async () => {
    const { source, destination } = stagedFiles();
    const defaults = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...defaults,
      child: {
        spawn: async (_command, args) => args[0] === "--version"
          ? { code: 0, stdout: "ein-installer 0.19.0\ntemplate-version 0.19.0\n" }
          : { code: 1, stdout: "" },
      },
    };
    const continued = await replaceAndContinueExecutable({
      sourcePath: source,
      destinationPath: destination,
      txId: "tx-2",
      releaseTag: "installer-v0.19.0",
      caps,
    });
    expect(continued).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "child-exit" }) }));
    expect(readFileSync(destination, "utf8")).toBe("old executable");
    expect(runUpdateContinuation({ txId: "tx-2", releaseTag: "installer-v0.19.0", identity: { binaryVersion: "0.18.0", templateVersion: "0.19.0" } }))
      .toEqual(expect.objectContaining({ status: "failed" }));
    expect(process.execPath).toBe(beforeExecPath);
    expect(process.argv0).toBe(beforeArgv0);
  });
});
