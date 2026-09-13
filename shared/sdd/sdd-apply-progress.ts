import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { isSafeChangeName, readTasksStatus, resolveChangesDir } from "./sdd-routing-core.ts";

// Only control metadata is derived. Group narratives, failures and fenced evidence remain intact.
export function normalizeApplyProgress(content: string, pending: number, total: number): string {
  let fence = "";
  let blocked = false;
  const body = content.split(/\r?\n/).filter((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ""; return true; }
    if (fence) return true;
    const status = /^status:\s*(complete|partial|blocked)\s*(?:#.*)?$/i.exec(line);
    if (!status) return true;
    blocked ||= status[1]!.toLowerCase() === "blocked";
    return false;
  }).join("\n").replace(/^\n+/, "");
  const state = blocked ? "blocked" : pending > 0 || total === 0 ? "partial" : "complete";
  return `status: ${state}\n\n${body}`;
}

export function normalizeApplyProgressWrite(cwd: string, path: string, content: string): string {
  const absolute = resolve(cwd, path);
  if (basename(absolute) !== "apply-progress.md") return content;
  const dir = dirname(absolute); const change = basename(dir);
  if (!isSafeChangeName(change) || dirname(dir) !== resolve(resolveChangesDir(cwd)) || !existsSync(join(dir, "tasks.md"))) return content;
  const tasks = readTasksStatus(dir);
  return normalizeApplyProgress(content, tasks.counts.pending, tasks.items.length);
}

export function reconcileApplyProgress(cwd: string, change: string): void {
  const path = join(resolveChangesDir(cwd), change, "apply-progress.md");
  if (!existsSync(path)) return;
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Unsafe apply progress path");
  const original = readFileSync(path, "utf8");
  const content = normalizeApplyProgressWrite(cwd, path, original);
  if (content === original) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: lstatSync(path).mode });
    if (readFileSync(path, "utf8") !== original) throw new Error("Apply report changed during progress update");
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
