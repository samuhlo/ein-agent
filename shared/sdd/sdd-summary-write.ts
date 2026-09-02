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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isSafeChangeName } from "./sdd-routing-core.ts";

export type SummaryWriteRequest = Readonly<{
	cwd: string;
	change: string;
	content: string;
}>;

export type SummaryWriteResult =
	| Readonly<{ ok: true; change: string; path: string }>
	| Readonly<{
			ok: false;
			code: "no-change" | "invalid-change" | "empty-content" | "write-failed";
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
		writeFileSync(path, content);
	} catch (error) {
		return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
	}

	return { ok: true, change, path };
}
