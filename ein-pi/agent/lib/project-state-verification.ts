// =============================================================================
// PROJECT VERIFICATION STATE
// Binds a verification report to the exact Git state it observed and fails
// closed when either source is absent, stale, unreadable, or malformed.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ProjectGitState,
	ProjectOpenSpecState,
	ProjectVerificationState,
} from "./project-state-contract.ts";

const PROJECT_STATE_GIT_REF = /^git-v1:sha256:[0-9a-f]{64}$/;

type VerificationBinding =
	| { kind: "missing" }
	| { kind: "invalid" }
	| { kind: "valid"; stateRef: string };

function verificationReportPath(
	cwd: string,
	openSpec: ProjectOpenSpecState,
): string | undefined {
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

export function readProjectVerificationState(
	cwd: string,
	openspec: ProjectOpenSpecState,
	git: ProjectGitState,
): ProjectVerificationState {
	const reportPath = verificationReportPath(cwd, openspec);
	const currentStateRef =
		git.repository === true && git.complete && git.stateRef ? git.stateRef : undefined;
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
