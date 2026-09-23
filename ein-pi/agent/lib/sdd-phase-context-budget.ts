import {
	admitDelegation,
	serializeDelegationExecution,
	type DelegationItem,
} from "./delegation-admission.ts";

const DEFAULT_MAX_TOKENS = 15_000;
const DEFAULT_TOOL_CALLS = 30;
const DEFAULT_SOFT_TOOL_CALLS = 24;
const RESEARCH_TOOLS = ["read", "grep", "find", "ls", "bash"] as const;
const BUDGET_MARKER = "ein_phase_budget:";

type ToolBudget = Readonly<{
	hard: number;
	soft: number;
	block: "*" | string[];
}>;

export type PhaseToolBudgetAllocation = Readonly<{
	agent: "sdd-map" | "sdd-design";
	maxTokensGuidance: number;
	toolBudget: ToolBudget;
	unit: "total_tool_calls_per_execution";
	warning?: string;
}>;

export type PhaseToolBudgetResult = Readonly<{
	changed: boolean;
	allocations: PhaseToolBudgetAllocation[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new Error(`phase_budget.${field} must be a positive integer`);
	}
	return value as number;
}

function parsePhaseBudget(task: string): { maxTokens: number; maxToolCalls: number } {
	const match = task.match(/^phase_budget:\s*(\{[^\r\n]+\})\s*$/m);
	if (!match) return { maxTokens: DEFAULT_MAX_TOKENS, maxToolCalls: DEFAULT_TOOL_CALLS };
	let raw: unknown;
	try { raw = JSON.parse(match[1]!); }
	catch { throw new Error("phase_budget must contain valid single-line JSON"); }
	if (!isRecord(raw)) throw new Error("phase_budget must be a JSON object");
	const unsupported = Object.keys(raw).find((key) => !["max_tokens", "max_reads", "max_tool_calls"].includes(key));
	if (unsupported) throw new Error(`phase_budget.${unsupported} is not supported`);
	const maxTokens = positiveInteger(raw.max_tokens, "max_tokens");
	if (raw.max_reads === undefined && raw.max_tool_calls === undefined) {
		throw new Error("phase_budget requires max_tool_calls (or legacy max_reads)");
	}
	const legacy = raw.max_reads === undefined ? undefined : positiveInteger(raw.max_reads, "max_reads");
	const canonical = raw.max_tool_calls === undefined ? undefined : positiveInteger(raw.max_tool_calls, "max_tool_calls");
	if (legacy !== undefined && canonical !== undefined && legacy !== canonical) {
		throw new Error("phase_budget.max_reads and phase_budget.max_tool_calls must match when both are present");
	}
	return { maxTokens, maxToolCalls: canonical ?? legacy! };
}

function readToolBudget(value: unknown): Partial<ToolBudget> {
	if (value === undefined) return {};
	if (!isRecord(value)) throw new Error("toolBudget must be an object");
	const hard = positiveInteger(value.hard, "toolBudget.hard");
	const soft = value.soft === undefined ? undefined : positiveInteger(value.soft, "toolBudget.soft");
	if (soft !== undefined && soft > hard) throw new Error("toolBudget.soft must be <= toolBudget.hard");
	let block: "*" | string[] | undefined;
	if (value.block === "*") block = "*";
	else if (value.block !== undefined) {
		if (!Array.isArray(value.block) || value.block.length === 0 || value.block.some((name) => typeof name !== "string" || !name.trim())) {
			throw new Error('toolBudget.block must be "*" or a non-empty array of tool names');
		}
		block = [...new Set(value.block as string[])];
	}
	return { hard, ...(soft === undefined ? {} : { soft }), ...(block === undefined ? {} : { block }) };
}

function mergeBlockedTools(...explicit: (ToolBudget["block"] | undefined)[]): ToolBudget["block"] {
	if (explicit.includes("*")) return "*";
	return [...new Set([...RESEARCH_TOOLS, ...explicit.flatMap((block) => Array.isArray(block) ? block : [])])];
}

function allocationFor(item: DelegationItem, inherited: Partial<ToolBudget>): PhaseToolBudgetAllocation | null {
	if (item.agent !== "sdd-map" && item.agent !== "sdd-design") return null;
	const phase = parsePhaseBudget(item.task);
	const caller = readToolBudget(item.toolBudget);
	const allowIncrease = item.allowBudgetIncrease === true;
	const requestedHard = Math.min(phase.maxToolCalls, caller.hard ?? Infinity, inherited.hard ?? Infinity);
	if (!allowIncrease && (phase.maxTokens > DEFAULT_MAX_TOKENS || requestedHard > DEFAULT_TOOL_CALLS)) {
		throw new Error("phase budget increases require allowBudgetIncrease:true");
	}
	const hard = allowIncrease ? requestedHard : Math.min(DEFAULT_TOOL_CALLS, requestedHard);
	const soft = Math.min(caller.soft ?? inherited.soft ?? DEFAULT_SOFT_TOOL_CALLS, inherited.soft ?? Infinity, hard);
	const block = mergeBlockedTools(inherited.block, caller.block);
	return {
		agent: item.agent,
		maxTokensGuidance: allowIncrease ? phase.maxTokens : Math.min(DEFAULT_MAX_TOKENS, phase.maxTokens),
		toolBudget: { hard, soft, block },
		unit: "total_tool_calls_per_execution",
		...(block === "*" ? { warning: "toolBudget.block='*' may prevent writing a partial artifact" } : {}),
	};
}

function directive(allocation: PhaseToolBudgetAllocation): string {
	return [
		"",
		"",
		`${BUDGET_MARKER} ${JSON.stringify({
			max_tokens_guidance: allocation.maxTokensGuidance,
			max_tool_calls: allocation.toolBudget.hard,
			unit: allocation.unit,
			blocked_after_hard: allocation.toolBudget.block,
		})}`,
		"max_tokens_guidance is an approximate context orientation, not measured usage or a runtime token limit.",
		"max_tool_calls counts every tool call in this execution. After the hard threshold, only blocked_after_hard tools are denied; write/edit can still preserve a partial artifact unless the caller explicitly blocked '*'.",
		"A later child invocation receives a new per-execution allocation. Reuse the partial artifact and investigate only the remaining gap; no persistent balance is claimed.",
	].join("\n");
}

function applyAllocation(item: DelegationItem, allocation: PhaseToolBudgetAllocation): DelegationItem {
	const nextTask = item.task.includes(BUDGET_MARKER) ? item.task : item.task + directive(allocation);
	return { ...item, task: nextTask, toolBudget: allocation.toolBudget };
}

export function ensurePhaseContextBudget(input: unknown): PhaseToolBudgetResult {
	if (!isRecord(input)) return { changed: false, allocations: [] };
	const admission = admitDelegation(input);
	if (admission.kind !== "execution") return { changed: false, allocations: [] };
	const inherited = typeof input.workflowScript === "string" ? readToolBudget(input.toolBudget) : {};
	const allocations: PhaseToolBudgetAllocation[] = [];
	const items = admission.items.map((item) => {
		const allocation = allocationFor(item, inherited);
		if (!allocation) return item;
		allocations.push(allocation);
		return applyAllocation(item, allocation);
	});
	if (allocations.length === 0) return { changed: false, allocations };
	let changed: boolean;
	if (typeof input.workflowScript === "string") {
		const script = serializeDelegationExecution({ ...admission, items });
		changed = script !== input.workflowScript;
		input.workflowScript = script;
	} else {
		changed = input.task !== items[0]!.task
			|| JSON.stringify(input.toolBudget) !== JSON.stringify(items[0]!.toolBudget)
			|| Object.hasOwn(input, "allowBudgetIncrease");
		input.task = items[0]!.task;
		input.toolBudget = items[0]!.toolBudget;
		delete input.allowBudgetIncrease;
	}
	return { changed, allocations };
}
