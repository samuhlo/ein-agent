import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, EntryRenderer } from "@earendil-works/pi-coding-agent";
import { loadThemeFromPath, setThemeInstance } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { CustomEntryComponent } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/custom-entry.js";
import { withEinCommandSurfaces } from "../../ein-pi/agent/lib/command-surface.ts";
import { registerSddReadSurface } from "../../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts";

delete process.env.NO_COLOR;
process.env.TERM = "xterm-256color";
const root = mkdtempSync(join(tmpdir(), "ein-command-surface-"));
try {
	const theme = loadThemeFromPath(join(import.meta.dir, "../../ein-pi/agent/themes/ein.json"), "truecolor");
	setThemeInstance(theme);
	const session = SessionManager.inMemory(root);
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	const renderers = new Map<string, EntryRenderer>();
	const notifications: string[] = [];
	const pi = {
		registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => commands.set(name, command),
		registerEntryRenderer: (name: string, renderer: EntryRenderer) => renderers.set(name, renderer),
		appendEntry: (name: string, data: unknown) => session.appendCustomEntry(name, data),
	} as unknown as ExtensionAPI;
	const wrapped = withEinCommandSurfaces(pi, "test");
	const ctx = { mode: "tui", hasUI: true, cwd: root, ui: { notify: (text: string) => notifications.push(text), theme } } as unknown as ExtensionCommandContext;
	registerSddReadSurface(wrapped, () => {});
	for (const name of ["ein:sdd-status", "ein:sdd-next"]) await commands.get(name)!.handler("", ctx);
	wrapped.registerCommand("ein:probe", { description: "fixture", handler: async (_args, context) => {
		for (const level of ["info", "warning", "error"] as const) context.ui.notify("Línea con 中文 y texto largo para comprobar el ajuste.\nSegunda línea.", level);
	} });
	await commands.get("ein:probe")!.handler("", ctx);
	assert.equal(notifications.length, 0);
	assert.equal(session.buildSessionContext().messages.length, 0);
	const entries = session.getEntries().filter((entry) => entry.type === "custom");
	assert.equal(entries.length, 5);
	for (const entry of entries) {
		const component = new CustomEntryComponent(entry, renderers.get(entry.customType)!);
		for (const width of [24, 80, 120]) {
			const lines = component.render(width);
			for (const line of lines.filter((line) => line.length > 0)) {
				assert(visibleWidth(line) <= width);
				assert(line.includes("\x1b[48;2;21;19;13m"), "native custom-entry renderer must paint every content row");
			}
			assert(lines.join("\n").includes("/ein:"));
		}
	}
	const error = entries.at(-1)!;
	assert(new CustomEntryComponent(error, renderers.get(error.customType)!).render(80).join("\n").includes("ERROR"));
	process.env.NO_COLOR = "1";
	assert(!new CustomEntryComponent(error, renderers.get(error.customType)!).render(80).join("\n").includes("\x1b["));
	delete process.env.NO_COLOR;
	for (const mode of ["rpc", "json", "print"] as const) await commands.get("ein:probe")!.handler("", { ...ctx, mode });
	assert.equal(notifications.length, 9);
	assert.equal(session.getEntries().filter((entry) => entry.type === "custom").length, 5);
	ctx.ui.notify("unrelated notification");
	assert.equal(notifications.at(-1), "unrelated notification");
	assert(new Text("plain").render(30).join("").includes("plain"));
	console.log("command surfaces: passed");
} finally { rmSync(root, { recursive: true, force: true }); }
