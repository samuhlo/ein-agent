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
