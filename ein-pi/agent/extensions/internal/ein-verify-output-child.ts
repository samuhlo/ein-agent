import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

// A transport optimization for verify's native bash results, never a check runner
// or a passing verdict. Unknown shell syntax and all failures stay untouched.
export function isSimpleCheck(command: unknown): boolean {
	if (typeof command !== "string" || !/^[\w ./=:,@+\-]+$/.test(command)) return false;
	return /^(?:bun|npm|pnpm|yarn) (?:run )?(?:test|typecheck|lint|build|check)(?::[\w-]+)?(?: |$)/.test(command.trim());
}

export function checkPreview(text: string): string | undefined {
	if (Buffer.byteLength(text) <= 8192) return;
	const lines = text.split("\n");
	const keep = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		// Keep diagnostic lines even in the middle, including false-green signals.
		if (i < 12 || i >= lines.length - 35) keep.add(i);
		if (/\b(?:warn\w*|err(?:or)?\w*|fail\w*|skip\w*|todo|pending|cancel\w*|coverage|no tests?|0 (?:tests?|pass))\b/i.test(stripVTControlCharacters(lines[i]))) {
			for (let n = Math.max(0, i - 2); n <= Math.min(lines.length - 1, i + 2); n++) keep.add(n);
		}
	}
	const result: string[] = [];
	let previous = -1;
	for (const i of [...keep].sort((a, b) => a - b)) {
		if (i > previous + 1) result.push(`[${i - previous - 1} lines omitted]`);
		result.push(lines[i]);
		previous = i;
	}
	const preview = result.join("\n");
	// Prefer the original whenever preserving diagnostics defeats the saving.
	return Buffer.byteLength(preview) <= 6144 ? preview : undefined;
}

export default function verifyOutput(pi: ExtensionAPI): void {
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash" || event.isError !== false || !isSimpleCheck(event.input.command)) return;
		if (event.content.length !== 1 || event.content[0].type !== "text") return;
		const original = event.content[0].text;
		// A verified Headroom view must not acquire a second, lossy preview.
		if (original.startsWith("[Ein Headroom:")) return;
		const preview = checkPreview(original);
		if (preview === undefined) return;
		try {
			const details = event.details as { fullOutputPath?: string; truncation?: unknown } | undefined;
			let fullPath = details?.fullOutputPath;
			if (fullPath) {
				if (!isAbsolute(fullPath) || !existsSync(fullPath) || !statSync(fullPath).isFile()) return;
			} else {
				// Never label a native truncated tail as a full log.
				if (details?.truncation) return;
				const sessionFile = ctx.sessionManager.getSessionFile();
				if (!sessionFile || !isAbsolute(sessionFile)) return;
				const folder = join(dirname(sessionFile), "verify-logs");
				mkdirSync(folder, { recursive: true, mode: 0o700 });
				const id = createHash("sha256").update(sessionFile).update(event.toolCallId).update(original).digest("hex");
				fullPath = join(folder, `${id}.log`);
				writeFileSync(fullPath, original, { flag: "wx", mode: 0o600 });
			}
			return {
				content: [{ type: "text" as const, text: `[Check output preview; omitted lines are not evidence of passing. Full log: ${fullPath}]\n${preview}` }],
				details: event.details,
			};
		} catch {
			// Missing storage or any unexpected tool shape keeps the native result.
			return;
		}
	});
}
