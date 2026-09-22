import { lstatSync, readdirSync } from "node:fs";
import { posix, relative, sep } from "node:path";

export const TEMPLATE_INVENTORY_SCHEMA_VERSION = 1 as const;

export const TEMPLATE_REPLACE_TREES = [
  "agents",
  "assets",
  "bin",
  "chains",
  "docs",
  "extensions",
  "lib",
  "prompts",
] as const;

export type TemplateInventory = {
  schemaVersion: typeof TEMPLATE_INVENTORY_SCHEMA_VERSION;
  replaceTrees: string[];
  overlayFiles: string[];
};

function normalizeRelativePath(value: unknown, kind: "tree" | "file"): string | null {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0")) return null;
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/")) return null;
  if (kind === "tree" && normalized.includes("/")) return null;
  return normalized;
}

export function validateTemplateInventory(value: unknown): TemplateInventory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TemplateInventory>;
  if (candidate.schemaVersion !== TEMPLATE_INVENTORY_SCHEMA_VERSION
    || !Array.isArray(candidate.replaceTrees)
    || !Array.isArray(candidate.overlayFiles)) return null;

  const replaceTrees = candidate.replaceTrees.map((path) => normalizeRelativePath(path, "tree"));
  const overlayFiles = candidate.overlayFiles.map((path) => normalizeRelativePath(path, "file"));
  if (replaceTrees.some((path) => path === null) || overlayFiles.some((path) => path === null)) return null;

  const trees = replaceTrees as string[];
  const files = overlayFiles as string[];
  if (new Set(trees).size !== trees.length || new Set(files).size !== files.length) return null;
  if (trees.some((tree) => files.some((file) => file === tree || file.startsWith(`${tree}/`)))) return null;
  const canonicalTrees = [...TEMPLATE_REPLACE_TREES].sort();
  if ([...trees].sort().join("\0") !== canonicalTrees.join("\0")) return null;
  if (!files.includes("template-manifest.json") || !files.includes("ein-mode.json")) return null;

  return {
    schemaVersion: TEMPLATE_INVENTORY_SCHEMA_VERSION,
    replaceTrees: [...trees].sort(),
    overlayFiles: [...files].sort(),
  };
}

export function assertTemplateInventory(value: unknown): TemplateInventory {
  const inventory = validateTemplateInventory(value);
  if (!inventory) throw new Error("Inventario del template inválido");
  return inventory;
}

export function createTemplateInventory(staging: string, additionalEffects: readonly string[]): TemplateInventory {
  const replaceTrees = [...TEMPLATE_REPLACE_TREES];
  const overlayFiles: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = `${directory}${sep}${entry.name}`;
      const path = relative(staging, absolute).split(sep).join("/");
      const top = path.split("/", 1)[0]!;
      if (replaceTrees.includes(top as (typeof replaceTrees)[number])) continue;
      const inspected = lstatSync(absolute);
      if (inspected.isSymbolicLink()) throw new Error(`El template no admite enlaces simbólicos: ${path}`);
      if (inspected.isDirectory()) visit(absolute);
      else if (inspected.isFile()) overlayFiles.push(path);
      else throw new Error(`El template solo admite ficheros y directorios: ${path}`);
    }
  };
  visit(staging);
  overlayFiles.push("template-manifest.json", ...additionalEffects);
  const inventory = validateTemplateInventory({
    schemaVersion: TEMPLATE_INVENTORY_SCHEMA_VERSION,
    replaceTrees,
    overlayFiles: [...new Set(overlayFiles)].sort(),
  });
  if (!inventory) throw new Error("No se pudo construir un inventario cerrado del template");
  return inventory;
}
