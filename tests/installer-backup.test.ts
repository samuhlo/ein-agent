// =============================================================================
// TESTS: installer manifest backups — exact restore + dedup + prune + pin
// =============================================================================

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
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
import {
  BACKUP_LIMITS,
  canonicalManifest,
  collectTree,
  contentDigest,
  fsyncTree,
  parseManifest,
  readBoundedFile,
  sealTree,
  validateSnapshot,
} from "../installer/src/core/backup-manifest";

const ROOT = join(tmpdir(), "ein-agent-tests", "backup");
const AGENT = join(ROOT, "agent");
const BACKUPS = join(ROOT, "backups");
const PATHS = { agentDir: AGENT, backupDir: BACKUPS };

function removeFixtureRoot(): void {
  const protectedTree = join(ROOT, "omarchy-target");
  if (existsSync(protectedTree)) chmodSync(protectedTree, 0o700);
  rmSync(ROOT, { recursive: true, force: true });
}

function seedAgentDir(): void {
  if (existsSync(BACKUPS)) { for (const entry of listBackups(PATHS)) if (entry.kind !== "recovery") setPinned(entry.path, false); pruneBackups({ ...PATHS, keep: 0 }); }
  removeFixtureRoot();
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

describe("manifest backup v1", () => {
  beforeEach(seedAgentDir);
  afterAll(removeFixtureRoot);

  test("snapshot publica manifest determinista y excluye estado de runtime", async () => {
    const result = await snapshot("pre-update", { ...PATHS, now: () => new Date("2026-01-01T00:00:00.000Z") });
    expect(result.path).not.toBeNull();
    expect(result.path!.endsWith(".snapshot")).toBe(true);
    expect(result.deduped).toBe(false);
    const meta = JSON.parse(readFileSync(join(result.path!, "metadata.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(join(result.path!, "manifest.json"), "utf8"));
    expect(meta.contentDigest).toBe(treeHash(AGENT));
    expect(meta.reason).toBe("pre-update");
    expect(manifest.entries.map((entry: { path: string }) => entry.path)).toEqual(["agents/sdd-scope.md", "settings.json", "skills/local/demo/SKILL.md"]);
    expect(manifest.entries.every((entry: { size: number; sha256: string }) => Number.isSafeInteger(entry.size) && /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain("secret");
  });

  test("manifest v1 can be parsed canonically and v2 distinguishes file and symlink content", () => {
    const file = { path: "settings.json", type: "file" as const, size: 3, sha256: "a".repeat(64), mode: 0o644 };
    const v1 = { schemaVersion: 1 as const, excludedStateVersion: 1 as const, entries: [file] };
    expect(parseManifest(canonicalManifest(v1))).toEqual(v1);

    const link = { path: "skills/omarchy", type: "symlink" as const, target: "/external/omarchy" };
    const v2 = { schemaVersion: 2 as const, excludedStateVersion: 1 as const, entries: [file, link] };
    expect(parseManifest(canonicalManifest(v2))).toEqual(v2);
    expect(contentDigest(v2.entries)).not.toBe(contentDigest([{ ...file, path: "skills/omarchy" }]));
    expect(contentDigest(v2.entries)).not.toBe(contentDigest([...v2.entries.slice(0, 1), { ...link, target: "/external/other" }]));
  });

  test("manifest v2 records opaque symlink targets in canonical path order", () => {
    const external = join(ROOT, "external-omarchy");
    mkdirSync(external, { recursive: true });
    symlinkSync(external, join(AGENT, "skills", "local", "omarchy"));
    const manifest = collectTree(AGENT);
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      "agents/sdd-scope.md",
      "settings.json",
      "skills/local/demo/SKILL.md",
      "skills/local/omarchy",
    ]);
    expect(manifest.entries.at(-1)).toEqual({ path: "skills/local/omarchy", type: "symlink", target: external });
    expect(canonicalManifest(manifest)).toBe(`${JSON.stringify(manifest)}\n`);
  });

  test("manifest rejects empty and over-limit opaque symlink targets", () => {
    const entry = { path: "skills/omarchy", type: "symlink", target: "x".repeat(BACKUP_LIMITS.target + 1) };
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [entry] }))).toThrow("target");
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [{ ...entry, target: "" }] }))).toThrow("target");
  });

  test("manifest v2 rejects control targets, path collisions, and non-canonical ordering", () => {
    const file = { path: "a", type: "file", size: 0, sha256: "a".repeat(64), mode: 0o644 };
    const link = { path: "b", type: "symlink", target: "safe" };
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [{ ...link, target: "bad\u0001target" }] }))).toThrow("target");
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [link, file] }))).toThrow("canonico");
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [file, { ...link, path: "a/child" }] }))).toThrow("canonico");
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 1, excludedStateVersion: 1, entries: [link] }))).toThrow("entrada");
  });

  test("manifest v2 rejects Unicode control targets", () => {
    const entry = { path: "skills/omarchy", type: "symlink", target: "safe\u0085target" };
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, excludedStateVersion: 1, entries: [entry] }))).toThrow("target");
  });

  test("node_modules is excluded before lstat and hardlinked user files are accepted", () => {
    const external = join(ROOT, "dependency-target");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "must-not-be-read"), "dependency");
    mkdirSync(join(AGENT, "skills", "local", "node_modules"), { recursive: true });
    rmSync(join(AGENT, "skills", "local", "node_modules"), { recursive: true, force: true });
    symlinkSync(external, join(AGENT, "skills", "local", "node_modules"));
    writeFileSync(join(AGENT, "agents", "hardlink-source"), "shared");
    linkSync(join(AGENT, "agents", "hardlink-source"), join(AGENT, "agents", "hardlink-copy"));

    const manifest = collectTree(AGENT);
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      "agents/hardlink-copy",
      "agents/hardlink-source",
      "agents/sdd-scope.md",
      "settings.json",
      "skills/local/demo/SKILL.md",
    ]);
    expect(manifest.entries.filter((entry) => entry.path.includes("node_modules")).length).toBe(0);
  });

  test("snapshot y restore v2 conservan targets externos y relativos sin seguirlos", async () => {
    const external = join(ROOT, "external-omarchy");
    const relativeTarget = join(ROOT, "relative-target");
    mkdirSync(external, { recursive: true });
    mkdirSync(relativeTarget, { recursive: true });
    writeFileSync(join(external, "sentinel"), "must-not-be-read");
    symlinkSync(external, join(AGENT, "skills", "local", "omarchy"));
    symlinkSync("../../relative-target", join(AGENT, "agents", "relative-link"));

    const snap = await snapshot("links", PATHS);
    const manifest = validateSnapshot(snap.path!).manifest;
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.entries).toContainEqual({ path: "skills/local/omarchy", type: "symlink", target: external });
    expect(manifest.entries).toContainEqual({ path: "agents/relative-link", type: "symlink", target: "../../relative-target" });

    rmSync(join(AGENT, "skills", "local", "omarchy"));
    rmSync(join(AGENT, "agents", "relative-link"));
    await restoreBackup(snap.path!, PATHS);

    expect(lstatSync(join(AGENT, "skills", "local", "omarchy")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(AGENT, "skills", "local", "omarchy"))).toBe(external);
    expect(readlinkSync(join(AGENT, "agents", "relative-link"))).toBe("../../relative-target");
    expect(readFileSync(join(external, "sentinel"), "utf8")).toBe("must-not-be-read");
  });

  test("staging rechaza padres enlazados sin escribir fuera del stage", () => {
    const source = join(ROOT, "source");
    const stage = join(ROOT, "stage");
    const external = join(ROOT, "stage-external");
    mkdirSync(join(source, "nested"), { recursive: true });
    mkdirSync(stage, { recursive: true });
    mkdirSync(external, { recursive: true });
    writeFileSync(join(source, "nested", "state.json"), "safe");
    writeFileSync(join(external, "state.json"), "sentinel");
    symlinkSync(external, join(stage, "nested"));

    expect(() => collectTree(source, stage, false)).toThrow();
    expect(readFileSync(join(external, "state.json"), "utf8")).toBe("sentinel");
  });

  test("restore rechaza un padre enlazado al reinsertar estado excluido", async () => {
    const external = join(ROOT, "excluded-external");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "must-not-change"), "sentinel");
    rmSync(join(AGENT, "skills"), { recursive: true, force: true });
    symlinkSync(external, join(AGENT, "skills"));
    const snap = await snapshot("linked-excluded", PATHS);

    rmSync(join(AGENT, "skills"), { recursive: true, force: true });
    mkdirSync(join(AGENT, "skills", "downloaded"), { recursive: true });
    writeFileSync(join(AGENT, "skills", "downloaded", "state"), "excluded-state");

    await expect(restoreBackup(snap.path!, PATHS)).rejects.toThrow();
    expect(readFileSync(join(external, "must-not-change"), "utf8")).toBe("sentinel");
  });

  test("restore rechaza una raiz live enlazada aunque el target no exista", async () => {
    const snap = await snapshot("dangling-live", PATHS);
    rmSync(AGENT, { recursive: true, force: true });
    symlinkSync(join(ROOT, "missing-live-target"), AGENT);

    await expect(restoreBackup(snap.path!, PATHS)).rejects.toThrow();
    expect(lstatSync(AGENT).isSymbolicLink()).toBe(true);
  });

  test("fsync y seal tratan enlaces como nodos y no siguen su target", () => {
    const tree = join(ROOT, "link-tree");
    const external = join(ROOT, "link-tree-external");
    mkdirSync(tree, { recursive: true });
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "sentinel"), "untouched");
    symlinkSync(external, join(tree, "external"));
    symlinkSync(external, join(ROOT, "link-tree-root"));

    expect(() => fsyncTree(tree)).not.toThrow();
    expect(() => sealTree(tree)).not.toThrow();
    expect(() => fsyncTree(join(ROOT, "link-tree-root"))).toThrow();
    expect(() => sealTree(join(ROOT, "link-tree-root"))).toThrow();
    expect(lstatSync(join(tree, "external")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(external, "sentinel"), "utf8")).toBe("untouched");
  });

  test("v1 y v2 validan antes de mutar live y el tamper de un enlace se rechaza", async () => {
    const v1 = await snapshot("v1", PATHS);
    expect(validateSnapshot(v1.path!).manifest.schemaVersion).toBe(1);

    const external = join(ROOT, "tamper-external");
    mkdirSync(external, { recursive: true });
    symlinkSync(external, join(AGENT, "skills", "local", "omarchy"));
    const v2 = await snapshot("v2", PATHS);
    expect(validateSnapshot(v2.path!).manifest.schemaVersion).toBe(2);
    const before = readFileSync(join(AGENT, "settings.json"), "utf8");
    rmSync(join(v2.path!, "content", "skills", "local", "omarchy"));
    symlinkSync(join(ROOT, "tampered-target"), join(v2.path!, "content", "skills", "local", "omarchy"));

    await expect(restoreBackup(v2.path!, PATHS)).rejects.toThrow();
    expect(readFileSync(join(AGENT, "settings.json"), "utf8")).toBe(before);
  });

  // TIEMPO -> este test monta un arbol real: crea directorios, pone uno en modo
  // 000, teje symlinks y hardlinks, y hace un snapshot y un restore completos.
  // Su duracion la manda la contencion del disco, no la logica: 1,3 s en una
  // maquina tranquila y 33,8 s en un runner de CI compitiendo con el resto de
  // la suite en paralelo. Los 5 s que lo tumbaron eran el DEFAULT de Bun, que
  // nadie eligio para este caso. El limite explicito deja margen para un runner
  // cargado sin dejar de cortar un cuelgue de verdad.
  const REAL_TREE_TIMEOUT_MS = 60_000;

  test("Omarchy real tree snapshots and restores user state without dependency traversal", async () => {
    const external = join(ROOT, "omarchy-target");
    mkdirSync(join(external, "private"), { recursive: true });
    writeFileSync(join(external, "private", "sentinel"), "must-not-be-read");
    chmodSync(external, 0o000);
    symlinkSync(external, join(AGENT, "skills", "omarchy"));

    const npmBin = join(AGENT, "npm", "node_modules", ".bin");
    const nestedBin = join(AGENT, "skills", "local", "node_modules", ".bin");
    mkdirSync(npmBin, { recursive: true });
    mkdirSync(nestedBin, { recursive: true });
    symlinkSync(join(external, "private"), join(npmBin, "omarchy"));
    symlinkSync(join(external, "private"), join(nestedBin, "omarchy"));

    const dependencyPayload = join(AGENT, "npm", "node_modules", "payload");
    mkdirSync(dependencyPayload, { recursive: true });
    for (let index = 0; index <= BACKUP_LIMITS.files; index++) writeFileSync(join(dependencyPayload, `package-${index}.js`), "dependency");
    const oversizedDependency = join(dependencyPayload, "oversized.bin");
    writeFileSync(oversizedDependency, "");
    truncateSync(oversizedDependency, BACKUP_LIMITS.bytes + 1);

    const userFile = join(AGENT, "agents", "omarchy-user.json");
    const hardlinkedUserFile = join(AGENT, "agents", "omarchy-user-copy.json");
    writeFileSync(userFile, JSON.stringify({ source: "omarchy" }));
    linkSync(userFile, hardlinkedUserFile);

    const snap = await snapshot("omarchy-real-tree", PATHS);
    chmodSync(external, 0o755);
    expect(snap.path).not.toBeNull();
    const manifest = validateSnapshot(snap.path!).manifest;
    const paths = manifest.entries.map((entry) => entry.path);
    expect(manifest.schemaVersion).toBe(2);
    expect(paths).toContain("skills/omarchy");
    expect(paths).toContain("agents/omarchy-user.json");
    expect(paths).toContain("agents/omarchy-user-copy.json");
    expect(paths.some((path) => path.startsWith("npm/") || path.includes("node_modules") || path.includes(".bin/"))).toBe(false);
    expect(existsSync(join(snap.path!, "content", "npm"))).toBe(false);
    expect(paths).not.toContain("skills/omarchy/private/sentinel");
    expect(readFileSync(join(external, "private", "sentinel"), "utf8")).toBe("must-not-be-read");

    writeFileSync(userFile, "changed");
    rmSync(hardlinkedUserFile);
    await restoreBackup(snap.path!, PATHS);

    expect(readFileSync(userFile, "utf8")).toBe(JSON.stringify({ source: "omarchy" }));
    expect(readFileSync(hardlinkedUserFile, "utf8")).toBe(JSON.stringify({ source: "omarchy" }));
    expect(lstatSync(userFile).isFile()).toBe(true);
    expect(lstatSync(hardlinkedUserFile).isFile()).toBe(true);
    expect(lstatSync(userFile).ino).not.toBe(lstatSync(hardlinkedUserFile).ino);
    expect(lstatSync(join(AGENT, "skills", "omarchy")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(AGENT, "skills", "omarchy"))).toBe(external);
    expect(existsSync(join(AGENT, "npm"))).toBe(false);
    expect(existsSync(join(AGENT, "skills", "local", "node_modules"))).toBe(false);
    expect(readFileSync(join(external, "private", "sentinel"), "utf8")).toBe("must-not-be-read");

    writeFileSync(join(AGENT, "agents", "included-over-limit.bin"), "x");
    truncateSync(join(AGENT, "agents", "included-over-limit.bin"), BACKUP_LIMITS.bytes + 1);
    await expect(snapshot("omarchy-over-limit", PATHS)).rejects.toThrow("limite de contenido excedido");
  }, REAL_TREE_TIMEOUT_MS);

  test("un socket unix fuera de exclusiones se rechaza sin publicar", async () => {
    const { createServer } = await import("node:net");
    // intercom/broker.sock: estado IPC del runtime (excluido por nombre).
    mkdirSync(join(AGENT, "intercom"), { recursive: true });
    // Y un socket suelto en un dir NO excluido: lo tapa el filtro isCopyable.
    const srv1 = createServer();
    const srv2 = createServer();
    await new Promise<void>((r) => srv1.listen(join(AGENT, "intercom", "broker.sock"), r));
    await new Promise<void>((r) => srv2.listen(join(AGENT, "agents", "stray.sock"), r));
    try {
      await expect(snapshot("pre-update", PATHS)).rejects.toThrow("tipo de entrada");
      expect(existsSync(BACKUPS) ? readdirSync(BACKUPS).filter((name) => !name.startsWith(".staging-")).length : 0).toBe(0);
    } finally {
      srv1.close();
      srv2.close();
    }
  });

  test("dedup: un árbol idéntico no genera un segundo snapshot", async () => {
    const first = await snapshot("pre-update", PATHS);
    const second = await snapshot("pre-update", PATHS);
    expect(second.deduped).toBe(true);
    expect(second.path).toBe(first.path);
    expect(archiveNames().length).toBe(1);
  });

  test("cada ocurrencia de publicacion falla sin falso exito", async () => { const seen: string[] = []; await snapshot("probe", { ...PATHS, fault: (point) => { seen.push(point); } }); const labels = [...new Set(seen)]; for (const failure of labels) { seedAgentDir(); await expect(snapshot("fault", { ...PATHS, fault: (point) => { if (point === failure) throw new Error("fault"); } })).rejects.toThrow(); } expect(labels.length).toBe(24); });

  test("fallo compuesto de cleanup conserva artefacto nombrado", async () => { for (const [primaryPoint, cleanup] of [["snapshot:metadata-write", "snapshot:cleanup-staging"], ["snapshot:readback", "snapshot:cleanup-published"]]) { seedAgentDir(); let primary = true; await expect(snapshot("cleanup", { ...PATHS, fault: (point) => { if (primary && point === primaryPoint) { primary = false; throw new Error("primary"); } if (!primary && point === cleanup) throw new Error("cleanup"); } })).rejects.toThrow("cleanup"); expect(readdirSync(BACKUPS).some((name) => name.startsWith(".staging-") || name.endsWith(".snapshot"))).toBe(true); } });

  test("lectura descriptor rechaza reemplazo y fsync es post-order", () => { const path = join(ROOT, "evidence"), old = `${path}.old`, tree = join(ROOT, "durable", "nested"), order: string[] = []; writeFileSync(path, "original", { mode: 0o600 }); expect(() => readBoundedFile(path, 64, "race", () => { renameSync(path, old); writeFileSync(path, "replacement", { mode: 0o600 }); })).toThrow("race"); mkdirSync(tree, { recursive: true }); writeFileSync(join(tree, "file"), "x"); fsyncTree(join(ROOT, "durable"), (point) => order.push(point), "probe"); expect(order.indexOf("probe:file:nested/file")).toBeLessThan(order.indexOf("probe:dir:nested")); expect(order.at(-1)).toBe("probe:dir:."); });

  test("un cambio real sí genera un segundo snapshot", async () => {
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

  test("restore exacto elimina residuo y conserva estado excluido", async () => {
    const snap = await snapshot("pre-restore", PATHS);
    writeFileSync(join(AGENT, "settings.json"), "corrupto");
    rmSync(join(AGENT, "agents", "sdd-scope.md"));
    writeFileSync(join(AGENT, "auth.json"), "secreto-nuevo");
    writeFileSync(join(AGENT, "sessions", "s1.jsonl"), "session-new");
    writeFileSync(join(AGENT, "skills", "downloaded", "huge", "SKILL.md"), "downloaded-new");
    writeFileSync(join(AGENT, "agents", "residue.md"), "remove me");

    await restoreBackup(snap.path!, PATHS);

    expect(JSON.parse(readFileSync(join(AGENT, "settings.json"), "utf8")).theme).toBe("ein");
    expect(readFileSync(join(AGENT, "agents", "sdd-scope.md"), "utf8")).toBe("# scope");
    // auth.json no está en el backup: el restore no lo pisa.
    expect(readFileSync(join(AGENT, "auth.json"), "utf8")).toBe("secreto-nuevo");
    expect(readFileSync(join(AGENT, "sessions", "s1.jsonl"), "utf8")).toBe("session-new");
    expect(readFileSync(join(AGENT, "skills", "downloaded", "huge", "SKILL.md"), "utf8")).toBe("downloaded-new");
    expect(existsSync(join(AGENT, "agents", "residue.md"))).toBe(false);
    expect(statSync(join(AGENT, "settings.json")).mode & 0o777).toBe(0o644);
    const recovery = listBackups(PATHS).find((entry) => entry.kind === "recovery"); expect(recovery?.pinned).toBe(true); expect(() => setPinned(recovery!.path, false)).toThrow("protegido"); pruneBackups({ ...PATHS, keep: 0 }); expect(existsSync(recovery!.path)).toBe(true);
  });

  test("restore conserva modo ejecutable exacto", async () => { chmodSync(join(AGENT, "settings.json"), 0o755); const snap = await snapshot("mode", PATHS); chmodSync(join(AGENT, "settings.json"), 0o600); await restoreBackup(snap.path!, PATHS); expect(statSync(join(AGENT, "settings.json")).mode & 0o777).toBe(0o755); });

  test("tamper y symlink se rechazan antes de mutar live", async () => {
    const snap = await snapshot("pre-restore", PATHS);
    chmodSync(snap.path!, 0o700); chmodSync(join(snap.path!, "content"), 0o700); chmodSync(join(snap.path!, "content", "settings.json"), 0o666);
    writeFileSync(join(snap.path!, "content", "settings.json"), "tampered");
    const before = readFileSync(join(AGENT, "settings.json"), "utf8");
    await expect(restoreBackup(snap.path!, PATHS)).rejects.toThrow("modo no permitido");
    expect(readFileSync(join(AGENT, "settings.json"), "utf8")).toBe(before);
    pruneBackups({ ...PATHS, keep: 0 });
    symlinkSync(join(AGENT, "settings.json"), join(AGENT, "agents", "escape"));
    await expect(snapshot("unsafe", PATHS)).rejects.toThrow();
    rmSync(join(AGENT, "agents", "escape")); chmodSync(join(AGENT, "settings.json"), 0o666); await expect(snapshot("unsafe-mode", PATHS)).rejects.toThrow("modo no permitido");
  });

  test("metadata exige bytes canonicos y fecha ISO exacta", async () => { const snap = await snapshot("canonical", PATHS); const path = join(snap.path!, "metadata.json"); const raw = readFileSync(path, "utf8"), meta = JSON.parse(raw); for (const invalid of [`${raw.trim()} \n`, raw.replace("{\"schemaVersion\":1", "{\"schemaVersion\":1,\"schemaVersion\":1"), `${JSON.stringify({ createdAt: meta.createdAt, ...meta })}\n`, `${JSON.stringify({ ...meta, createdAt: "1" })}\n`]) { writeFileSync(path, invalid); await expect(restoreBackup(snap.path!, PATHS)).rejects.toThrow(); } rmSync(join(snap.path!, "manifest.json")); symlinkSync(join(AGENT, "auth.json"), join(snap.path!, "manifest.json")); expect(listBackups(PATHS)).toHaveLength(0); });

  test("ancestro enlazado se rechaza", async () => { const link = join(ROOT, "linked"); symlinkSync(ROOT, link); await expect(snapshot("linked", { ...PATHS, agentDir: join(link, "agent") })).rejects.toThrow("componente enlazado"); const backupLink = join(ROOT, "linked-backups"); symlinkSync(BACKUPS, backupLink); await expect(snapshot("linked", { ...PATHS, backupDir: backupLink })).rejects.toThrow(); });

  test("manifest rechaza rutas no canonicas, duplicados y limite de ficheros", async () => {
    const snap = await snapshot("strict", PATHS); const path = join(snap.path!, "manifest.json");
    chmodSync(path, 0o600); const original = JSON.parse(readFileSync(path, "utf8")); const entry = original.entries[0];
    const invalid = [
      [{ ...entry, path: "../escape" }], [{ ...entry, path: "/absolute" }],
      [{ ...entry, path: "back\\slash" }], [entry, entry],
      Array.from({ length: 10_001 }, (_, index) => ({ ...entry, path: `cap/${String(index).padStart(5, "0")}` })),
    ];
    for (const entries of invalid) { writeFileSync(path, `${JSON.stringify({ ...original, entries })}\n`); await expect(restoreBackup(snap.path!, PATHS)).rejects.toThrow("Backup invalido"); }
  });

  test("cada ocurrencia restore revierte exactamente", async () => { const seen: string[] = [], fixed = { ...PATHS, now: () => new Date("2026-01-01T00:00:00.000Z") }; let snap = await snapshot("probe", fixed); await restoreBackup(snap.path!, { ...fixed, fault: (point) => { seen.push(point); } }); const labels = [...new Set(seen)]; for (const failure of labels) { seedAgentDir(); snap = await snapshot("probe", fixed); writeFileSync(join(AGENT, "settings.json"), failure); await expect(restoreBackup(snap.path!, { ...fixed, fault: (point) => { if (point === failure) throw new Error("fault"); } })).rejects.toThrow(); expect(readFileSync(join(AGENT, "settings.json"), "utf8")).toBe(failure); } expect(labels.length).toBe(56); });

  test("fallo compuesto conserva original nombrado", async () => { for (const recoveryFailure of ["recovery:retained-to-rollback", "recovery:meta-remove", "recovery:pin-remove", "recovery:backup-parent-fsync", "recovery:live-remove", "recovery:rollback-to-live", "recovery:live-fsync", "recovery:parent-fsync", "recovery:stage-remove"]) { seedAgentDir(); const snap = await snapshot("compound", PATHS); writeFileSync(join(AGENT, "settings.json"), recoveryFailure); let primary = true; const primaryPoint = recoveryFailure === "recovery:stage-remove" ? "restore:stage-copy" : "restore:retain-pin-write"; await expect(restoreBackup(snap.path!, { ...PATHS, fault: (point) => { if (primary && point === primaryPoint) { primary = false; throw new Error("primary"); } if (!primary && point === recoveryFailure) throw new Error("compound"); } })).rejects.toThrow("recuperacion"); const roots = [AGENT, ...readdirSync(ROOT).filter((name) => name.includes("rollback-")).map((name) => join(ROOT, name)), ...listBackups(PATHS).filter((entry) => entry.kind === "recovery").map((entry) => entry.path)]; expect(roots.some((root) => existsSync(join(root, "settings.json")) && readFileSync(join(root, "settings.json"), "utf8") === recoveryFailure)).toBe(true); } });

  test("fallo de cleanup sin live conserva copia completa", async () => { const snap = await snapshot("absent", PATHS); rmSync(AGENT, { recursive: true }); let primary = true; await expect(restoreBackup(snap.path!, { ...PATHS, fault: (point) => { if (primary && point === "restore:stage-rename") { primary = false; throw new Error("primary"); } if (!primary && point === "recovery:new-live-remove") throw new Error("compound"); } })).rejects.toThrow("recuperacion"); expect(JSON.parse(readFileSync(join(AGENT, "settings.json"), "utf8")).theme).toBe("ein"); });

  test("backups legacy (directorio) se listan y restauran", async () => {
    const legacy = join(BACKUPS, "2026-01-01T00-00-00-000Z_legacy");
    mkdirSync(join(legacy, "agents"), { recursive: true });
    writeFileSync(join(legacy, "agents", "sdd-scope.md"), "# legacy");

    const entries = listBackups(PATHS);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe("dir");

    await restoreBackup(legacy, PATHS);
    expect(readFileSync(join(AGENT, "agents", "sdd-scope.md"), "utf8")).toBe("# legacy");
    for (const failure of ["legacy:copy:agents/sdd-scope.md", "legacy:chmod:agents/sdd-scope.md"]) await expect(restoreBackup(legacy, { ...PATHS, fault: (point) => { if (point === failure) throw new Error("fault"); } })).rejects.toThrow("fault");
  });

  test("legacy restore recreates symlinks without chmoding external targets", async () => {
    const legacy = join(BACKUPS, "2026-01-01T00-00-00-000Z_legacy-link");
    const external = join(ROOT, "legacy-external.txt");
    mkdirSync(join(legacy, "agents"), { recursive: true });
    writeFileSync(external, "sentinel", { mode: 0o644 });
    symlinkSync(external, join(legacy, "agents", "external-link"));

    await restoreBackup(legacy, PATHS);

    const restored = join(AGENT, "agents", "external-link");
    expect(lstatSync(restored).isSymbolicLink()).toBe(true);
    expect(readlinkSync(restored)).toBe(external);
    expect(readFileSync(external, "utf8")).toBe("sentinel");
    if (process.platform !== "win32") expect(statSync(external).mode & 0o777).toBe(0o644);
  });

  test("archives legacy fallan cerrado antes de extraer", async () => {
    const source = join(ROOT, "legacy-source"); mkdirSync(join(source, "agents"), { recursive: true });
    writeFileSync(join(source, "agents", "legacy.md"), "legacy"); mkdirSync(BACKUPS, { recursive: true });
    const safe = join(BACKUPS, "safe.tar.gz");
    expect(Bun.spawnSync(["tar", "-czf", safe, "-C", source, "."]).exitCode).toBe(0);
    await expect(restoreBackup(safe, PATHS)).rejects.toThrow("no soportados");
    symlinkSync(join(source, "agents", "legacy.md"), join(source, "escape"));
    const hostile = join(BACKUPS, "hostile.tar.gz");
    expect(Bun.spawnSync(["tar", "-czf", hostile, "-C", source, "."]).exitCode).toBe(0);
    await expect(restoreBackup(hostile, PATHS)).rejects.toThrow("no soportados");
  });

  test("snapshot sin agentDir devuelve null sin crear nada", async () => {
    rmSync(AGENT, { recursive: true, force: true });
    const result = await snapshot("pre-update", PATHS);
    expect(result.path).toBeNull();
    expect(existsSync(BACKUPS) ? readdirSync(BACKUPS).length : 0).toBe(0);
  });
});
