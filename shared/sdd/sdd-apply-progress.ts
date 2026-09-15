import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { isSafeChangeName, readTasksStatus, resolveChangesDir } from "./sdd-routing-core.ts";

// Only control metadata is derived. Group narratives, failures and fenced evidence remain intact.
export function normalizeApplyProgress(content: string, pending: number, total: number, preserveBlocked = true): string {
  let fence = "";
  let declared: string | undefined;
  const body = content.split(/\r?\n/).flatMap((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ""; return [line]; }
    if (fence) return [line];
    const status = /^status:\s*(complete|partial|blocked)\s*(?:#.*)?$/i.exec(line);
    if (!status) return [line];
    if (declared !== undefined) return [`Reported group status: ${status[1]!.toLowerCase()}`];
    declared = status[1]!.toLowerCase();
    return [];
  }).join("\n").replace(/^\n+/, "");
  const state = preserveBlocked && declared === "blocked" ? "blocked" : pending > 0 || total === 0 ? "partial" : "complete";
  return `status: ${state}\n\n${body}`;
}

export function normalizeApplyProgressWrite(cwd: string, path: string, content: string): string {
	const change = applyProgressChangeForPath(cwd, path);
	if (!change) return content;
	const dir = join(resolveChangesDir(cwd), change);
	const tasks = readTasksStatus(dir);
	return normalizeApplyProgress(content, tasks.counts.pending, tasks.items.length);
}

function applyProgressChangeForPath(cwd: string, path: string): string | null {
	const absolute = resolve(cwd, path);
	if (basename(absolute) !== "apply-progress.md") return null;
	const dir = dirname(absolute);
	const change = basename(dir);
	if (!isSafeChangeName(change) || dirname(dir) !== resolve(resolveChangesDir(cwd)) || !existsSync(join(dir, "tasks.md"))) return null;
	return change;
}

export function reconcileApplyProgressPath(cwd: string, path: string): void {
	const change = applyProgressChangeForPath(cwd, path);
	if (change) reconcileApplyProgress(cwd, change);
}

export function reconcileApplyProgress(cwd: string, change: string): void {
  const path = join(resolveChangesDir(cwd), change, "apply-progress.md");
  if (!existsSync(path)) return;
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Unsafe apply progress path");
  const original = readFileSync(path, "utf8");
  const tasks = readTasksStatus(dirname(path));
  const content = normalizeApplyProgress(original, tasks.counts.pending, tasks.items.length, false);
  if (content === original) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: lstatSync(path).mode });
    if (readFileSync(path, "utf8") !== original) throw new Error("Apply report changed during progress update");
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
