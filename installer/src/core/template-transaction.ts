import { createHash } from "node:crypto";
import { dirname, join, posix } from "node:path";
import type { Result, UpdateStageError } from "./release-types.ts";
import { validateTemplateInventory, type TemplateInventory } from "./template-inventory.ts";
import { updateCapsLimits, type FileEntry, type UpdateCaps } from "./update-caps.ts";

const SNAPSHOT_INDEX = "template-snapshot.json";
const SNAPSHOT_SEAL = "template-snapshot.sha256";
const SNAPSHOT_DATA = "files";

type SnapshotEntry = {
  path: string;
  kind: "absent" | "file" | "directory";
  mode?: number;
  sha256?: string;
};

type SnapshotIndex = {
  schemaVersion: 1;
  inventory: TemplateInventory;
  entries: SnapshotEntry[];
  absentParents: string[];
};

export type TemplateSnapshot = { path: string; inventory: TemplateInventory };
export type TemplateTransactionError = UpdateStageError;

export type CandidateTemplateInventory = {
  binaryVersion: string;
  templateVersion: string;
  inventory: TemplateInventory;
};

function templateError(code: string, message: string): TemplateTransactionError {
  return { stage: "deploying", code, message };
}

export async function queryCandidateTemplateInventory(options: {
  binaryPath: string;
  expectedVersion: string;
  caps: UpdateCaps;
}): Promise<Result<CandidateTemplateInventory, TemplateTransactionError>> {
  try {
    const response = await options.caps.template.queryInventory(options.binaryPath);
    if (response.code !== 0) return { ok: false, error: templateError("inventory-query-exit", `Candidate inventory query exited with ${response.code}`) };
    if (new TextEncoder().encode(response.stdout).byteLength > updateCapsLimits.MAX_TEMPLATE_INVENTORY_BYTES) {
      return { ok: false, error: templateError("inventory-query-too-large", "Candidate template inventory exceeds size limit") };
    }
    const parsed = JSON.parse(response.stdout) as Partial<CandidateTemplateInventory>;
    const inventory = validateTemplateInventory(parsed.inventory);
    if (parsed.binaryVersion !== options.expectedVersion || parsed.templateVersion !== options.expectedVersion || !inventory) {
      return { ok: false, error: templateError("inventory-query-invalid", "Candidate template inventory does not match the selected release") };
    }
    return { ok: true, value: { binaryVersion: parsed.binaryVersion, templateVersion: parsed.templateVersion, inventory } };
  } catch (error) {
    return { ok: false, error: templateError("inventory-query-failed", error instanceof Error ? error.message : "Could not query candidate template inventory") };
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mode(entry: FileEntry): number {
  return entry.mode & 0o7777;
}

function depth(path: string): number {
  return path.split("/").length;
}

function parents(path: string): string[] {
  const result: string[] = [];
  let current = posix.dirname(path);
  while (current !== ".") {
    result.push(current);
    current = posix.dirname(current);
  }
  return result.reverse();
}

function assertDirectory(path: string, caps: UpdateCaps): void {
  if (caps.fs.inspect(path).kind !== "directory") throw new Error(`Ruta no segura para rollback: ${path}`);
}

function assertSafeRoot(agentDir: string, caps: UpdateCaps): void {
  if (caps.fs.exists(agentDir)) {
    assertDirectory(agentDir, caps);
    return;
  }
  let current = dirname(agentDir);
  while (true) {
    if (caps.fs.exists(current)) {
      assertDirectory(current, caps);
      return;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function isCanonicalSnapshotPath(path: string): boolean {
  return path.length > 0 && !path.includes("\\") && !path.includes("\0")
    && !path.startsWith("/") && !path.startsWith("../") && posix.normalize(path) === path;
}

function assertSafePath(agentDir: string, relativePath: string, caps: UpdateCaps, leaf: "file" | "directory"): void {
  if (caps.fs.exists(agentDir)) assertDirectory(agentDir, caps);
  let current = agentDir;
  const parts = relativePath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!);
    if (!caps.fs.exists(current)) return;
    const expected = index === parts.length - 1 ? leaf : "directory";
    if (caps.fs.inspect(current).kind !== expected) throw new Error(`Colisión o enlace no seguro: ${relativePath}`);
  }
}

function captureFile(agentDir: string, snapshotPath: string, path: string, caps: UpdateCaps): SnapshotEntry {
  const source = join(agentDir, path);
  const inspected = caps.fs.inspect(source);
  if (inspected.kind !== "file") throw new Error(`Se esperaba un fichero regular: ${path}`);
  const bytes = caps.fs.readFile(source);
  const destination = join(snapshotPath, SNAPSHOT_DATA, path);
  caps.fs.makeDir(dirname(destination));
  caps.fs.copyFile(source, destination);
  return { path, kind: "file", mode: mode(inspected), sha256: digest(bytes) };
}

function captureTree(agentDir: string, snapshotPath: string, root: string, caps: UpdateCaps): SnapshotEntry[] {
  const source = join(agentDir, root);
  if (!caps.fs.exists(source)) return [{ path: root, kind: "absent" }];
  assertSafePath(agentDir, root, caps, "directory");
  const entries: SnapshotEntry[] = [{ path: root, kind: "directory", mode: mode(caps.fs.inspect(source)) }];
  const visit = (relativeDirectory: string): void => {
    const directory = join(agentDir, relativeDirectory);
    for (const name of caps.fs.listDir(directory)) {
      if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
        throw new Error(`Entrada de directorio no segura: ${name}`);
      }
      const path = `${relativeDirectory}/${name}`;
      const inspected = caps.fs.inspect(join(agentDir, path));
      if (inspected.kind === "directory") {
        entries.push({ path, kind: "directory", mode: mode(inspected) });
        visit(path);
      } else if (inspected.kind === "file") {
        entries.push(captureFile(agentDir, snapshotPath, path, caps));
      } else {
        throw new Error(`El snapshot no admite enlaces ni entradas especiales: ${path}`);
      }
    }
  };
  visit(root);
  return entries;
}

export function snapshotTemplate(options: {
  agentDir: string;
  inventory: TemplateInventory;
  snapshotPath?: string;
  caps: UpdateCaps;
}): Result<TemplateSnapshot, TemplateTransactionError> {
  const { agentDir, caps } = options;
  const inventory = validateTemplateInventory(options.inventory);
  if (!inventory) return { ok: false, error: templateError("inventory-invalid", "Candidate template inventory is invalid") };
  const snapshotPath = options.snapshotPath ?? caps.fs.createTempDir("ein-template-snapshot-");
  try {
    assertSafeRoot(agentDir, caps);
    caps.fs.makeDir(snapshotPath);
    const entries = inventory.replaceTrees.flatMap((tree) => captureTree(agentDir, snapshotPath, tree, caps));
    const absentParents = new Set<string>();
    for (const path of inventory.overlayFiles) {
      for (const parent of parents(path)) {
        const full = join(agentDir, parent);
        if (!caps.fs.exists(full)) absentParents.add(parent);
        else assertDirectory(full, caps);
      }
      const source = join(agentDir, path);
      if (!caps.fs.exists(source)) entries.push({ path, kind: "absent" });
      else entries.push(captureFile(agentDir, snapshotPath, path, caps));
    }
    const index: SnapshotIndex = {
      schemaVersion: 1,
      inventory,
      entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
      absentParents: [...absentParents].sort(),
    };
    const encoded = new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`);
    caps.fs.writeFile(join(snapshotPath, SNAPSHOT_INDEX), encoded);
    caps.fs.writeFile(join(snapshotPath, SNAPSHOT_SEAL), new TextEncoder().encode(`${digest(encoded)}\n`));
    return { ok: true, value: { path: snapshotPath, inventory } };
  } catch (error) {
    return { ok: false, error: templateError("snapshot-failed", error instanceof Error ? error.message : "Could not snapshot managed template") };
  }
}

/** Deploys through the verified continuation binary, never the running installer's embedded asset. */
export async function deployEmbeddedTemplate(options: {
  binaryPath: string;
  agentDir: string;
  caps: UpdateCaps;
}): Promise<Result<void, TemplateTransactionError>> {
  try {
    await options.caps.template.deploy(options.binaryPath, options.agentDir);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("deploy-failed", error instanceof Error ? error.message : "Could not deploy embedded template") };
  }
}

function parseSnapshot(snapshotPath: string, caps: UpdateCaps): SnapshotIndex {
  const path = join(snapshotPath, SNAPSHOT_INDEX);
  const sealPath = join(snapshotPath, SNAPSHOT_SEAL);
  if (!caps.fs.exists(path) || !caps.fs.exists(sealPath)) throw new Error("Snapshot legacy sin inventario verificable");
  const encoded = caps.fs.readFile(path);
  const seal = new TextDecoder().decode(caps.fs.readFile(sealPath)).trim();
  if (seal !== digest(encoded)) throw new Error("Índice de snapshot corrupto o incompleto");
  const parsed = JSON.parse(new TextDecoder().decode(encoded)) as Partial<SnapshotIndex>;
  const inventory = validateTemplateInventory(parsed.inventory);
  if (parsed.schemaVersion !== 1 || !inventory || !Array.isArray(parsed.entries) || !Array.isArray(parsed.absentParents)) {
    throw new Error("Índice de snapshot inválido");
  }
  const allowedParents = new Set(inventory.overlayFiles.flatMap(parents));
  if (parsed.absentParents.some((item) => typeof item !== "string" || !allowedParents.has(item))) throw new Error("Padres ausentes inválidos");
  const entries = parsed.entries as SnapshotEntry[];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string" || !isCanonicalSnapshotPath(entry.path) || seen.has(entry.path)
      || !["absent", "file", "directory"].includes(entry.kind)) throw new Error("Entrada de snapshot inválida");
    seen.add(entry.path);
    const tree = inventory.replaceTrees.find((root) => entry.path === root || entry.path.startsWith(`${root}/`));
    const overlay = inventory.overlayFiles.includes(entry.path);
    if (!tree && !overlay) throw new Error(`Ruta fuera del inventario: ${entry.path}`);
    if (overlay && entry.kind === "directory") throw new Error(`Overlay no regular: ${entry.path}`);
    if (entry.kind === "file" && (typeof entry.mode !== "number" || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? ""))) {
      throw new Error(`Metadatos incompletos: ${entry.path}`);
    }
    if (entry.kind === "directory" && typeof entry.mode !== "number") throw new Error(`Modo ausente: ${entry.path}`);
  }
  for (const tree of inventory.replaceTrees) if (!seen.has(tree)) throw new Error(`Árbol ausente del índice: ${tree}`);
  for (const file of inventory.overlayFiles) if (!seen.has(file)) throw new Error(`Overlay ausente del índice: ${file}`);
  return { schemaVersion: 1, inventory, entries, absentParents: [...new Set(parsed.absentParents)] };
}

function prevalidateRestore(agentDir: string, snapshotPath: string, index: SnapshotIndex, caps: UpdateCaps): void {
  assertSafeRoot(agentDir, caps);
  for (const entry of index.entries) {
    if (entry.kind === "file") {
      const source = join(snapshotPath, SNAPSHOT_DATA, entry.path);
      if (!caps.fs.exists(source) || caps.fs.inspect(source).kind !== "file"
        || digest(caps.fs.readFile(source)) !== entry.sha256) throw new Error(`Preimage corrupta: ${entry.path}`);
    }
  }
  for (const tree of index.inventory.replaceTrees) assertSafePath(agentDir, tree, caps, "directory");
  for (const file of index.inventory.overlayFiles) assertSafePath(agentDir, file, caps, "file");
}

function verifyRestored(agentDir: string, index: SnapshotIndex, caps: UpdateCaps): void {
  for (const entry of index.entries) {
    const target = join(agentDir, entry.path);
    if (entry.kind === "absent") {
      if (caps.fs.exists(target)) throw new Error(`La ruta debía quedar ausente: ${entry.path}`);
      continue;
    }
    if (!caps.fs.exists(target)) throw new Error(`Falta la ruta restaurada: ${entry.path}`);
    const inspected = caps.fs.inspect(target);
    if (inspected.kind !== entry.kind || mode(inspected) !== entry.mode) throw new Error(`Tipo o modo restaurado incorrecto: ${entry.path}`);
    if (entry.kind === "file" && digest(caps.fs.readFile(target)) !== entry.sha256) throw new Error(`Bytes restaurados incorrectos: ${entry.path}`);
  }
}

export function restoreTemplate(options: {
  agentDir: string;
  snapshotPath: string;
  caps: UpdateCaps;
}): Result<void, TemplateTransactionError> {
  try {
    const index = parseSnapshot(options.snapshotPath, options.caps);
    prevalidateRestore(options.agentDir, options.snapshotPath, index, options.caps);

    for (const tree of index.inventory.replaceTrees) {
      const target = join(options.agentDir, tree);
      if (options.caps.fs.exists(target)) options.caps.fs.removeDir(target);
      const root = index.entries.find((entry) => entry.path === tree)!;
      if (root.kind === "absent") continue;
      const treeEntries = index.entries.filter((entry) => entry.path === tree || entry.path.startsWith(`${tree}/`));
      for (const entry of treeEntries.filter((item) => item.kind === "directory").sort((a, b) => depth(a.path) - depth(b.path))) {
        options.caps.fs.makeDir(join(options.agentDir, entry.path));
      }
      for (const entry of treeEntries.filter((item) => item.kind === "file")) {
        const targetFile = join(options.agentDir, entry.path);
        options.caps.fs.makeDir(dirname(targetFile));
        options.caps.fs.copyFile(join(options.snapshotPath, SNAPSHOT_DATA, entry.path), targetFile);
        options.caps.fs.chmod(targetFile, entry.mode!);
      }
      for (const entry of treeEntries.filter((item) => item.kind === "directory").sort((a, b) => depth(b.path) - depth(a.path))) {
        options.caps.fs.chmod(join(options.agentDir, entry.path), entry.mode!);
      }
    }

    for (const path of index.inventory.overlayFiles) {
      const entry = index.entries.find((item) => item.path === path)!;
      const target = join(options.agentDir, path);
      if (entry.kind === "absent") {
        if (options.caps.fs.exists(target)) options.caps.fs.removeFile(target);
      } else {
        options.caps.fs.makeDir(dirname(target));
        options.caps.fs.copyFile(join(options.snapshotPath, SNAPSHOT_DATA, path), target);
        options.caps.fs.chmod(target, entry.mode!);
      }
    }
    for (const path of [...index.absentParents].sort((a, b) => depth(b) - depth(a))) {
      const target = join(options.agentDir, path);
      if (options.caps.fs.exists(target) && options.caps.fs.listDir(target).length === 0) options.caps.fs.removeDir(target);
    }
    verifyRestored(options.agentDir, index, options.caps);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("restore-failed", error instanceof Error ? error.message : "Could not restore managed template") };
  }
}

export async function validateDeployedManifest(options: {
  agentDir: string;
  expectedVersion: string;
  caps: UpdateCaps;
}): Promise<Result<void, TemplateTransactionError>> {
  try {
    const manifest = await options.caps.template.readManifest(options.agentDir);
    if (!manifest || manifest.templateVersion !== options.expectedVersion) {
      return { ok: false, error: templateError("manifest-mismatch", "Deployed template does not match selected release") };
    }
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("manifest-unreadable", error instanceof Error ? error.message : "Could not validate deployed template") };
  }
}
