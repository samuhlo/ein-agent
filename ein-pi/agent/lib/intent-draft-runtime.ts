import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureEinGitignore } from "./gitignore.ts";
import { setContinuityObjective, showContinuityObjective } from "./continuity-objective.ts";
import type { IntentRuntimePorts } from "./intent-draft.ts";

export function createIntentDraftRuntime(root: string, options: { mutating: boolean; lockOnly?: boolean }): IntentRuntimePorts {
  const expectedRoot = resolve(root);
  return {
    now: () => new Date().toISOString(), newId: randomUUID,
    admission: { check(requestedRoot, mode = "initialize") {
      const rejected = (reason: string) => ({ status: "rejected" as const, root: expectedRoot, reason });
      if (!options.mutating || resolve(requestedRoot) !== expectedRoot) return rejected("Intent mutation has no runtime write admission");
      if (options.lockOnly) {
        const directory = join(expectedRoot, ".ein/intent-drafts");
        try {
          if (!existsSync(directory) || !readdirSync(directory).some((name) => name.endsWith(".json"))) return { status: "lock-only", root: expectedRoot };
        } catch { return rejected("Cannot inspect the intent lock directory"); }
      }
      const git = (args: string[]) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: expectedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C" }, timeout: 10000 });
      try { git(["rev-parse", "--is-inside-work-tree"]); }
      catch (error) {
        const stderr = String((error as { stderr?: unknown }).stderr ?? "");
        return stderr.includes("not a git repository") ? { status: "not-git", root: expectedRoot } : rejected("Cannot establish Git isolation for intent drafts");
      }
      try {
        if (git(["ls-files", "-z", "--", ".ein/intent-drafts"]).length) return rejected("Intent draft directory contains tracked data; do not publish private responses");
        const ignore = join(expectedRoot, ".gitignore");
        if (existsSync(ignore) && lstatSync(ignore).isSymbolicLink()) return rejected("Unsafe .gitignore path");
        if (mode === "initialize") ensureEinGitignore(expectedRoot);
        else {
          try { git(["check-ignore", "--no-index", "-q", ".ein/intent-drafts/.admission-probe"]); }
          catch { return { status: "lock-only", root: expectedRoot }; }
        }
        git(["check-ignore", "--no-index", "-q", ".ein/intent-drafts/.admission-probe"]);
        return { status: "isolated", root: expectedRoot };
      } catch { return rejected("Intent drafts are not verifiably ignored by Git"); }
    } },
    publishObjective(input) {
      const current = showContinuityObjective(expectedRoot);
      if (current.kind === "unavailable") return { status: "warning", code: `continuity-objective-unavailable:${current.reason}` };
      const { objective, ...evidence } = input;
      const result = setContinuityObjective(expectedRoot, { objective, evidence }, current.expectedRevision);
      return result.outcome === "set" || result.outcome === "unchanged" ? { status: "updated" } : { status: "warning", code: `continuity-objective-${result.outcome}:${result.reason ?? "unknown"}` };
    },
  };
}
