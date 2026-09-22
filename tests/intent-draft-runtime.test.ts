import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createIntentDraftRuntime } from "../ein-pi/agent/lib/intent-draft-runtime.ts";
import { withIntentAdmissionLock } from "../shared/sdd/intent-draft-store.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "intent-isolation-")); roots.push(root); execFileSync("git", ["init", "-q"], { cwd: root }); return root; }
test("read-only construction and admission never initialize exclusion files", () => {
  const root = fixture();
  const ports = createIntentDraftRuntime(root, { mutating: false });
  expect(ports.admission.check(root).status).toBe("rejected");
  expect(existsSync(join(root, ".gitignore"))).toBe(false);
  expect(existsSync(join(root, ".ein"))).toBe(false);
});
test("a tracked draft is rejected before changing gitignore or private data", () => {
  const root = fixture(); mkdirSync(join(root, ".ein/intent-drafts"), { recursive: true });
  const file = join(root, ".ein/intent-drafts/export.json"); writeFileSync(file, "tracked content");
  execFileSync("git", ["add", ".ein/intent-drafts/export.json"], { cwd: root });
  expect(createIntentDraftRuntime(root, { mutating: true }).admission.check(root).status).toBe("rejected");
  expect(readFileSync(file, "utf8")).toBe("tracked content");
  expect(existsSync(join(root, ".gitignore"))).toBe(false);
});
test("the runtime initializes privacy only inside its acquired lock", () => {
  const root = fixture(); const ports = createIntentDraftRuntime(root, { mutating: true });
  expect(ports.admission.check(root, "inspect").status).toBe("lock-only");
  expect(existsSync(join(root, ".gitignore"))).toBe(false);
  withIntentAdmissionLock(root, "export", () => {
    expect(existsSync(join(root, ".ein/intent-drafts/export.json.lock"))).toBe(true);
    expect(ports.admission.check(root).status).toBe("isolated");
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain(".ein/intent-drafts/");
  }, ports);
});
