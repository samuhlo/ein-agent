// =============================================================================
// [CORE] SDD SUMMARY WRITE
// Writes the durable close summary from content already produced by the agent.
// Both runtimes need this deterministic fallback because Claude agents have
// refused an explicitly requested ordinary Write to a Markdown report twice in
// one observed session. This does not reinterpret that refusal; it provides a
// bounded persistence path that does not depend on the model overcoming it.
//
// FAIL CLOSED -> validate the change name, its directory and non-empty content
// before touching the filesystem.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isSafeChangeName, readSddCompletionEvidence, resolveChangesDir } from "./sdd-routing-core.ts";
import { summaryContractErrors } from "./sdd-summary-contract.ts";

export type SummaryWriteRequest = Readonly<{
	cwd: string;
	change: string;
	content: string;
}>;

export type SummaryWriteResult =
	| Readonly<{ ok: true; change: string; path: string }>
	| Readonly<{
			ok: false;
			code: "no-change" | "invalid-change" | "empty-content" | "write-failed" | "invalid-evidence";
			reason: string;
	  }>;

export function writeSddSummary(request: SummaryWriteRequest): SummaryWriteResult {
	const { cwd, change, content } = request;

	if (!change) return { ok: false, code: "no-change", reason: "no active change" };
	if (!isSafeChangeName(change)) {
		return { ok: false, code: "invalid-change", reason: `invalid change name: ${JSON.stringify(change)}` };
	}

	const changeDir = join(cwd, "openspec", "changes", change);
	if (!existsSync(changeDir)) {
		return { ok: false, code: "no-change", reason: `change '${change}' does not exist in openspec/changes` };
	}
	if (content.trim().length === 0) {
		return { ok: false, code: "empty-content", reason: "summary content is empty" };
	}

	const path = join(changeDir, "summary.md");
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content.replace(/^[ \t]*(?:[-*][ \t]*)?verify[ \t]*:[ \t]*(\S[^\r\n]*)/gmi, "- verify: $1"));
	} catch (error) {
		return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
	}

	return { ok: true, change, path };
}

export function writeVerifiedSddSummary(request: SummaryWriteRequest & { commands: readonly string[] }): SummaryWriteResult {
	try {
		const evidence = readSddCompletionEvidence(request.cwd, request.change);
		if (evidence.apply !== "complete" || evidence.verify !== "pass" || evidence.verifyStale || evidence.tasks.counts.pending > 0) throw new Error("Summary requires completed apply and fresh passing verification with no pending tasks");
		const dir = join(resolveChangesDir(request.cwd), request.change);
		const report = readFileSync(join(dir, "verify-report.md"), "utf8");
		const recorded = new Set([
			...[...report.matchAll(/`([^`\r\n]+)`/g)].map((match) => match[1]),
			...report.split(/\r?\n/).flatMap((line) => line.split("|").map((part) => part.trim().replace(/^[-*]\s+/, "").replace(/^(?:verify|command|comando|executed|ejecutado):\s*/i, ""))),
		]);
		if (!Array.isArray(request.commands) || request.commands.length === 0 || request.commands.some((command) => typeof command !== "string" || !command.trim() || /[\r\n]/.test(command) || !recorded.has(command))) throw new Error("Commands must be exact single-line commands recorded in verify-report.md");
		const groups = Math.max(1, new Set(evidence.tasks.items.map((item) => item.groupTitle ?? "")).size);
		const content = request.content.trim();
		if (!content) throw new Error("Summary explanation is empty");
		const heading = content.search(/^#{1,6}\s/m);
		const headerEnd = heading < 0 ? content.length : heading;
		const narrative = content.slice(0, headerEnd).replace(/^(?:status|change|work_groups|verification_status):[^\r\n]*\r?\n?/gm, "") + content.slice(headerEnd);
		const summary = [`status: complete`, `change: ${request.change}`, `work_groups: ${groups}`, "verification_status: pass", "", narrative.trim(), "", "## Verification commands", ...[...new Set(request.commands)].map((command) => `- verify: ${command}`), ""].join("\n");
		const errors = summaryContractErrors(summary, request.change);
		if (errors.length) throw new Error(errors.join("; "));
		return writeSddSummary({ ...request, content: summary });
	} catch (error) {
		return { ok: false, code: "invalid-evidence", reason: error instanceof Error ? error.message : String(error) };
	}
}
