import { describe, expect, test } from "bun:test";

import {
	EIN_SDD_SESSION_BINDING_ENV_KEY,
	SDD_SESSION_BINDING_CUSTOM_TYPE,
	SDD_SESSION_BINDING_EVENT_CHANNEL,
	parseSessionBindingEntryV1,
	parseSessionBindingEventV1,
	parseSessionBindingLaunchMetadataV1,
	restoreSessionBinding,
	revalidateSessionBinding,
	serializeSessionBindingEntryV1,
	serializeSessionBindingEventV1,
	serializeSessionBindingLaunchMetadataV1,
} from "../ein-pi/agent/lib/sdd-session-binding.ts";

const customEntry = (data: unknown) => ({
	type: "custom",
	customType: SDD_SESSION_BINDING_CUSTOM_TYPE,
	data,
});

describe("session binding V1 contract", () => {
	test("exports stable transport identifiers", () => {
		expect(SDD_SESSION_BINDING_CUSTOM_TYPE).toBe("ein:sdd-session-binding");
		expect(SDD_SESSION_BINDING_EVENT_CHANNEL).toBe("ein:sdd-session-binding:v1");
		expect(EIN_SDD_SESSION_BINDING_ENV_KEY).toBe("EIN_SDD_SESSION_BINDING_V1");
	});

	test("accepts only exact bound and unbound entry shapes", () => {
		expect(parseSessionBindingEntryV1({ version: 1, state: "bound", change: "bind-todo-to-session" })).toEqual({
			version: 1,
			state: "bound",
			change: "bind-todo-to-session",
		});
		expect(parseSessionBindingEntryV1({ version: 1, state: "unbound" })).toEqual({ version: 1, state: "unbound" });
		expect(parseSessionBindingEntryV1({ version: 1, state: "unbound", change: "stale" })).toBeNull();
		expect(parseSessionBindingEntryV1({ version: 1, state: "bound", change: "../escape" })).toBeNull();
		expect(parseSessionBindingEntryV1({ version: 2, state: "bound", change: "safe" })).toBeNull();
		expect(parseSessionBindingEntryV1(null)).toBeNull();
	});

	test("accepts only the three exact event shapes", () => {
		for (const event of [
			{ version: 1, action: "bind", change: "selected" },
			{ version: 1, action: "invalidate", change: "selected" },
			{ version: 1, action: "clear" },
		] as const) {
			expect(parseSessionBindingEventV1(event)).toEqual(event);
		}
		expect(parseSessionBindingEventV1({ version: 1, action: "clear", change: "selected" })).toBeNull();
		expect(parseSessionBindingEventV1({ version: 1, action: "bind", change: "archive" })).toBeNull();
		expect(parseSessionBindingEventV1({ version: 3, action: "clear" })).toBeNull();
		expect(parseSessionBindingEventV1("clear")).toBeNull();
	});

	test("parses only exact launch metadata JSON", () => {
		const metadata = { version: 1 as const, change: "selected", projectCwd: "/work/project" };
		expect(parseSessionBindingLaunchMetadataV1(JSON.stringify(metadata))).toEqual(metadata);
		expect(parseSessionBindingLaunchMetadataV1('{"version":1,"change":"selected","projectCwd":"/work/project","extra":true}')).toBeNull();
		expect(parseSessionBindingLaunchMetadataV1('{"version":2,"change":"selected","projectCwd":"/work/project"}')).toBeNull();
		expect(parseSessionBindingLaunchMetadataV1('{"version":1,"change":"../escape","projectCwd":"/work/project"}')).toBeNull();
		expect(parseSessionBindingLaunchMetadataV1('{"version":1,"change":"selected","projectCwd":""}')).toBeNull();
		expect(parseSessionBindingLaunchMetadataV1("not json")).toBeNull();
	});

	test("triangulates each union with another valid and adversarial value", () => {
		expect(parseSessionBindingEntryV1({ state: "bound", change: "release-082", version: 1 })).toEqual({
			version: 1,
			state: "bound",
			change: "release-082",
		});
		expect(parseSessionBindingEntryV1({ version: "1", state: "unbound" })).toBeNull();

		expect(parseSessionBindingEventV1({ change: "release-082", action: "invalidate", version: 1 })).toEqual({
			version: 1,
			action: "invalidate",
			change: "release-082",
		});
		expect(parseSessionBindingEventV1({ version: 1, action: "invalidate", change: "nested\\change" })).toBeNull();

		expect(parseSessionBindingLaunchMetadataV1('{"projectCwd":"/tmp/project with spaces","change":"release-082","version":1}')).toEqual({
			version: 1,
			change: "release-082",
			projectCwd: "/tmp/project with spaces",
		});
		expect(parseSessionBindingLaunchMetadataV1("[]")).toBeNull();
	});

	test("restore gives the newest matching clear authority over older bindings and launch intent", () => {
		const result = restoreSessionBinding({
			entries: [
				customEntry({ version: 1, state: "bound", change: "older" }),
				customEntry({ version: 1, state: "unbound" }),
			],
			validation: { change: "launch-change", active: true },
			launchIntent: { version: 1, change: "launch-change", projectCwd: "/work/project" },
		});

		expect(result).toEqual({ source: "entry", binding: { kind: "unbound" }, persist: null });
	});

	test("restore fails closed when the newest matching entry is malformed", () => {
		const result = restoreSessionBinding({
			entries: [
				customEntry({ version: 1, state: "bound", change: "older" }),
				customEntry({ version: 1, state: "bound", change: "../malformed" }),
			],
			validation: { change: "older", active: true },
		});

		expect(result).toEqual({
			source: "invalid-entry",
			binding: { kind: "unbound" },
			persist: { version: 1, state: "unbound" },
		});
	});

	test("restore consumes launch intent only when there is no matching entry", () => {
		const intent = { version: 1 as const, change: "launch-change", projectCwd: "/work/project" };
		const restored = restoreSessionBinding({
			entries: [{ type: "custom", customType: "another-extension", data: { version: 1 } }],
			validation: { change: intent.change, active: true },
			launchIntent: intent,
		});

		expect(restored).toEqual({
			source: "launch-intent",
			binding: { kind: "bound", change: "launch-change" },
			persist: { version: 1, state: "bound", change: "launch-change" },
		});
	});

	test("restore revalidation requests one clear and remains quiet once unbound", () => {
		const first = revalidateSessionBinding(
			{ kind: "bound", change: "missing-change" },
			{ change: "missing-change", active: false },
		);
		const second = revalidateSessionBinding(
			first.binding,
			{ change: "missing-change", active: false },
		);

		expect(first).toEqual({
			source: "revalidation",
			binding: { kind: "unbound" },
			persist: { version: 1, state: "unbound" },
		});
		expect(second).toEqual({
			source: "revalidation",
			binding: { kind: "unbound" },
			persist: null,
		});
	});

	test("restore keeps a valid newest bind and ignores an invalid launch intent", () => {
		expect(restoreSessionBinding({
			entries: [
				customEntry({ version: 1, state: "bound", change: "older" }),
				customEntry({ version: 1, state: "bound", change: "newest" }),
			],
			validation: { change: "newest", active: true },
			launchIntent: { version: 1, change: "../unsafe", projectCwd: "/work/project" },
		})).toEqual({
			source: "entry",
			binding: { kind: "bound", change: "newest" },
			persist: null,
		});
	});

	test("serializes every union member with canonical key order", () => {
		expect(serializeSessionBindingEntryV1({ version: 1, state: "bound", change: "selected" })).toBe(
			'{"version":1,"state":"bound","change":"selected"}',
		);
		expect(serializeSessionBindingEntryV1({ version: 1, state: "unbound" })).toBe('{"version":1,"state":"unbound"}');
		expect(serializeSessionBindingEventV1({ version: 1, action: "bind", change: "selected" })).toBe(
			'{"version":1,"action":"bind","change":"selected"}',
		);
		expect(serializeSessionBindingEventV1({ version: 1, action: "invalidate", change: "selected" })).toBe(
			'{"version":1,"action":"invalidate","change":"selected"}',
		);
		expect(serializeSessionBindingEventV1({ version: 1, action: "clear" })).toBe('{"version":1,"action":"clear"}');
		expect(serializeSessionBindingLaunchMetadataV1({ version: 1, change: "selected", projectCwd: "/work/project" })).toBe(
			'{"version":1,"change":"selected","projectCwd":"/work/project"}',
		);
	});
});
