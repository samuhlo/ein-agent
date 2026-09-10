import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, constants, openSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// Evidence is an index into real invocations, not a behavioral verdict. Keeping
// it out of bash content also leaves native output views untouched.
export function registerCommandEvidence(pi: ExtensionAPI): (ctx: ExtensionContext) => string {
	let problem = "";
	const indexPath = (ctx: ExtensionContext): string => {
		const session = ctx.sessionManager.getSessionFile();
		if (!session || !isAbsolute(session)) throw new Error("No durable child session");
		const folder = join(dirname(session), `command-evidence-${hash(session).slice(0, 24)}`);
		mkdirSync(folder, { recursive: true, mode: 0o700 });
		if (lstatSync(folder).isSymbolicLink()) throw new Error("Unsafe evidence directory");
		return join(folder, "commands.jsonl");
	};
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash" || typeof event.input.command !== "string") return;
		try {
			const index = indexPath(ctx);
			const id = hash(event.toolCallId);
			const output = event.content.map((part) => part.type === "text" ? part.text : "[non-text output]").join("\n");
			const details = event.details as { fullOutputPath?: string; truncation?: unknown } | undefined;
			// Historical preview markers remain ineligible as full originals.
			let original: string | undefined;
			if (details?.fullOutputPath && isAbsolute(details.fullOutputPath)) {
				const stat = lstatSync(details.fullOutputPath);
				if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 512 * 1024) original = readFileSync(details.fullOutputPath, "utf8");
			} else if (!details?.truncation && !/^\[(?:Ein Headroom:|Check output preview;)/.test(output)) original = output;
			const log = join(dirname(index), `${id}.log`);
			// A partial view stays explicitly partial; never call a truncated tail full.
			const stored = original ?? output;
			if (Buffer.byteLength(stored) > 512 * 1024) throw new Error("Output exceeds evidence copy limit; use native session");
			writeFileSync(log, stored, { flag: "wx", mode: 0o600 });
			const row = { version: 1, session: ctx.sessionManager.getSessionFile(), toolCallId: event.toolCallId,
				cwd: ctx.cwd, command: event.input.command, observedAt: new Date().toISOString(), toolSucceeded: event.isError === false,
				output: log, outputSha256: hash(stored), outputComplete: original !== undefined,
				...(details?.fullOutputPath ? { nativeOutput: details.fullOutputPath } : {}) };
			const fd = openSync(index, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
			try { appendFileSync(fd, `${JSON.stringify(row)}\n`); } finally { closeSync(fd); }
		} catch (error) {
			problem = error instanceof Error ? error.message : String(error);
		}
		// No result/content mutation: failures and compaction retain their owner.
	});
	return (ctx) => {
		try { return `Command evidence: ${indexPath(ctx)}${problem ? ` (incomplete: ${problem}; inspect native session)` : ""}. Link this index in apply-progress.md; row order is observed completion order, not proof of behavior.`; }
		catch { return "Command evidence unavailable: link exact native session/tool calls; never invent invocation references."; }
	};
}
