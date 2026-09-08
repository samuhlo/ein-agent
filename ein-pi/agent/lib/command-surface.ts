import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { GLYPH } from "./chrome.ts";

type Notice = { command: string; message: string; level: "info" | "warning" | "error" };

export function withEinCommandSurfaces(pi: ExtensionAPI, owner: string): ExtensionAPI {
	if (typeof pi.registerEntryRenderer !== "function") return pi;
	const entryType = `ein-command-output:${owner}`;
	pi.registerEntryRenderer<Notice>(entryType, (entry, _options, theme) => {
		const data = entry.data;
		if (!data || typeof data.command !== "string" || typeof data.message !== "string"
			|| !["info", "warning", "error"].includes(data.level)) return undefined;
		const label = `${GLYPH.rule} /${data.command}${data.level === "info" ? "" : ` · ${data.level.toUpperCase()}`}`;
		const color = !process.env.NO_COLOR && process.env.TERM !== "dumb";
		const title = color ? theme.fg(data.level === "info" ? "customMessageLabel" : data.level, label) : label;
		const body = color ? theme.fg("customMessageText", data.message) : data.message;
		return new Text(`${title}\n${body}`, 1, 0, color ? (line) => theme.bg("customMessageBg", line) : undefined);
	});
	return new Proxy(pi, {
		get(target, property, receiver) {
			if (property !== "registerCommand") return Reflect.get(target, property, receiver);
			return (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => {
				if (!name.startsWith("ein:")) return target.registerCommand(name, command);
				target.registerCommand(name, {
					...command,
					handler(args, ctx) {
						if (ctx.mode !== "tui" || !ctx.hasUI) return command.handler(args, ctx);
						// CONTEXTO LOCAL -> Una notificación concurrente ajena al comando conserva su UI.
						const ui = new Proxy(ctx.ui, {
							get(original, key, uiReceiver) {
								if (key !== "notify") return Reflect.get(original, key, uiReceiver);
								return (message: string, level: Notice["level"] = "info") => {
									// Las entradas custom se muestran y persisten sin convertirse en mensajes del modelo.
									pi.appendEntry<Notice>(entryType, { command: name, message, level });
								};
							},
						});
						const context = new Proxy(ctx, {
							get(original, key, contextReceiver) {
								return key === "ui" ? ui : Reflect.get(original, key, contextReceiver);
							},
						});
						return command.handler(args, context);
					},
				});
			};
		},
	});
}
