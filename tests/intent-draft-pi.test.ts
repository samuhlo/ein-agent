import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";
import { readAgreement, writeAgreement, type IntentAgreement } from "../shared/sdd/intent-agreement.ts";
import { INTENT_INPUT, INTENT_STATE, migrateLegacyIntentDraft } from "../shared/sdd/intent-discovery.ts";
import { createIntentDraftRuntime } from "../shared/ports/intent.ts";
import { readIntentDraft } from "../shared/sdd/intent-draft-store.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(status: "pending" | "confirmed" = "pending") {
  const root = mkdtempSync(join(tmpdir(), "intent-legacy-import-")); roots.push(root);
  const material = { objective: "Export visible rows", boundaries: { in: ["CSV"], out: ["Hidden rows"] }, completionCriteria: ["Keeps filter"] };
  const agreement: IntentAgreement = { version: 1, work: "export", change: "export", status, revision: "legacy-round", material, materialKey: createIntentMaterialKey(material), questions: ["Which columns?"], ...(status === "confirmed" ? { response: { id: "original", text: "Visible", source: "rpc" as const } } : {}) };
  const response = { id: "original", text: "Visible", source: "rpc", revision: agreement.revision };
  const entries = [{ type: "custom", customType: INTENT_STATE, data: agreement }, { type: "custom", customType: INTENT_INPUT, data: response }];
  return { root, agreement, ctx: { cwd: root, sessionManager: { getBranch: () => entries } }, ports: createIntentDraftRuntime(root, { mutating: true }), dir: join(root, "openspec/changes/export") };
}
test("importing a reopened legacy session preserves its observed response without creating SDD", () => {
  const f = fixture();
  expect(migrateLegacyIntentDraft(f.ctx, "export", f.ports).response).toMatchObject({ id: "original", text: "Visible", source: "rpc" });
  expect(existsSync(f.dir)).toBe(false);
});
test("a confirmed canonical agreement is read without manufacturing a new draft", () => {
  const f = fixture("confirmed"); mkdirSync(f.dir, { recursive: true }); writeAgreement(f.dir, f.agreement);
  expect(migrateLegacyIntentDraft(f.ctx, "export", f.ports).agreement).toEqual(f.agreement);
  expect(readIntentDraft(f.root, "export")).toEqual({ status: "absent" });
});
test("old session entries cannot overwrite or recreate the canonical agreement", () => {
  const f = fixture("confirmed");
  expect(() => migrateLegacyIntentDraft(f.ctx, "export", f.ports)).toThrow("missing");
  expect(existsSync(f.dir)).toBe(false);
  mkdirSync(f.dir, { recursive: true }); writeAgreement(f.dir, { ...f.agreement, revision: "newer" });
  expect(() => migrateLegacyIntentDraft(f.ctx, "export", f.ports)).toThrow("disagrees");
  expect(readAgreement(f.dir)).toMatchObject({ kind: "valid", agreement: { revision: "newer" } });
  expect(readIntentDraft(f.root, "export")).toEqual({ status: "absent" });
});
