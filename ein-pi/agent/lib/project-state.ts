import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { readProjectEinState } from "./project-state-ein.ts";
import { readProjectOpenSpecState } from "./project-state-openspec.ts";
import { projectRuntimeState } from "./project-state-runtime.ts";
import {
	PROJECT_STATE_SCHEMA_VERSION,
	type ProjectEinBoundary,
	type ProjectEinState,
	type ProjectGitChange,
	type ProjectGitChangeKind,
	type ProjectGitState,
	type ProjectGitStatusCode,
	type ProjectOpenSpecState,
	type ProjectRuntimeAvailability,
	type ProjectRuntimeError,
	type ProjectRuntimeMetadata,
	type ProjectRuntimeProvider,
	type ProjectRuntimeState,
	type ProjectStateProvenance,
	type ProjectStateQuality,
	type ProjectStateReasonCode,
	type ProjectStateRequest,
	type ProjectStateSource,
	type ProjectStateV1,
	type ProjectVerificationState,
} from "./project-state-contract.ts";

export * from "./project-state-contract.ts";

const NOT_INSPECTED_SOURCE = {
	quality: "unavailable",
	reason: "not-inspected",
} satisfies ProjectStateSource;

const GIT_MAX_CHANGES = 256;
const GIT_MAX_OUTPUT_BYTES = 1_048_576;
const HEX_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const STATUS_CHARS = new Set<string>([".", "M", "A", "D", "R", "C", "T", "U"]);

type GitCommandResult =
	| { ok: true; output: string }
	| { ok: false };

type ParsedGitStatus = {
	recordType: "1" | "2" | "u" | "?";
	path: string;
	previousPath?: string;
	kind: ProjectGitChangeKind;
	indexStatus: ProjectGitStatusCode;
	worktreeStatus: ProjectGitStatusCode;
	identityFields: readonly string[];
};

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

function output(result: GitCommandResult): string | undefined {
	return result.ok ? result.output : undefined;
}

function singleLine(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.includes("\n") || trimmed.includes("\r")) return undefined;
	return trimmed;
}

function isObjectId(value: string): boolean {
	return HEX_OBJECT_ID.test(value);
}

function safeRelativePath(root: string, candidate: string): string | undefined {
	if (!candidate || candidate.includes("\0") || isAbsolute(candidate)) return undefined;
	const absolute = resolve(root, candidate);
	const outside = relative(root, absolute);
	if (!outside || outside === ".." || outside.startsWith("../") || isAbsolute(outside)) {
		return undefined;
	}
	return candidate;
}

function splitStatusPrefix(record: string, tokenCount: number): string[] | undefined {
	const tokens: string[] = [];
	let cursor = 0;
	for (let index = 0; index < tokenCount; index += 1) {
		const separator = record.indexOf(" ", cursor);
		if (separator <= cursor) return undefined;
		tokens.push(record.slice(cursor, separator));
		cursor = separator + 1;
	}
	const path = record.slice(cursor);
	if (!path) return undefined;
	return [...tokens, path];
}

type ParsedStatusPair = {
	raw: string;
	indexStatus: ProjectGitStatusCode;
	worktreeStatus: ProjectGitStatusCode;
};

function isGitStatusCode(value: string): value is ProjectGitStatusCode {
	return STATUS_CHARS.has(value);
}

function parseStatusPair(value: string | undefined): ParsedStatusPair | undefined {
	if (!value || value.length !== 2) return undefined;
	const indexStatus = value[0];
	const worktreeStatus = value[1];
	if (
		!indexStatus ||
		!worktreeStatus ||
		!isGitStatusCode(indexStatus) ||
		!isGitStatusCode(worktreeStatus)
	) {
		return undefined;
	}
	return { raw: value, indexStatus, worktreeStatus };
}

function statusKind(
	recordType: ParsedGitStatus["recordType"],
	pair: string,
	score?: string,
): ProjectGitChangeKind {
	if (recordType === "?") return "added";
	if (recordType === "u") return "unmerged";
	if (score?.startsWith("C")) return "copied";
	if (score?.startsWith("R")) return "renamed";
	if (pair.includes("R")) return "renamed";
	if (pair.includes("C")) return "copied";
	if (pair.includes("D")) return "deleted";
	if (pair.includes("T")) return "type-changed";
	if (pair.includes("A")) return "added";
	if (pair.includes("M")) return "modified";
	return "unknown";
}

function parseGitStatus(
	root: string,
	status: string,
): { records: ParsedGitStatus[]; malformed: boolean } {
	const records: ParsedGitStatus[] = [];
	const fields = status.split("\0");
	for (let index = 0; index < fields.length; index += 1) {
		const record = fields[index];
		if (!record) continue;
		const recordType = record[0];
		if (recordType === "1") {
			const tokens = splitStatusPrefix(record, 8);
			const type = tokens?.[0];
			const pair = parseStatusPair(tokens?.[1]);
			const firstObjectId = tokens?.[6];
			const secondObjectId = tokens?.[7];
			const pathToken = tokens?.[8];
			if (
				type !== "1" ||
				!pair ||
				tokens?.slice(2, 8).some((token) => !token) ||
				!firstObjectId ||
				!secondObjectId ||
				!isObjectId(firstObjectId) ||
				!isObjectId(secondObjectId) ||
				!pathToken
			) {
				return { records: [], malformed: true };
			}
			const path = safeRelativePath(root, pathToken);
			if (!path) return { records: [], malformed: true };
			records.push({
				recordType: "1",
				path,
				kind: statusKind("1", pair.raw),
				indexStatus: pair.indexStatus,
				worktreeStatus: pair.worktreeStatus,
				identityFields: tokens.slice(1, 8),
			});
			continue;
		}
		if (recordType === "2") {
			const tokens = splitStatusPrefix(record, 9);
			const type = tokens?.[0];
			const pair = parseStatusPair(tokens?.[1]);
			const firstObjectId = tokens?.[6];
			const secondObjectId = tokens?.[7];
			const score = tokens?.[8];
			const pathToken = tokens?.[9];
			if (
				type !== "2" ||
				!pair ||
				tokens?.slice(2, 8).some((token) => !token) ||
				!firstObjectId ||
				!secondObjectId ||
				!isObjectId(firstObjectId) ||
				!isObjectId(secondObjectId) ||
				!score ||
				!/^[RC][0-9]+$/.test(score) ||
				!pathToken
			) {
				return { records: [], malformed: true };
			}
			index += 1;
			const previousPathToken = fields[index];
			const path = safeRelativePath(root, pathToken);
			const previousPath = safeRelativePath(root, previousPathToken ?? "");
			if (!path || !previousPath) return { records: [], malformed: true };
			records.push({
				recordType: "2",
				path,
				previousPath,
				kind: statusKind("2", pair.raw, score),
				indexStatus: pair.indexStatus,
				worktreeStatus: pair.worktreeStatus,
				identityFields: tokens.slice(1, 9),
			});
			continue;
		}
		if (recordType === "u") {
			const tokens = splitStatusPrefix(record, 10);
			const type = tokens?.[0];
			const pair = parseStatusPair(tokens?.[1]);
			const objectIds = [tokens?.[7], tokens?.[8], tokens?.[9]];
			const pathToken = tokens?.[10];
			if (
				type !== "u" ||
				!pair ||
				tokens?.slice(2, 10).some((token) => !token) ||
				objectIds.some((objectId) => !objectId || !isObjectId(objectId)) ||
				!pathToken
			) {
				return { records: [], malformed: true };
			}
			const path = safeRelativePath(root, pathToken);
			if (!path) return { records: [], malformed: true };
			records.push({
				recordType: "u",
				path,
				kind: "unmerged",
				indexStatus: pair.indexStatus,
				worktreeStatus: pair.worktreeStatus,
				identityFields: tokens.slice(1, 10),
			});
			continue;
		}
		if (recordType === "?") {
			const tokens = splitStatusPrefix(record, 1);
			const type = tokens?.[0];
			const pathToken = tokens?.[1];
			const path = pathToken ? safeRelativePath(root, pathToken) : undefined;
			if (type !== "?" || !path) {
				return { records: [], malformed: true };
			}
			records.push({
				recordType: "?",
				path,
				kind: "added",
				indexStatus: "?",
				worktreeStatus: "?",
				identityFields: ["?"],
			});
			continue;
		}
		return { records: [], malformed: true };
	}
	return { records, malformed: false };
}

function compareGitPath(left: ParsedGitStatus, right: ParsedGitStatus): number {
	const pathOrder = Buffer.from(left.path).compare(Buffer.from(right.path));
	if (pathOrder !== 0) return pathOrder;
	return Buffer.from(left.previousPath ?? "").compare(Buffer.from(right.previousPath ?? ""));
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

function gitFailure(
	repository: boolean | null,
	reason: ProjectStateReasonCode,
	quality: ProjectStateQuality,
	root?: string,
): ProjectGitState {
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

function readGitState(cwd: string): ProjectGitState {
	if (!runGit(cwd, ["--version"]).ok) {
		return gitFailure(null, "command-error", "unavailable");
	}
	const insideOutput = output(runGit(cwd, ["rev-parse", "--is-inside-work-tree"]));
	if (insideOutput === undefined) {
		return gitFailure(false, "not-a-repository", "absent");
	}
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
		if (!headValue || !isObjectId(headValue)) return gitFailure(true, "parse-error", "incomplete", root);
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
	const parsed = parseGitStatus(root, statusOutput);
	if (parsed.malformed) return gitFailure(true, "parse-error", "incomplete", root);
	parsed.records.sort(compareGitPath);
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
		identityEntries.push(
			JSON.stringify([
				record.recordType,
				record.identityFields,
				record.path,
				record.previousPath ?? "",
				content ?? "",
			]),
		);
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

const PROJECT_STATE_GIT_REF = /^git-v1:sha256:[0-9a-f]{64}$/;

type VerificationBinding =
	| { kind: "missing" }
	| { kind: "invalid" }
	| { kind: "valid"; stateRef: string };

function verificationReportPath(cwd: string, openSpec: ProjectOpenSpecState): string | undefined {
	if (!openSpec.selectedChange) return undefined;
	const changesRoot = openSpec.provenance === "legacy" ? ".sdd" : "openspec";
	return join(cwd, changesRoot, "changes", openSpec.selectedChange, "verify-report.md");
}

function parseVerificationBinding(content: string): VerificationBinding {
	const lines = content
		.split(/\r?\n/)
		.filter((line) => /^\s*project_state_git_ref\s*:/i.test(line));
	if (lines.length === 0) return { kind: "missing" };
	if (lines.length !== 1) return { kind: "invalid" };
	const value = lines[0]?.match(/^\s*project_state_git_ref\s*:\s*(.*?)\s*$/i)?.[1]?.trim();
	if (!value || !PROJECT_STATE_GIT_REF.test(value)) return { kind: "invalid" };
	return { kind: "valid", stateRef: value };
}

function projectVerificationState(
	cwd: string,
	openspec: ProjectOpenSpecState,
	git: ProjectGitState,
): ProjectVerificationState {
	const reportPath = verificationReportPath(cwd, openspec);
	const currentStateRef = git.repository === true && git.complete && git.stateRef ? git.stateRef : undefined;
	const reportedOutcome = openspec.verify;
	const currentReference = currentStateRef ? { currentStateRef } : {};

	if (!reportPath || !existsSync(reportPath)) {
		const quality = openspec.selection === "ambiguous" ? "ambiguous" : "absent";
		const reason = openspec.selection === "ambiguous" ? "ambiguous-selection" : "not-found";
		return {
			quality,
			reason,
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "absent" ? "absent" : "unknown",
			freshness: "unavailable",
			...currentReference,
		};
	}

	let content: string;
	try {
		content = readFileSync(reportPath, "utf8");
	} catch {
		return {
			quality: "unavailable",
			reason: "read-error",
			reportedOutcome,
			effectiveOutcome: "unknown",
			freshness: "unavailable",
			...currentReference,
		};
	}

	if (!currentStateRef) {
		return {
			quality: "unavailable",
			reason: git.reason,
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "fail" ? "fail" : "unknown",
			freshness: "unavailable",
			...currentReference,
		};
	}

	const binding = parseVerificationBinding(content);
	if (binding.kind === "missing") {
		const malformed = reportedOutcome === "unknown";
		return {
			quality: malformed ? "incomplete" : "unbound",
			reason: malformed ? "invalid-source" : "legacy-source",
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "fail" ? "fail" : "unknown",
			freshness: malformed ? "invalid" : "unbound",
			...currentReference,
		};
	}
	if (binding.kind === "invalid") {
		return {
			quality: "incomplete",
			reason: "invalid-source",
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "fail" ? "fail" : "unknown",
			freshness: "invalid",
			...currentReference,
		};
	}

	const observedStateRef = binding.stateRef;
	const references = { ...currentReference, observedStateRef };
	if (observedStateRef !== currentStateRef) {
		return {
			quality: "stale",
			reason: "state-mismatch",
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "fail" ? "fail" : "unknown",
			freshness: "stale",
			...references,
		};
	}
	if (reportedOutcome !== "pass") {
		return {
			quality: "incomplete",
			reason: "invalid-source",
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "fail" ? "fail" : "unknown",
			freshness: "invalid",
			...references,
		};
	}
	if (openspec.verifyStale) {
		return {
			quality: "stale",
			reason: "stale-source",
			reportedOutcome,
			effectiveOutcome: "pass",
			freshness: "stale",
			...references,
		};
	}
	return {
		quality: "current",
		reason: "read-success",
		reportedOutcome,
		effectiveOutcome: "pass",
		freshness: "current",
		...references,
	};
}

/**
 * [DATA] PROJECT GIT PROJECTION
 * ---------------------------------------------------------
 * B owns repository meaning; G receives only the bounded current authority.
 * Current changes are deliberately excluded because they are not a historical transition.
 */
export function projectGitStateForReviewedArea(state: ProjectStateV1): Readonly<{
	repository: boolean | null;
	complete: boolean;
	quality: ProjectStateQuality;
	stateRef?: string;
	dirty: boolean | null;
}> {
	return Object.freeze({
		repository: state.git.repository,
		complete: state.git.complete,
		quality: state.git.quality,
		...(state.git.stateRef ? { stateRef: state.git.stateRef } : {}),
		dirty: state.git.dirty,
	});
}

export const reviewedAreaGitInput = projectGitStateForReviewedArea;

export function projectProjectState({ cwd, selectedChange, runtime }: ProjectStateRequest): ProjectStateV1 {
	let physicalCwd: string;
	try {
		physicalCwd = realpathSync(cwd);
	} catch {
		physicalCwd = resolve(cwd);
	}
	const git = readGitState(physicalCwd);
	const openspec = readProjectOpenSpecState(physicalCwd, selectedChange);
	return {
		schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
		identity: {
			cwd: physicalCwd,
			quality: git.quality,
			reason: git.reason,
			...(git.root ? { repositoryRoot: git.root } : {}),
		},
		openspec,
		ein: readProjectEinState(physicalCwd),
		git,
		verification: projectVerificationState(physicalCwd, openspec, git),
		runtimes: {
			pi: projectRuntimeState("pi", runtime?.pi),
			claude: projectRuntimeState("claude", runtime?.claude),
		},
	};
}
