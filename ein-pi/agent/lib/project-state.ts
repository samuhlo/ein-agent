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
import { listActiveChanges } from "./sdd-routing-core.ts";
import { resolveSddNext, resolveSddStatus } from "./sdd-routing-runtime.ts";
import { einMdPath, readEinMd } from "./project-context.ts";

export const PROJECT_STATE_SCHEMA_VERSION = 1 as const;

export type ProjectStateQuality =
	| "current"
	| "absent"
	| "incomplete"
	| "ambiguous"
	| "legacy"
	| "stale"
	| "unbound"
	| "unavailable";

export type ProjectStateReasonCode =
	| "not-inspected"
	| "not-provided"
	| "not-found"
	| "not-a-repository"
	| "incomplete-source"
	| "ambiguous-selection"
	| "legacy-source"
	| "stale-source"
	| "invalid-source"
	| "state-mismatch"
	| "read-error"
	| "command-error"
	| "parse-error"
	| "read-success";

export type ProjectStateSource = {
	quality: ProjectStateQuality;
	reason: ProjectStateReasonCode;
	detail?: string;
};

export type ProjectStatePhase =
	| "scope"
	| "map"
	| "design"
	| "tasks"
	| "apply"
	| "verify"
	| "close";

export type ProjectStateNext = ProjectStatePhase | "done";

export type ProjectStateProvenance = "canonical" | "legacy" | "mixed" | "none";

export type ProjectStateArtifact = {
	phase: ProjectStatePhase;
	file: string;
	present: boolean;
};

export type ProjectOpenSpecState = ProjectStateSource & {
	activeChanges: readonly string[];
	selection: "none" | "selected" | "ambiguous";
	selectedChange?: string;
	phase?: ProjectStatePhase;
	next?: ProjectStateNext;
	provenance: ProjectStateProvenance;
	artifacts: readonly ProjectStateArtifact[];
	blockers: readonly string[];
	verify: ProjectVerificationOutcome;
	verifyStale: boolean;
};

export type ProjectEinBoundary = {
	present: boolean;
	complete: boolean;
};

export type ProjectEinState = ProjectStateSource & {
	path: string;
	revision?: string;
	curated: ProjectEinBoundary;
	auto: {
	present: boolean;
	};
};

export type ProjectGitChangeKind =
	| "added"
	| "copied"
	| "deleted"
	| "modified"
	| "renamed"
	| "type-changed"
	| "unmerged"
	| "unknown";

export type ProjectGitStatusCode = "." | "M" | "A" | "D" | "R" | "C" | "T" | "U" | "?";

export type ProjectGitChange = {
	path: string;
	kind: ProjectGitChangeKind;
	indexStatus: ProjectGitStatusCode;
	worktreeStatus: ProjectGitStatusCode;
	previousPath?: string;
};

export type ProjectGitState = ProjectStateSource & {
	repository: boolean | null;
	root?: string;
	head?: string;
	branch?: string;
	dirty: boolean | null;
	complete: boolean;
	changes: readonly ProjectGitChange[];
	stateRef?: string;
};

export type ProjectVerificationOutcome = "pass" | "fail" | "unknown" | "absent";

export type ProjectVerificationFreshness =
	| "current"
	| "stale"
	| "unbound"
	| "unavailable"
	| "invalid";

export type ProjectVerificationState = ProjectStateSource & {
	reportedOutcome: ProjectVerificationOutcome;
	effectiveOutcome: ProjectVerificationOutcome;
	freshness: ProjectVerificationFreshness;
	currentStateRef?: string;
	observedStateRef?: string;
};

export type ProjectRuntimeProvider = "pi" | "claude";
export type ProjectRuntimeAvailability = "available" | "unavailable" | "not-provided";

export type ProjectRuntimeError = {
	code: ProjectStateReasonCode;
	detail?: string;
};

export type ProjectRuntimeMetadata = {
	availability?: ProjectRuntimeAvailability;
	quality?: ProjectStateQuality;
	reason?: ProjectStateReasonCode;
	capabilities?: readonly string[];
	references?: readonly string[];
	errors?: readonly ProjectRuntimeError[];
};

export type ProjectRuntimeInput = Partial<
	Record<ProjectRuntimeProvider, ProjectRuntimeMetadata>
>;

export type ProjectRuntimeState = ProjectStateSource & {
	provider: ProjectRuntimeProvider;
	availability: ProjectRuntimeAvailability;
	capabilities: readonly string[];
	references: readonly string[];
	errors: readonly ProjectRuntimeError[];
};

export type ProjectIdentity = ProjectStateSource & {
	cwd: string;
	repositoryRoot?: string;
};

export type ProjectStateV1 = {
	schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION;
	identity: ProjectIdentity;
	openspec: ProjectOpenSpecState;
	ein: ProjectEinState;
	git: ProjectGitState;
	verification: ProjectVerificationState;
	runtimes: Record<ProjectRuntimeProvider, ProjectRuntimeState>;
};

export type ProjectStateRequest = {
	cwd: string;
	selectedChange?: string;
	runtime?: ProjectRuntimeInput;
};

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

function defaultRuntime(provider: ProjectRuntimeProvider): ProjectRuntimeState {
	return {
		provider,
		availability: "not-provided",
		quality: "absent",
		reason: "not-provided",
		capabilities: [],
		references: [],
		errors: [],
	};
}

const RUNTIME_AVAILABILITIES = [
	"available",
	"unavailable",
	"not-provided",
] as const satisfies readonly ProjectRuntimeAvailability[];
const RUNTIME_QUALITIES = [
	"current",
	"absent",
	"incomplete",
	"ambiguous",
	"legacy",
	"stale",
	"unbound",
	"unavailable",
] as const satisfies readonly ProjectStateQuality[];
const RUNTIME_REASON_CODES = [
	"not-inspected",
	"not-provided",
	"not-found",
	"not-a-repository",
	"incomplete-source",
	"ambiguous-selection",
	"legacy-source",
	"stale-source",
	"invalid-source",
	"state-mismatch",
	"read-error",
	"command-error",
	"parse-error",
	"read-success",
] as const satisfies readonly ProjectStateReasonCode[];
const RUNTIME_PUBLIC_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RUNTIME_PRIVATE_WORD = /(?:prompt|transcript|message|command)/i;

function runtimeAvailability(value: unknown): ProjectRuntimeAvailability | undefined {
	return typeof value === "string" && RUNTIME_AVAILABILITIES.includes(value as ProjectRuntimeAvailability)
		? (value as ProjectRuntimeAvailability)
		: undefined;
}

function runtimeQuality(value: unknown): ProjectStateQuality | undefined {
	return typeof value === "string" && RUNTIME_QUALITIES.includes(value as ProjectStateQuality)
		? (value as ProjectStateQuality)
		: undefined;
}

function runtimeReason(value: unknown): ProjectStateReasonCode | undefined {
	return typeof value === "string" && RUNTIME_REASON_CODES.includes(value as ProjectStateReasonCode)
		? (value as ProjectStateReasonCode)
		: undefined;
}

function normalizeRuntimeTokens(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	const normalized = values.flatMap((value) => {
		if (typeof value !== "string") return [];
		const token = value.trim();
		if (!RUNTIME_PUBLIC_TOKEN.test(token) || RUNTIME_PRIVATE_WORD.test(token)) return [];
		return [token];
	});
	return [...new Set(normalized)].sort((left, right) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
}

function normalizeRuntimeDetail(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const detail = value.trim();
	if (
		!detail ||
		detail.length > 256 ||
		/[\\/\0\r\n]/.test(detail) ||
		RUNTIME_PRIVATE_WORD.test(detail)
	) {
		return undefined;
	}
	return detail;
}

function normalizeRuntimeErrors(values: unknown): ProjectRuntimeError[] {
	if (!Array.isArray(values)) return [];
	const normalized = values.flatMap((value) => {
		if (value === null || typeof value !== "object") return [];
		const error = value as Record<string, unknown>;
		const code = runtimeReason(error.code);
		if (!code) return [];
		const detail = normalizeRuntimeDetail(error.detail);
		return [{ code, ...(detail ? { detail } : {}) }];
	});
	const unique = new Map<string, ProjectRuntimeError>();
	for (const error of normalized) {
		unique.set(JSON.stringify(error), error);
	}
	return [...unique.values()].sort((left, right) => {
		const leftKey = JSON.stringify(left);
		const rightKey = JSON.stringify(right);
		return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
	});
}

function projectRuntime(
	provider: ProjectRuntimeProvider,
	metadata: ProjectRuntimeMetadata | undefined,
): ProjectRuntimeState {
	const fallback = defaultRuntime(provider);
	if (!metadata) return fallback;
	const availability = runtimeAvailability(metadata.availability);
	const quality = runtimeQuality(metadata.quality);
	const reason = runtimeReason(metadata.reason);
	return {
		...fallback,
		...(availability ? { availability } : {}),
		...(quality ? { quality } : {}),
		...(reason ? { reason } : {}),
		capabilities: normalizeRuntimeTokens(metadata.capabilities),
		references: normalizeRuntimeTokens(metadata.references),
		errors: normalizeRuntimeErrors(metadata.errors),
	};
}

function uniqueBlockers(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function openSpecProvenance(specState: string): ProjectStateProvenance {
	return specState === "legacy" ? "legacy" : "canonical";
}

function openSpecQuality(specState: string): Pick<ProjectStateSource, "quality" | "reason"> {
	if (specState === "legacy") return { quality: "legacy", reason: "legacy-source" };
	if (["pending", "unresolved", "conflict"].includes(specState)) {
		return { quality: "incomplete", reason: "incomplete-source" };
	}
	return { quality: "current", reason: "read-success" };
}

function emptyOpenSpecState(activeChanges: readonly string[] = [], done = true): ProjectOpenSpecState {
	return {
		quality: activeChanges.length === 0 ? "absent" : "unavailable",
		reason: "not-found",
		activeChanges,
		selection: "none",
		provenance: "none",
		artifacts: [],
		blockers: [],
		...(done ? { next: "done" as const } : {}),
		verify: "absent",
		verifyStale: false,
	};
}

type OpenSpecChangesRoot =
	| { kind: "absent" }
	| { kind: "ready" }
	| { kind: "unavailable"; reason: "invalid-source" | "read-error" };

function inspectOpenSpecChangesRoot(cwd: string): OpenSpecChangesRoot {
	const canonical = join(cwd, "openspec", "changes");
	const legacy = join(cwd, ".sdd", "changes");
	const root = existsSync(canonical) ? canonical : existsSync(legacy) ? legacy : undefined;
	if (!root) return { kind: "absent" };
	try {
		if (!lstatSync(root).isDirectory()) return { kind: "unavailable", reason: "invalid-source" };
		readdirSync(root);
		return { kind: "ready" };
	} catch {
		return { kind: "unavailable", reason: "read-error" };
	}
}

function unavailableOpenSpecState(reason: "invalid-source" | "read-error"): ProjectOpenSpecState {
	return {
		...emptyOpenSpecState([], false),
		quality: "unavailable",
		reason,
	};
}

function projectOpenSpecState(cwd: string, selectedChange?: string): ProjectOpenSpecState {
	const root = inspectOpenSpecChangesRoot(cwd);
	if (root.kind === "unavailable") return unavailableOpenSpecState(root.reason);
	const activeChanges = listActiveChanges(cwd);
	if (activeChanges.length === 0) return emptyOpenSpecState();

	const hasExplicitSelection = typeof selectedChange === "string";
	const target = hasExplicitSelection
		? activeChanges.includes(selectedChange!)
			? selectedChange
			: undefined
		: activeChanges.length === 1
			? activeChanges[0]
			: undefined;

	if (!target) {
		if (!hasExplicitSelection && activeChanges.length > 1) {
			return {
				...emptyOpenSpecState(activeChanges, false),
				quality: "ambiguous",
				reason: "ambiguous-selection",
				selection: "ambiguous",
			};
		}
		return {
			...emptyOpenSpecState(activeChanges),
			quality: "unavailable",
			reason: "not-found",
		};
	}

	const status = resolveSddStatus(cwd, target);
	const next = resolveSddNext(cwd, target);
	const specState = String(status.specState);
	const artifacts = [...status.artifacts.present, ...status.artifacts.missing];
	const blockers = uniqueBlockers([
		...status.blocked,
		...status.tasks.problems,
		...status.budget.problems,
		...next.blocked,
	]);
	return {
		...openSpecQuality(specState),
		activeChanges,
		selection: "selected",
		selectedChange: target,
		...(status.currentPhase === "done" ? {} : { phase: status.currentPhase }),
		next: next.nextRecommended,
		provenance: openSpecProvenance(specState),
		artifacts,
		blockers,
		verify: status.verify,
		verifyStale: status.verifyStale,
	};
}

function curatedBoundary(content: string): ProjectEinBoundary {
	const autoStart = content.indexOf("<!-- ein:auto:start") ;
	const curated = content.slice(0, autoStart >= 0 ? autoStart : content.length);
	const meaningful = curated
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => !/^<!--.*-->$/.test(line))
		.filter((line) => !/^#+\s+/.test(line))
		.filter((line) => !/^_\((?:pendiente|pending|describe)\)_$/i.test(line));
	return { present: meaningful.length > 0 || /(?:^|\n)#{2,}\s+/.test(curated), complete: meaningful.length > 0 };
}

function projectEinState(cwd: string): ProjectEinState {
	const path = einMdPath(cwd);
	if (!existsSync(path)) {
		return {
			path,
			quality: "absent",
			reason: "not-found",
			curated: { present: false, complete: false },
			auto: { present: false },
		};
	}

	const info = readEinMd(cwd);
	if (!info.exists) {
		return {
			path,
			quality: "unavailable",
			reason: "read-error",
			curated: { present: false, complete: false },
			auto: { present: false },
		};
	}

	const autoStart = info.content.indexOf("<!-- ein:auto:start");
	const autoEnd = info.content.indexOf("<!-- ein:auto:end -->");
	const autoPresent = autoStart >= 0 && autoEnd > autoStart;
	const autoMarkerIncomplete = (autoStart >= 0) !== (autoEnd >= 0) || (autoStart >= 0 && autoEnd < autoStart);
	const curated = curatedBoundary(info.content);
	return {
		path,
		...(curated.complete && !autoMarkerIncomplete
			? { quality: "current" as const, reason: "read-success" as const }
			: { quality: "incomplete" as const, reason: "incomplete-source" as const }),
		...(info.rev ? { revision: info.rev } : {}),
		curated,
		auto: { present: autoPresent },
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
	const openspec = projectOpenSpecState(physicalCwd, selectedChange);
	return {
		schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
		identity: {
			cwd: physicalCwd,
			quality: git.quality,
			reason: git.reason,
			...(git.root ? { repositoryRoot: git.root } : {}),
		},
		openspec,
		ein: projectEinState(physicalCwd),
		git,
		verification: projectVerificationState(physicalCwd, openspec, git),
		runtimes: {
			pi: projectRuntime("pi", runtime?.pi),
			claude: projectRuntime("claude", runtime?.claude),
		},
	};
}
