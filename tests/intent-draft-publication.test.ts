import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";
import { readAgreement, writeAgreement, type IntentAgreement } from "../shared/sdd/intent-agreement.ts";
import type { IntentDraftBody, IntentRuntimePorts } from "../shared/sdd/intent-draft.ts";
import { publishIntentDraft, readIntentDraft, recoverIntentDraft } from "../shared/sdd/intent-draft-store.ts";
import { readIntentAdmission } from "../shared/sdd/intent-admission.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const ports: IntentRuntimePorts = { now: () => "2026-09-22", newId: randomUUID, publishObjective: () => ({ status: "updated" }), admission: { check: (root) => ({ status: "not-git", root }) } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "intent-publication-")); roots.push(root);
  const dir = join(root, "openspec/changes/export"); mkdirSync(dir, { recursive: true });
  const material = { objective: "Export filtered rows", boundaries: { in: ["CSV"], out: ["other rows"] }, completionCriteria: ["Preserves the filter"] };
  const agreement: IntentAgreement = { version: 1, work: "export", change: "export", revision: "old", status: "confirmed", fromRequest: true,
    material, materialKey: createIntentMaterialKey(material), questions: [], response: { id: "human", text: "Exporta las filas filtradas", source: "rpc" } };
  writeAgreement(dir, agreement);
  const body = (status: "pending" | "confirmed", revision: string): IntentDraftBody => ({ schemaVersion: 1, work: "export", agreement: { ...agreement, status, revision }, questionnaireBindings: [], publication: { state: "none" } });
  const admission = () => readIntentAdmission({ root, work: "export", changeDir: dir, requiresCanonical: true });
  return { root, dir, agreement, body, admission };
}
test("invalidating is durable before the old canonical agreement can be changed", () => {
  const f = fixture();
  expect(publishIntentDraft(f.root, f.body("pending", "new-round"), "absent", ports, { afterJournal: () => { throw new Error("crash"); } }).ok).toBe(false);
  expect(readAgreement(f.dir)).toMatchObject({ kind: "valid", agreement: { status: "confirmed", revision: "old" } });
  expect(f.admission()).toMatchObject({ admitted: false, state: "pending" });
  const draft = readIntentDraft(f.root, "export"); if (draft.status !== "valid") throw new Error("missing journal");
  expect(recoverIntentDraft(f.root, "export", draft.draft.revision, ports).ok).toBe(true);
  expect(readAgreement(f.dir)).toMatchObject({ kind: "valid", agreement: { status: "pending", revision: "new-round" } });
});
test("promotion recovers after canonical write without obtaining another human answer", () => {
  const f = fixture();
  expect(publishIntentDraft(f.root, f.body("confirmed", "new-review"), "absent", ports, { afterCanonical: () => { throw new Error("crash"); } }).ok).toBe(false);
  expect(f.admission().admitted).toBe(false);
  const draft = readIntentDraft(f.root, "export"); if (draft.status !== "valid") throw new Error("missing journal");
  const restored = recoverIntentDraft(f.root, "export", draft.draft.revision, ports);
  expect(restored.ok).toBe(true);
  expect(f.admission()).toMatchObject({ admitted: true, agreement: { revision: "new-review", response: { id: "human" } } });
  if (restored.ok) expect(recoverIntentDraft(f.root, "export", restored.draft.revision, ports)).toEqual(restored);
});
test("recovery never overwrites a competing canonical revision", () => {
  const f = fixture();
  publishIntentDraft(f.root, f.body("pending", "round"), "absent", ports, { afterJournal: () => { throw new Error("crash"); } });
  const draft = readIntentDraft(f.root, "export"); if (draft.status !== "valid") throw new Error("missing journal");
  writeAgreement(f.dir, { ...f.agreement, revision: "another-session" });
  expect(recoverIntentDraft(f.root, "export", draft.draft.revision, ports)).toMatchObject({ ok: false, code: "conflict" });
  expect(readAgreement(f.dir)).toMatchObject({ kind: "valid", agreement: { revision: "another-session" } });
  expect(readIntentDraft(f.root, "export")).toMatchObject({ status: "valid", draft: { revision: draft.draft.revision } });
});
