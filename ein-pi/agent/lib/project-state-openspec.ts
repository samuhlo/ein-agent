// =============================================================================
// PROJECT OPENSPEC STATE
// Reads the active change selection and projects the deterministic SDD router
// into the versioned project-state contract.
// =============================================================================

import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
	ProjectOpenSpecState,
	ProjectStateProvenance,
	ProjectStateSource,
} from "./project-state-contract.ts";
import { listActiveChanges } from "./sdd-routing-core.ts";
import { resolveSddNext, resolveSddStatus } from "./sdd-routing-runtime.ts";

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

function emptyOpenSpecState(
	activeChanges: readonly string[] = [],
	done = true,
): ProjectOpenSpecState {
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

function unavailableOpenSpecState(
	reason: "invalid-source" | "read-error",
): ProjectOpenSpecState {
	return {
		...emptyOpenSpecState([], false),
		quality: "unavailable",
		reason,
	};
}

export function readProjectOpenSpecState(
	cwd: string,
	selectedChange?: string,
): ProjectOpenSpecState {
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
