# Evidencias históricas de la auditoría del manifiesto

Base auditada: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).

Estos scripts se preservan como texto para no depender de temporales. Ejecutaron funciones reales sobre fixtures temporales o E/S en memoria. Los imports absolutos pertenecen al entorno original; no ejecutar literalmente en otro checkout. Las expectativas que demuestran un defecto son históricas, no criterios de aceptación de la corrección. Cada [ficha del plan](../plans/manifesto-hardening/README.md) prescribe tests nuevos con el comportamiento correcto y rutas relativas del repositorio.

## sdd

```ts
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, unlinkSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolveSddStatus, resolveSddNext, assessCloseReadiness, sddNextHandoff } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-router.ts";
import { closeChange } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-close.ts";
import { lintTasksArtifact } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-guardrails.ts";
import { snapshotPhaseArtifacts, reconcilePhaseFailure, formatReconciliation } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-reconcile.ts";

const baseline = "/private/tmp/ein-scout-salvage";
const expectedCommit = "3b9fa420f8cd18480bee6a19dd1ed14b99bc483e";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: baseline, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: baseline, encoding: "utf8" }).trim();
if (commit !== expectedCommit || dirty) throw new Error("Probe requires the clean, exact alpha.9 baseline checkout.");

const roots: string[] = [];
function fixture(change: string) {
  const cwd = mkdtempSync(join(tmpdir(), "ein-manifest-sdd-proof-"));
  roots.push(cwd);
  const dir = join(cwd, "openspec/changes", change);
  mkdirSync(dir, { recursive: true });
  const put = (name: string, text: string, time: number) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    utimesSync(path, time, time);
  };
  for (const file of ["a.ts", "b.ts"]) {
    writeFileSync(join(cwd, file), "export const x=1;\n");
    utimesSync(join(cwd, file), 1000, 1000);
  }
  put("scope.md", "scope\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: internal probe only\n", 1000);
  put("map.md", "scope_status: bounded\n", 1000);
  put("design.md", "design\n", 1000);
  put("tasks.md", "status: ready\nblocked_by: none\n- [x] 1 Implemented a.ts b.ts\n- verify: bun test\n", 1000);
  put("apply-progress.md", "status: complete\n", 1000);
  put("verify-report.md", "status: pass\n", 2000);
  put("summary.md", `status: complete\nchange: ${change}\nwork_groups: 1\nverification_status: pass\n\n# Summary\n- verify: bun test\n`, 3000);
  return { cwd, dir, put, change };
}
function closeObservation(f: ReturnType<typeof fixture>) {
  const status = resolveSddStatus(f.cwd, f.change);
  const readiness = assessCloseReadiness(f.cwd, f.change);
  const result = closeChange(f.cwd, f.change);
  return {
    verify: status.verify,
    verifyStale: status.verifyStale,
    next: status.nextRecommended,
    closeReady: readiness.ready,
    closeOk: result.ok,
    archiveExists: existsSync(join(f.cwd, "openspec/changes/archive", f.change)),
  };
}

try {
  const valid = fixture("valid-control");
  const failed = fixture("failed-control");
  failed.put("verify-report.md", "status: fail\n", 2000);
  const failedCheck = fixture("failed-check-control");
  failedCheck.put("verify-report.md", 'Example expected result: pass\nstatus: fail\nrequired_check: {"command":"bun test","exitCode":1}\n', 2000);
  const contradictory = fixture("contradictory");
  const contradictoryText = "Example expected result: pass\n\nstatus: fail\nThe feature does not work.\n";
  contradictory.put("verify-report.md", contradictoryText, 2000);
  const deleted = fixture("deleted");
  unlinkSync(join(deleted.cwd, "b.ts"));
  const unrelated = fixture("change-a");
  const before = snapshotPhaseArtifacts(unrelated.cwd, "design");
  const otherDir = join(unrelated.cwd, "openspec/changes/change-b");
  mkdirSync(otherDir);
  writeFileSync(join(otherDir, "design.md"), "Draft started. More work pending.\n");
  const reconciliation = reconcilePhaseFailure(unrelated.cwd, "design", before);
  const done = fixture("done");
  const taskText = "## Completed work\n- [x] 1 Implemented a.ts b.ts\n- verify: bun test\n";
  done.put("tasks.md", taskText, 1000);
  const lint = lintTasksArtifact(taskText);
  const next = resolveSddNext(done.cwd, done.change);
  console.log(JSON.stringify({
    baseline: { path: baseline, commit, clean: true },
    controls: { valid: closeObservation(valid), plainFailure: closeObservation(failed), failedRequiredCheck: closeObservation(failedCheck) },
    proofs: {
      contradictoryVerification: { input: contradictoryText, ...closeObservation(contradictory) },
      deliveredFileDeletedAfterVerification: { deleted: "b.ts", surviving: "a.ts", ...closeObservation(deleted) },
      unrelatedArtifactReconcilesFailure: {
        intendedChange: "change-a",
        modifiedChange: "change-b",
        reconciled: reconciliation.reconciled,
        attributedChange: reconciliation.change,
        warnings: reconciliation.warnings,
        presentation: formatReconciliation(reconciliation, "Delegated change-a design failed"),
      },
      completedTasksBlockedForMetadata: {
        input: taskText,
        lintOk: lint.ok,
        lintIssues: lint.issues,
        next: next.nextRecommended,
        blocked: next.blocked,
        handoff: sddNextHandoff(next),
      },
    },
  }, null, 2));
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
```

## delegation

```ts
import { collectDelegationItems, delegationShapeIsUnrecognized, delegationTargetsOnly } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/delegation-shape.ts";
import { ensurePhaseContextBudget } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-phase-context-budget.ts";
import { ensureApplyTurnBudget, ensurePhaseRuntime } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/sdd-preflight.ts";

// Pure adapter probes only: no runner launches, filesystem changes or delivery.
// These predicates do not establish that every guard is disabled: child command
// guards and native runner defaults remain independent protections.
const dynamic: any = { workflowScript: 'const who = ["sdd", "apply"].join("-"); return runs.run("fix", {agent: who, task: "fix app/foo.ts"});' };
const dynamicResult = {
  items: collectDelegationItems(dynamic),
  unrecognized: delegationShapeIsUnrecognized(dynamic),
  targetsApply: delegationTargetsOnly(dynamic, "sdd-apply"),
  turnBudgetAdded: ensureApplyTurnBudget(dynamic),
  phaseRuntimeAdded: ensurePhaseRuntime(dynamic),
  input: dynamic,
};
const task = 'phase_budget: {"max_tokens":100,"max_reads":1}';
const direct = { agent: "sdd-map", task };
const workflow = { workflowScript: `return runs.run("map", ${JSON.stringify({ agent: "sdd-map", task })});` };
const budgets = [direct, workflow].map((input) => ({ added: ensurePhaseContextBudget(input), input }));
// No on-disk stance is created here. This demonstrates that the cap helper
// sees delegation text alone; the separate child hook reads persisted stance.
const unmarked = { agent: "sdd-apply", task: "Implement next group in openspec/changes/strict-change/tasks.md" };
const marked = { agent: "sdd-apply", task: "Implement next group. STRICT TDD MODE IS ACTIVE." };
const tdd = [unmarked, marked].map((input) => ({ added: ensureApplyTurnBudget(input), input }));
console.log(JSON.stringify({ baseline: "3b9fa42", dynamic: dynamicResult, budgets, tdd }, null, 2));
```

## forecast

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { reviewForecast, evaluateReviewForecast, formatReviewForecast } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/review-forecast.ts";

const roots: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function fixture() {
  const root = mkdtempSync("/private/tmp/ein-manifest-forecast-"); roots.push(root);
  git(root, "init", "-q"); git(root, "config", "user.name", "Audit fixture"); git(root, "config", "user.email", "audit@example.invalid");
  writeFileSync(join(root, "base.ts"), "export const base = true;\n");
  git(root, "add", "base.ts"); git(root, "commit", "-qm", "fixture");
  return root;
}
function summarize(root: string, base?: string) {
  const f = reviewForecast(root, base);
  return { ok: f.ok, production: f.production, tests: f.tests, overBudget: evaluateReviewForecast(f, 400).overBudget };
}
try {
  const root = fixture();
  writeFileSync(join(root, "new-feature.ts"), Array.from({ length: 600 }, (_, i) => `export const x${i} = ${i};\n`).join(""));
  const untracked = summarize(root);
  git(root, "add", "new-feature.ts");
  const staged = summarize(root);
  const withBaseBeforeCommit = summarize(root, "HEAD");
  const classes = [];
  for (const path of ["tests/fixtures/data.ts", "package/tests/fixtures/data.ts", "tests/check.test.ts"]) {
    const dir = fixture();
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), "one\ntwo\nthree\n");
    git(dir, "add", path);
    classes.push({ path, ...summarize(dir) });
  }
  const unknown = reviewForecast(root, "missing-base");
  console.log(JSON.stringify({ baseline: "3b9fa42", untracked, staged, withBaseBeforeCommit, classes,
    unknown: { ok: unknown.ok, overBudget: evaluateReviewForecast(unknown, 400).overBudget, text: formatReviewForecast(unknown, 400) } }, null, 2));
} finally { for (const root of roots) rmSync(root, { recursive: true, force: true }); }
```

## template-rollback

```ts
import { existsSync } from "node:fs";
import { snapshotTemplate, restoreTemplate } from "/private/tmp/ein-scout-salvage/installer/src/core/template-transaction.ts";
import { fakeUpdateCaps } from "/private/tmp/ein-scout-salvage/tests/helpers/fake-update-caps.ts";

// All deployed/snapshot files below exist only in this in-memory map.
// restoreTemplate also invokes cleanManagedDirs against real paths; require
// the entire synthetic root to be absent so that helper cannot remove anything.
const root = "/private/tmp/ein-manifest-in-memory-only-rollback-probe";
if (existsSync(root)) throw new Error("Synthetic root unexpectedly exists; refusing probe");
const agentDir = `${root}/agent`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const files = new Map<string, Uint8Array>();
for (const name of ["AGENTS.md", "app.ts", "settings.json", "template-manifest.json", "mcp.json"]) files.set(`${agentDir}/${name}`, encoder.encode(`old:${name}`));
const caps = fakeUpdateCaps({ files });
const saved = snapshotTemplate({ agentDir, snapshotPath: `${root}/snapshot`, caps });
if (!saved.ok) throw new Error(saved.error.message);
for (const name of ["AGENTS.md", "app.ts", "settings.json", "template-manifest.json", "mcp.json"]) files.set(`${agentDir}/${name}`, encoder.encode(`new:${name}`));
const restored = restoreTemplate({ agentDir, snapshotPath: saved.value.path, caps });
console.log(JSON.stringify({ baseline: "3b9fa42", snapshotOk: saved.ok, restoreOk: restored.ok, afterRestore: Object.fromEntries([...files].filter(([path]) => path.startsWith(`${agentDir}/`)).map(([path, content]) => [path.slice(agentDir.length + 1), decoder.decode(content)])), physicalRootExists: existsSync(root), limits: "Exercises actual snapshot/restore with in-memory capabilities, not a full installer run" }, null, 2));
```

## continuity

```ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { createContinuityHandoffLifecycle as create } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { projectProjectState } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/project-state.ts";
import { runIntentDiscovery, discoveryAgreement } from "/private/tmp/ein-scout-salvage/ein-pi/agent/lib/intent-discovery.ts";
import { runIntentCommand } from "/private/tmp/ein-scout-salvage/ein-cc/sdd-cli/intent-command.ts";

const baseline = "/private/tmp/ein-scout-salvage";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: baseline, encoding: "utf8" }).trim();
assert(commit.startsWith("3b9fa42"), "Probe requires the audited main snapshot");
const base = projectProjectState({ cwd: baseline });
let changed = false;
let checkpoint: any;
const ports: any = {
 now: () => "2026-09-16T12:00:00Z", runtimeAvailable: () => true, processObservation: () => "none",
 projectState: (_cwd: string, runtimes: any) => ({ ...base,
  git: changed ? { ...base.git, stateRef: `git-v1:sha256:${"b".repeat(64)}`, dirty: true, changes: [{ path: "safe.ts", kind: "modified", indexStatus: ".", worktreeStatus: "M" }] } : base.git,
  verification: changed ? { ...base.verification, currentStateRef: `git-v1:sha256:${"b".repeat(64)}` } : base.verification, runtimes }),
 read: () => checkpoint ? { status: "valid", checkpoint } : { status: "absent" },
 write: (_cwd: string, _location: any, next: any) => { checkpoint = next; return { ok: true }; },
};
const first = create(baseline, ports);
first.captureInput("Implementar exportacion CSV de contactos filtrados");
await first.refresh();
const originalObjective = checkpoint.objective;
first.captureInput("Si, continua");
await first.refresh();
const afterAnswer = checkpoint.objective;
assert.equal(afterAnswer, "Si, continua");
await first.mutationResult(false);
changed = true;
const originalPrepare = await first.prepare("claude");
assert(!originalPrepare.ok && originalPrepare.reason === "mutation-uncertain");
const restarted = create(baseline, ports);
const restartStatus = (await restarted.status()).claude;
const restartPrepare = await restarted.prepare("claude");
assert(restartStatus.blockers.includes("checkpoint-state-ref-mismatch"));
assert(restartPrepare.ok);

const cwd = mkdtempSync("/private/tmp/ein-audit-pending-intent-");
let pending: any;
try {
 const entries: any[] = [];
 const ctx: any = { cwd, sessionManager: { getBranch: () => entries } };
 const append = (customType: string, data: unknown) => entries.push({ type: "custom", customType, data });
 const start = runIntentDiscovery(ctx, {
  action: "propose", work: "export-csv", change: "export-csv",
  material: { objective: "Exportar contactos", boundaries: { in: ["Tabla de contactos"], out: ["Envio por correo"] }, completionCriteria: ["CSV del alcance acordado"] },
  decisions: [{ id: "rows", question: "Que filas se exportan", dependsOn: [], status: "open" }, { id: "columns", question: "Que columnas se exportan", dependsOn: [], status: "open" }],
  questions: ["Que filas se exportan", "Que columnas se exportan"],
 }, append, { id: "human-start", text: "Hagamos el intent", source: "interactive" });
 append("ein:intent-response", { id: "answer-1", revision: start.agreement!.revision, text: "Solo filtrados", source: "interactive" });
 const next = runIntentDiscovery(ctx, {
  action: "propose", work: "export-csv", change: "export-csv", responseId: "answer-1",
  decisions: [{ id: "rows", question: "Que filas se exportan", dependsOn: [], status: "resolved", resolution: "Solo filtrados; respuesta answer-1" }, { id: "columns", question: "Que columnas se exportan", dependsOn: [], status: "open" }],
  questions: ["Que columnas se exportan"],
 }, append);
 const fresh = discoveryAgreement({ cwd, sessionManager: { getBranch: () => [] } } as any, "export-csv", "export-csv");
 pending = { originalStatus: next.agreement!.status, resolvedDecision: next.agreement!.decisions![0]!.resolution,
  canonicalIntentExists: existsSync(`${cwd}/openspec/changes/export-csv/intent.md`), newPiSessionHasAgreement: !!fresh.agreement,
  claudeShow: JSON.parse(runIntentCommand(cwd, ["export-csv", "show"]).text) };
 assert.equal(pending.originalStatus, "pending");
 assert.equal(pending.canonicalIntentExists, false);
 assert.equal(pending.newPiSessionHasAgreement, false);
 assert.equal(pending.claudeShow.kind, "absent");
} finally { rmSync(cwd, { recursive: true, force: true }); }
const result = { commit, objective: { originalObjective, afterAnswer }, uncertainty: {
 originalPrepare, restartStatus, restartPrepareOk: restartPrepare.ok,
 restartWarnings: restartPrepare.ok ? restartPrepare.brief.warnings : [],
 limit: "Demonstrates loss of the handoff mutation-uncertain marker after lifecycle recreation, not bypass of verification or closure gates. I/O and the changed Git state are controlled in-memory ports.",
}, pendingIntent: { ...pending, limit: "An unconfirmed first interview only. Original Pi session custom entries retain it; this does not claim loss of confirmed intent.md or failure to resume the same Pi session. The gap concerns new-session/cross-runtime handoff through the shared project artifact/checkpoint contract." } };
writeFileSync("/private/tmp/ein-manifest-continuity-probe.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
```
