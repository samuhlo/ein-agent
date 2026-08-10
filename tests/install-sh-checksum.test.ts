// =============================================================================
// TESTS: install.sh — deterministic command-fixture boundary
// The bootstrap is executed as a real process, while every external command
// that can reach the network or publish the binary is intercepted in a temp
// fixture. Later checksum cases can add inputs to this same seam without
// weakening the isolation contract.
// =============================================================================

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INSTALLER = join(import.meta.dir, "../installer/install.sh");
const ASSET = "ein-installer-darwin-x64";
const REPO = "fixture-owner/fixture-repo";
const BASE_URL = `https://github.com/${REPO}/releases/latest/download`;
const roots: string[] = [];
const CANONICAL_TMPDIR = realpathSync(tmpdir());

const BINARY_BYTES = Buffer.from("deterministic installer fixture\n", "utf8");

type ChecksumMode =
  | "valid"
  | "download-failure"
  | "empty"
  | "valid-no-newline"
  | "missing"
  | "malformed"
  | "format-single-space"
  | "format-short-digest"
  | "format-uppercase"
  | "format-asset-whitespace"
  | "duplicate"
  | "mismatch";

type ChecksumUtilityMode = "host" | "success" | "failing" | "unusable" | "fallback" | "absent";

type FixtureOptions = {
  checksumMode?: ChecksumMode;
  checksumUtility?: ChecksumUtilityMode;
};

type Fixture = {
  root: string;
  commandDir: string;
  home: string;
  tempDir: string;
  downloadDir: string;
  logPath: string;
  binarySource: string;
  checksumSource: string;
  publicationDir: string;
  digest: string;
  checksumMode: ChecksumMode;
  checksumUtility: ChecksumUtilityMode;
};

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  events: string[];
};

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("install.sh deterministic shell fixture", () => {
  test("fixture roots use one canonical temporary-directory prefix", () => {
    const fixture = createFixture();

    expect(fixture.root.startsWith(`${CANONICAL_TMPDIR}/`)).toBe(true);
    expect(fixture.root).toBe(realpathSync(fixture.root));
  });

  test("sandbox fixture executes the real installer with guarded commands", () => {
    const fixture = createFixture();
    const result = runFixture(fixture);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("guard:");
    expect(result.stdout).toContain("checksum verificado");
    expect(result.stdout).toContain("Listo. Ejecuta");

    expect(result.events.some((event) => event.startsWith("curl:binary:"))).toBe(true);
    expect(result.events.some((event) => event.startsWith("curl:checksums:"))).toBe(true);
    expect(result.events.some((event) => event.startsWith("chmod:"))).toBe(true);
    expect(result.events.some((event) => event.startsWith("mv:"))).toBe(true);
    const binaryIndex = result.events.findIndex((event) => event.startsWith("curl:binary:"));
    const checksumIndex = result.events.findIndex((event) => event.startsWith("curl:checksums:"));
    const chmodIndex = result.events.findIndex((event) => event.startsWith("chmod:"));
    const mvIndex = result.events.findIndex((event) => event.startsWith("mv:"));
    expect(checksumIndex).toBeGreaterThan(binaryIndex);
    expect(chmodIndex).toBeGreaterThan(checksumIndex);
    expect(mvIndex).toBeGreaterThan(chmodIndex);

    // fake mv remaps publication into the fixture; it never writes the real
    // /usr/local/bin or HOME/.local/bin destination requested by install.sh.
    expect(readFileSync(join(fixture.publicationDir, "ein"))).toEqual(BINARY_BYTES);
    expectSandboxedDownloads(fixture, result);
    expectTemporaryDirectoryCleaned(fixture);

    // The command guards are the network/path boundary: an unexpected URL or
    // output path makes fake curl/mv fail instead of reaching the host.
    expect(result.events.some((event) => event.startsWith("guard:"))).toBe(false);
  });

  test("verified success preserves non-TTY handoff and cleanup", () => {
    const fixture = createFixture({ checksumUtility: "success" });
    const result = runFixture(fixture);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("guard:");
    expect(result.stdout).toContain("checksum verificado");
    expect(result.stdout).toContain("instalado en ");
    expect(result.stdout).toContain("Listo. Ejecuta");
    expect(result.events).toContain("sha256sum:success");
    const verificationIndex = result.events.indexOf("sha256sum:success");
    const chmodIndex = result.events.findIndex((event) => event.startsWith("chmod:"));
    const mvIndex = result.events.findIndex((event) => event.startsWith("mv:"));
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(chmodIndex).toBeGreaterThan(verificationIndex);
    expect(mvIndex).toBeGreaterThan(chmodIndex);
    expect(readFileSync(join(fixture.publicationDir, "ein"))).toEqual(BINARY_BYTES);

    expectSandboxedDownloads(fixture, result);
    expectTemporaryDirectoryCleaned(fixture);
  });

  test("EXIT cleanup captures the mktemp path beyond main's local scope", () => {
    const fixture = createFixture({ checksumUtility: "success" });
    const result = runFixture(fixture);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("tmp: unbound variable");
    expectTemporaryDirectoryCleaned(fixture);
  });

  test("checksum download failure rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "download-failure" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("empty checksum manifest (missing selected asset) rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "empty" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("missing selected asset rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "missing" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("malformed checksum manifest rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "malformed" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum manifest requires exactly two GNU separator spaces", () => {
    const fixture = createFixture({ checksumMode: "format-single-space" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum manifest requires a complete 64-character digest", () => {
    const fixture = createFixture({ checksumMode: "format-short-digest" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum manifest requires lowercase SHA-256 hex", () => {
    const fixture = createFixture({ checksumMode: "format-uppercase" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum manifest requires one non-whitespace asset name", () => {
    const fixture = createFixture({ checksumMode: "format-asset-whitespace" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("valid checksum without terminal newline verifies before publication", () => {
    const fixture = createFixture({ checksumMode: "valid-no-newline", checksumUtility: "success" });
    const result = runFixture(fixture);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("guard:");
    expect(result.stdout).toContain("checksum verificado");
    expect(result.events).toContain("sha256sum:success");
    const verificationIndex = result.events.indexOf("sha256sum:success");
    const chmodIndex = result.events.findIndex((event) => event.startsWith("chmod:"));
    const mvIndex = result.events.findIndex((event) => event.startsWith("mv:"));
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(chmodIndex).toBeGreaterThan(verificationIndex);
    expect(mvIndex).toBeGreaterThan(chmodIndex);
    expect(result.stdout).toContain("Listo. Ejecuta");
    expect(readFileSync(join(fixture.publicationDir, "ein"))).toEqual(BINARY_BYTES);

    expectSandboxedDownloads(fixture, result);
    expectTemporaryDirectoryCleaned(fixture);
  });

  test("duplicate selected asset rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "duplicate" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum digest mismatch rejects before publication", () => {
    const fixture = createFixture({ checksumMode: "mismatch" });
    const result = runFixture(fixture);

    expectRejectedBeforePublication(fixture, result);
  });

  test("checksum utility failure rejects before publication", () => {
    const fixture = createFixture({ checksumUtility: "failing" });
    const result = runFixture(fixture);

    expect(result.events).toContain("sha256sum:failure");
    expectRejectedBeforePublication(fixture, result);
  });

  test("unusable checksum utility output rejects before publication", () => {
    const fixture = createFixture({ checksumUtility: "unusable" });
    const result = runFixture(fixture);

    expect(result.events).toContain("sha256sum:unusable");
    expectRejectedBeforePublication(fixture, result);
  });

  test("shasum fallback verifies before publication", () => {
    const fixture = createFixture({ checksumUtility: "fallback" });
    const result = runFixture(fixture);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("guard:");
    expect(result.stdout).toContain("checksum verificado");
    expect(result.events).toContain("shasum:-a:256");
    expect(result.events.some((event) => event.startsWith("sha256sum:"))).toBe(false);
    const shasumIndex = result.events.indexOf("shasum:-a:256");
    const chmodIndex = result.events.findIndex((event) => event.startsWith("chmod:"));
    const mvIndex = result.events.findIndex((event) => event.startsWith("mv:"));
    expect(shasumIndex).toBeGreaterThan(-1);
    expect(chmodIndex).toBeGreaterThan(shasumIndex);
    expect(mvIndex).toBeGreaterThan(chmodIndex);
    expect(result.stdout).toContain("instalado en ");
    expect(result.stdout).toContain("Listo. Ejecuta");
    expect(readFileSync(join(fixture.publicationDir, "ein"))).toEqual(BINARY_BYTES);

    expectSandboxedDownloads(fixture, result);
    expectTemporaryDirectoryCleaned(fixture);
  });

  test("both checksum utilities absent rejects before publication", () => {
    const fixture = createFixture({ checksumUtility: "absent" });
    const result = runFixture(fixture);

    expect(result.events.some((event) => event.startsWith("sha256sum:"))).toBe(false);
    expect(result.events.some((event) => event.startsWith("shasum:"))).toBe(false);
    expectRejectedBeforePublication(fixture, result);
  });
});

function expectRejectedBeforePublication(fixture: Fixture, result: RunResult): void {
  expect(result.code).not.toBe(0);
  expect(result.stderr).not.toContain("guard:");
  expect(result.events.some((event) => event.startsWith("guard:"))).toBe(false);
  expect(result.events.some((event) => event.startsWith("chmod:"))).toBe(false);
  expect(result.events.some((event) => event.startsWith("mv:"))).toBe(false);
  expect(existsSync(join(fixture.publicationDir, "ein"))).toBe(false);
  expectSandboxedDownloads(fixture, result);
}

function expectSandboxedDownloads(fixture: Fixture, result: RunResult): void {
  const downloadPaths = result.events
    .filter((event) => event.startsWith("curl:"))
    .map((event) => event.slice(event.lastIndexOf(":") + 1));
  expect(downloadPaths).toHaveLength(2);
  expect(downloadPaths.every((path) => path.startsWith(`${fixture.root}/`))).toBe(true);
  expect(downloadPaths.every((path) => path.startsWith(`${fixture.downloadDir}/`))).toBe(true);
  expect(downloadPaths.every((path) => !existsSync(path))).toBe(true);

  const mktempIndex = result.events.indexOf("mktemp:download");
  const firstCurlIndex = result.events.findIndex((event) => event.startsWith("curl:"));
  expect(mktempIndex).toBeGreaterThan(-1);
  expect(firstCurlIndex).toBeGreaterThan(mktempIndex);
}

function expectTemporaryDirectoryCleaned(fixture: Fixture): void {
  expect(fixture.downloadDir.startsWith(`${fixture.root}/`)).toBe(true);
  expect(existsSync(fixture.downloadDir)).toBe(false);
  expect(existsSync(fixture.tempDir)).toBe(true);
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const checksumMode = options.checksumMode ?? "valid";
  const checksumUtility = options.checksumUtility ?? "host";
  const root = mkdtempSync(join(CANONICAL_TMPDIR, "install-sh-checksum-fixture-"));
  roots.push(root);

  const commandDir = join(root, "commands");
  const home = join(root, "home");
  const tempDir = join(root, "tmp");
  const downloadDir = join(tempDir, "install-sh-checksum-download");
  const sourceDir = join(root, "source");
  const publicationDir = join(root, "published");
  const logPath = join(root, "events.log");
  const binarySource = join(sourceDir, "ein");
  const checksumSource = join(sourceDir, "checksums.txt");
  const digest = createHash("sha256").update(BINARY_BYTES).digest("hex");

  const checksumContent = (() => {
    switch (checksumMode) {
      case "empty":
        return "";
      case "valid-no-newline":
        return `${digest}  ${ASSET}`;
      case "missing":
        return `${digest}  another-asset\n`;
      case "malformed":
        return `${digest}  ${ASSET}\nnot a checksum manifest line\n`;
      case "format-single-space":
        return `${digest} ${ASSET}\n`;
      case "format-short-digest":
        return `${digest.slice(0, -1)}  ${ASSET}\n`;
      case "format-uppercase":
        return `${digest.toUpperCase()}  ${ASSET}\n`;
      case "format-asset-whitespace":
        return `${digest}  ${ASSET} extra\n`;
      case "duplicate":
        return `${digest}  ${ASSET}\n${digest}  ${ASSET}\n`;
      case "mismatch":
        return `${"0".repeat(64)}  ${ASSET}\n`;
      case "download-failure":
      case "valid":
        return `${digest}  ${ASSET}\n`;
    }
  })();

  mkdirSync(commandDir, { recursive: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(publicationDir, { recursive: true });
  writeFileSync(logPath, "");
  writeFileSync(binarySource, BINARY_BYTES);
  writeFileSync(checksumSource, checksumContent);

  writeCommand(
    join(commandDir, "mktemp"),
    `#!/bin/sh
set -eu
[ "$#" -eq 1 ] && [ "$1" = -d ] || {
  printf '%s\\n' 'guard:mktemp-args' >> "$EIN_FIXTURE_LOG"
  exit 91
}
case "\${TMPDIR:-}" in
  "$EIN_FIXTURE_ROOT"/*) ;;
  *)
    printf '%s\\n' 'guard:mktemp-tmpdir' >> "$EIN_FIXTURE_LOG"
    exit 91
    ;;
esac
download_dir="$TMPDIR/install-sh-checksum-download"
case "$download_dir" in
  "$EIN_FIXTURE_ROOT"/*) ;;
  *)
    printf '%s\\n' 'guard:mktemp-path' >> "$EIN_FIXTURE_LOG"
    exit 91
    ;;
esac
[ ! -e "$download_dir" ] || {
  printf '%s\\n' 'guard:mktemp-existing' >> "$EIN_FIXTURE_LOG"
  exit 91
}
mkdir "$download_dir"
printf '%s\\n' 'mktemp:download' >> "$EIN_FIXTURE_LOG"
printf '%s\\n' "$download_dir"
`,
  );

  writeCommand(
    join(commandDir, "curl"),
    `#!/bin/sh
set -eu
log() { printf '%s\\n' "$*" >> "$EIN_FIXTURE_LOG"; }
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      [ "$#" -ge 2 ] || { log 'guard:curl-args'; exit 91; }
      output=$2
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      [ -z "$url" ] || { log 'guard:curl-args'; exit 91; }
      url=$1
      shift
      ;;
  esac
done
[ -n "$output" ] || { log 'guard:curl-output'; exit 91; }
[ -n "$url" ] || { log 'guard:curl-url'; exit 91; }
case "$output" in
  "$EIN_FIXTURE_ROOT"/*) ;;
  *) log "guard:curl-path:$output"; exit 91 ;;
esac
case "$url" in
  "$EIN_EXPECTED_BASE/$EIN_ASSET")
    cp "$EIN_BINARY_SOURCE" "$output"
    log "curl:binary:$output"
    ;;
  "$EIN_EXPECTED_BASE/checksums.txt")
    if [ "$EIN_CHECKSUM_MODE" = download-failure ]; then
      log "curl:checksums-failure:$output"
      exit 92
    fi
    cp "$EIN_CHECKSUM_SOURCE" "$output"
    log "curl:checksums:$output"
    ;;
  *)
    log "guard:curl-url:$url"
    exit 91
    ;;
esac
`,
  );

  if (checksumUtility === "success") {
    writeCommand(
      join(commandDir, "sha256sum"),
      `#!/bin/sh
set -eu
[ "$#" -eq 1 ] || exit 93
printf '%s\\n' 'sha256sum:success' >> "$EIN_FIXTURE_LOG"
printf '%s  %s\\n' "$EIN_BINARY_DIGEST" "$1"
`,
    );
  }

  if (checksumUtility === "failing") {
    writeCommand(
      join(commandDir, "sha256sum"),
      `#!/bin/sh
set -eu
printf '%s\\n' 'sha256sum:failure' >> "$EIN_FIXTURE_LOG"
exit 92
`,
    );
  }

  if (checksumUtility === "unusable") {
    writeCommand(
      join(commandDir, "sha256sum"),
      `#!/bin/sh
set -eu
printf '%s\\n' 'sha256sum:unusable' >> "$EIN_FIXTURE_LOG"
printf '%s\\n' "$EIN_BINARY_DIGEST"
`,
    );
  }

  if (checksumUtility === "fallback") {
    writeCommand(
      join(commandDir, "shasum"),
      `#!/bin/sh
set -eu
[ "$#" -eq 3 ] || exit 93
[ "$1" = -a ] || exit 93
[ "$2" = 256 ] || exit 93
printf '%s\\n' 'shasum:-a:256' >> "$EIN_FIXTURE_LOG"
printf '%s  %s\\n' "$EIN_BINARY_DIGEST" "$3"
`,
    );
  }

  writeCommand(
    join(commandDir, "uname"),
    `#!/bin/sh
set -eu
case "\${1:-}" in
  -s) printf '%s\\n' Darwin; printf '%s\\n' 'uname:-s' >> "$EIN_FIXTURE_LOG" ;;
  -m) printf '%s\\n' x86_64; printf '%s\\n' 'uname:-m' >> "$EIN_FIXTURE_LOG" ;;
  *) printf '%s\\n' 'guard:uname-args' >> "$EIN_FIXTURE_LOG"; exit 91 ;;
esac
`,
  );

  writeCommand(
    join(commandDir, "chmod"),
    `#!/bin/sh
set -eu
[ "$#" -eq 2 ] || { printf '%s\\n' 'guard:chmod-args' >> "$EIN_FIXTURE_LOG"; exit 91; }
[ "$1" = 755 ] || { printf '%s\\n' "guard:chmod-mode:$1" >> "$EIN_FIXTURE_LOG"; exit 91; }
case "$2" in
  "$EIN_FIXTURE_ROOT"/*) printf '%s\\n' "chmod:$2" >> "$EIN_FIXTURE_LOG" ;;
  *) printf '%s\\n' "guard:chmod-path:$2" >> "$EIN_FIXTURE_LOG"; exit 91 ;;
esac
`,
  );

  writeCommand(
    join(commandDir, "mv"),
    `#!/bin/sh
set -eu
[ "$#" -eq 2 ] || { printf '%s\\n' 'guard:mv-args' >> "$EIN_FIXTURE_LOG"; exit 91; }
case "$1" in
  "$EIN_FIXTURE_ROOT"/*) ;;
  *) printf '%s\\n' "guard:mv-source:$1" >> "$EIN_FIXTURE_LOG"; exit 91 ;;
esac
case "$2" in
  /usr/local/bin/ein|"$HOME"/.local/bin/ein) ;;
  *) printf '%s\\n' "guard:mv-destination:$2" >> "$EIN_FIXTURE_LOG"; exit 91 ;;
esac
cp "$1" "$EIN_PUBLICATION_ROOT/ein"
printf '%s\\n' "mv:$2:$EIN_PUBLICATION_ROOT/ein" >> "$EIN_FIXTURE_LOG"
`,
  );

  return {
    root,
    commandDir,
    home,
    tempDir,
    downloadDir,
    logPath,
    binarySource,
    checksumSource,
    publicationDir,
    digest,
    checksumMode,
    checksumUtility,
  };
}

function writeCommand(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function runFixture(fixture: Fixture): RunResult {
  const hostPath = process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  const runtimePath =
    fixture.checksumUtility === "fallback"
      ? pathWithoutCommands(hostPath, fixture.root, ["sha256sum"])
      : fixture.checksumUtility === "absent"
        ? pathWithoutCommands(hostPath, fixture.root, ["sha256sum", "shasum"])
        : hostPath;
  const proc = Bun.spawnSync(["bash", INSTALLER], {
    env: {
      ...process.env,
      PATH: `${fixture.commandDir}:${runtimePath}`,
      HOME: fixture.home,
      TMPDIR: fixture.tempDir,
      tmp: undefined,
      WSL_DISTRO_NAME: "",
      EIN_INSTALLER_REPO: REPO,
      EIN_FIXTURE_ROOT: fixture.root,
      EIN_FIXTURE_LOG: fixture.logPath,
      EIN_EXPECTED_BASE: BASE_URL,
      EIN_ASSET: ASSET,
      EIN_BINARY_SOURCE: fixture.binarySource,
      EIN_CHECKSUM_SOURCE: fixture.checksumSource,
      EIN_CHECKSUM_MODE: fixture.checksumMode,
      EIN_BINARY_DIGEST: fixture.digest,
      EIN_PUBLICATION_ROOT: fixture.publicationDir,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    code: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
    events: readFileSync(fixture.logPath, "utf8").trim().split("\n").filter(Boolean),
  };
}

function pathWithoutCommands(hostPath: string, root: string, excludedCommands: readonly string[]): string {
  return hostPath
    .split(":")
    .map((directory, index) => {
      if (!directory || !excludedCommands.some((command) => existsSync(join(directory, command)))) {
        return directory;
      }

      const filteredDir = join(root, `system-without-checksum-tools-${index}`);
      mkdirSync(filteredDir, { recursive: true });
      for (const name of readdirSync(directory)) {
        if (excludedCommands.includes(name)) continue;
        const target = join(filteredDir, name);
        try {
          symlinkSync(join(directory, name), target);
        } catch {
          // Duplicate names from repeated PATH directories are harmless here.
        }
      }
      return filteredDir;
    })
    .join(":");
}
