import { realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { sddPreflightSessionKey } from "./sdd-preflight.ts";

type ReadSpan = { start: number; end: number };
type ReadRecord = { version: string; spans: ReadSpan[] };
type ReadContext = { persistent: Map<string, ReadRecord>; turn: Map<string, ReadRecord> };

function readTarget(cwd: string, input: unknown): { path: string; start: number; limit?: number; version: string } | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const value = input as Record<string, unknown>;
	if (typeof value.path !== "string" || value.path.length === 0) return null;
	if (value.offset !== undefined && (!Number.isSafeInteger(value.offset) || (value.offset as number) < 1)) return null;
	if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || (value.limit as number) < 1)) return null;
	try {
		const path = realpathSync(resolve(cwd, value.path));
		const stat = statSync(path);
		if (!stat.isFile()) return null;
		return {
			path,
			start: typeof value.offset === "number" ? value.offset : 1,
			limit: typeof value.limit === "number" ? value.limit : undefined,
			version: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,
		};
	} catch { return null; }
}

function persistsAcrossTurns(path: string): boolean {
	return basename(path) === "SKILL.md"
		|| (basename(path) === "orchestrator.md" && basename(dirname(path)) === "assets");
}

function requestsFreshRead(text: string): boolean {
	return /\b(?:relee|releer|lee de nuevo|vuelve a leer|read again|reread|reload)\b/i.test(text);
}

function clearRequestedReads(records: Map<string, ReadRecord>, text: string): void {
	if (!requestsFreshRead(text)) return;
	const skill = /\b(?:skill|SKILL\.md)\b/i.test(text);
	const policy = /\borchestrator(?:\.md)?\b/i.test(text);
	if (!skill && !policy && !/\S+\.md\b/i.test(text)) { records.clear(); return; }
	for (const path of records.keys()) {
		if ((skill && basename(path) === "SKILL.md")
			|| (policy && basename(path) === "orchestrator.md")) records.delete(path);
	}
}

function deliveredSpan(target: NonNullable<ReturnType<typeof readTarget>>, event: ToolResultEvent): ReadSpan | null {
	if (event.isError || event.content.length !== 1 || event.content[0]?.type !== "text") return null;
	const details = event.details as { truncation?: { truncated: boolean; outputLines: number; firstLineExceedsLimit: boolean } } | undefined;
	const truncation = details?.truncation;
	if (truncation?.firstLineExceedsLimit) return null;
	const count = truncation?.truncated ? truncation.outputLines : target.limit;
	if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) return null;
	return { start: target.start, end: count === undefined ? Number.POSITIVE_INFINITY : target.start + count - 1 };
}

function covers(spans: ReadSpan[], requested: ReadSpan): boolean {
	let next = requested.start;
	for (const span of spans.toSorted((a, b) => a.start - b.start)) {
		if (span.end < next) continue;
		if (span.start > next) return false;
		if (span.end >= requested.end) return true;
		next = span.end + 1;
	}
	return false;
}

export function createContextReadGuard() {
	const contexts = new Map<string, ReadContext>();
	const contextFor = (ctx: ExtensionContext): ReadContext => {
		const key = sddPreflightSessionKey(ctx);
		let context = contexts.get(key);
		if (!context) {
			context = { persistent: new Map(), turn: new Map() };
			contexts.set(key, context);
		}
		return context;
	};
	const recordsFor = (context: ReadContext, path: string) => persistsAcrossTurns(path) ? context.persistent : context.turn;
	return {
		before(event: ToolCallEvent, ctx: ExtensionContext) {
			if (event.toolName !== "read") return;
			const target = readTarget(ctx.cwd, event.input);
			if (!target) return;
			const record = recordsFor(contextFor(ctx), target.path).get(target.path);
			if (!record || record.version !== target.version) return;
			const requested = { start: target.start, end: target.limit === undefined ? Number.POSITIVE_INFINITY : target.start + target.limit - 1 };
			if (!covers(record.spans, requested)) return;
			return { block: true, reason: `Este tramo de ${target.path} ya se entregó en el contexto actual. Usa ese contenido; lee solo líneas nuevas. Tras compactar o modificar el archivo se permite otra lectura.` };
		},
		after(event: ToolResultEvent, ctx: ExtensionContext) {
			if (event.toolName !== "read") return;
			const target = readTarget(ctx.cwd, event.input);
			if (!target) return;
			const span = deliveredSpan(target, event);
			if (!span) return;
			const records = recordsFor(contextFor(ctx), target.path);
			const previous = records.get(target.path);
			const spans = previous?.version === target.version ? [...previous.spans, span] : [span];
			records.delete(target.path);
			records.set(target.path, { version: target.version, spans });
			if (records.size > 128) records.delete(records.keys().next().value!);
		},
		newTurn(ctx: ExtensionContext, text = "") {
			const context = contextFor(ctx);
			context.turn.clear();
			clearRequestedReads(context.persistent, text);
		},
		compact(ctx: ExtensionContext) { contexts.delete(sddPreflightSessionKey(ctx)); },
		end(ctx: ExtensionContext) { contexts.delete(sddPreflightSessionKey(ctx)); },
	};
}

export function registerContextReadGuard(pi: ExtensionAPI): void {
	const guard = createContextReadGuard();
	pi.on("tool_call", (event, ctx) => guard.before(event, ctx));
	pi.on("tool_result", (event, ctx) => { guard.after(event, ctx); });
	pi.on("input", (event, ctx) => { guard.newTurn(ctx, event.source === "extension" ? "" : event.text); });
	pi.on("session_compact", (_event, ctx) => { guard.compact(ctx); });
	pi.on("session_shutdown", (_event, ctx) => { guard.end(ctx); });
}
