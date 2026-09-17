import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEMPLATE_REPLACE_TREES, type TemplateInventory } from "../installer/src/core/template-inventory.ts";
import { restoreTemplate, snapshotTemplate } from "../installer/src/core/template-transaction.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";

const roots: string[] = [];
const inventory: TemplateInventory = {
  schemaVersion: 1,
  replaceTrees: [...TEMPLATE_REPLACE_TREES],
  overlayFiles: ["app.ts", "ein-mode.json", "settings.json", "skills/local/ein.md", "surfaces/new.ts", "template-manifest.json"],
};

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ein-template-rollback-"));
  roots.push(value);
  return value;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("inventory-driven template rollback", () => {
  test("restores bytes, modes and absences in a temporary real installation", () => {
    const base = root();
    const agentDir = join(base, "agent");
    const snapshotPath = join(base, "snapshot");
    mkdirSync(join(agentDir, "agents"), { recursive: true });
    mkdirSync(join(agentDir, "skills", "local"), { recursive: true });
    writeFileSync(join(agentDir, "agents", "old.md"), "old-agent");
    writeFileSync(join(agentDir, "app.ts"), "old-app");
    writeFileSync(join(agentDir, "settings.json"), '{"defaultModel":"personal"}');
    writeFileSync(join(agentDir, "skills", "local", "ein.md"), "old-ein-skill");
    writeFileSync(join(agentDir, "skills", "local", "personal.md"), "personal-skill");
    writeFileSync(join(agentDir, "auth.json"), "secret");
    chmodSync(join(agentDir, "app.ts"), 0o640);

    const caps = defaultUpdateCaps();
    const snapshot = snapshotTemplate({ agentDir, snapshotPath, inventory, caps });
    expect(snapshot.ok).toBe(true);
    rmSync(join(agentDir, "agents"), { recursive: true });
    mkdirSync(join(agentDir, "agents"), { recursive: true });
    writeFileSync(join(agentDir, "agents", "new.md"), "new-agent");
    writeFileSync(join(agentDir, "app.ts"), "new-app");
    chmodSync(join(agentDir, "app.ts"), 0o777);
    writeFileSync(join(agentDir, "settings.json"), '{"defaultModel":"new-default"}');
    writeFileSync(join(agentDir, "skills", "local", "ein.md"), "new-ein-skill");
    mkdirSync(join(agentDir, "surfaces"), { recursive: true });
    writeFileSync(join(agentDir, "surfaces", "new.ts"), "new-surface");

    expect(restoreTemplate({ agentDir, snapshotPath, caps })).toEqual({ ok: true, value: undefined });
    expect(readFileSync(join(agentDir, "agents", "old.md"), "utf8")).toBe("old-agent");
    expect(existsSync(join(agentDir, "agents", "new.md"))).toBe(false);
    expect(readFileSync(join(agentDir, "app.ts"), "utf8")).toBe("old-app");
    expect(statSync(join(agentDir, "app.ts")).mode & 0o777).toBe(0o640);
    expect(readFileSync(join(agentDir, "settings.json"), "utf8")).toContain("personal");
    expect(readFileSync(join(agentDir, "skills", "local", "ein.md"), "utf8")).toBe("old-ein-skill");
    expect(readFileSync(join(agentDir, "skills", "local", "personal.md"), "utf8")).toBe("personal-skill");
    expect(readFileSync(join(agentDir, "auth.json"), "utf8")).toBe("secret");
    expect(existsSync(join(agentDir, "surfaces"))).toBe(false);
  });

  test("runs the same snapshot and restore algorithm through fake capabilities", () => {
    const files = new Map<string, Uint8Array>();
    const caps = fakeUpdateCaps({ files });
    const agentDir = "/fake/agent";
    const snapshotPath = "/fake/snapshot";
    caps.fs.makeDir(agentDir);
    caps.fs.makeDir(join(agentDir, "agents"));
    caps.fs.writeFile(join(agentDir, "agents", "old.md"), new TextEncoder().encode("old"));
    caps.fs.writeFile(join(agentDir, "app.ts"), new TextEncoder().encode("old-app"));
    caps.fs.writeFile(join(agentDir, "settings.json"), new TextEncoder().encode("old-settings"));
    caps.fs.makeDir(join(agentDir, "skills", "local"));
    caps.fs.writeFile(join(agentDir, "skills", "local", "ein.md"), new TextEncoder().encode("old-skill"));
    const snapshot = snapshotTemplate({ agentDir, snapshotPath, inventory, caps });
    expect(snapshot.ok).toBe(true);
    caps.fs.writeFile(join(agentDir, "app.ts"), new TextEncoder().encode("new-app"));
    caps.fs.writeFile(join(agentDir, "surfaces", "new.ts"), new TextEncoder().encode("new"));
    expect(restoreTemplate({ agentDir, snapshotPath, caps })).toEqual({ ok: true, value: undefined });
    expect(new TextDecoder().decode(caps.fs.readFile(join(agentDir, "app.ts")))).toBe("old-app");
    expect(caps.fs.exists(join(agentDir, "surfaces", "new.ts"))).toBe(false);
  });

  test("rejects corrupt and legacy snapshots before mutating the installation", () => {
    const base = root();
    const agentDir = join(base, "agent");
    const snapshotPath = join(base, "snapshot");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "app.ts"), "old-app");
    const caps = defaultUpdateCaps();
    expect(snapshotTemplate({ agentDir, snapshotPath, inventory, caps }).ok).toBe(true);
    writeFileSync(join(snapshotPath, "files", "app.ts"), "corrupt");
    writeFileSync(join(agentDir, "app.ts"), "deployed-app");
    expect(restoreTemplate({ agentDir, snapshotPath, caps })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "restore-failed" }) }));
    expect(readFileSync(join(agentDir, "app.ts"), "utf8")).toBe("deployed-app");

    const indexPath = join(snapshotPath, "template-snapshot.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as { entries: Array<{ path: string }> };
    index.entries[0]!.path = "agents/../auth.json";
    writeFileSync(indexPath, JSON.stringify(index));
    expect(restoreTemplate({ agentDir, snapshotPath, caps })).toEqual(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("corrupto") }) }));
    expect(readFileSync(join(agentDir, "app.ts"), "utf8")).toBe("deployed-app");

    const legacy = join(base, "legacy");
    mkdirSync(legacy);
    expect(restoreTemplate({ agentDir, snapshotPath: legacy, caps })).toEqual(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("legacy") }) }));
    expect(readFileSync(join(agentDir, "app.ts"), "utf8")).toBe("deployed-app");
  });

  test("copy, chmod and read-back faults never report success and a later retry restores", () => {
    for (const fault of ["copy", "chmod", "read-back"] as const) {
      const base = root();
      const agentDir = join(base, "agent");
      const snapshotPath = join(base, "snapshot");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, "app.ts"), "old-app");
      const caps = defaultUpdateCaps();
      expect(snapshotTemplate({ agentDir, snapshotPath, inventory, caps }).ok).toBe(true);
      writeFileSync(join(agentDir, "app.ts"), "new-app");
      const target = join(agentDir, "app.ts");
      let copied = false;
      const faulty = {
        ...caps,
        fs: {
          ...caps.fs,
          copyFile(source: string, destination: string) {
            if (fault === "copy" && destination === target) throw new Error("injected copy failure");
            caps.fs.copyFile(source, destination);
            if (destination === target) copied = true;
          },
          chmod(path: string, value: number) {
            if (fault === "chmod" && path === target) throw new Error("injected chmod failure");
            caps.fs.chmod(path, value);
          },
          readFile(path: string) {
            if (fault === "read-back" && copied && path === target) return new TextEncoder().encode("corrupt read-back");
            return caps.fs.readFile(path);
          },
        },
      };
      expect(restoreTemplate({ agentDir, snapshotPath, caps: faulty })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "restore-failed" }) }));
      expect(existsSync(join(snapshotPath, "template-snapshot.json"))).toBe(true);
      expect(restoreTemplate({ agentDir, snapshotPath, caps })).toEqual({ ok: true, value: undefined });
      expect(readFileSync(target, "utf8")).toBe("old-app");
    }
  });
});
