import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseConfigRules } from "./openspec-config-rules.ts";
import { changeDirFor, readChangeStance, type TddStance } from "./sdd-preflight-record.ts";
import { tddConfigPath, type TddMode } from "./tdd.ts";

export type ApplyTddSource = "change" | "delegation-field" | "legacy-text" | "project-setting" | "project-auto";

export type ResolvedApplyTdd = Readonly<{
	version: 1;
	change: string | null;
	mode: TddStance;
	source: ApplyTddSource;
	stanceFingerprint: string;
	configEvidence?: Readonly<{ state: "present" | "absent"; sha256?: string }>;
	testCommand?: string;
}>;

export type ApplyTddResolution =
	| Readonly<{ kind: "resolved"; contract: ResolvedApplyTdd }>
	| Readonly<{ kind: "needs-decision"; reason: "change-stance-missing" | "project-ask" | "missing-test-command"; message: string; candidate?: ResolvedApplyTdd }>
	| Readonly<{ kind: "invalid"; reason: string }>;

export type ApplyTurnBudgetDecision = Readonly<{
	status: "not-applicable" | "explicit" | "automatic" | "unavailable";
	turnBudget?: unknown;
	message?: string;
}>;

const CONTRACT_PREFIX = "ein_effective_tdd: ";
const CONTRACT_LINE = /^ein_effective_tdd:\s*(.+)$/mu;
const LEGACY_STRICT = /\bstrict\s+tdd\s+mode\s+is\s+active\b/iu;
const LEGACY_OFF = /\bno[-\s]?tdd\b|\bsin\s+tdd\b|\btdd\s*[:=]?\s*(?:off|skip)\b/iu;
const CHANGE_PATTERNS = [
	/(?:openspec|\.sdd)\/changes\/([a-z0-9]+(?:-[a-z0-9]+)*)\b/giu,
	/^\s*(?:change|intent_work)\s*:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gimu,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: unknown): string {
	return `sha256:${sha256(JSON.stringify(value))}`;
}

function resolved(input: Omit<ResolvedApplyTdd, "version" | "stanceFingerprint"> & { fingerprintMaterial: unknown }): ApplyTddResolution {
	const { fingerprintMaterial, ...contract } = input;
	return {
		kind: "resolved",
		contract: Object.freeze({ version: 1, ...contract, stanceFingerprint: fingerprint(fingerprintMaterial) }),
	};
}

function normalizeStructuredHint(value: unknown): TddMode | "invalid" | undefined {
	if (value === true) return "strict";
	if (value === false) return "off";
	if (value === undefined) return undefined;
	if (typeof value !== "string") return "invalid";
	const token = value.trim().toLowerCase();
	return (["off", "strict", "auto", "ask"] as const).includes(token as TddMode)
		? token as TddMode
		: "invalid";
}

function readProjectTddSetting(cwd: string): { kind: "absent"; mode: "off" } | { kind: "present"; mode: TddMode; sha256: string } | { kind: "invalid"; reason: string } {
	const path = tddConfigPath(cwd);
	if (!existsSync(path)) return { kind: "absent", mode: "off" };
	let source: string;
	try { source = readFileSync(path, "utf8"); }
	catch (error) { return { kind: "invalid", reason: `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}` }; }
	let value: unknown;
	try { value = JSON.parse(source); }
	catch { return { kind: "invalid", reason: `${path} is invalid JSON` }; }
	if (!isRecord(value)) return { kind: "invalid", reason: `${path} must contain an object` };
	const mode = normalizeStructuredHint(value.mode);
	if (!mode || mode === "invalid") return { kind: "invalid", reason: `${path} contains an invalid TDD mode` };
	return { kind: "present", mode, sha256: sha256(source) };
}

type AutoConfig =
	| Readonly<{ kind: "valid"; mode: TddStance; evidence: { state: "present" | "absent"; sha256?: string }; testCommand?: string }>
	| Readonly<{ kind: "invalid"; reason: string }>;

function readAutoConfig(cwd: string): AutoConfig {
	const path = join(cwd, "openspec", "config.yaml");
	if (!existsSync(path)) return { kind: "valid", mode: "off", evidence: { state: "absent" } };
	let source: string;
	try { source = readFileSync(path, "utf8"); }
	catch (error) { return { kind: "invalid", reason: `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}` }; }
	const normalized = source.replace(/\r\n?/gu, "\n");
	const declarations = normalized.split("\n").filter((line) => /^strict_tdd\s*:/u.test(line));
	const unsupported = normalized.split("\n").some((line) => /^(?:["']strict_tdd["']|\?\s*strict_tdd\b)/u.test(line));
	if (unsupported) return { kind: "invalid", reason: `${path} uses an unsupported strict_tdd key form` };
	if (declarations.length > 1) return { kind: "invalid", reason: `${path} declares strict_tdd more than once` };
	let mode: TddStance = "off";
	if (declarations.length === 1) {
		const match = /^strict_tdd\s*:\s*(true|false)\s*(?:#.*)?$/u.exec(declarations[0]!);
		if (!match) return { kind: "invalid", reason: `${path} strict_tdd must be a root boolean` };
		mode = match[1] === "true" ? "strict" : "off";
	}
	const testCommand = parseConfigRules(normalized).apply?.testCommand?.trim() || undefined;
	return {
		kind: "valid",
		mode,
		evidence: { state: "present", sha256: sha256(source) },
		...(testCommand ? { testCommand } : {}),
	};
}

function resolveAuto(cwd: string): ApplyTddResolution {
	const config = readAutoConfig(cwd);
	if (config.kind === "invalid") return config;
	const result = resolved({
		change: null,
		mode: config.mode,
		source: "project-auto",
		configEvidence: config.evidence,
		...(config.testCommand ? { testCommand: config.testCommand } : {}),
		fingerprintMaterial: { source: "project-auto", mode: config.mode, configEvidence: config.evidence, testCommand: config.testCommand ?? null },
	});
	if (result.kind === "resolved" && config.mode === "strict" && !config.testCommand) {
		return {
			kind: "needs-decision",
			reason: "missing-test-command",
			message: "strict_tdd is true but rules.apply.test_command is missing",
			candidate: result.contract,
		};
	}
	return result;
}

function resolveChange(cwd: string, change: string): ApplyTddResolution {
	const changeDir = changeDirFor(cwd, change);
	if (!existsSync(changeDir)) return { kind: "invalid", reason: `change '${change}' does not exist` };
	const path = join(changeDir, "preflight.json");
	if (!existsSync(path)) return { kind: "needs-decision", reason: "change-stance-missing", message: `change '${change}' has no TDD decision` };
	let parsed: unknown;
	try { parsed = JSON.parse(readFileSync(path, "utf8")); }
	catch { return { kind: "invalid", reason: `${path} is unreadable or invalid JSON` }; }
	if (!isRecord(parsed)) return { kind: "invalid", reason: `${path} must contain an object` };
	if (parsed.tdd === undefined) return { kind: "needs-decision", reason: "change-stance-missing", message: `change '${change}' has no TDD decision` };
	if (parsed.tdd !== "strict" && parsed.tdd !== "off") return { kind: "invalid", reason: `${path} has invalid persisted tdd '${String(parsed.tdd)}'` };
	const stance = readChangeStance(cwd, change);
	if (!stance?.tdd) return { kind: "invalid", reason: `${path} does not produce a valid persisted stance` };
	const material = { change, tdd: stance.tdd, decidedBy: stance.decidedBy ?? null, decidedAt: stance.decidedAt ?? null };
	return resolved({ change, mode: stance.tdd, source: "change", fingerprintMaterial: material });
}

export function extractApplyChange(task: string): { kind: "none" } | { kind: "change"; change: string } | { kind: "invalid"; reason: string } {
	const changes = new Set<string>();
	for (const pattern of CHANGE_PATTERNS) {
		pattern.lastIndex = 0;
		for (const match of task.matchAll(pattern)) changes.add(match[1]!);
	}
	if (changes.size === 0) return { kind: "none" };
	if (changes.size > 1) return { kind: "invalid", reason: `apply task identifies multiple changes: ${[...changes].join(", ")}` };
	return { kind: "change", change: [...changes][0]! };
}

export function resolveApplyTdd(input: Readonly<{ cwd: string; task: string; structuredHint?: unknown; change?: string | null }>): ApplyTddResolution {
	const identified = input.change === undefined ? extractApplyChange(input.task) : input.change ? { kind: "change" as const, change: input.change } : { kind: "none" as const };
	if (identified.kind === "invalid") return identified;
	if (identified.kind === "change") return resolveChange(input.cwd, identified.change);

	const structured = normalizeStructuredHint(input.structuredHint);
	if (structured === "invalid") return { kind: "invalid", reason: "delegation contains an invalid structured TDD hint" };
	if (structured === "strict" || structured === "off") {
		return resolved({ change: null, mode: structured, source: "delegation-field", fingerprintMaterial: { source: "delegation-field", mode: structured } });
	}
	if (structured === "auto") return resolveAuto(input.cwd);
	if (structured === "ask") return { kind: "needs-decision", reason: "project-ask", message: "ad-hoc apply requires an explicit TDD decision" };

	const legacy = LEGACY_STRICT.test(input.task) ? "strict" : LEGACY_OFF.test(input.task) ? "off" : undefined;
	if (legacy) return resolved({ change: null, mode: legacy, source: "legacy-text", fingerprintMaterial: { source: "legacy-text", mode: legacy } });

	const setting = readProjectTddSetting(input.cwd);
	if (setting.kind === "invalid") return setting;
	if (setting.mode === "auto") return resolveAuto(input.cwd);
	if (setting.mode === "ask") return { kind: "needs-decision", reason: "project-ask", message: "project TDD mode is ask and this ad-hoc apply has no hint" };
	return resolved({
		change: null,
		mode: setting.mode,
		source: "project-setting",
		fingerprintMaterial: { source: "project-setting", mode: setting.mode, setting: setting.kind === "present" ? setting.sha256 : "absent" },
	});
}

export function serializeResolvedApplyTdd(contract: ResolvedApplyTdd): string {
	return `${CONTRACT_PREFIX}${JSON.stringify(contract)}`;
}

export function attachResolvedApplyTdd(task: string, contract: ResolvedApplyTdd): string {
	const withoutContracts = task.split(/\r?\n/u).filter((line) => !/^ein_effective_tdd\s*:/u.test(line)).join("\n").trimEnd();
	return `${withoutContracts}${withoutContracts ? "\n" : ""}${serializeResolvedApplyTdd(contract)}`;
}

export function parseResolvedApplyTdd(task: string): { kind: "absent" } | { kind: "invalid"; reason: string } | { kind: "resolved"; contract: ResolvedApplyTdd } {
	const lines = task.split(/\r?\n/u).filter((line) => /^ein_effective_tdd\s*:/u.test(line));
	if (lines.length === 0) return { kind: "absent" };
	if (lines.length !== 1) return { kind: "invalid", reason: "apply task contains duplicate ein_effective_tdd contracts" };
	const payload = CONTRACT_LINE.exec(lines[0]!)?.[1];
	if (!payload) return { kind: "invalid", reason: "ein_effective_tdd contract is malformed" };
	let value: unknown;
	try { value = JSON.parse(payload); }
	catch { return { kind: "invalid", reason: "ein_effective_tdd contract is invalid JSON" }; }
	if (!isRecord(value) || value.version !== 1 || (value.change !== null && typeof value.change !== "string") ||
		(value.mode !== "strict" && value.mode !== "off") || !["change", "delegation-field", "legacy-text", "project-setting", "project-auto"].includes(String(value.source)) ||
		typeof value.stanceFingerprint !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.stanceFingerprint)) {
		return { kind: "invalid", reason: "ein_effective_tdd contract has an invalid shape" };
	}
	if (value.configEvidence !== undefined && (!isRecord(value.configEvidence) || !["present", "absent"].includes(String(value.configEvidence.state)) ||
		(value.configEvidence.sha256 !== undefined && (typeof value.configEvidence.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.configEvidence.sha256))))) {
		return { kind: "invalid", reason: "ein_effective_tdd config evidence is invalid" };
	}
	if (value.testCommand !== undefined && (typeof value.testCommand !== "string" || !value.testCommand.trim())) return { kind: "invalid", reason: "ein_effective_tdd test command is invalid" };
	return { kind: "resolved", contract: value as ResolvedApplyTdd };
}

export function revalidateResolvedApplyTdd(cwd: string, contract: ResolvedApplyTdd): { current: true } | { current: false; reason: string } {
	if (contract.source === "delegation-field" || contract.source === "legacy-text") return { current: true };
	const current = contract.source === "change" && contract.change
		? resolveApplyTdd({ cwd, task: "", change: contract.change })
		: contract.source === "project-auto"
			? resolveApplyTdd({ cwd, task: "", structuredHint: "auto", change: null })
			: resolveApplyTdd({ cwd, task: "", change: null });
	if (current.kind !== "resolved") return { current: false, reason: current.kind === "invalid" ? current.reason : current.message };
	return current.contract.stanceFingerprint === contract.stanceFingerprint
		? { current: true }
		: { current: false, reason: "TDD stance or configuration changed after delegation preparation" };
}

export function renderResolvedApplyTdd(contract: ResolvedApplyTdd, coordinated = true): string {
	const stance = contract.mode === "strict"
		? "Strict TDD: ON (forced) — follow RED → GREEN → TRIANGULATE → REFACTOR and record evidence."
		: "Strict TDD: OFF — implement directly; independent verify still runs the real suite.";
	const test = contract.testCommand ? ` Test command: \`${contract.testCommand}\`.` : "";
	const budget = coordinated
		? "The parent resolved this same contract before launch. Runner turn limits are unavailable; maxRuntimeMs remains active."
		: "Legacy direct launch: the parent supplied no proof that TDD and the apply budget were coordinated.";
	return `## Effective apply TDD (mechanical contract)\n- ${stance}${test}\n- ${budget}`;
}

export function decideApplyTurnBudget(contract: ResolvedApplyTdd, explicit: unknown, runnerSupportsTurnBudget = false): ApplyTurnBudgetDecision {
	if (explicit !== undefined) return runnerSupportsTurnBudget
		? { status: "explicit", turnBudget: explicit }
		: { status: "unavailable", turnBudget: explicit, message: "explicit turnBudget cannot be guaranteed by pi-subagents@0.68.0" };
	if (contract.mode === "strict") return { status: "not-applicable" };
	return runnerSupportsTurnBudget
		? { status: "automatic", turnBudget: { maxTurns: 60, graceTurns: 3 } }
		: { status: "unavailable", message: "turn limit unavailable; maxRuntimeMs remains active" };
}
