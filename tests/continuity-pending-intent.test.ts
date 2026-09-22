import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runIntentDiscovery, observeIntentResponse, selectIntentDraft } from "../shared/sdd/intent-discovery.ts";
import { createIntentDraftRuntime } from "../shared/ports/intent.ts";
import { readIntentDraft } from "../shared/sdd/intent-draft-store.ts";
import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pending-intent-handoff-")); roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, ctx: { cwd: root, sessionManager: { getBranch: () => [] } }, ports: createIntentDraftRuntime(root, { mutating: true }) };
}
const material = { objective: "Exportar filas filtradas", boundaries: { in: ["CSV"], out: ["Filas ocultas"] }, completionCriteria: ["Conserva el filtro"] };
const decisions = [{ id: "columns", question: "¿Columnas visibles?", dependsOn: [], status: "open" as const }];

test("handoff carries a provisional objective and source path, never copies response secrets", async () => {
  const f = fixture();
  const pending = runIntentDiscovery(f.ctx, { action: "propose", work: "export", expectedRevision: "absent", material, decisions, questions: [decisions[0].question] }, () => {}, undefined, f.ports);
  observeIntentResponse(f.ctx, "export", pending.draftRevision!, pending.agreement!.revision, { id: "literal-response", source: "rpc", text: "Visibles. secret=keep-this-private" }, f.ports);
  const lifecycle = createContinuityHandoffLifecycle(f.root, { now: () => new Date().toISOString(), runtimeAvailable: () => true, processObservation: () => "none" });
  const ready = await lifecycle.prepare("claude");
  expect(ready.ok, JSON.stringify(ready)).toBe(true);
  if (!ready.ok) return;
  expect(ready.brief.content).toContain(".ein/intent-drafts/export.json");
  expect(ready.brief.content).toContain("intent-draft");
  expect(ready.brief.content).not.toContain("keep-this-private");
  expect(ready.brief.byteLength).toBeLessThanOrEqual(12 * 1024);
  const checkpoint = readContinuityCheckpoint(f.root, { mode: "adhoc" });
  expect(checkpoint.status === "valid" && checkpoint.checkpoint).toMatchObject({ mode: "adhoc", objective: material.objective, objectiveEvidence: { kind: "intent-draft", work: "export", agreementRevision: pending.agreement!.revision } });
  expect(existsSync(join(f.root, "openspec"))).toBe(false);
  expect(readIntentDraft(f.root, "export")).toMatchObject({ status: "valid", draft: { response: { id: "literal-response", text: "Visibles. secret=keep-this-private" } } });
});

test("multiple pending drafts without selected provenance prevent guessing during handoff", async () => {
  const f = fixture();
  const ports = { ...f.ports, publishObjective: () => ({ status: "updated" as const }) };
  for (const work of ["one", "two"]) runIntentDiscovery(f.ctx, { action: "propose", work, expectedRevision: "absent", material, decisions, questions: [decisions[0].question] }, () => {}, undefined, ports);
  expect(selectIntentDraft(f.ctx)).toEqual({ ambiguous: ["one", "two"] });
  const lifecycle = createContinuityHandoffLifecycle(f.root, { now: () => new Date().toISOString(), runtimeAvailable: () => true, processObservation: () => "none" });
  expect((await lifecycle.prepare("claude")).ok).toBe(false);
  expect(existsSync(join(f.root, "openspec"))).toBe(false);
});
