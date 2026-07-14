import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

import {
	ENGRAM_TIMEOUT_MS,
	RETRIEVAL_BUDGET,
	SAVE_BUDGET,
	type EngramReason,
	type EngramTransport,
	type RetrievalResult,
	type SaveResult,
} from "./memory-contract.ts";

export type ProcessStartOptions = {
	command: string;
	args: string[];
	shell: false;
};

export type ProcessExit = {
	code: number | null;
	error?: unknown;
};

export type ProcessChild = {
	stdout: AsyncIterable<Uint8Array | string>;
	stderr: AsyncIterable<Uint8Array | string>;
	exited: Promise<ProcessExit>;
	cancel(): void;
};

/** The only external capability; tests inject this instead of spawning Engram. */
export interface ProcessCapability {
	start(options: ProcessStartOptions): ProcessChild;
}

type Output = { text: string; capped: boolean };
type CompletedProcess = { exit: ProcessExit; stdout: Output; stderr: Output };
type RunResult =
	| { kind: "complete"; value: CompletedProcess }
	| { kind: "timeout" }
	| { kind: "output_cap" }
	| { kind: "spawn_error"; error: unknown };

const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const UPDATE_NOTICE = /^(?:engram:\s*)?(?:update available|a new version of engram is available)\b/i;
const ERROR_PAYLOAD = /\b(?:error|failed|invalid)\b/i;

const systemProcess: ProcessCapability = {
	start({ command, args, shell }) {
		const child = spawn(command, args, { shell, stdio: "pipe" });
		const exited = new Promise<ProcessExit>((resolve) => {
			child.once("error", (error) => resolve({ code: null, error }));
			child.once("close", (code) => resolve({ code }));
		});

		return {
			stdout: child.stdout,
			stderr: child.stderr,
			exited,
			cancel: () => child.kill(),
		};
	},
};

function isEnoent(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function collectOutput(
	stream: AsyncIterable<Uint8Array | string>,
	cap: number,
	onCap: () => void,
): Promise<Output> {
	return (async () => {
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		for await (const chunk of stream) {
			const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			bytes += data.byteLength;
			if (bytes > cap) {
				onCap();
				return { text: "", capped: true };
			}
			chunks.push(data);
		}
		return { text: Buffer.concat(chunks).toString("utf8"), capped: false };
	})();
}

async function run(
	process: ProcessCapability,
	args: string[],
	stdoutCap: number,
	stderrCap: number,
): Promise<RunResult> {
	let child: ProcessChild;
	try {
		child = process.start({ command: "engram", args, shell: false });
	} catch (error) {
		return { kind: "spawn_error", error };
	}

	let cancelCalled = false;
	const cancel = () => {
		if (!cancelCalled) {
			cancelCalled = true;
			child.cancel();
		}
	};
	let signalCap: () => void = () => undefined;
	const outputCap = new Promise<"output_cap">((resolve) => {
		signalCap = () => {
			cancel();
			resolve("output_cap");
		};
	});
	const completed = Promise.all([
		child.exited,
		collectOutput(child.stdout, stdoutCap, signalCap),
		collectOutput(child.stderr, stderrCap, signalCap),
	]).then(([exit, stdout, stderr]) => ({ kind: "complete" as const, value: { exit, stdout, stderr } }));
	let timeoutId: ReturnType<typeof setTimeout>;
	const timeout = new Promise<"timeout">((resolve) => {
		timeoutId = setTimeout(() => {
			cancel();
			resolve("timeout");
		}, ENGRAM_TIMEOUT_MS);
	});

	const outcome = await Promise.race([completed, outputCap, timeout]);
	clearTimeout(timeoutId!);
	return typeof outcome === "string" ? { kind: outcome } : outcome;
}

function stripUpdateNotices(text: string): { text: string; malformed: boolean } {
	let malformed = false;
	const lines = text.split(/\r?\n/).flatMap((line) => {
		const plain = line.replace(ANSI, "").trim();
		if (UPDATE_NOTICE.test(plain)) return [];
		if (line.includes("\u001B")) malformed = true;
		return [line];
	});
	const cleaned = lines.join("\n").trim();
	return {
		text: cleaned,
		malformed: malformed || /\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(cleaned),
	};
}

function parseSearch(text: string): string[] | null {
	if (!text) return [];
	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			const parsed: unknown = JSON.parse(text);
			const entries = Array.isArray(parsed)
				? parsed
				: typeof parsed === "object" && parsed !== null && "entries" in parsed
					? parsed.entries
					: typeof parsed === "object" && parsed !== null && "results" in parsed
						? parsed.results
						: null;
			return Array.isArray(entries) && entries.every((entry) => typeof entry === "string")
				? entries.filter(Boolean)
				: null;
		} catch {
			return null;
		}
	}
	return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function validSaveAcknowledgement(text: string): boolean {
	if (!text || ERROR_PAYLOAD.test(text)) return false;
	if (!text.startsWith("{") && !text.startsWith("[")) return true;
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
		const value = parsed as Record<string, unknown>;
		return value.ok === true || ["saved", "ok", "acknowledged"].includes(String(value.status));
	} catch {
		return false;
	}
}

function searchFailure(reason: EngramReason, exitCode?: number): RetrievalResult {
	return { operation: "search", status: "failed", reason, entries: [], ...(exitCode === undefined ? {} : { exitCode }) };
}

function saveFailure(reason: EngramReason, exitCode?: number): SaveResult {
	return { operation: "save", status: "failed", reason, ...(exitCode === undefined ? {} : { exitCode }) };
}

function normalizeSearch(result: RunResult): RetrievalResult {
	if (result.kind === "timeout" || result.kind === "output_cap") return searchFailure(result.kind);
	if (result.kind === "spawn_error") {
		return isEnoent(result.error)
			? { operation: "search", status: "unavailable", reason: "binary_missing", entries: [] }
			: searchFailure("spawn_error");
	}
	if (result.value.exit.error) return isEnoent(result.value.exit.error)
		? { operation: "search", status: "unavailable", reason: "binary_missing", entries: [] }
		: searchFailure("spawn_error");
	if (result.value.exit.code !== 0) return searchFailure("nonzero_exit", result.value.exit.code ?? undefined);
	const stdout = stripUpdateNotices(result.value.stdout.text);
	const stderr = stripUpdateNotices(result.value.stderr.text);
	if (stdout.malformed || stderr.malformed || stderr.text) return searchFailure("malformed_output");
	const entries = parseSearch(stdout.text);
	if (entries === null) return searchFailure("malformed_output");
	return entries.length
		? { operation: "search", status: "retrieved", reason: "ok", entries }
		: { operation: "search", status: "empty", reason: "no_results", entries: [] };
}

function normalizeSave(result: RunResult): SaveResult {
	if (result.kind === "timeout" || result.kind === "output_cap") return saveFailure(result.kind);
	if (result.kind === "spawn_error") {
		return isEnoent(result.error)
			? { operation: "save", status: "unavailable", reason: "binary_missing" }
			: saveFailure("spawn_error");
	}
	if (result.value.exit.error) return isEnoent(result.value.exit.error)
		? { operation: "save", status: "unavailable", reason: "binary_missing" }
		: saveFailure("spawn_error");
	if (result.value.exit.code !== 0) return saveFailure("nonzero_exit", result.value.exit.code ?? undefined);
	const stdout = stripUpdateNotices(result.value.stdout.text);
	const stderr = stripUpdateNotices(result.value.stderr.text);
	if (stdout.malformed || stderr.malformed || stderr.text || !validSaveAcknowledgement(stdout.text)) {
		return saveFailure("malformed_output");
	}
	return { operation: "save", status: "saved", reason: "acknowledged" };
}

export function createEngramTransport(process: ProcessCapability = systemProcess): EngramTransport {
	return {
		async search(input) {
			return normalizeSearch(await run(
				process,
				["search", input.query, "--project", input.projectId, "--scope", "project", "--limit", "5"],
				RETRIEVAL_BUDGET.stdoutBytes,
				RETRIEVAL_BUDGET.stderrBytes,
			));
		},
		async save(input) {
			return normalizeSave(await run(
				process,
				[
					"save", input.title, input.content, "--type", input.type,
					"--project", input.projectId, "--scope", "project", "--topic", input.topic,
				],
				SAVE_BUDGET.stdoutBytes,
				SAVE_BUDGET.stderrBytes,
			));
		},
	};
}
