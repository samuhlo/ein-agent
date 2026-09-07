const DEFAULTS: Record<string, { max_tokens: number; max_reads: number }> = {
	"sdd-map": { max_tokens: 15000, max_reads: 30 },
	"sdd-design": { max_tokens: 15000, max_reads: 30 },
};

export function ensurePhaseContextBudget(input: unknown): boolean {
	if (!input || typeof input !== "object") return false;
	const value = input as { agent?: string; task?: string };
	if (!value.agent || !DEFAULTS[value.agent] || typeof value.task !== "string") return false;
	const explicit = value.task.match(/^phase_budget:\s*(\{[^\r\n]+\})\s*$/m);
	const budget = explicit ? JSON.parse(explicit[1]!) : DEFAULTS[value.agent];
	if (!budget || !Number.isSafeInteger(budget.max_tokens) || budget.max_tokens <= 0 || !Number.isSafeInteger(budget.max_reads) || budget.max_reads <= 0) throw new Error("phase_budget requires positive max_tokens and max_reads");
	const directive = `\n\nPhase context allocation (${value.agent}): ${JSON.stringify({ max_tokens: budget.max_tokens, max_reads: budget.max_reads })}. This is a phase-local allocation, not a remaining balance from another phase. Other phases' budget_consumed/remaining fields are accounting only. Resuming this phase does not reset its consumption. Explicit user limits, including a shared total ceiling, still apply and may only narrow this allocation.`;
	if (value.task.endsWith(directive)) return false;
	value.task += directive;
	return true;
}
