import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTemplateInventory,
  TEMPLATE_REPLACE_TREES,
  validateTemplateInventory,
} from "../installer/src/core/template-inventory.ts";
import { queryCandidateTemplateInventory } from "../installer/src/core/template-transaction.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";

const roots: string[] = [];

function staging(): string {
  const path = mkdtempSync(join(tmpdir(), "ein-template-inventory-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("template inventory v1", () => {
  test("separates replace trees from root and mixed-tree leaves", () => {
    const root = staging();
    mkdirSync(join(root, "agents"), { recursive: true });
    mkdirSync(join(root, "skills", "local"), { recursive: true });
    writeFileSync(join(root, "agents", "owned.md"), "owned");
    writeFileSync(join(root, "skills", "local", "ein.md"), "overlay");
    writeFileSync(join(root, "settings.json"), "{}");

    expect(createTemplateInventory(root, ["ein-mode.json"])).toEqual({
      schemaVersion: 1,
      replaceTrees: [...TEMPLATE_REPLACE_TREES].sort(),
      overlayFiles: ["ein-mode.json", "settings.json", "skills/local/ein.md", "template-manifest.json"],
    });
  });

  test("rejects escapes, duplicates and overlap between ownership modes", () => {
    expect(validateTemplateInventory({ schemaVersion: 1, replaceTrees: [...TEMPLATE_REPLACE_TREES], overlayFiles: ["ein-mode.json", "template-manifest.json", "../auth.json"] })).toBeNull();
    expect(validateTemplateInventory({ schemaVersion: 1, replaceTrees: [...TEMPLATE_REPLACE_TREES], overlayFiles: ["ein-mode.json", "template-manifest.json", "agents/custom.md"] })).toBeNull();
    expect(validateTemplateInventory({ schemaVersion: 1, replaceTrees: ["agents", "agents"], overlayFiles: ["ein-mode.json", "template-manifest.json"] })).toBeNull();
  });

  test("does not follow symlinks while enumerating the staged payload", () => {
    const root = staging();
    writeFileSync(join(root, "outside"), "bytes");
    symlinkSync(join(root, "outside"), join(root, "linked"));
    expect(() => createTemplateInventory(root, [])).toThrow("enlaces simbólicos");
  });

  test("candidate query is version-bound, schema-checked and limited to one MiB", async () => {
    const inventory = {
      schemaVersion: 1 as const,
      replaceTrees: [...TEMPLATE_REPLACE_TREES],
      overlayFiles: ["ein-mode.json", "template-manifest.json"],
    };
    const response = (binaryVersion: string, stdout?: string) => fakeUpdateCaps({
      template: {
        deploy: async () => undefined,
        readManifest: async () => null,
        queryInventory: async () => ({ code: 0, stdout: stdout ?? JSON.stringify({ binaryVersion, templateVersion: binaryVersion, inventory }) }),
      },
    });
    expect(await queryCandidateTemplateInventory({ binaryPath: "/candidate", expectedVersion: "1.2.3", caps: response("1.2.3") }))
      .toEqual(expect.objectContaining({ ok: true }));
    expect(await queryCandidateTemplateInventory({ binaryPath: "/candidate", expectedVersion: "1.2.3", caps: response("1.2.2") }))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "inventory-query-invalid" }) }));
    expect(await queryCandidateTemplateInventory({ binaryPath: "/candidate", expectedVersion: "1.2.3", caps: response("1.2.3", "x".repeat(1024 * 1024 + 1)) }))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "inventory-query-too-large" }) }));
  });
});
