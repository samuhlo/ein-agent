import { afterEach, describe, expect, test } from "bun:test";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreparedInstallJournal } from "../installer/src/core/install-journal-policy.ts";
import {
  inspectInstallJournal,
  publishInstallJournal,
} from "../installer/src/core/install-journal-persistence.ts";
import { InstallJournalError } from "../installer/src/core/install-journal-contract.ts";
import {
  installJournalPath,
  type InstallJournalFs,
} from "../installer/src/core/install-journal-store.ts";
import { createInstallPlan } from "../installer/src/core/install-plan.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function home(): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "ein-journal-persistence-"));
  roots.push(root);
  return root;
}

function fsOps(): InstallJournalFs {
  return {
    read: (path) => readFileSync(path),
    mkdir: (path, mode) => mkdirSync(path, { mode }),
    open: (path, flags, mode) => openSync(path, flags, mode),
    write: (fd, data, offset) => writeSync(fd, data, offset, data.length - offset),
    fsync: fsyncSync,
    close: closeSync,
    rename: renameSync,
    unlink: unlinkSync,
    inspect: (path) => {
      try {
        const item = lstatSync(path);
        return {
          kind: item.isSymbolicLink()
            ? "symlink"
            : item.isFile()
              ? "file"
              : item.isDirectory()
                ? "directory"
                : "other",
          mode: item.mode & 0o777,
          size: item.size,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { kind: "missing", mode: 0, size: 0 };
        }
        throw error;
      }
    },
  };
}

function prepared(root: string) {
  const plan = createInstallPlan({
    target: "claude",
    home: root,
    piAgentDir: join(root, ".pi-ein", "agent"),
    piAgentDirExists: false,
    piOwnership: { status: "absent" },
    claudeConfigHome: join(root, ".claude-ein"),
    platform: { os: "darwin", arch: "arm64" },
    dependencies: {
      bun: true,
      pi: false,
      engram: false,
      gh: false,
      hypa: false,
      codegraph: false,
    },
    flags: {
      yes: true,
      noEngram: false,
      noSecrets: true,
      noHypa: false,
      noCodegraph: false,
      skipLinear: true,
    },
  });
  return createPreparedInstallJournal(
    plan,
    "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  );
}

describe("install journal persistence", () => {
  test("composes canonical codec and atomic store", () => {
    const root = home();
    const fs = fsOps();
    const journal = prepared(root);

    expect(inspectInstallJournal(root, fs)).toEqual({ status: "missing" });
    publishInstallJournal(root, journal, fs);
    expect(inspectInstallJournal(root, fs)).toEqual({ status: "valid", journal });
    expect(readFileSync(installJournalPath(root), "utf8")).toBe(`${JSON.stringify(journal)}\n`);

    writeFileSync(installJournalPath(root), ` ${JSON.stringify(journal)}\n`, { mode: 0o600 });
    expect(inspectInstallJournal(root, fs)).toEqual({ status: "invalid" });
  });

  test("keeps invalid state distinct from publication failure", () => {
    const root = home();
    const journal = prepared(root);
    const fs = fsOps();
    const failing: InstallJournalFs = {
      ...fs,
      open: () => {
        throw new Error("private filesystem failure");
      },
    };

    expect(() => publishInstallJournal(root, journal, failing)).toThrow(InstallJournalError);
    try {
      publishInstallJournal(root, journal, failing);
    } catch (error) {
      expect(error).toMatchObject({ code: "journal-write-failed" });
    }

    const unreachable = { ...journal, state: "complete" } as typeof journal;
    expect(() => publishInstallJournal(root, unreachable, fs)).toThrow(
      expect.objectContaining({ code: "recovery-required" }),
    );
  });
});
