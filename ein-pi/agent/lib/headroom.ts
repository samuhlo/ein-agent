// Verified tool-output compression. No provider routing, model calls or memory.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { lstat, mkdir, open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { readHeadroomMode, type HeadroomMode } from "./headroom-settings.ts";

export type { HeadroomMode } from "./headroom-settings.ts";
export interface HeadroomConfig { mode: HeadroomMode; endpoint: string; timeoutMs: number }
export const HEADROOM_MIN_BYTES = 8_192;
export const HEADROOM_MAX_BYTES = 512 * 1024;
export const HEADROOM_DELIVERY_BYTES = 48_000;
export const HEADROOM_SESSION_BYTES = 32 * 1024 * 1024;

export function headroomConfig(env: NodeJS.ProcessEnv = process.env, cwd?: string): HeadroomConfig {
	const mode = env.EIN_HEADROOM_MODE ?? (cwd ? readHeadroomMode(cwd) : "off");
	if (!["off", "observe", "on"].includes(mode)) throw new Error("EIN_HEADROOM_MODE must be off, observe or on");
	const endpoint = new URL(env.EIN_HEADROOM_URL ?? "http://127.0.0.1:8787");
	if (endpoint.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") {
		throw new Error("EIN_HEADROOM_URL must be an HTTP loopback origin (127.0.0.1 or [::1])");
	}
	const timeoutMs = Number(env.EIN_HEADROOM_TIMEOUT_MS ?? 1500);
	if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 5000) throw new Error("EIN_HEADROOM_TIMEOUT_MS must be 50..5000");
	return { mode: mode as HeadroomMode, endpoint: endpoint.origin, timeoutMs };
}

export interface OutputCandidate {
	toolName: string; input: unknown; content: readonly { type: string; text?: string }[];
	isError: boolean; details?: unknown;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function headroomPayload(text: string): { payload: string; prefix: string; suffix: string } {
	const start = text.search(/\S/);
	if (start >= 0 && text[start] === "[") {
		let depth = 0, quoted = false, escaped = false;
		for (let i = start; i < text.length; i++) {
			const char = text[i];
			if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
			if (char === '"') quoted = true;
			else if (char === "[") depth++;
			else if (char === "]" && --depth === 0) {
				const suffix = text.slice(i + 1);
				if (suffix.length <= 2048) return { payload: text.slice(start, i + 1), prefix: text.slice(0, start), suffix };
				break;
			}
		}
	}
	return { payload: text, prefix: "", suffix: "" };
}

export function eligibleHeadroomOutput(event: OutputCandidate): string | undefined {
	// Read stays exact, including retrieval of our own originals. Evidence and
	// delegated results are never intercepted. Already-reduced/truncated results
	// must not go through a second compressor.
	if (event.toolName !== "bash" || event.isError || event.content.length !== 1 || event.content[0]?.type !== "text") return;
	if (!record(event.input) || typeof event.input.command !== "string") return;
	if (/\bhypa\b|\bcontext[_-]mode\b|\b(?:ein[-_]sdd|ein[-_]cc[-_]sdd|openspec)\b|\b(?:cat|sed|head|tail|bat)\b[^\n]*\.(?:[cm]?[jt]sx?|py|rs|go|md|ya?ml|toml)\b|\bgit\s+(?:diff|show)\b/i.test(event.input.command)) return;
	if (record(event.details) && (event.details.fullOutputPath || event.details.headroom || (record(event.details.truncation) && event.details.truncation.truncated))) return;
	const text = event.content[0].text;
	if (!text || Buffer.byteLength(text) < HEADROOM_MIN_BYTES || Buffer.byteLength(text) > HEADROOM_MAX_BYTES) return;
	if (/\[Ein Headroom|<<ccr:|Retrieve more: hash=|Full output:|\bapply-packet\/|\bstateRef\b|\bwriteAllowlist\b/.test(text)) return;
	// Accept data tables and timestamped logs. Both require an exact, reversible
	// representation check below; sampling or dropping records is never accepted.
	try {
		const data: unknown = JSON.parse(headroomPayload(text).payload);
		if (Array.isArray(data) && data.length >= 5 && data.every(record)) return text;
	} catch { /* Unknown representations stay raw. */ }
	const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
	if (lines.length >= 30 && lines.every((line) => /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d/.test(line))) return text;
}

export async function headroomSource(event: OutputCandidate): Promise<{ text: string; full: boolean } | undefined> {
	if (event.content.some((part) => part.type === "text" && (part.text?.startsWith("[Check output preview;") || part.text?.startsWith("[Ein Headroom:")))) return;
	if (event.toolName !== "bash" || event.isError || !record(event.details) || !record(event.details.truncation) || !event.details.truncation.truncated) {
		const text = eligibleHeadroomOutput(event); return text ? { text, full: false } : undefined;
	}
	const path = event.details.fullOutputPath;
	// Only Pi's own bounded spool surface. Never open a path found in tool text,
	// an arbitrary extension's details, a symlink or a special file.
	if (typeof path !== "string" || !/^pi-bash-[a-f0-9]{16}\.log$/.test(basename(path))) return;
	if (await realpath(dirname(path)) !== await realpath(tmpdir())) return;
	const info = await lstat(path);
	if (!info.isFile() || info.size > HEADROOM_MAX_BYTES || info.size < HEADROOM_MIN_BYTES) return;
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const before = await handle.stat(); if (before.ino !== info.ino || before.size !== info.size) return;
		const buffer = Buffer.alloc(info.size + 1);
		let length = 0;
		while (length < buffer.length) { const part = await handle.read(buffer, length, buffer.length - length, length); if (!part.bytesRead) break; length += part.bytesRead; }
		const after = await handle.stat(); if (length !== info.size || after.size !== info.size || after.mtimeMs !== before.mtimeMs) return;
		const text = buffer.subarray(0, length).toString("utf8");
		if (!buffer.subarray(0, length).equals(Buffer.from(text, "utf8"))) return;
		const candidate = eligibleHeadroomOutput({ ...event, details: undefined, content: [{ type: "text", text }] });
		return candidate ? { text: candidate, full: true } : undefined;
	} finally { await handle.close(); }
}

export interface Compression { text: string; tokensBefore: number; tokensAfter: number; transforms: string[] }
export async function compressHeadroom(text: string, config: HeadroomConfig, signal?: AbortSignal): Promise<Compression> {
	const controller = new AbortController();
	const cancel = () => controller.abort();
	if (signal?.aborted) cancel();
	signal?.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(cancel, config.timeoutMs);
	try {
		// Fixed tokenizer for comparable experiment metrics, NOT a model request.
		// Only this fresh result is submitted. The conversation/prompt never leaves Pi.
		const response = await fetch(`${config.endpoint}/v1/compress`, {
			method: "POST", redirect: "error", signal: controller.signal,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-4o", messages: [
				{ role: "assistant", content: null, tool_calls: [{ id: "ein-output", type: "function", function: { name: "bash", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "ein-output", name: "bash", content: text },
			] }),
		});
		if (!response.ok) throw new Error(`headroom-http-${response.status}`);
		// Bound response reads as well as input. Content-Length alone is not enough.
		const reader = response.body?.getReader();
		if (!reader) throw new Error("headroom-empty-response");
		const chunks: Uint8Array[] = []; let bytes = 0;
		while (true) {
			const part = await reader.read(); if (part.done) break;
			bytes += part.value.byteLength;
			if (bytes > HEADROOM_MAX_BYTES * 3) { await reader.cancel(); throw new Error("headroom-response-too-large"); }
			chunks.push(part.value);
		}
		const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (!record(result) || !Array.isArray(result.messages) || result.messages.length !== 2) throw new Error("headroom-invalid-response");
		const output = result.messages[1];
		if (!record(output) || output.role !== "tool" || output.tool_call_id !== "ein-output" || typeof output.content !== "string" || !output.content.trim()) throw new Error("headroom-invalid-content");
		if (/<<ccr:|Retrieve more: hash=|headroom_retrieve/.test(output.content)) throw new Error("headroom-unresolved-retrieval");
		const before = result.tokens_before, after = result.tokens_after;
		if (typeof before !== "number" || typeof after !== "number" || !Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after < 0) throw new Error("headroom-invalid-metrics");
		return { text: output.content, tokensBefore: before, tokensAfter: after, transforms: Array.isArray(result.transforms_applied) ? result.transforms_applied.filter((x): x is string => typeof x === "string") : [] };
	} finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}

export function headroomTableText(output: string): string {
	if (!output.startsWith('"')) return output;
	const decoded: unknown = JSON.parse(output);
	if (typeof decoded !== "string") throw new Error("headroom-invalid-table");
	return decoded;
}

export function verifyHeadroomTable(original: string, output: string): boolean {
	// Verify the upstream scalar csv-schema wire format by rebuilding its exact
	// representation from the original. No heuristic parsing or type coercion.
	try {
		const rows: unknown = JSON.parse(original);
		if (!Array.isArray(rows) || !rows.length || !rows.every(record)) return false;
		// Reject duplicate object keys: parsing alone would silently keep the last
		// value. Normalize lexical tokens without discarding repeated keys.
		let exactNumbers = true;
		const lexical = original.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\s+/g, (token) => {
			if (/^\s/.test(token)) return "";
			const normalized = JSON.stringify(JSON.parse(token));
			if (token[0] !== '"' && token !== normalized) exactNumbers = false;
			return normalized;
		});
		if (!exactNumbers || lexical !== JSON.stringify(rows)) return false;
		const table = headroomTableText(output);
		const match = table.match(/^\[(\d+)\]\{([^\n}]+)\}\n/);
		if (!match?.[2] || Number(match[1]) !== rows.length) return false;
		const columns: [string, string][] = [];
		for (const column of match[2].split(",")) {
			const [key, type, extra] = column.split(":");
			if (!key || !type || !/^[a-zA-Z_]\w*$/.test(key) || !/^(string|int|float|bool|null)\??$/.test(type) || extra !== undefined) return false;
			columns.push([key, type]);
		}
		const keys = columns.map(([key]) => key);
		if (new Set(keys).size !== keys.length) return false;
		const lines: string[] = [];
		for (const row of rows) {
			if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))) return false;
			for (const [key, declared] of columns) {
				const value = row[key];
				const type = declared.replace(/\?$/, "");
				if (value === null) { if (declared.endsWith("?") || type === "null") continue; return false; }
				if (type === "null") return false;
				if (type === "string" && typeof value !== "string") return false;
				// csv-schema represents both null and empty strings as an empty cell.
				// Refuse that ambiguous nullable-string combination.
				if (type === "string" && declared.endsWith("?") && value === "") return false;
				if (type === "int" && (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0))) return false;
				if (type === "float" && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || Object.is(value, -0))) return false;
				if (type === "bool" && typeof value !== "boolean") return false;
			}
			lines.push(keys.map((key) => { const value = row[key]; if (value === null) return ""; if (typeof value === "string") return /[,"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; return String(value); }).join(","));
		}
		return table.replace(/\n$/, "") === match[0] + lines.join("\n");
	} catch { return false; }
}

export type HeadroomProof = "table" | "prefix-lines";
export function verifyHeadroomRepresentation(original: string, output: string): HeadroomProof | undefined {
	if (verifyHeadroomTable(original, output)) return "table";
	// Headroom sometimes folds a shared timestamp prefix onto one header line.
	// Expand it and compare the ordered sequence, including duplicate events.
	const rows = output.replace(/\r?\n$/, "").split(/\r?\n/);
	const prefix = rows.shift();
	if (!prefix || !/^\d{4}-\d\d-\d\d[T ]\d\d$/.test(prefix) || !rows.length) return;
	const expanded = rows.map((line) => line.startsWith(`${prefix}:`) ? line : `${prefix}:${line}`).join("\n");
	if (expanded === original.replace(/\r?\n$/, "").replace(/\r\n/g, "\n")) return "prefix-lines";
}

export function presentHeadroom(compact: string, proof: HeadroomProof): string {
	if (proof !== "prefix-lines") return compact;
	const lines = compact.replace(/\r?\n$/, "").split(/\r?\n/), prefix = lines.shift()!;
	return [prefix, ...lines.map((line) => /\b(?:ERROR|WARN|WARNING|FATAL|EXCEPTION)\b/i.test(line) && !line.startsWith(`${prefix}:`) ? `${prefix}:${line}` : line)].join("\n");
}

export async function saveHeadroomOriginal(cwd: string, sessionId: string, original: string): Promise<string> {
	const project = await realpath(cwd);
	const sessionKey = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
	let dir = project;
	// Refuse symlinked storage; a project cannot redirect the archive elsewhere.
	for (const part of [".pi", "ein", "headroom", sessionKey]) {
		dir = join(dir, part); await mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
		if (await realpath(dir) !== resolve(dir)) throw new Error("headroom-storage-symlink");
	}
	// Keep regenerable command output out of ordinary git add/status even in
	// projects that do not already ignore .pi/ein. Never change their git config.
	const ignorePath = join(project, ".pi", "ein", "headroom", ".gitignore");
	try { const ignore = await open(ignorePath, "wx", 0o600); try { await ignore.writeFile("*\n"); } finally { await ignore.close(); } }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await lstat(ignorePath)).isFile() || await readFile(ignorePath, "utf8") !== "*\n") throw new Error("headroom-cache-ignore-conflict");
	}
	const path = join(dir, `${createHash("sha256").update(original).digest("hex")}.txt`);
	// Repeated results reuse only an exact, non-symlink original. Count persisted
	// files so resuming a session cannot reset the archive budget.
	let used = 0;
	for (const name of await readdir(dir)) used += (await lstat(join(dir, name))).size;
	try {
		if (!(await lstat(path)).isFile() || await realpath(path) !== path || await readFile(path, "utf8") !== original) throw new Error("headroom-storage-conflict");
		return path;
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	if (used + Buffer.byteLength(original) > HEADROOM_SESSION_BYTES) throw new Error("headroom-storage-budget");
	const file = await open(path, "wx", 0o600);
	try { await file.writeFile(original, "utf8"); } finally { await file.close(); }
	if ((await stat(path)).size !== Buffer.byteLength(original)) throw new Error("headroom-storage-incomplete");
	return path;
}

export function headroomNotice(path: string, proof: HeadroomProof = "table"): string {
	const representation = proof === "table" ? "table VIEW of JSON data; header types are authoritative: int/float are JSON numbers, bool is boolean, string is string. Preserve these types when writing JSON. Source JSON files remain JSON and no source file was rewritten" : "the first line is a shared timestamp prefix for abbreviated lines; diagnostic lines already show FULL timestamps";
	return `[Ein Headroom: ${representation}. All original records and values verified, in order, including duplicates. Original: ${JSON.stringify(path)}. The archive contains the unmodified command output.]\n`;
}
