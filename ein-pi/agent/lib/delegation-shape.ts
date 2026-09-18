import {
	admitDelegation,
	serializeDelegationExecution,
	type DelegationExecution,
	type DelegationItem,
} from "./delegation-admission.ts";

export type { DelegationItem } from "./delegation-admission.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWorkflowScriptDelegations(script: string): DelegationItem[] {
	const admission = admitDelegation({ workflowScript: script });
	return admission.kind === "execution" ? admission.items : [];
}

export function workflowScriptFansOut(script: string): boolean {
	const admission = admitDelegation({ workflowScript: script });
	return admission.kind === "execution" && (admission.form === "all" || admission.items.length > 1);
}

export function delegationWorkflowScript(input: unknown): string | undefined {
	if (!isRecord(input)) return undefined;
	return typeof input.workflowScript === "string" ? input.workflowScript : undefined;
}

export function collectDelegationItems(input: unknown): DelegationItem[] {
	const admission = admitDelegation(input);
	return admission.kind === "execution" ? admission.items : [];
}

export function rewriteDelegationTasks(
	input: unknown,
	rewrite: (agent: string, task: string) => string,
): void {
	if (!isRecord(input)) return;
	const admission = admitDelegation(input);
	if (admission.kind === "rejected") throw new Error(admission.reason);
	if (admission.kind === "management") return;
	const items = admission.items.map((item) => ({
		...item,
		task: rewrite(item.agent, item.task),
	}));
	if (typeof input.workflowScript === "string") {
		input.workflowScript = serializeDelegationExecution({ ...admission, items }, { includeEinMetadata: true });
		return;
	}
	input.task = items[0]!.task;
}

export function normalizeDelegationForRunner(input: unknown): DelegationExecution {
	if (!isRecord(input)) throw new Error("subagent input must be an object");
	delete input.turnBudget;
	delete input.foregroundOnly;
	const admission = admitDelegation(input);
	if (admission.kind !== "execution") {
		throw new Error(admission.kind === "rejected" ? admission.reason : "management calls do not launch children");
	}
	delete input.tdd;
	delete input.allowBudgetIncrease;
	if (typeof input.workflowScript === "string") input.workflowScript = admission.script;
	return admission;
}

export function collectDelegationAgentNames(input: unknown): string[] {
	return collectDelegationItems(input).map((item) => item.agent);
}

export function collectDelegationTaskTexts(input: unknown): string[] {
	return collectDelegationItems(input).map((item) => item.task);
}

export function delegationTargetsOnly(input: unknown, agent: string): boolean {
	const agents = collectDelegationAgentNames(input);
	return agents.length > 0 && agents.every((name) => name === agent);
}

export function delegationIncludes(input: unknown, agent: string): boolean {
	return collectDelegationAgentNames(input).includes(agent);
}

export function delegationShapeIsUnrecognized(input: unknown): boolean {
	return admitDelegation(input).kind === "rejected";
}
