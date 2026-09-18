import { describe, expect, test } from "bun:test";

import {
	DELEGATION_CALL_MAX,
	DELEGATION_SCRIPT_MAX_BYTES,
	admitDelegation,
} from "../ein-pi/agent/lib/delegation-admission.ts";

function execution(input: unknown) {
	const result = admitDelegation(input);
	expect(result.kind).toBe("execution");
	if (result.kind !== "execution") throw new Error(result.kind === "rejected" ? result.reason : `unexpected ${result.kind}`);
	return result;
}

function rejection(input: unknown, field?: string) {
	const result = admitDelegation(input);
	expect(result.kind).toBe("rejected");
	if (result.kind !== "rejected") throw new Error("expected rejection");
	if (field) expect(result.field).toBe(field);
	return result;
}

describe("delegation admission", () => {
	test("admits a direct single and preserves decoded task bytes", () => {
		const task = "línea 1\nline 2 \\n ${notCode}";
		const result = execution({ agent: "ein-cleaner", task, cwd: "/tmp/project", async: false });
		expect(result.items).toEqual([{ agent: "ein-cleaner", task, cwd: "/tmp/project" }]);
		expect(execution({ workflowScript: result.script }).items[0]?.task).toBe(task);
	});

	test("admits an awaited sequence and emits one canonical script", () => {
		const result = execution({ workflowScript: `
			await runs.run("map", { agent: "sdd-map", task: 'map\\nnow' });
			return await runs.run(` + "`apply`" + `, { agent: "sdd-apply", task: \`apply exactly\`, tdd: "strict" });
		` });
		expect(result.form).toBe("sequence");
		expect(result.items.map(({ key, agent, task }) => ({ key, agent, task }))).toEqual([
			{ key: "map", agent: "sdd-map", task: "map\nnow" },
			{ key: "apply", agent: "sdd-apply", task: "apply exactly" },
		]);
		expect(result.script).not.toContain("tdd");
		expect(execution({ workflowScript: result.script }).items.map((item) => item.task)).toEqual(["map\nnow", "apply exactly"]);
	});

	test("admits a static keyed fan-out without changing its independence", () => {
		const result = execution({ workflowScript: `return runs.all([
			{ key: "api", agent: "ein-scout", task: "read API", context: "fresh" },
			{ key: "tests", agent: "ein-scout", task: "read tests", context: "fresh" },
			{ key: "docs", agent: "ein-scout", task: "read docs", context: "fresh" }
		])` });
		expect(result.form).toBe("all");
		expect(result.items.map((item) => item.key)).toEqual(["api", "tests", "docs"]);
		expect(result.script.startsWith("return runs.all(")).toBe(true);
	});

	test("admits literal status as management without execution items", () => {
		expect(admitDelegation({ workflowScript: `return await runs.status("run-1")` })).toEqual({
			kind: "management",
			action: "status",
			id: "run-1",
			script: `return runs.status("run-1")`,
		});
		expect(admitDelegation({ action: "get", id: "run-1" })).toMatchObject({ kind: "management", action: "get" });
	});

	test("rejects variables, interpolation, calls, spreads, computed and duplicate keys", () => {
		for (const script of [
			`return runs.run("x", { agent: chosen, task: "read" })`,
			"return runs.run('x', { agent: 'ein-scout', task: `read ${target}` })",
			`return runs.run("x", { agent: "ein-scout", task: makeTask() })`,
			`return runs.run("x", { ...child, agent: "ein-scout", task: "read" })`,
			`return runs.run("x", { ["agent"]: "ein-scout", task: "read" })`,
			`return runs.run("x", { agent: "ein-scout", agent: "other", task: "read" })`,
		]) rejection({ workflowScript: script });
	});

	test("rejects a mixed literal/dynamic fan-out as one unit", () => {
		const result = rejection({ workflowScript: `return runs.all([
			{ key: "visible", agent: "ein-scout", task: "read A" },
			{ key: "hidden", agent: selectedAgent, task: "read B" }
		])` }, "child.agent");
		expect(result.reason).toContain("resolve dynamic values");
	});

	test("does not accept decoys, comments, regex, loops, conditions, aliases, or host access", () => {
		for (const script of [
			`const bait = { agent: "ein-scout", task: "fake" }; return runs.run("x", { agent: "ein-scout", task: "real" })`,
			`/agent: "ein-scout"/; return runs.status("id")`,
			`for (;;) break; return runs.run("x", {agent:"ein-scout",task:"x"})`,
			`if (ok) await runs.run("x", {agent:"ein-scout",task:"x"}); return runs.run("y", {agent:"ein-scout",task:"y"})`,
			`return other.run("x", {agent:"ein-scout",task:"x"})`,
			`return runs.host("git", {})`,
		]) rejection({ workflowScript: script });
		expect(admitDelegation({ workflowScript: `// runs.run("fake", {agent:"ein-scout",task:"fake"})\nreturn runs.status("id")` })).toMatchObject({ kind: "management", action: "status" });
	});

	test("rejects legacy arrays with a precise reissue code", () => {
		for (const key of ["tasks", "steps", "chain"]) {
			const result = rejection({ [key]: [{ agent: "ein-scout", task: "read" }] }, key);
			expect(result.code).toBe("legacy-delegation-reissue-required");
			expect(result.reason).toContain("existing authorization");
		}
	});

	test("rejects ambiguous mixtures, unknown fields, invalid keys, and turnBudget", () => {
		rejection({ workflowScript: `return runs.run("x", {agent:"ein-scout",task:"x"})`, agent: "ein-scout", task: "x" }, "workflowScript");
		rejection({ workflowScript: `return runs.run("x", {agent:"ein-scout",task:"x",mystery:true})` }, "mystery");
		rejection({ workflowScript: `return runs.run("x", {agent:"ein-scout",task:"x",turnBudget:{maxTurns:2}})` }, "turnBudget");
		rejection({ workflowScript: `return runs.all([{key:"bad key",agent:"ein-scout",task:"x"}])` }, "key");
		rejection({ workflowScript: `return runs.all([{key:"same",agent:"ein-scout",task:"x"},{key:"same",agent:"ein-scout",task:"y"}])` }, "key");
	});

	test("enforces byte and call bounds", () => {
		const oversized = `return runs.status("${"x".repeat(DELEGATION_SCRIPT_MAX_BYTES)}")`;
		expect(rejection({ workflowScript: oversized }).reason).toContain("bytes");
		const calls = Array.from({ length: DELEGATION_CALL_MAX + 1 }, (_, index) =>
			`${index === DELEGATION_CALL_MAX ? "return " : "await "}runs.run("k${index}",{agent:"a",task:"t"})${index === DELEGATION_CALL_MAX ? "" : ";"}`,
		).join("\n");
		expect(rejection({ workflowScript: calls }).reason).toContain("calls");
	});
});
