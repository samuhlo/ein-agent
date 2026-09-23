import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runIntentDiscovery, requireIntent, nextIntentAction, snapshotFromDraft } from "../shared/sdd/intent-discovery.ts";
import { publishIntentDraft, readIntentDraft, recoverIntentDraft } from "../shared/sdd/intent-draft-store.ts";
import { createIntentDraftRuntime } from "../shared/ports/intent.ts";
import { resolveSddStatus } from "../ein-pi/agent/lib/sdd-router.ts";
import { closeChange } from "../ein-pi/agent/lib/sdd-close.ts";
import { writeVerifiedSddSummary } from "../shared/sdd/sdd-summary-write.ts";
import { beginVerification, finishVerification, readVerificationFreshness } from "../ein-pi/agent/lib/sdd-verification-runtime.ts";
import { beginPhaseRun, finishPhaseRun, assessPhaseRecovery } from "../ein-pi/agent/lib/sdd-phase-runtime.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const material = { objective: "Export visible rows", boundaries: { in: ["CSV"], out: ["Hidden rows"] }, completionCriteria: ["Filter preserved"] };
function fixture(legacy = false) {
  const root = mkdtempSync(join(tmpdir(), "draft-close-")); roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  const ctx = { cwd: root, sessionManager: { getBranch: () => [] } };
  const ports = createIntentDraftRuntime(root, { mutating: true });
  const agreement = legacy ? undefined : runIntentDiscovery(ctx, { action: "record", work: "export", change: "export", material, expectedRevision: "absent" }, () => {}, { id: "human", text: "Exporta las filas visibles", source: "rpc" }, ports).agreement;
  const dir = join(root, "openspec/changes/export"); mkdirSync(dir, { recursive: true });
  const key = agreement ? `\nintent_key: ${agreement.materialKey}\n` : "";
  const documents = { "scope.md": "scope\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: internal only\n", "map.md": "scope_status: bounded\n", "design.md": "Design\n", "tasks.md": "status: ready\nblocked_by: none\n- [x] 1 Delivered\n- verify: bun test\n", "apply-progress.md": "status: complete\n" };
  for (const [name, content] of Object.entries(documents)) writeFileSync(join(dir, name), content + key);
  writeFileSync(join(root, "source.ts"), "export const value = 1;\n");
  const begun = beginVerification({ cwd: root, changePath: dir }); if (!begun.ok) throw new Error(begun.reason);
  const verified = finishVerification({ cwd: root, changePath: dir, token: begun.value.token, content: "status: pass\nbehavior_coverage: verified\nrequired_check: {\"command\":\"bun test\",\"exitCode\":0}\n" });
  if (!verified.ok) throw new Error(verified.reason);
  const summary = () => writeVerifiedSddSummary({ cwd: root, change: "export", content: "# Summary\nExport checked.", commands: ["bun test"], readVerification: (cwd, changePath) => readVerificationFreshness({ cwd, changePath }) });
  const written = summary(); if (!written.ok) throw new Error(written.reason);
  return { root, dir, ctx, ports, summary };
}
function current(root: string) { const read = readIntentDraft(root, "export"); if (read.status !== "valid") throw new Error("missing draft"); return read.draft; }

test("an interrupted optional interview remains recoverable without blocking ordinary routing", () => {
  const f = fixture(); const before = current(f.root);
  const run = beginPhaseRun({ cwd: f.root, change: "export", phase: "map", toolCallId: "map" }); if (!run.ok) throw new Error(run.reason);
  expect(finishPhaseRun({ cwd: f.root, toolCallId: "map", nonce: run.value.nonce, status: "complete" }).ok).toBe(true);
  const canonical = readFileSync(join(f.dir, "intent.md"), "utf8");
  expect(publishIntentDraft(f.root, { ...before, agreement: { ...before.agreement, status: "pending", revision: "new-round" } }, before.revision, f.ports, { afterJournal: () => { throw new Error("crash"); } }).ok).toBe(false);
  expect(readFileSync(join(f.dir, "intent.md"), "utf8")).toBe(canonical);
  expect(resolveSddStatus(f.root, "export").intent).toBeUndefined();
  expect(f.summary().ok).toBe(true);
  expect(assessPhaseRecovery({ cwd: f.root, toolCallId: "map" }).state).toBe("complete");
  expect(readIntentDraft(f.root, "export").status).toBe("valid");
});

test("successful archive leaves a historical tombstone without implementation authority", () => {
  const f = fixture(); expect(closeChange(f.root, "export").ok).toBe(true);
  const archived = current(f.root);
  expect(archived.publication.state).toBe("archived");
  expect(nextIntentAction(snapshotFromDraft(archived))).toBe("archived");
  expect(() => requireIntent(f.ctx, "export", "export")).toThrow("Archived");
});

test("crash after archive move is recovered by exact durable hashes, not by archive existence", () => {
  const f = fixture();
  expect(closeChange(f.root, "export", {}, { afterArchive() { throw new Error("crash after archive"); } }).ok).toBe(false);
  expect(current(f.root).publication.state).toBe("archiving");
  expect(closeChange(f.root, "export").ok).toBe(true);
  const archived = current(f.root); expect(archived.publication.state).toBe("archived");
  writeFileSync(join(f.root, "openspec/changes/archive/export/summary.md"), "another revision\n");
  expect(recoverIntentDraft(f.root, "export", archived.revision, f.ports)).toMatchObject({ ok: false, code: "conflict" });
});

test("the final close lock excludes reopening and is released after errors", () => {
  const f = fixture(); let concurrent: unknown;
  expect(closeChange(f.root, "export", {}, { beforeArchive() {
    const draft = current(f.root);
    concurrent = publishIntentDraft(f.root, { ...draft, agreement: { ...draft.agreement, status: "pending", revision: "concurrent" } }, draft.revision, f.ports);
  } }).ok).toBe(true);
  expect(concurrent).toMatchObject({ ok: false, code: "busy" });
  const broken = fixture();
  expect(closeChange(broken.root, "export", {}, { beforeArchive() { throw new Error("interrupt"); } }).ok).toBe(false);
  expect(existsSync(join(broken.root, ".ein/intent-drafts/export.json.lock"))).toBe(false);
  const retried = closeChange(broken.root, "export");
  expect(retried.ok, retried.reason).toBe(true);
});

test("first legacy close does not initialize optional intent state", () => {
  const f = fixture(true); expect(existsSync(join(f.root, ".gitignore"))).toBe(false);
  const result = closeChange(f.root, "export");
  expect(result.ok, result.reason).toBe(true);
  expect(existsSync(join(f.root, ".gitignore"))).toBe(false);
  expect(readIntentDraft(f.root, "export")).toEqual({ status: "absent" });
});

test("only the reserved lock path is excluded from verification identity", () => {
  const f = fixture(true); mkdirSync(join(f.root, ".ein/intent-drafts"), { recursive: true });
  writeFileSync(join(f.root, ".ein/intent-drafts/export.json.lock"), "lock");
  expect(readVerificationFreshness({ cwd: f.root, changePath: f.dir }).state).toBe("current");
  writeFileSync(join(f.root, "unrelated.json.lock"), "actual project input");
  expect(readVerificationFreshness({ cwd: f.root, changePath: f.dir }).state).toBe("stale");
});
