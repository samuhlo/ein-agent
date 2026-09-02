// =============================================================================
// PROJECT GIT STATUS
// Parses porcelain-v2 records into bounded project-state facts without
// executing Git or reading working-tree content.
// =============================================================================

import { isAbsolute, relative, resolve } from "node:path";
import type {
	ProjectGitChangeKind,
	ProjectGitStatusCode,
} from "./project-state-contract.ts";

const HEX_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const STATUS_CHARS = new Set<string>([".", "M", "A", "D", "R", "C", "T", "U"]);

export type ParsedProjectGitStatus = {
	recordType: "1" | "2" | "u" | "?";
	path: string;
	previousPath?: string;
	kind: ProjectGitChangeKind;
	indexStatus: ProjectGitStatusCode;
	worktreeStatus: ProjectGitStatusCode;
	identityFields: readonly string[];
};

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
	recordType: ParsedProjectGitStatus["recordType"],
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

export function parseProjectGitStatus(
	root: string,
	status: string,
): { records: ParsedProjectGitStatus[]; malformed: boolean } {
	const records: ParsedProjectGitStatus[] = [];
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
			if (type !== "?" || !path) return { records: [], malformed: true };
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

export function compareProjectGitPath(
	left: ParsedProjectGitStatus,
	right: ParsedProjectGitStatus,
): number {
	const pathOrder = Buffer.from(left.path).compare(Buffer.from(right.path));
	if (pathOrder !== 0) return pathOrder;
	return Buffer.from(left.previousPath ?? "").compare(Buffer.from(right.previousPath ?? ""));
}
