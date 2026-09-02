// =============================================================================
// PROJECT GIT STATE
// Executes bounded read-only Git probes and derives an exact working-tree
// identity from the strict porcelain parser and current file content.
// =============================================================================

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ProjectGitChange, ProjectGitState, ProjectStateQuality, ProjectStateReasonCode } from "./project-state-contract.ts";
import { compareProjectGitPath, isProjectGitObjectId, parseProjectGitStatus } from "./project-state-git-status.ts";

const GIT_MAX_CHANGES = 256;
const GIT_MAX_OUTPUT_BYTES = 1_048_576;

type GitCommandResult = { ok: true; output: string } | { ok: false };

function runGit(cwd: string, args: readonly string[]): GitCommandResult {
	try {
		return {
			ok: true,
			output: execFileSync("git", ["--no-optional-locks", ...args], {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				maxBuffer: GIT_MAX_OUTPUT_BYTES,
				windowsHide: true,
			}),
		};
	} catch {
		return { ok: false };
	}
}

const output = (result: GitCommandResult): string | undefined => result.ok ? result.output : undefined;

function singleLine(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return !trimmed || trimmed.includes("\n") || trimmed.includes("\r") ? undefined : trimmed;
}

function contentIdentity(root: string, path: string): string | undefined {
	const absolute = resolve(root, path);
	try {
		const stat = lstatSync(absolute);
		if (stat.isSymbolicLink()) {
			const target = readlinkSync(absolute, "utf8");
			return `symlink:${createHash("sha256").update(target).digest("hex")}`;
		}
		if (stat.isFile()) {
			const digest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
			return `file:${stat.mode.toString(8)}:${digest}`;
		}
		return `special:${stat.mode.toString(8)}`;
	} catch {
		try {
			lstatSync(absolute);
			return undefined;
		} catch {
			return "missing";
		}
	}
}

function gitFailure(repository: boolean | null, reason: ProjectStateReasonCode, quality: ProjectStateQuality, root?: string): ProjectGitState {
	return {
		quality,
		reason,
		repository,
		...(root ? { root } : {}),
		dirty: repository === false ? false : null,
		complete: repository === false,
		changes: [],
	};
}

export function readProjectGitState(cwd: string): ProjectGitState {
	if (!runGit(cwd, ["--version"]).ok) {
		return gitFailure(null, "command-error", "unavailable");
	}
	const insideOutput = output(runGit(cwd, ["rev-parse", "--is-inside-work-tree"]));
	if (insideOutput === undefined) return gitFailure(false, "not-a-repository", "absent");
	const inside = singleLine(insideOutput);
	if (inside === "false") return gitFailure(false, "not-a-repository", "absent");
	if (inside !== "true") return gitFailure(null, "parse-error", "incomplete");

	const rootOutput = output(runGit(cwd, ["rev-parse", "--show-toplevel"]));
	const rootValue = singleLine(rootOutput);
	if (!rootValue || !isAbsolute(rootValue)) {
		const rootFailureReason = rootOutput === undefined ? "command-error" : "parse-error";
		const rootFailureQuality = rootOutput === undefined ? "unavailable" : "incomplete";
		return gitFailure(true, rootFailureReason, rootFailureQuality);
	}
	const root = resolve(rootValue);

	const symbolicOutput = output(runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]));
	let branch: string;
	if (symbolicOutput !== undefined) {
		const symbolic = singleLine(symbolicOutput);
		if (!symbolic) return gitFailure(true, "parse-error", "incomplete", root);
		branch = symbolic;
	} else {
		const abbreviated = singleLine(output(runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])));
		if (abbreviated !== "HEAD") return gitFailure(true, "command-error", "unavailable", root);
		branch = "detached";
	}

	const headOutput = output(runGit(cwd, ["rev-parse", "--verify", "HEAD^{commit}"]));
	let head: string;
	if (headOutput === undefined) {
		if (branch === "detached") return gitFailure(true, "command-error", "unavailable", root);
		head = "unborn";
	} else {
		const headValue = singleLine(headOutput);
		if (!headValue || !isProjectGitObjectId(headValue)) return gitFailure(true, "parse-error", "incomplete", root);
		head = headValue;
	}

	const statusOutput = output(
		runGit(root, [
			"status",
			"--porcelain=v2",
			"--untracked-files=all",
			"--find-renames=50%",
			"-z",
		]),
	);
	if (statusOutput === undefined) return gitFailure(true, "command-error", "unavailable", root);
	const parsed = parseProjectGitStatus(root, statusOutput);
	if (parsed.malformed) return gitFailure(true, "parse-error", "incomplete", root);
	parsed.records.sort(compareProjectGitPath);
	const overflow = parsed.records.length > GIT_MAX_CHANGES;
	const boundedRecords = parsed.records.slice(0, GIT_MAX_CHANGES);
	const changes: ProjectGitChange[] = boundedRecords.map((record) => ({
		path: record.path,
		kind: record.kind,
		indexStatus: record.indexStatus,
		worktreeStatus: record.worktreeStatus,
		...(record.previousPath ? { previousPath: record.previousPath } : {}),
	}));
	if (overflow) {
		return {
			quality: "incomplete",
			reason: "incomplete-source",
			repository: true,
			root,
			head,
			branch,
			dirty: true,
			complete: false,
			changes,
		};
	}

	const identityEntries: string[] = [];
	for (const record of boundedRecords) {
		const content = record.worktreeStatus !== "." ? contentIdentity(root, record.path) : undefined;
		if (record.worktreeStatus !== "." && content === undefined) {
			return gitFailure(true, "read-error", "unavailable", root);
		}
		identityEntries.push(JSON.stringify([
			record.recordType,
			record.identityFields,
			record.path,
			record.previousPath ?? "",
			content ?? "",
		]));
	}
	const identityPayload = ["git-v1", head, branch, ...identityEntries].join("\n");
	const stateRef = `git-v1:sha256:${createHash("sha256").update(identityPayload).digest("hex")}`;
	return {
		quality: "current",
		reason: "not-found",
		repository: true,
		root,
		head,
		branch,
		dirty: parsed.records.length > 0,
		complete: true,
		changes,
		stateRef,
	};
}
