// =============================================================================
// [CORE] SDD SESSION BINDING
// Versioned, fail-closed contracts shared by session persistence, events, and
// one-shot launch metadata. This module performs no I/O and owns no state.
// =============================================================================

import { isSafeChangeName } from "./sdd-routing-core.ts";

export const SDD_SESSION_BINDING_CUSTOM_TYPE = "ein:sdd-session-binding";
export const SDD_SESSION_BINDING_EVENT_CHANNEL = "ein:sdd-session-binding:v1";
export const EIN_SDD_SESSION_BINDING_ENV_KEY = "EIN_SDD_SESSION_BINDING_V1";

export type SessionBinding =
	| { kind: "unbound" }
	| { kind: "bound"; change: string };

export type SessionBindingEntryV1 =
	| { version: 1; state: "bound"; change: string }
	| { version: 1; state: "unbound" };

export type SessionBindingEventV1 =
	| { version: 1; action: "bind"; change: string }
	| { version: 1; action: "invalidate"; change: string }
	| { version: 1; action: "clear" };

export type SessionBindingLaunchMetadataV1 = {
	version: 1;
	change: string;
	projectCwd: string;
};

export type SessionBindingValidation = {
	change: string;
	active: boolean;
};

export type SessionBindingTransition = {
	source: "entry" | "invalid-entry" | "launch-intent" | "no-entry" | "revalidation";
	binding: SessionBinding;
	persist: SessionBindingEntryV1 | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, expected: readonly string[]): value is UnknownRecord {
	if (!isRecord(value)) return false;
	const actual = Object.keys(value);
	return actual.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function parseSessionBindingEntryV1(value: unknown): SessionBindingEntryV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	if (value.state === "unbound" && isExactRecord(value, ["version", "state"])) {
		return { version: 1, state: "unbound" };
	}
	if (value.state === "bound" && isExactRecord(value, ["version", "state", "change"]) && isSafeChangeName(value.change)) {
		return { version: 1, state: "bound", change: value.change };
	}
	return null;
}

export function parseSessionBindingEventV1(value: unknown): SessionBindingEventV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	if (value.action === "clear" && isExactRecord(value, ["version", "action"])) {
		return { version: 1, action: "clear" };
	}
	if (
		(value.action === "bind" || value.action === "invalidate")
		&& isExactRecord(value, ["version", "action", "change"])
		&& isSafeChangeName(value.change)
	) {
		return { version: 1, action: value.action, change: value.change };
	}
	return null;
}

export function parseSessionBindingLaunchMetadataV1(source: string): SessionBindingLaunchMetadataV1 | null {
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch {
		return null;
	}
	if (
		!isExactRecord(value, ["version", "change", "projectCwd"])
		|| value.version !== 1
		|| !isSafeChangeName(value.change)
		|| typeof value.projectCwd !== "string"
		|| value.projectCwd.length === 0
	) {
		return null;
	}
	return { version: 1, change: value.change, projectCwd: value.projectCwd };
}

function isMatchingCustomEntry(value: unknown): value is UnknownRecord {
	return isRecord(value)
		&& value.type === "custom"
		&& value.customType === SDD_SESSION_BINDING_CUSTOM_TYPE;
}

function isActiveValidationFor(validation: SessionBindingValidation | null | undefined, change: string): boolean {
	return isSafeChangeName(change) && validation?.active === true && validation.change === change;
}

function unboundTransition(
	source: "entry" | "invalid-entry" | "no-entry" | "revalidation",
	persistClear = false,
): SessionBindingTransition {
	return {
		source,
		binding: { kind: "unbound" },
		persist: persistClear ? { version: 1, state: "unbound" } : null,
	};
}

export function restoreSessionBinding(input: {
	entries: readonly unknown[];
	validation?: SessionBindingValidation | null;
	launchIntent?: SessionBindingLaunchMetadataV1 | null;
}): SessionBindingTransition {
	let newest: UnknownRecord | undefined;
	for (let index = input.entries.length - 1; index >= 0; index -= 1) {
		const entry = input.entries[index];
		if (isMatchingCustomEntry(entry)) {
			newest = entry;
			break;
		}
	}

	if (newest) {
		const parsed = parseSessionBindingEntryV1(newest.data);
		if (!parsed || (parsed.state === "bound" && !isActiveValidationFor(input.validation, parsed.change))) {
			return unboundTransition("invalid-entry", true);
		}
		return parsed.state === "bound"
			? { source: "entry", binding: { kind: "bound", change: parsed.change }, persist: null }
			: unboundTransition("entry");
	}

	const intent = input.launchIntent;
	if (intent && isActiveValidationFor(input.validation, intent.change)) {
		return {
			source: "launch-intent",
			binding: { kind: "bound", change: intent.change },
			persist: { version: 1, state: "bound", change: intent.change },
		};
	}
	return unboundTransition("no-entry");
}

export function revalidateSessionBinding(
	binding: SessionBinding,
	validation?: SessionBindingValidation | null,
): SessionBindingTransition {
	if (binding.kind === "unbound") {
		return unboundTransition("revalidation");
	}
	if (isActiveValidationFor(validation, binding.change)) {
		return { source: "revalidation", binding, persist: null };
	}
	return unboundTransition("revalidation", true);
}

export function serializeSessionBindingEntryV1(value: SessionBindingEntryV1): string {
	return value.state === "bound"
		? JSON.stringify({ version: 1, state: "bound", change: value.change })
		: JSON.stringify({ version: 1, state: "unbound" });
}

export function serializeSessionBindingEventV1(value: SessionBindingEventV1): string {
	return value.action === "clear"
		? JSON.stringify({ version: 1, action: "clear" })
		: JSON.stringify({ version: 1, action: value.action, change: value.change });
}

export function serializeSessionBindingLaunchMetadataV1(value: SessionBindingLaunchMetadataV1): string {
	return JSON.stringify({ version: 1, change: value.change, projectCwd: value.projectCwd });
}
