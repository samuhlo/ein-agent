// Experimental tool-output compression. No provider routing, model calls or memory.
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export type HeadroomMode = "off" | "observe" | "on";
export interface HeadroomConfig { mode: HeadroomMode; endpoint: string; timeoutMs: number }
export const HEADROOM_MIN_BYTES = 8_192;
export const HEADROOM_MAX_BYTES = 200_000;
export const HEADROOM_SESSION_BYTES = 32 * 1024 * 1024;

export function headroomConfig(env: NodeJS.ProcessEnv = process.env): HeadroomConfig {
	const mode = env.EIN_HEADROOM_MODE ?? "off";
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
	// The first live pilot miscounted a log despite retrieving its original.
	// Only tabular JSON is eligible in the final profile. It must also pass the
	// exact record verifier below; source, logs and prose remain untouched.
	try {
		const data: unknown = JSON.parse(text);
		if (Array.isArray(data) && data.length >= 5 && data.every(record)) return text;
	} catch { /* Unknown representations stay raw. */ }
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
	// Intentionally a small verified subset of Headroom's csv-schema format,
	// not a permissive CSV parser. Reject quoting, nesting, mixed schemas or
	// type coercion. Every value, row order, column and multiplicity must match.
	try {
		const rows: unknown = JSON.parse(original);
		if (!Array.isArray(rows) || !rows.length || !rows.every(record)) return false;
		const table = headroomTableText(output);
		const match = table.match(/^\[(\d+)\]\{([^\n}]+)\}\n/);
		if (!match || Number(match[1]) !== rows.length) return false;
		const columns = match[2].split(",").map((column) => column.split(":"));
		if (columns.some(([key, type, extra]) => !key || !/^[a-zA-Z_]\w*$/.test(key) || !["string", "int", "bool"].includes(type) || extra !== undefined)) return false;
		const keys = columns.map(([key]) => key);
		if (new Set(keys).size !== keys.length) return false;
		const lines: string[] = [];
		for (const row of rows) {
			if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))) return false;
			for (const [key, type] of columns) {
				const value = row[key];
				if (type === "string" && (typeof value !== "string" || !value || /[,\r\n"\\]/.test(value) || value.trim() !== value)) return false;
				if (type === "int" && (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0))) return false;
				if (type === "bool" && typeof value !== "boolean") return false;
			}
			lines.push(keys.map((key) => String(row[key])).join(","));
		}
		return table.replace(/\n$/, "") === match[0] + lines.join("\n");
	} catch { return false; }
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

export function headroomNotice(path: string): string {
	return `[Ein Headroom: display table of a JSON array, verified against every original row and value. Files on disk retain their original JSON format. Original: ${JSON.stringify(path)}. Use read with offset/limit for original syntax.]\n`;
}
