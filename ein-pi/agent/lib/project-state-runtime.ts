// =============================================================================
// PROJECT RUNTIME STATE
// Normalizes bounded, public runtime metadata without exposing session,
// transcript, command, or filesystem details.
// =============================================================================

import type {
	ProjectRuntimeAvailability,
	ProjectRuntimeError,
	ProjectRuntimeMetadata,
	ProjectRuntimeProvider,
	ProjectRuntimeState,
	ProjectStateQuality,
	ProjectStateReasonCode,
} from "./project-state-contract.ts";

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
	for (const error of normalized) unique.set(JSON.stringify(error), error);
	return [...unique.values()].sort((left, right) => {
		const leftKey = JSON.stringify(left);
		const rightKey = JSON.stringify(right);
		return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
	});
}

export function projectRuntimeState(
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
