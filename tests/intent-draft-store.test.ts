import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";
import { createIntentDraft, type IntentDraftBody, type IntentRuntimePorts } from "../shared/sdd/intent-draft.ts";
import { intentDraftPath, listIntentDrafts, readIntentDraft, transactIntentDraft, withIntentAdmissionLock } from "../shared/sdd/intent-draft-store.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "intent-draft-")); roots.push(root); return root; }
export function testPorts(): IntentRuntimePorts {
  return { admission: { check: (root) => ({ status: "not-git", root }) }, now: () => "2026-09-22T10:00:00Z", newId: randomUUID, publishObjective: () => ({ status: "updated" }) };
}
function body(): IntentDraftBody {
  const material = { objective: "Export filtered rows", boundaries: { in: ["visible rows"], out: ["all rows"] }, completionCriteria: ["CSV preserves the filter"] };
  return { schemaVersion: 1, work: "export", agreement: { version: 1, work: "export", status: "pending", revision: "round-1", questions: ["Which columns?"], material, materialKey: createIntentMaterialKey(material) }, questionnaireBindings: [], publication: { state: "none" } };
}
test("reads have no side effects and mutations require isolated runtime admission", () => {
  const root = fixture();
  expect(readIntentDraft(root, "export")).toEqual({ status: "absent" });
  expect(listIntentDrafts(root)).toEqual({ status: "ok", drafts: [] });
  expect(existsSync(join(root, ".ein"))).toBe(false);
  expect(transactIntentDraft(root, "export", "absent", body, undefined as never).ok).toBe(false);
  expect(existsSync(join(root, ".ein"))).toBe(false);
});
test("CAS preserves literal responses, rejects stale writers and uses private modes", () => {
  const root = fixture(); const ports = testPorts();
  const first = transactIntentDraft(root, "export", "absent", body, ports);
  if (!first.ok) throw new Error(first.reason);
  const answer = { id: "observed-id", source: "rpc" as const, text: "Solo lo filtrado", revision: "round-1" };
  const next = transactIntentDraft(root, "export", first.draft.revision, (old) => ({ ...old!, response: answer }), ports);
  expect(next.ok).toBe(true);
  expect(transactIntentDraft(root, "export", first.draft.revision, body, ports)).toMatchObject({ ok: false, code: "conflict" });
  expect(readIntentDraft(root, "export")).toMatchObject({ status: "valid", draft: { response: answer } });
  expect(statSync(intentDraftPath(root, "export")).mode & 0o777).toBe(0o600);
  expect(statSync(join(root, ".ein/intent-drafts")).mode & 0o777).toBe(0o700);
});
test("lock excludes concurrent close/reopen and is released after failure", () => {
  const root = fixture(); const ports = testPorts();
  withIntentAdmissionLock(root, "export", () => {
    expect(transactIntentDraft(root, "export", "absent", body, ports)).toMatchObject({ ok: false, code: "busy" });
  }, ports);
  expect(() => withIntentAdmissionLock(root, "export", () => { throw new Error("crash"); }, ports)).toThrow("crash");
  expect(transactIntentDraft(root, "export", "absent", body, ports).ok).toBe(true);
});
test("symlinks, malformed records and byte limits fail without losing existing evidence", () => {
  const root = fixture(); const outside = fixture();
  symlinkSync(outside, join(root, ".ein"));
  expect(transactIntentDraft(root, "export", "absent", body, testPorts()).ok).toBe(false);
  expect(existsSync(join(outside, "intent-drafts"))).toBe(false);
  const safe = fixture();
  const first = transactIntentDraft(safe, "export", "absent", body, testPorts());
  if (!first.ok) throw new Error(first.reason);
  const before = readFileSync(intentDraftPath(safe, "export"), "utf8");
  expect(transactIntentDraft(safe, "export", first.draft.revision, (old) => ({ ...old!, response: { id: "big", revision: "round-1", source: "rpc", text: "x".repeat(300000) } }), testPorts()).ok).toBe(false);
  expect(readFileSync(intentDraftPath(safe, "export"), "utf8")).toBe(before);
  writeFileSync(intentDraftPath(safe, "export"), "{}");
  expect(readIntentDraft(safe, "export").status).toBe("invalid");
  expect(transactIntentDraft(safe, "export", "absent", body, testPorts()).ok).toBe(false);
});
test("a crash after rename reports uncertain publication while preserving the published draft", () => {
  const root = fixture();
  expect(transactIntentDraft(root, "export", "absent", body, testPorts(), { afterPublish: () => { throw new Error("crash"); } })).toMatchObject({ ok: false, code: "published-unverified" });
  expect(readIntentDraft(root, "export").status).toBe("valid");
});
test("automatic listing is bounded and rejects unknown fields or mismatched hashes", () => {
  const root = fixture(); mkdirSync(join(root, ".ein/intent-drafts"), { recursive: true });
  for (let index = 0; index < 33; index++) writeFileSync(join(root, `.ein/intent-drafts/work-${index}.json`), "{}");
  expect(listIntentDrafts(root).status).toBe("invalid");
  expect(() => createIntentDraft({ ...body(), unexpected: true } as never)).toThrow();
});
