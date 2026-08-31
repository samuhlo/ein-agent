import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	agentAutomaticParticipationLabel,
	agentControlsConfigPath,
	clearAgentControlSession,
	readAgentActivationProfile,
	readAgentControlStatus,
	readProjectAgentControlStatus,
	routeAgentControl,
	writeAgentActivationProfile,
} from "../ein-pi/agent/lib/agent-controls.ts";

const roots: string[] = [];

function project(): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-agent-controls-"));
	roots.push(cwd);
	return cwd;
}

afterEach(() => {
	clearAgentControlSession("session-a");
	clearAgentControlSession("session-b");
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("agent activation state", () => {
	test("all supported profiles round-trip through the authoritative writer", () => {
		const cwd = project();
		const expected = {
			balanced: ["auto:on", "auto:off"],
			thorough: ["auto:on", "auto:on"],
			manual: ["auto:off", "auto:off"],
		} as const;
		for (const profile of ["balanced", "thorough", "manual"] as const) {
			writeAgentActivationProfile(cwd, profile);
			expect(readAgentActivationProfile(cwd)).toBe(profile);
			expect([
				agentAutomaticParticipationLabel(readProjectAgentControlStatus(cwd, "cleaner").enabled),
				agentAutomaticParticipationLabel(readProjectAgentControlStatus(cwd, "architect").enabled),
			]).toEqual([...expected[profile]]);
		}
	});

	test("legacy Cleaner-off Architect-on state is custom and is not normalized", () => {
		const cwd = project();
		mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
		const path = agentControlsConfigPath(cwd);
		const content = `${JSON.stringify({ agents: { cleaner: { enabled: false }, architect: { enabled: true } } }, null, 2)}\n`;
		writeFileSync(path, content);
		expect(readAgentActivationProfile(cwd)).toBe("custom");
		expect(readFileSync(path, "utf8")).toBe(content);
	});
	test("both agents default independently to disabled project state", () => {
		const cwd = project();
		expect(readProjectAgentControlStatus(cwd, "cleaner")).toEqual({
			agent: "cleaner",
			enabled: false,
			source: "project config",
		});
		expect(readAgentControlStatus(cwd, "session-a", "cleaner")).toEqual({
			agent: "cleaner",
			enabled: false,
			source: "project config",
		});
		expect(readAgentControlStatus(cwd, "session-a", "architect").enabled).toBe(false);
	});

	test("pure project reads expose configured automatic banner values without session state", () => {
		const cwd = project();
		mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
		writeFileSync(
			agentControlsConfigPath(cwd),
			`${JSON.stringify({ agents: { cleaner: { enabled: true }, architect: { enabled: false } } })}\n`,
		);

		expect(readProjectAgentControlStatus(cwd, "cleaner").enabled).toBe(true);
		expect(readProjectAgentControlStatus(cwd, "architect").enabled).toBe(false);
		expect(agentAutomaticParticipationLabel(readProjectAgentControlStatus(cwd, "cleaner").enabled)).toBe("auto:on");
		expect(agentAutomaticParticipationLabel(readProjectAgentControlStatus(cwd, "architect").enabled)).toBe("auto:off");
	});

	test("project config supplies new-session defaults and session overrides stay isolated", () => {
		const cwd = project();
		const path = agentControlsConfigPath(cwd);
		mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
		writeFileSync(path, `${JSON.stringify({ agents: { cleaner: { enabled: true }, architect: { enabled: false } } }, null, 2)}\n`);

		expect(readAgentControlStatus(cwd, "session-a", "cleaner").enabled).toBe(true);
		writeFileSync(path, `${JSON.stringify({ agents: { cleaner: { enabled: false } } })}\n`);
		expect(readAgentControlStatus(cwd, "session-a", "cleaner").enabled).toBe(true);
		expect(readAgentControlStatus(cwd, "session-b", "cleaner").enabled).toBe(false);
		const override = routeAgentControl(cwd, "session-a", "cleaner", "off");
		expect(override.kind).toBe("status");
		if (override.kind !== "status") throw new Error("expected status");
		expect(override.status).toEqual({
			agent: "cleaner",
			enabled: false,
			source: "session override",
		});
		clearAgentControlSession("session-a");
		expect(readAgentControlStatus(cwd, "session-a", "cleaner").enabled).toBe(false);
	});
});

describe("direct routing", () => {
	test("explicit requests remain routable while automatic participation is off", () => {
		const result = routeAgentControl(project(), "session-a", "cleaner", "improve src/core safely");
		expect(result.kind).toBe("request");
		if (result.kind !== "request") throw new Error("expected request");
		expect(result.prompt).toContain('subagent({ agent: "ein-cleaner"');
		expect(result.prompt).toContain("Automatic SDD participation is off");
		expect(result.prompt).toContain("does not block this explicit request");
	});

	test("status names the effective value and source", () => {
		const result = routeAgentControl(project(), "session-a", "architect", "status");
		expect(result).toEqual({
			kind: "status",
			status: { agent: "architect", enabled: false, source: "project config" },
		});
	});

	test("empty requests return bounded usage instead of inventing work", () => {
		expect(routeAgentControl(project(), "session-a", "architect", "")).toEqual({
			kind: "usage",
			message: "Usage: /ein:architect <request>|on|off|status",
		});
	});
});

describe("Pi-native agent assets", () => {
	for (const name of ["ein-cleaner", "ein-architect"] as const) {
		test(`${name} is named, internal, and honest about this work unit`, () => {
			const asset = readFileSync(join(import.meta.dir, "../runtime/agents", `${name}.md`), "utf8");
			expect(asset).toContain(`name: ${name}`);
			expect(asset).toContain("internal Pi subagent");
			if (name === "ein-cleaner") {
				expect(asset).toContain("ein_cleaner_evidence");
				expect(asset).toContain("ein_cleaner_active_evidence");
				expect(asset).toContain("ein_cleaner_audit");
				expect(asset).toContain("NEVER recompute");
				expect(asset).toContain("NEVER executes commands");
				expect(asset).toContain("ein_cleaner_improve_admit");
				expect(asset).toContain("NEVER claim completion unless this tool returns `complete`");
			} else {
				expect(asset).toContain("ein_architect_evidence");
				expect(asset).toContain("ein_architect_plan_bind");
				expect(asset).toContain("ein_architect_validate");
				expect(asset).toContain("no source-write path");
			}
		});
	}
});
