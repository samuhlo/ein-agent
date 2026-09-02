// =============================================================================
// RUNTIME SESSION METADATA
// Projects transient adapter results into bounded ProjectState runtime metadata
// without persistence, filesystem access, or runtime-private diagnostics.
// =============================================================================

import type {
	ProjectRuntimeMetadata,
	ProjectStateReasonCode,
} from "./project-state.ts";
import { isRecord, validateOpaqueReference } from "./runtime-session-identity.ts";
import type {
	AdapterErrorCode,
	AdapterOutcome,
	AdapterResult,
	RuntimeOperation,
	RuntimeProvider,
} from "./runtime-session-adapters.ts";

const RUNTIME_METADATA_CAPABILITIES: Partial<Record<RuntimeOperation, string>> = {
	list: "session.list",
	create: "session.create",
	launch: "runtime.launch",
};
const MAX_RUNTIME_METADATA_REFERENCES = 20;

function adapterErrorReason(code: AdapterErrorCode | undefined): ProjectStateReasonCode {
	switch (code) {
		case "operation-not-supported":
			return "not-provided";
		case "session-source-unavailable":
		case "scan-limit-exceeded":
			return "read-error";
		case "runtime-unavailable":
		case "executable-unavailable":
		case "spawn-failed":
		case "process-exit":
		case "process-signalled":
			return "command-error";
		case "project-mismatch":
		case "provider-mismatch":
			return "state-mismatch";
		case "reference-not-found":
			return "not-found";
		case "reference-ambiguous":
			return "ambiguous-selection";
		case "invalid-request":
		case "unsupported-state-version":
		case "project-identity-unavailable":
		case "state-ref-unavailable":
		case "reference-invalid":
		default:
			return "invalid-source";
	}
}

function publicRuntimeReferences(
	provider: RuntimeProvider,
	data: unknown,
): string[] {
	if (!Array.isArray(data)) return [];
	const references: string[] = [];
	const seen = new Set<string>();
	for (const item of data) {
		if (references.length >= MAX_RUNTIME_METADATA_REFERENCES) break;
		if (!isRecord(item)) continue;
		const reference = item.reference;
		if (!validateOpaqueReference(provider, reference) || seen.has(reference)) continue;
		seen.add(reference);
		references.push(reference);
	}
	return references;
}

type AdapterFailureOutcome = Exclude<AdapterOutcome, "success">;

function failureRuntimeMetadata(
	outcome: AdapterFailureOutcome,
	code: AdapterErrorCode | undefined,
): ProjectRuntimeMetadata {
	if (outcome === "cancelled") return { availability: "unavailable" };
	const reason: ProjectStateReasonCode =
		outcome === "unsupported" ? "not-provided" : adapterErrorReason(code);
	return {
		availability: outcome === "unsupported" ? "not-provided" : "unavailable",
		reason,
		errors: [{ code: reason }],
	};
}

/** Translate one transient observation into existing ProjectState metadata. */
export function toProjectRuntimeMetadata(
	result: AdapterResult<unknown>,
): ProjectRuntimeMetadata {
	if (result.outcome === "success") {
		const capability = RUNTIME_METADATA_CAPABILITIES[result.operation];
		const metadata: ProjectRuntimeMetadata = {
			availability: "available",
			...(capability ? { capabilities: [capability] } : {}),
		};
		if (result.operation === "list") {
			metadata.references = publicRuntimeReferences(result.provider, result.data);
		}
		return metadata;
	}

	return failureRuntimeMetadata(result.outcome, result.error?.code);
}
