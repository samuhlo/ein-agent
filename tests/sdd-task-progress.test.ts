import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { updateSddTaskProgress } from "../shared/sdd/sdd-task-progress.ts";
import { resolveSddStatus } from "../ein-pi/agent/lib/sdd-router.ts";

test("publishes each task transition immediately and preserves the remaining checklist", () => {
	const cwd = mkdtempSync(join(tmpdir(), "ein-task-progress-"));
	const dir = join(cwd, "openspec/changes/change"); mkdirSync(dir, { recursive: true });
	const path = join(dir, "tasks.md");
	writeFileSync(path, "status: ready\nblocked_by: none\n## Grupo\n- [ ] 001 first\n- [ ] 002 second\n");
	try {
		expect(() => updateSddTaskProgress(cwd, "change", "001", "complete")).toThrow("started");
		updateSddTaskProgress(cwd, "change", "001", "start");
		expect(resolveSddStatus(cwd, "change").tasks.items[0]?.started).toBe(true);
		expect(() => updateSddTaskProgress(cwd, "change", "002", "start")).toThrow("already started");
		updateSddTaskProgress(cwd, "change", "001", "complete");
		expect(resolveSddStatus(cwd, "change").tasks.counts.done).toBe(1);
		expect(readFileSync(path, "utf8")).toContain("- [ ] 002 second");
		updateSddTaskProgress(cwd, "change", "001", "complete");
		execFileSync("bun", [join(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "task-progress", "change", "002", "start"], { cwd });
		updateSddTaskProgress(cwd, "change", "002", "complete");
		expect(resolveSddStatus(cwd, "change").tasks.counts.done).toBe(2);
		expect(readFileSync(path, "utf8")).not.toContain("ein:started");
		expect(readFileSync(path, "utf8")).toContain("status: ready");
		const before = readFileSync(path, "utf8");
		for (const [change, task] of [["../escape", "001"], ["change", "missing"]]) expect(() => updateSddTaskProgress(cwd, change!, task!, "start")).toThrow();
		expect(readFileSync(path, "utf8")).toBe(before);
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("the native progress tool persists the checkbox without an executor edit", async () => {
	const { default: registerProgress } = await import("../ein-pi/agent/extensions/internal/ein-apply-progress-child.ts");
	const cwd = mkdtempSync(join(tmpdir(), "ein-progress-tool-"));
	const dir = join(cwd, "openspec/changes/change");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "tasks.md");
	const source = "status: ready\nblocked_by: none\n## // 001. Behavior\n- [ ] 1.1 Implement and test\n- [ ] 1.2 Another step\n";
	writeFileSync(path, source);
	let tool: any;
	registerProgress({ on() {}, registerTool(value: any) { tool = value; } } as any);
	const execute = (task: string, action: string) => tool.execute("call", { change: "change", task, action }, undefined, undefined, { cwd });
	try {
		for (const id of ["001/1.1", "001 / 1.1", "missing"]) {
			await expect(execute(id, "start")).rejects.toThrow("Task id is missing or ambiguous");
			expect(readFileSync(path, "utf8")).toBe(source);
		}
		await execute("1.1", "start");
		expect(resolveSddStatus(cwd, "change").tasks.items[0]?.started).toBe(true);
		const result = await execute("1.1", "complete");
		expect(result.content[0].text).toContain("tasks.md updated");
		expect(readFileSync(path, "utf8")).toContain("- [x] 1.1 Implement and test");
		expect(readFileSync(path, "utf8")).toContain("- [ ] 1.2 Another step");
		expect(readFileSync(path, "utf8")).toContain("status: ready");
		const completed = readFileSync(path, "utf8");
		await execute("1.1", "complete");
		expect(readFileSync(path, "utf8")).toBe(completed);
		await expect(execute("1.1", "start")).rejects.toThrow("already complete");
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});
