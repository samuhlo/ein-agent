import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import { loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { renderSddOverlay } from "../ein-pi/agent/lib/sdd-overlay.ts";
import { createPalette, stripAnsi } from "../ein-pi/agent/lib/theme.ts";
import type { SddChangeStatus } from "../ein-pi/agent/lib/sdd-router.ts";

// Exercise the installed renderer, including its mounted-component update path.
const [packageRoot, snapshotPath] = process.argv.slice(2);
if (!packageRoot) throw new Error("Usage: bun tooling/verify-subagent-widget-runtime.ts <pi-subagents directory> [snapshot.json]");
const root = resolve(import.meta.dir, "..");
const config = JSON.parse(readFileSync(join(root, "ein-pi/agent/extensions/subagent/config.json"), "utf8"));
assert.equal(config.asyncWidget, true);
assert.equal(config.fleetView, false);
const { createAsyncJobTracker } = await import(pathToFileURL(join(packageRoot, "src/runs/background/async-job-tracker.ts")).href);
const theme = loadThemeFromPath(join(root, "ein-pi/agent/themes/ein.json"), "truecolor");
const snapshots: { name: string; width: number; height: number; lines: string[] }[] = [];
const now = Date.now();
const names = ["sdd-map", "sdd-design", "sdd-verify"];
const tasks = ["acreditar el handler", "reproducir fecha imposible", "validar fecha de inicio", "comprobar años bisiestos", "rechazar formatos incorrectos", "ejecutar tests focalizados", "comprobar tipos"]
	.map((title, index) => ({ id: String(index + 1).padStart(3, "0"), title, done: index === 0 }));
const status = {
	change: "validar-fecha-inicio", lane: "standard", nextRecommended: "apply",
	verify: "absent", verifyStale: false,
	present: { scope: true, map: true, design: true, tasks: true, apply: false, verify: false, close: false },
	tasks: { items: tasks, counts: { done: 1 }, nextPending: tasks[1] },
} as SddChangeStatus;

for (const [width, height] of [[80, 24], [120, 40], [60, 20]]) {
	Object.defineProperty(process.stdout, "rows", { value: height, configurable: true });
	Object.defineProperty(process.stdout, "columns", { value: width, configurable: true });
	for (const count of [1, 3]) {
		const jobs = names.slice(0, count).map((agent, index) => ({
			asyncId: `ui-probe-${index}`, asyncDir: "/unused-ui-probe", mode: "single", agents: [agent],
			status: "running", startedAt: now - 90_000, updatedAt: now, currentTool: "read", currentPath: "src/schema.ts",
		}));
		let component: { render(width: number): string[]; dispose?(): void } | undefined;
		let mounts = 0;
		let renders = 0;
		const tui = { requestRender() { renders++; } };
		const ui = {
			theme, getToolsExpanded: () => false,
			setWidget(key: string, factory: unknown, options?: { placement?: string }) {
				assert.equal(key, "subagent-async");
				assert.equal(options?.placement, undefined);
				component?.dispose?.();
				component = typeof factory === "function" ? factory(tui, theme) : undefined;
				if (component) mounts++;
			},
		};
		const ctx = { hasUI: true, ui };
		const state = { asyncJobs: new Map(jobs.map((job) => [job.asyncId, job])), widgetsSuspended: false };
		const tracker = createAsyncJobTracker({ events: { emit() {} } }, state, "/unused-ui-probe", { widgetEnabled: config.asyncWidget });
		const capture = (name: string) => {
			assert(component, "active jobs must mount a visible widget");
			const lines = component.render(width!);
			assert(lines.length > 0);
			for (const line of lines) {
				assert(visibleWidth(line) <= width!);
				assert(!/\u001b\[(?:4[0-8]|10[0-7])(?:;|m)/.test(line), "activity must not paint a fixed background");
			}
			if (height! >= 24) for (const agent of names.slice(0, count)) assert(stripAnsi(lines.join("\n")).includes(agent), `missing visible agent ${agent}`);
			const todo = renderSddOverlay(status, { width: width! - 2, palette: createPalette(true) });
			const screen = [
				theme.fg("accent", "ein · vista de prueba"), "",
				theme.bg("userMessageBg", "  Revisa la validación de fecha."),
				theme.bg("toolSuccessBg", "  ein · Estado · siguiente: aplicar"), "",
				...lines, "", theme.fg("muted", "─".repeat(width!)), "  > Mensaje", theme.fg("muted", "─".repeat(width!)),
				...todo,
			];
			assert(screen.length <= height!, "activity, editor and TODO must fit together");
			snapshots.push({ name: `${name}-${count}`, width: width!, height: height!, lines: screen });
			return stripAnsi(lines.join("\n"));
		};
		tracker.refreshWidget(ctx);
		capture("running");
		jobs[0]!.currentTool = "bash";
		tracker.refreshWidget(ctx);
		if (height! >= 24) assert(capture("updated").includes("bash"));
		assert.equal(mounts, 1, "updates must retain the mounted widget and its position");
		assert(renders > 0);
		jobs[0]!.status = "failed";
		tracker.refreshWidget(ctx);
		assert.match(capture("failed"), /failed|✗/);
		jobs[0]!.status = "paused";
		tracker.refreshWidget(ctx);
		assert.match(capture("paused"), /paused|■/);
		jobs[0]!.status = "running";
		jobs[0]!.currentTool = "grep";
		tracker.refreshWidget(ctx);
		const resumed = capture("resumed");
		if (height! >= 24) assert(resumed.includes("grep"));
		assert.equal(mounts, 1);
		state.asyncJobs.clear();
		tracker.refreshWidget(ctx);
		assert.equal(component, undefined, "an empty run list must clear the widget");
		tracker.dispose();
	}
}
if (snapshotPath) writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));
console.log(`Native subagent widget: ${snapshots.length} snapshots passed; activity updates, failure, pause/resume, cleanup and terminal widths verified.`);
