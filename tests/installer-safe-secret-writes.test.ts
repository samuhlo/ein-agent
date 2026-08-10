import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  open as fsOpen,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  atomicWriteForTesting,
  ensureContext7Export,
  ensureContext7ExportForTesting,
  type AtomicFsOps,
  type SyncAtomicFsOps,
} from "../installer/src/core/secrets.ts";
import { CONTEXT7_KEY_PATH } from "../installer/src/core/paths.ts";
import type { Platform } from "../installer/src/core/platform.ts";

type RealHandle = Awaited<ReturnType<typeof fsOpen>>;

type FailureOperation = "open" | "write" | "fsync" | "close" | "rename";

const temporaryDirectories: string[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ein-atomic-") );
  temporaryDirectories.push(directory);
  return directory;
}

const secretsModuleUrl = pathToFileURL(join(process.cwd(), "installer/src/core/secrets.ts")).href;

type WriteSecretRun = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type HasSecretRun = WriteSecretRun & {
  timedOut: boolean;
};

function runHasSecret(home: string, name = "linear"): HasSecretRun {
  const script = `
    const { hasSecret } = await import(${JSON.stringify(secretsModuleUrl)});
    try {
      const result = hasSecret(${JSON.stringify(name)});
      console.log(JSON.stringify({ result }));
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    }
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, HOME: home },
    timeout: 1000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
  };
}

function hasSecretResult(run: HasSecretRun): boolean {
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout.trim()).result as boolean;
}

function runWriteSecret(
  home: string,
  value: string,
  name = "linear",
  umask?: number,
): WriteSecretRun {
  const setUmask = umask === undefined ? "" : `process.umask(${umask});`;
  const script = `
    ${setUmask}
    const { writeSecret } = await import(${JSON.stringify(secretsModuleUrl)});
    try {
      const result = await writeSecret(${JSON.stringify(name)}, ${JSON.stringify(value)});
      console.log(JSON.stringify({ result }));
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    }
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeSecretResult(run: WriteSecretRun): boolean {
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout.trim()).result as boolean;
}

function realOps(): AtomicFsOps {
  return {
    open: (path, flags, mode) => fsOpen(path, flags, mode),
    write: async (handle, data, offset) =>
      (await (handle as RealHandle).write(data, 0, data.byteLength, offset)).bytesWritten,
    fsync: (handle) => (handle as RealHandle).sync(),
    close: (handle) => (handle as RealHandle).close(),
    rename,
    unlink,
    revalidate: async () => {},
  };
}

function failOnce(base: AtomicFsOps, operation: FailureOperation): AtomicFsOps {
  let failed = false;
  const injected = new Error(`injected ${operation} failure`);
  const ops: AtomicFsOps = { ...base };

  if (operation === "open") {
    ops.open = async (path, flags, mode) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return base.open(path, flags, mode);
    };
  }

  if (operation === "write") {
    ops.write = async (...args) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return base.write(...args);
    };
  }

  if (operation === "fsync") {
    ops.fsync = async (...args) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return base.fsync(...args);
    };
  }

  if (operation === "close") {
    ops.close = async (...args) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return base.close(...args);
    };
  }

  if (operation === "rename") {
    ops.rename = async (...args) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return base.rename(...args);
    };
  }

  return ops;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("publishes a fully written same-directory temp file in atomic order", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const temporary = join(directory, ".secret.ein.tmp");
  await Bun.write(destination, "old\n");

  const events: string[] = [];
  let openedPath = "";
  let openedMode = 0;
  let openedFlags = 0;
  let modeAtWrite = 0;
  const base = realOps();
  const ops: AtomicFsOps = {
    ...base,
    open: async (path, flags, mode) => {
      events.push("open");
      openedPath = path;
      openedFlags = flags;
      openedMode = mode;
      return base.open(path, flags, mode);
    },
    write: async (handle, data, offset) => {
      events.push("write");
      modeAtWrite = (await stat(openedPath)).mode & 0o777;
      const partial = data.subarray(offset, Math.min(offset + 2, data.byteLength));
      return base.write(handle, partial, offset);
    },
    fsync: async (handle) => {
      events.push("fsync");
      return base.fsync(handle);
    },
    close: async (handle) => {
      events.push("close");
      return base.close(handle);
    },
    revalidate: async () => {
      events.push("revalidate");
    },
    rename: async (from, to) => {
      events.push("rename");
      expect(from).toBe(temporary);
      expect(to).toBe(destination);
      return base.rename(from, to);
    },
  };

  await atomicWriteForTesting({
    destination,
    content: new TextEncoder().encode("new secret\n"),
    mode: 0o600,
    ops,
    tempName: () => temporary,
  });

  expect(openedPath).toBe(temporary);
  expect(openedMode).toBe(0o600);
  expect(modeAtWrite).toBe(0o600);
  expect(openedFlags & constants.O_CREAT).toBe(constants.O_CREAT);
  expect(openedFlags & constants.O_EXCL).toBe(constants.O_EXCL);
  expect(openedFlags & constants.O_WRONLY).toBe(constants.O_WRONLY);
  if ("O_NOFOLLOW" in constants) {
    expect(openedFlags & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW);
  }
  expect(events.indexOf("open")).toBeLessThan(events.indexOf("write"));
  expect(events.lastIndexOf("write")).toBeLessThan(events.indexOf("fsync"));
  expect(events.indexOf("fsync")).toBeLessThan(events.indexOf("close"));
  expect(events.indexOf("close")).toBeLessThan(events.indexOf("revalidate"));
  expect(events.indexOf("revalidate")).toBeLessThan(events.indexOf("rename"));
  expect(await readFile(destination, "utf8")).toBe("new secret\n");
  expect((await readdir(directory)).sort()).toEqual(["secret"]);
});

test("preserves an existing destination and cleans owned temps after injected failures", async () => {
  const operations: FailureOperation[] = ["open", "write", "fsync", "close", "rename"];

  for (const operation of operations) {
    const directory = await makeDirectory();
    const destination = join(directory, "secret");
    const temporary = join(directory, ".secret.ein.tmp");
    const original = `original ${operation}\n`;
    await Bun.write(destination, original);
    const modeBefore = (await stat(destination)).mode & 0o777;
    const ops = failOnce(realOps(), operation);

    let error: unknown;
    try {
      await atomicWriteForTesting({
        destination,
        content: new TextEncoder().encode("replacement\n"),
        mode: 0o600,
        ops,
        tempName: () => temporary,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`injected ${operation} failure`);
    expect(await readFile(destination, "utf8")).toBe(original);
    expect((await stat(destination)).mode & 0o777).toBe(modeBefore);
    expect(await Bun.file(temporary).exists()).toBe(false);
  }
});

test("reports cleanup failure without masking the primary failure", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const temporary = join(directory, ".secret.ein.tmp");
  await Bun.write(destination, "original\n");
  const base = realOps();
  const ops: AtomicFsOps = {
    ...base,
    rename: async () => {
      throw new Error("primary rename failure");
    },
    unlink: async () => {
      throw new Error("secondary cleanup failure");
    },
  };

  let error: unknown;
  try {
    await atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("replacement\n"),
      mode: 0o600,
      ops,
      tempName: () => temporary,
    });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("primary rename failure");
  expect((error as Error & { cleanupError?: Error }).cleanupError?.message).toBe(
    "secondary cleanup failure",
  );
  expect(await readFile(destination, "utf8")).toBe("original\n");
});

test("retries a colliding temp name without taking ownership of the collision", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const collision = join(directory, ".secret.collision.tmp");
  const temporary = join(directory, ".secret.fresh.tmp");
  await Bun.write(destination, "old\n");
  await Bun.write(collision, "do not remove\n");
  let next = 0;
  const ops = realOps();

  await atomicWriteForTesting({
    destination,
    content: new TextEncoder().encode("new\n"),
    mode: 0o600,
    ops,
    tempName: () => [collision, temporary][next++] ?? temporary,
  });

  expect(await readFile(destination, "utf8")).toBe("new\n");
  expect(await readFile(collision, "utf8")).toBe("do not remove\n");
  expect(await Bun.file(temporary).exists()).toBe(false);
});


test("creates a missing destination with restrictive mode regardless of umask", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const temporary = join(directory, ".secret.ein.tmp");
  const previousUmask = process.umask(0o077);
  try {
    await atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("created\n"),
      mode: 0o600,
      ops: realOps(),
      tempName: () => temporary,
    });
  } finally {
    process.umask(previousUmask);
  }

  expect(await readFile(destination, "utf8")).toBe("created\n");
  expect((await stat(destination)).mode & 0o777).toBe(0o600);
  expect(await Bun.file(temporary).exists()).toBe(false);
});

function noContentAccessOps(calls: { open: number }): AtomicFsOps {
  const base = realOps();
  return {
    ...base,
    open: async () => {
      calls.open += 1;
      throw new Error("content access attempted");
    },
  };
}

test("rejects a missing direct parent before temporary-file creation", async () => {
  const directory = await makeDirectory();
  const missingParent = join(directory, "missing");
  const destination = join(missingParent, "secret");
  const calls = { open: 0 };

  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be accessed\n"),
      ops: noContentAccessOps(calls),
      tempName: () => join(missingParent, ".secret.ein.tmp"),
    }),
  ).rejects.toThrow(/parent|directory/i);
  expect(calls.open).toBe(0);
});

test("rejects a symbolic-link direct parent before temporary-file creation", async () => {
  const directory = await makeDirectory();
  const realParent = join(directory, "real-parent");
  const unsafeParent = join(directory, "unsafe-parent");
  await mkdir(realParent);
  await symlink(realParent, unsafeParent);
  const destination = join(unsafeParent, "secret");
  const calls = { open: 0 };

  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be accessed\n"),
      ops: noContentAccessOps(calls),
    }),
  ).rejects.toThrow(/parent|symbolic|symlink|directory/i);
  expect(calls.open).toBe(0);
  expect((await lstat(unsafeParent)).isSymbolicLink()).toBe(true);
  expect(await Bun.file(join(realParent, "secret")).exists()).toBe(false);
});

test("rejects a final symlink before content access and preserves its referent", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const referent = join(directory, "referent");
  await Bun.write(referent, "referent stays unchanged\n");
  await symlink(referent, destination);
  const before = await lstat(destination);
  const calls = { open: 0 };

  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be accessed\n"),
      ops: noContentAccessOps(calls),
    }),
  ).rejects.toThrow(/symbolic|symlink|regular/i);

  const after = await lstat(destination);
  expect(after.isSymbolicLink()).toBe(true);
  expect(after.dev).toBe(before.dev);
  expect(after.ino).toBe(before.ino);
  expect(await readFile(referent, "utf8")).toBe("referent stays unchanged\n");
  expect(calls.open).toBe(0);
});

test("revalidates destination identity before rename", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  const original = join(directory, "original");
  const referent = join(directory, "referent");
  await Bun.write(destination, "original destination\n");
  await Bun.write(referent, "referent stays unchanged\n");
  const ops: AtomicFsOps = {
    ...realOps(),
    revalidate: async () => {
      await rename(destination, original);
      await symlink(referent, destination);
    },
  };

  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be published\n"),
      ops,
    }),
  ).rejects.toThrow(/symbolic|identity|changed|regular/i);

  expect(await readFile(original, "utf8")).toBe("original destination\n");
  expect((await lstat(destination)).isSymbolicLink()).toBe(true);
  expect(await readFile(referent, "utf8")).toBe("referent stays unchanged\n");
  expect((await readdir(directory)).filter((entry) => entry.includes("tmp"))).toEqual([]);
});

test("rejects a directory destination before content access and preserves the object", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret");
  await mkdir(destination);
  const before = await lstat(destination);
  const calls = { open: 0 };

  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be accessed\n"),
      ops: noContentAccessOps(calls),
    }),
  ).rejects.toThrow(/directory|regular/i);

  const after = await lstat(destination);
  expect(after.isDirectory()).toBe(true);
  expect(after.dev).toBe(before.dev);
  expect(after.ino).toBe(before.ino);
  expect(calls.open).toBe(0);
});

test("rejects an available FIFO before content access and preserves the special object", async () => {
  const directory = await makeDirectory();
  const destination = join(directory, "secret.fifo");
  const result = spawnSync("mkfifo", [destination]);
  if (result.error || result.status !== 0) {
    // The supported installer hosts normally provide mkfifo; leave this
    // capability-specific fixture skipped when the host does not.
    return;
  }

  const before = await lstat(destination);
  const calls = { open: 0 };
  await expect(
    atomicWriteForTesting({
      destination,
      content: new TextEncoder().encode("must not be accessed\n"),
      ops: noContentAccessOps(calls),
    }),
  ).rejects.toThrow(/special|regular|non-regular/i);

  const after = await lstat(destination);
  expect(after.isFIFO()).toBe(true);
  expect(after.dev).toBe(before.dev);
  expect(after.ino).toBe(before.ino);
  expect(calls.open).toBe(0);
});

test("hasSecret returns false for a missing target", async () => {
  const home = await makeDirectory();

  expect(hasSecretResult(runHasSecret(home))).toBe(false);
});

test("hasSecret does not follow a final symlink", async () => {
  const home = await makeDirectory();
  const directory = join(home, ".config", "opencode-secrets");
  const referent = join(home, "referent");
  const target = join(directory, "linear-api-key");
  await mkdir(directory, { recursive: true });
  await Bun.write(referent, "populated referent\n");
  await symlink(referent, target);

  const run = runHasSecret(home);
  expect(hasSecretResult(run)).toBe(false);
  expect(await readFile(referent, "utf8")).toBe("populated referent\n");
  expect((await lstat(target)).isSymbolicLink()).toBe(true);
});

test("hasSecret returns false for a directory target", async () => {
  const home = await makeDirectory();
  const target = join(home, ".config", "opencode-secrets", "linear-api-key");
  await mkdir(target, { recursive: true });

  expect(hasSecretResult(runHasSecret(home))).toBe(false);
});

test("hasSecret returns false for a supported non-regular target", async () => {
  const home = await makeDirectory();
  const directory = join(home, ".config", "opencode-secrets");
  const target = join(directory, "linear-api-key");
  await mkdir(directory, { recursive: true });
  const fixture = spawnSync("mkfifo", [target]);
  if (fixture.error || fixture.status !== 0) return;

  const run = runHasSecret(home);
  expect(run.timedOut, run.stderr).toBe(false);
  expect(hasSecretResult(run)).toBe(false);
  expect((await lstat(target)).isFIFO()).toBe(true);
});

test("hasSecret returns false for an empty regular secret file", async () => {
  const home = await makeDirectory();
  const directory = join(home, ".config", "opencode-secrets");
  await mkdir(directory, { recursive: true });
  await Bun.write(join(directory, "linear-api-key"), "\n  \t");

  expect(hasSecretResult(runHasSecret(home))).toBe(false);
});

test("hasSecret returns true for a populated regular secret file", async () => {
  const home = await makeDirectory();
  const directory = join(home, ".config", "opencode-secrets");
  await mkdir(directory, { recursive: true });
  await Bun.write(join(directory, "linear-api-key"), "valid-secret\n");

  expect(hasSecretResult(runHasSecret(home))).toBe(true);
});

test("writeSecret treats empty and whitespace-only values as filesystem no-ops", async () => {
  for (const value of ["", " \t\n "]) {
    const home = await makeDirectory();
    const run = runWriteSecret(home, value);

    expect(writeSecretResult(run)).toBe(false);
    expect(await readdir(home)).toEqual([]);
  }
});

test("writeSecret creates missing and replaces existing regular secrets with one trimmed newline", async () => {
  const missingHome = await makeDirectory();
  const missingResult = runWriteSecret(missingHome, "  new-token \n");
  expect(writeSecretResult(missingResult)).toBe(true);

  const missingDirectory = join(missingHome, ".config", "opencode-secrets");
  const missingTarget = join(missingDirectory, "linear-api-key");
  expect(await readFile(missingTarget, "utf8")).toBe("new-token\n");
  expect((await stat(missingTarget)).mode & 0o777).toBe(0o600);
  expect((await stat(missingDirectory)).mode & 0o777).toBe(0o700);
  expect(await readdir(missingDirectory)).toEqual(["linear-api-key"]);

  const existingHome = await makeDirectory();
  const existingDirectory = join(existingHome, ".config", "opencode-secrets");
  await mkdir(existingDirectory, { recursive: true });
  const existingTarget = join(existingDirectory, "linear-api-key");
  await Bun.write(existingTarget, "old-token\n");
  await chmod(existingTarget, 0o644);

  const existingResult = runWriteSecret(existingHome, " \tupdated-token\n ");
  expect(writeSecretResult(existingResult)).toBe(true);
  expect(await readFile(existingTarget, "utf8")).toBe("updated-token\n");
  expect((await stat(existingTarget)).mode & 0o777).toBe(0o600);
});

test("writeSecret commits secrets with mode 0600 under varying umasks", async () => {
  for (const umask of [0o000, 0o022, 0o077]) {
    const home = await makeDirectory();
    const run = runWriteSecret(home, `token-${umask}`, "context7", umask);
    expect(writeSecretResult(run)).toBe(true);

    const target = join(home, ".config", "opencode-secrets", "context7-api-key");
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  }
});

test("writeSecret rejects unsafe secret targets without following or replacing them", async () => {
  const symlinkHome = await makeDirectory();
  const symlinkDirectory = join(symlinkHome, ".config", "opencode-secrets");
  await mkdir(symlinkDirectory, { recursive: true });
  const referent = join(symlinkHome, "referent");
  const symlinkTarget = join(symlinkDirectory, "linear-api-key");
  await Bun.write(referent, "referent stays unchanged\n");
  await symlink(referent, symlinkTarget);

  const symlinkResult = runWriteSecret(symlinkHome, "must not publish");
  expect(symlinkResult.status).not.toBe(0);
  expect(await readFile(referent, "utf8")).toBe("referent stays unchanged\n");
  expect((await lstat(symlinkTarget)).isSymbolicLink()).toBe(true);

  const directoryHome = await makeDirectory();
  const directory = join(directoryHome, ".config", "opencode-secrets");
  await mkdir(directory, { recursive: true });
  const directoryTarget = join(directory, "linear-api-key");
  await mkdir(directoryTarget);

  const directoryResult = runWriteSecret(directoryHome, "must not publish");
  expect(directoryResult.status).not.toBe(0);
  expect((await lstat(directoryTarget)).isDirectory()).toBe(true);
});

test("writeSecret rejects a symbolic-link secrets directory", async () => {
  const home = await makeDirectory();
  const configDirectory = join(home, ".config");
  const realDirectory = join(home, "real-secrets");
  const secretsDirectory = join(configDirectory, "opencode-secrets");
  await mkdir(configDirectory);
  await mkdir(realDirectory);
  await symlink(realDirectory, secretsDirectory);

  const run = runWriteSecret(home, "must not publish");
  expect(run.status).not.toBe(0);
  expect(await readdir(realDirectory)).toEqual([]);
  expect((await lstat(secretsDirectory)).isSymbolicLink()).toBe(true);
});

function rcPlatform(shell: Platform["shell"], shellRc: string): Platform {
  return {
    os: "linux",
    arch: "x64",
    distro: "unknown",
    packageManager: "none",
    shell,
    shellRc,
    home: dirname(shellRc),
  };
}

function expectedContext7Block(shell: Platform["shell"]): string {
  return shell === "fish"
    ? [
        "# >>> ein context7 export >>>",
        `test -f "${CONTEXT7_KEY_PATH}"; and set -gx CONTEXT7_API_KEY (cat "${CONTEXT7_KEY_PATH}")`,
        "# <<< ein context7 export <<<",
        "",
      ].join("\n")
    : [
        "# >>> ein context7 export >>>",
        `export CONTEXT7_API_KEY=\"$(cat \"${CONTEXT7_KEY_PATH}\" 2>/dev/null)\"`,
        "# <<< ein context7 export <<<",
        "",
      ].join("\n");
}

test("ensureContext7Export creates compatible POSIX and Fish RC blocks", async () => {
  for (const shell of ["zsh", "fish"] as const) {
    const directory = await makeDirectory();
    const rc = join(directory, shell === "fish" ? "config.fish" : ".zshrc");
    const result = ensureContext7Export(rcPlatform(shell, rc));

    expect(result).toEqual({ changed: true, rc });
    expect(await readFile(rc, "utf8")).toBe(expectedContext7Block(shell));
    expect((await stat(rc)).mode & 0o777).toBe(0o600);
    expect((await readdir(directory)).filter((entry) => entry.includes(".tmp"))).toEqual([]);
  }
});

test("ensureContext7Export preserves existing RC bytes, separators, and mode", async () => {
  for (const [suffix, original] of [["newline", "unrelated bytes\n"], ["plain", "unrelated bytes"]] as const) {
    const directory = await makeDirectory();
    const rc = join(directory, `.${suffix}rc`);
    await Bun.write(rc, original);
    await chmod(rc, 0o640);

    const result = ensureContext7Export(rcPlatform("bash", rc));
    expect(result).toEqual({ changed: true, rc });
    const separator = original.endsWith("\n") ? "" : "\n";
    expect(await readFile(rc, "utf8")).toBe(`${original}${separator}${expectedContext7Block("bash")}`);
    expect((await stat(rc)).mode & 0o777).toBe(0o640);
  }
});

test("ensureContext7Export is sentinel-idempotent and does not create a temp", async () => {
  const directory = await makeDirectory();
  const rc = join(directory, ".zshrc");
  const original = `before\n${expectedContext7Block("zsh")}after`;
  await Bun.write(rc, original);
  const before = await lstat(rc);
  const entriesBefore = await readdir(directory);

  expect(ensureContext7Export(rcPlatform("zsh", rc))).toEqual({ changed: false, rc });
  const noWriteOps = syncRealOps();
  noWriteOps.open = () => {
    throw new Error("sentinel path attempted a write");
  };
  expect(ensureContext7ExportForTesting(rcPlatform("zsh", rc), noWriteOps)).toEqual({ changed: false, rc });

  const after = await lstat(rc);
  expect(await readFile(rc, "utf8")).toBe(original);
  expect(after.ino).toBe(before.ino);
  expect(await readdir(directory)).toEqual(entriesBefore);
});

test("ensureContext7Export rejects unsafe RC targets before reading or replacing", async () => {
  const directory = await makeDirectory();
  const referent = join(directory, "referent");
  const symlinkRc = join(directory, ".zshrc");
  await Bun.write(referent, expectedContext7Block("zsh"));
  await symlink(referent, symlinkRc);

  expect(() => ensureContext7Export(rcPlatform("zsh", symlinkRc))).toThrow(/symbolic|symlink|regular/i);
  expect((await lstat(symlinkRc)).isSymbolicLink()).toBe(true);
  expect(await readFile(referent, "utf8")).toBe(expectedContext7Block("zsh"));

  const directoryRc = join(directory, ".bashrc");
  await mkdir(directoryRc);
  expect(() => ensureContext7Export(rcPlatform("bash", directoryRc))).toThrow(/directory|regular/i);
});

function syncRealOps(): SyncAtomicFsOps {
  return {
    open: (path, flags, mode) => openSync(path, flags, mode),
    write: (handle, data, offset) => writeSync(handle as number, data, 0, data.byteLength, offset),
    fsync: (handle) => fsyncSync(handle as number),
    close: (handle) => closeSync(handle as number),
    chmod: chmodSync,
    rename: renameSync,
    unlink: unlinkSync,
    revalidate: () => {},
  };
}

test("ensureContext7Export preserves the RC and cleans its temp after injected publication failures", async () => {
  const directory = await makeDirectory();
  const rc = join(directory, ".zshrc");
  const original = "user bytes\n";
  await Bun.write(rc, original);
  const temporary = join(directory, ".zshrc.injected.tmp");
  const operations = ["open", "write", "fsync", "close", "rename"] as const;

  for (const operation of operations) {
    const ops = syncRealOps();
    let failed = false;
    const injected = new Error(`injected ${operation} failure`);
    const base = ops[operation];
    ops[operation] = ((...args: unknown[]) => {
      if (!failed) {
        failed = true;
        throw injected;
      }
      return (base as (...rest: unknown[]) => unknown)(...args);
    }) as never;

    expect(() => ensureContext7ExportForTesting(rcPlatform("zsh", rc), ops, () => temporary)).toThrow(
      `injected ${operation} failure`,
    );
    expect(await readFile(rc, "utf8")).toBe(original);
    expect(await Bun.file(temporary).exists()).toBe(false);
  }
});
