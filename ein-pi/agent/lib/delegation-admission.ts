import { createRequire } from "node:module";
import type * as typescript from "typescript";

type TypeScriptRuntime = typeof import("typescript");
let typescriptRuntime: TypeScriptRuntime | undefined;

function compiler(): TypeScriptRuntime {
	if (typescriptRuntime) return typescriptRuntime;
	const require = createRequire(import.meta.url);
	try { typescriptRuntime = require(["type", "script"].join("")) as TypeScriptRuntime; }
	catch { typescriptRuntime = require([".", "/vendor/typescript/typescript.js"].join("")) as TypeScriptRuntime; }
	return typescriptRuntime;
}

export const DELEGATION_SCRIPT_MAX_BYTES = 64 * 1024;
export const DELEGATION_CALL_MAX = 64;

const RUN_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LEGACY_KEYS = ["tasks", "steps", "chain"] as const;
const EIN_METADATA_KEYS = new Set(["tdd", "turnBudget", "allowBudgetIncrease"]);
const CHILD_KEYS = new Set([
	"agent", "task", "cwd", "context", "timeoutMs", "maxRuntimeMs", "toolTimeoutMs",
	"toolBudget", "usageBudget", "acceptance", "agentContract", "output", "outputMode",
	"outputSchema", "skill", "model", "fast", "worktree", "baseRef", "lane",
	"extensionBindings", "artifacts", "includeProgress", "sessionDir", "phase", "label",
	...EIN_METADATA_KEYS,
]);
const CONTAINER_KEYS = new Set([
	...CHILD_KEYS,
	"workflowScript", "async", "globalConcurrencyLimit", "maxSubagentSpawnsPerRun",
	"preflight", "chatProgress", "isolation", "agentScope",
]);

export type DelegationItem = Record<string, unknown> & {
	agent: string;
	task: string;
	key?: string;
	tdd?: unknown;
	allowBudgetIncrease?: unknown;
};

export type DelegationExecution = Readonly<{
	kind: "execution";
	form: "single" | "sequence" | "all";
	items: DelegationItem[];
	script: string;
}>;

export type DelegationManagement = Readonly<{
	kind: "management";
	action: string;
	script?: string;
	id?: string;
}>;

export type DelegationRejectionCode = "delegation-shape-unsupported" | "legacy-delegation-reissue-required";

export type DelegationRejected = Readonly<{
	kind: "rejected";
	code: DelegationRejectionCode;
	reason: string;
	field?: string;
	line?: number;
	column?: number;
}>;

export type DelegationAdmission = DelegationExecution | DelegationManagement | DelegationRejected;

type ParsedCall = Readonly<{ method: "run" | "all" | "status"; args: readonly typescript.Expression[]; node: typescript.CallExpression }>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejected(reason: string, field?: string, source?: typescript.SourceFile, node?: typescript.Node): DelegationRejected {
	if (!source || !node) return { kind: "rejected", code: "delegation-shape-unsupported", reason, ...(field ? { field } : {}) };
	const position = source.getLineAndCharacterOfPosition(node.getStart(source));
	return {
		kind: "rejected",
		code: "delegation-shape-unsupported",
		reason,
		...(field ? { field } : {}),
		line: position.line + 1,
		column: position.character + 1,
	};
}

function propertyName(node: typescript.PropertyName): string | null {
	if (compiler().isIdentifier(node) || compiler().isStringLiteral(node) || compiler().isNoSubstitutionTemplateLiteral(node)) return node.text;
	return null;
}

function literalValue(node: typescript.Expression, source: typescript.SourceFile, path: string): unknown | DelegationRejected {
	if (compiler().isStringLiteral(node) || compiler().isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (compiler().isNumericLiteral(node)) {
		const value = Number(node.text);
		return Number.isFinite(value) ? value : rejected(`${path} must be finite JSON`, path, source, node);
	}
	if (compiler().isPrefixUnaryExpression(node) && node.operator === compiler().SyntaxKind.MinusToken && compiler().isNumericLiteral(node.operand)) {
		const value = -Number(node.operand.text);
		return Number.isFinite(value) ? value : rejected(`${path} must be finite JSON`, path, source, node);
	}
	if (node.kind === compiler().SyntaxKind.TrueKeyword) return true;
	if (node.kind === compiler().SyntaxKind.FalseKeyword) return false;
	if (node.kind === compiler().SyntaxKind.NullKeyword) return null;
	if (compiler().isArrayLiteralExpression(node)) {
		const result: unknown[] = [];
		for (let index = 0; index < node.elements.length; index += 1) {
			const element = node.elements[index]!;
			if (compiler().isSpreadElement(element) || compiler().isOmittedExpression(element)) return rejected(`${path}[${index}] must be a JSON literal`, path, source, element);
			const value = literalValue(element, source, `${path}[${index}]`);
			if (isRejection(value)) return value;
			result.push(value);
		}
		return result;
	}
	if (compiler().isObjectLiteralExpression(node)) return objectValue(node, source, path);
	return rejected(`${path} must be a JSON literal; resolve dynamic values before reissuing the delegation`, path, source, node);
}

function objectValue(node: typescript.ObjectLiteralExpression, source: typescript.SourceFile, path: string): Record<string, unknown> | DelegationRejected {
	const result: Record<string, unknown> = {};
	for (const property of node.properties) {
		if (!compiler().isPropertyAssignment(property)) return rejected(`${path} cannot contain spreads, methods, getters, setters, or shorthand properties`, path, source, property);
		const key = propertyName(property.name);
		if (key === null || compiler().isComputedPropertyName(property.name)) return rejected(`${path} cannot contain a computed key`, path, source, property.name);
		if (Object.hasOwn(result, key)) return rejected(`${path} contains duplicate key '${key}'`, key, source, property.name);
		const value = literalValue(property.initializer, source, `${path}.${key}`);
		if (isRejection(value)) return value;
		result[key] = value;
	}
	return result;
}

function isRejection(value: unknown): value is DelegationRejected {
	return isRecord(value) && value.kind === "rejected";
}

function parseCall(expression: typescript.Expression): ParsedCall | null {
	const unwrapped = compiler().isAwaitExpression(expression) ? expression.expression : expression;
	if (!compiler().isCallExpression(unwrapped) || !compiler().isPropertyAccessExpression(unwrapped.expression)) return null;
	const target = unwrapped.expression;
	if (!compiler().isIdentifier(target.expression) || target.expression.text !== "runs") return null;
	if (!(["run", "all", "status"] as const).includes(target.name.text as "run" | "all" | "status")) return null;
	return { method: target.name.text as ParsedCall["method"], args: [...unwrapped.arguments], node: unwrapped };
}

function validateKnownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, source: typescript.SourceFile, node: typescript.Node, prefix: string): DelegationRejected | null {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) return rejected(`${prefix} contains unsupported field '${key}'`, key, source, node);
	}
	return null;
}

function validatePositiveInteger(value: unknown): boolean {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateToolBudget(value: unknown, source?: typescript.SourceFile, node?: typescript.Node, prefix = "child"): DelegationRejected | null {
	if (value === undefined) return null;
	if (!isRecord(value)) return rejected(`${prefix}.toolBudget must be a JSON object`, "toolBudget", source, node);
	const unknown = Object.keys(value).find((key) => !["hard", "soft", "block"].includes(key));
	if (unknown) return rejected(`${prefix}.toolBudget.${unknown} is not supported`, `toolBudget.${unknown}`, source, node);
	if (!validatePositiveInteger(value.hard)) return rejected(`${prefix}.toolBudget.hard must be a positive integer`, "toolBudget.hard", source, node);
	if (value.soft !== undefined && !validatePositiveInteger(value.soft)) return rejected(`${prefix}.toolBudget.soft must be a positive integer`, "toolBudget.soft", source, node);
	if (typeof value.soft === "number" && value.soft > (value.hard as number)) return rejected(`${prefix}.toolBudget.soft must be <= toolBudget.hard`, "toolBudget.soft", source, node);
	if (value.block !== undefined && value.block !== "*") {
		if (!Array.isArray(value.block) || value.block.length === 0 || value.block.some((item) => typeof item !== "string" || !item.trim())) {
			return rejected(`${prefix}.toolBudget.block must be "*" or a non-empty string array`, "toolBudget.block", source, node);
		}
	}
	return null;
}

function validateOptionTypes(item: Record<string, unknown>, source?: typescript.SourceFile, node?: typescript.Node, prefix = "child"): DelegationRejected | null {
	for (const key of ["timeoutMs", "maxRuntimeMs", "toolTimeoutMs", "globalConcurrencyLimit", "maxSubagentSpawnsPerRun"]) {
		if (item[key] !== undefined && !validatePositiveInteger(item[key])) return rejected(`${prefix}.${key} must be a positive integer`, key, source, node);
	}
	for (const key of ["fast", "worktree", "artifacts", "includeProgress", "async", "allowBudgetIncrease"]) {
		if (item[key] !== undefined && typeof item[key] !== "boolean") return rejected(`${prefix}.${key} must be boolean`, key, source, node);
	}
	for (const key of ["cwd", "context", "model", "baseRef", "sessionDir", "phase", "label", "chatProgress", "isolation", "agentScope"]) {
		if (item[key] !== undefined && typeof item[key] !== "string") return rejected(`${prefix}.${key} must be a string`, key, source, node);
	}
	for (const key of ["turnBudget", "toolBudget", "usageBudget", "agentContract", "lane", "extensionBindings", "preflight"]) {
		if (item[key] !== undefined && !isRecord(item[key])) return rejected(`${prefix}.${key} must be a JSON object`, key, source, node);
	}
	if (item.outputMode !== undefined && item.outputMode !== "inline" && item.outputMode !== "file-only") return rejected(`${prefix}.outputMode must be inline or file-only`, "outputMode", source, node);
	if (item.outputSchema !== undefined && item.outputSchema !== false && !isRecord(item.outputSchema)) return rejected(`${prefix}.outputSchema must be an object or false`, "outputSchema", source, node);
	if (item.acceptance !== undefined && item.acceptance !== false && !isRecord(item.acceptance)) {
		let valid = typeof item.acceptance === "string" && ["auto", "attested", "checked"].includes(item.acceptance);
		if (!valid && typeof item.acceptance === "string" && item.acceptance.trimStart().startsWith("{")) {
			try { valid = isRecord(JSON.parse(item.acceptance)); } catch { valid = false; }
		}
		if (!valid) return rejected(`${prefix}.acceptance must be a policy object, JSON object string, auto, attested, checked, or false`, "acceptance", source, node);
	}
	const invalidToolBudget = validateToolBudget(item.toolBudget, source, node, prefix);
	if (invalidToolBudget) return invalidToolBudget;
	if (item.output !== undefined && typeof item.output !== "string" && typeof item.output !== "boolean") return rejected(`${prefix}.output must be a string or boolean`, "output", source, node);
	if (item.skill !== undefined && typeof item.skill !== "string" && typeof item.skill !== "boolean" && !(Array.isArray(item.skill) && item.skill.every((value) => typeof value === "string"))) return rejected(`${prefix}.skill must be a string, string array, or boolean`, "skill", source, node);
	return null;
}

function childFromObject(node: typescript.ObjectLiteralExpression, source: typescript.SourceFile, allowKey: boolean): DelegationItem | DelegationRejected {
	const value = objectValue(node, source, "child");
	if (isRejection(value)) return value;
	const allowed = allowKey ? new Set([...CHILD_KEYS, "key"]) : CHILD_KEYS;
	const unknown = validateKnownKeys(value, allowed, source, node, "child");
	if (unknown) return unknown;
	if (typeof value.agent !== "string" || value.agent.length === 0) return rejected("child.agent must be a non-empty literal string", "agent", source, node);
	if (typeof value.task !== "string" || value.task.length === 0) return rejected("child.task must be a non-empty literal string", "task", source, node);
	if (!allowKey && value.key !== undefined) return rejected("key is only allowed on runs.all children", "key", source, node);
	if (allowKey && (typeof value.key !== "string" || !RUN_KEY.test(value.key))) return rejected("runs.all child.key must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/", "key", source, node);
	const invalidType = validateOptionTypes(value, source, node);
	return invalidType ?? value as DelegationItem;
}

function runItem(call: ParsedCall, source: typescript.SourceFile): DelegationItem | DelegationRejected {
	if (call.args.length !== 2) return rejected("runs.run requires exactly a literal id and one child object", "runs.run", source, call.node);
	const id = literalValue(call.args[0]!, source, "runs.run.id");
	if (isRejection(id) || typeof id !== "string" || !RUN_KEY.test(id)) return isRejection(id) ? id : rejected("runs.run id must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/", "id", source, call.args[0]);
	const object = call.args[1]!;
	if (!compiler().isObjectLiteralExpression(object)) return rejected("runs.run child must be an object literal", "child", source, object);
	const child = childFromObject(object, source, false);
	if (isRejection(child)) return child;
	return { ...child, key: id };
}

function publicChild(item: DelegationItem, includeKey: boolean): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(item)) {
		if (EIN_METADATA_KEYS.has(key) || (!includeKey && key === "key")) continue;
		output[key] = value;
	}
	return output;
}

export function serializeDelegationExecution(
	execution: Pick<DelegationExecution, "form" | "items">,
	options: Readonly<{ includeEinMetadata?: boolean }> = {},
): string {
	const child = (item: DelegationItem, includeKey: boolean) => options.includeEinMetadata
		? Object.fromEntries(Object.entries(item).filter(([key]) => includeKey || key !== "key"))
		: publicChild(item, includeKey);
	if (execution.form === "all") return `return runs.all(${JSON.stringify(execution.items.map((item) => child(item, true)))})`;
	const calls = execution.items.map((item) => `runs.run(${JSON.stringify(item.key ?? "single")}, ${JSON.stringify(child(item, false))})`);
	if (calls.length === 1) return `return ${calls[0]}`;
	return calls.map((call, index) => index === calls.length - 1 ? `return ${call}` : `await ${call};`).join("\n");
}

function parseWorkflow(script: string): DelegationAdmission {
	if (Buffer.byteLength(script, "utf8") > DELEGATION_SCRIPT_MAX_BYTES) return rejected(`workflowScript exceeds ${DELEGATION_SCRIPT_MAX_BYTES} UTF-8 bytes`, "workflowScript");
	const source = compiler().createSourceFile("delegation-workflow.ts", script, compiler().ScriptTarget.ESNext, true, compiler().ScriptKind.TS);
	const diagnostic = (source as typescript.SourceFile & { parseDiagnostics: readonly typescript.DiagnosticWithLocation[] }).parseDiagnostics[0];
	if (diagnostic) {
		const start = diagnostic.start ?? 0;
		const position = source.getLineAndCharacterOfPosition(start);
		return { kind: "rejected", code: "delegation-shape-unsupported", reason: compiler().flattenDiagnosticMessageText(diagnostic.messageText, " "), field: "workflowScript", line: position.line + 1, column: position.character + 1 };
	}
	if (source.statements.length === 0) return rejected("workflowScript must contain one supported return form", "workflowScript");
	if (source.statements.length > DELEGATION_CALL_MAX) return rejected(`workflowScript exceeds ${DELEGATION_CALL_MAX} calls`, "workflowScript");

	const final = source.statements.at(-1)!;
	if (!compiler().isReturnStatement(final) || !final.expression) return rejected("workflowScript must end with return runs.run(...), runs.all(...), or runs.status(...) ", "workflowScript", source, final);
	const finalCall = parseCall(final.expression);
	if (!finalCall) return rejected("the final return must call runs.run, runs.all, or runs.status directly", "workflowScript", source, final);

	if (finalCall.method === "status") {
		if (source.statements.length !== 1 || finalCall.args.length !== 1) return rejected("runs.status must be the workflow's only call and receive one literal id", "runs.status", source, finalCall.node);
		const id = literalValue(finalCall.args[0]!, source, "runs.status.id");
		if (isRejection(id) || typeof id !== "string" || id.length === 0) return isRejection(id) ? id : rejected("runs.status id must be a non-empty literal string", "id", source, finalCall.args[0]);
		return { kind: "management", action: "status", id, script: `return runs.status(${JSON.stringify(id)})` };
	}

	if (finalCall.method === "all") {
		if (source.statements.length !== 1 || finalCall.args.length !== 1 || !compiler().isArrayLiteralExpression(finalCall.args[0]!)) return rejected("runs.all must be the workflow's only call and receive one literal child array", "runs.all", source, finalCall.node);
		const items: DelegationItem[] = [];
		const keys = new Set<string>();
		for (const element of finalCall.args[0].elements) {
			if (!compiler().isObjectLiteralExpression(element)) return rejected("every runs.all child must be an object literal", "child", source, element);
			const child = childFromObject(element, source, true);
			if (isRejection(child)) return child;
			if (keys.has(child.key!)) return rejected(`runs.all child key '${child.key}' is duplicated`, "key", source, element);
			keys.add(child.key!);
			items.push(child);
		}
		if (items.length === 0) return rejected("runs.all requires at least one child", "runs.all", source, finalCall.node);
		if (items.length > DELEGATION_CALL_MAX) return rejected(`workflowScript exceeds ${DELEGATION_CALL_MAX} calls`, "workflowScript");
		const execution: DelegationExecution = { kind: "execution", form: "all", items, script: "" };
		return { ...execution, script: serializeDelegationExecution(execution) };
	}

	const items: DelegationItem[] = [];
	const keys = new Set<string>();
	for (let index = 0; index < source.statements.length; index += 1) {
		const statement = source.statements[index]!;
		const isLast = index === source.statements.length - 1;
		let expression: typescript.Expression | undefined;
		if (isLast && compiler().isReturnStatement(statement)) expression = statement.expression;
		else if (compiler().isExpressionStatement(statement) && compiler().isAwaitExpression(statement.expression)) expression = statement.expression;
		if (!expression) return rejected("workflow sequences allow only awaited runs.run calls followed by a final return runs.run", "workflowScript", source, statement);
		const call = parseCall(expression);
		if (!call || call.method !== "run") return rejected("workflow sequences allow runs.run only", "workflowScript", source, statement);
		const item = runItem(call, source);
		if (isRejection(item)) return item;
		if (keys.has(item.key!)) return rejected(`runs.run id '${item.key}' is duplicated`, "id", source, call.node);
		keys.add(item.key!);
		items.push(item);
	}
	const execution: DelegationExecution = { kind: "execution", form: items.length === 1 ? "single" : "sequence", items, script: "" };
	return { ...execution, script: serializeDelegationExecution(execution) };
}

export function admitDelegation(input: unknown): DelegationAdmission {
	if (!isRecord(input)) return rejected("subagent input must be an object");
	for (const key of LEGACY_KEYS) {
		if (Object.hasOwn(input, key)) {
			return {
				kind: "rejected",
				code: "legacy-delegation-reissue-required",
				field: key,
				reason: `${key} is a legacy delegation array; reissue independent tasks with runs.all and explicit keys, or ordered steps with awaited runs.run calls. Preserve task, cwd, limits, and the existing authorization.`,
			};
		}
	}
	if (typeof input.action === "string") {
		if (input.workflowScript !== undefined || input.task !== undefined) return rejected("management actions cannot be mixed with execution fields", "action");
		return { kind: "management", action: input.action };
	}
	if (input.workflowScript !== undefined) {
		if (typeof input.workflowScript !== "string" || input.workflowScript.length === 0) return rejected("workflowScript must be a non-empty string", "workflowScript");
		if (input.agent !== undefined || input.task !== undefined) return rejected("workflowScript cannot be mixed with single agent/task fields", "workflowScript");
		const unknown = Object.keys(input).find((key) => !CONTAINER_KEYS.has(key));
		if (unknown) return rejected(`delegation container contains unsupported field '${unknown}'`, unknown);
		const invalidType = validateOptionTypes(input, undefined, undefined, "delegation container");
		if (invalidType) return invalidType;
		return parseWorkflow(input.workflowScript);
	}
	if (input.agent !== undefined || input.task !== undefined) {
		const unknown = Object.keys(input).find((key) => !CONTAINER_KEYS.has(key));
		if (unknown) return rejected(`delegation container contains unsupported field '${unknown}'`, unknown);
		if (typeof input.agent !== "string" || input.agent.length === 0) return rejected("agent must be a non-empty string", "agent");
		if (typeof input.task !== "string" || input.task.length === 0) return rejected("task must be a non-empty string", "task");
		const invalidType = validateOptionTypes(input, undefined, undefined, "delegation container");
		if (invalidType) return invalidType;
		const item = Object.fromEntries(
			Object.entries(input).filter(([key]) => CHILD_KEYS.has(key)),
		) as DelegationItem;
		const execution: DelegationExecution = { kind: "execution", form: "single", items: [item], script: "" };
		return { ...execution, script: serializeDelegationExecution(execution) };
	}
	return rejected("execution requires literal agent/task fields or a supported workflowScript", "delegation");
}
