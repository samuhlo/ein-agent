import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { isSafeChangeName, readTasksStatus, resolveChangesDir, SDD_TASK_STARTED_MARKER } from "./sdd-routing-core.ts";

export function updateSddTaskProgress(cwd: string, change: string, task: string, action: "start" | "complete") {
	if (!isSafeChangeName(change) || !["start", "complete"].includes(action)) throw new Error("Invalid task progress request");
	const path = join(resolveChangesDir(cwd), change, "tasks.md");
	if (realpathSync(dirname(path)) !== resolve(realpathSync(cwd), relative(cwd, dirname(path))) || lstatSync(path).isSymbolicLink()) throw new Error("Symlinked task progress path");
	const source = readFileSync(path, "utf8");
	const status = readTasksStatus(dirname(path));
	if (status.status !== "ready") throw new Error("Task plan is not ready");
	const matches = status.items.filter((item) => item.id === task);
	if (matches.length !== 1) throw new Error("Task id is missing or ambiguous");
	const item = matches[0]!;
	if (item.done) {
		if (action === "start") throw new Error("Task is already complete");
		return status;
	}
	if (action === "complete" && !item.started) throw new Error("Task must be started before completion");
	if (action === "start" && status.items.some((other) => other.started && other.id !== task)) throw new Error("Another task is already started");
	if (action === "start" && status.nextPending?.id !== task) throw new Error("Start the next pending task first");
	if (action === "start" && item.started) return status;
	const lines = source.split("\n");
	const indexes = lines.flatMap((line, index) => /^\s*-\s*\[( |x|X)\]\s+(.+)$/.test(line) ? [index] : []);
	const index = indexes[status.items.indexOf(item)]!;
	const cr = lines[index]!.endsWith("\r") ? "\r" : "";
	const line = lines[index]!.replace(/\r$/, "").replace(SDD_TASK_STARTED_MARKER, "").trimEnd();
	lines[index] = (action === "start" ? `${line} ${SDD_TASK_STARTED_MARKER}` : line.replace(/^(\s*-\s*)\[ \]/, "$1[x]")) + cr;
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temp, lines.join("\n"), { flag: "wx", mode: lstatSync(path).mode });
		if (readFileSync(path, "utf8") !== source) throw new Error("Task checklist changed during progress update");
		renameSync(temp, path);
	} finally { rmSync(temp, { force: true }); }
	return readTasksStatus(dirname(path));
}
