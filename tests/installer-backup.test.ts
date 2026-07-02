// =============================================================================
// TESTS: installer backup v2 — tar.gz + dedup + prune + pin
// Protege el contrato del backup: archivos comprimidos, dedup por hash de
// contenido (no re-backupea árboles idénticos), poda automática que respeta
// pins, y restore compatible con archives nuevos y backups legacy (directorio).
// =============================================================================

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listBackups,
  pruneBackups,
  restoreBackup,
  setPinned,
  snapshot,
  treeHash,
} from "../installer/src/core/backup";

const ROOT = join(tmpdir(), "ein-agent-tests", "backup");
const AGENT = join(ROOT, "agent");
const BACKUPS = join(ROOT, "backups");
const PATHS = { agentDir: AGENT, backupDir: BACKUPS };

function seedAgentDir(): void {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(AGENT, "agents"), { recursive: true });
  mkdirSync(join(AGENT, "skills", "local", "demo"), { recursive: true });
  mkdirSync(join(AGENT, "skills", "downloaded", "huge"), { recursive: true });
  mkdirSync(join(AGENT, "sessions"), { recursive: true });
  mkdirSync(join(AGENT, "npm"), { recursive: true });
  writeFileSync(join(AGENT, "settings.json"), JSON.stringify({ theme: "ein" }));
  writeFileSync(join(AGENT, "auth.json"), "secret");
  writeFileSync(join(AGENT, "agents", "sdd-scope.md"), "# scope");
  writeFileSync(join(AGENT, "skills", "local", "demo", "SKILL.md"), "demo");
  writeFileSync(join(AGENT, "skills", "downloaded", "huge", "SKILL.md"), "huge");
  writeFileSync(join(AGENT, "sessions", "s1.jsonl"), "session");
  writeFileSync(join(AGENT, "run-history.jsonl"), "history");
}

function archiveNames(): string[] {
  return listBackups(PATHS).map((b) => b.name);
}

describe("backup v2", () => {
  beforeEach(seedAgentDir);
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  test("snapshot crea tar.gz con sidecar de meta y excluye estado de runtime", async () => {
    const result = await snapshot("pre-update", PATHS);
    expect(result.path).not.toBeNull();
    expect(result.path!.endsWith(".tar.gz")).toBe(true);
    expect(result.deduped).toBe(false);
    expect(existsSync(`${result.path}.meta.json`)).toBe(true);

    const meta = JSON.parse(readFileSync(`${result.path}.meta.json`, "utf8"));
    expect(meta.hash).toBe(treeHash(AGENT));
    expect(meta.reason).toBe("pre-update");

    // El contenido excluye sessions/, npm/, run-history y skills/downloaded.
    const list = Bun.spawnSync(["tar", "-tzf", result.path!]);
    const entries = list.stdout.toString();
    expect(entries).toContain("agents/sdd-scope.md");
    expect(entries).toContain("skills/local/demo/SKILL.md");
    expect(entries).not.toContain("skills/downloaded");
    expect(entries).not.toContain("sessions");
    expect(entries).not.toContain("run-history.jsonl");
    expect(entries).not.toContain("npm/");
  });

  test("dedup: un árbol idéntico no genera un segundo archive", async () => {
    const first = await snapshot("pre-update", PATHS);
    const second = await snapshot("pre-update", PATHS);
    expect(second.deduped).toBe(true);
    expect(second.path).toBe(first.path);
    expect(archiveNames().length).toBe(1);
  });

  test("un cambio real sí genera un segundo archive", async () => {
    await snapshot("pre-update", PATHS);
    writeFileSync(join(AGENT, "settings.json"), JSON.stringify({ theme: "otro" }));
    const second = await snapshot("pre-update", PATHS);
    expect(second.deduped).toBe(false);
    expect(archiveNames().length).toBe(2);
  });

  test("prune conserva los N más recientes y respeta pins", async () => {
    const paths = { ...PATHS, keep: 2 };
    const created: string[] = [];
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(AGENT, "settings.json"), JSON.stringify({ rev: i }));
      const r = await snapshot(`step-${i}`, paths);
      created.push(r.path!);
    }
    // snapshot ya poda al crear: quedan como mucho keep + los recién creados.
    const names = archiveNames();
    expect(names.length).toBe(2);
    expect(names.some((n) => n.includes("step-3"))).toBe(true);

    // Pin del más antiguo restante y una poda agresiva: el pin sobrevive.
    const entries = listBackups(PATHS);
    const oldest = entries[entries.length - 1];
    setPinned(oldest.path, true);
    const pruned = pruneBackups({ ...PATHS, keep: 0 });
    expect(existsSync(oldest.path)).toBe(true);
    expect(listBackups(PATHS).length).toBe(1);
    expect(pruned.length).toBe(1);
  });

  test("restore de un archive recupera contenido sin tocar lo demás", async () => {
    const snap = await snapshot("pre-restore", PATHS);
    writeFileSync(join(AGENT, "settings.json"), "corrupto");
    rmSync(join(AGENT, "agents", "sdd-scope.md"));
    writeFileSync(join(AGENT, "auth.json"), "secreto-nuevo");

    await restoreBackup(snap.path!, PATHS);

    expect(JSON.parse(readFileSync(join(AGENT, "settings.json"), "utf8")).theme).toBe("ein");
    expect(readFileSync(join(AGENT, "agents", "sdd-scope.md"), "utf8")).toBe("# scope");
    // auth.json no está en el backup: el restore no lo pisa.
    expect(readFileSync(join(AGENT, "auth.json"), "utf8")).toBe("secreto-nuevo");
  });

  test("backups legacy (directorio) se listan y restauran", async () => {
    const legacy = join(BACKUPS, "2026-01-01T00-00-00-000Z_legacy");
    mkdirSync(join(legacy, "agents"), { recursive: true });
    writeFileSync(join(legacy, "agents", "sdd-scope.md"), "# legacy");

    const entries = listBackups(PATHS);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe("dir");

    await restoreBackup(legacy, PATHS);
    expect(readFileSync(join(AGENT, "agents", "sdd-scope.md"), "utf8")).toBe("# legacy");
  });

  test("snapshot sin agentDir devuelve null sin crear nada", async () => {
    rmSync(AGENT, { recursive: true, force: true });
    const result = await snapshot("pre-update", PATHS);
    expect(result.path).toBeNull();
    expect(existsSync(BACKUPS) ? readdirSync(BACKUPS).length : 0).toBe(0);
  });
});
