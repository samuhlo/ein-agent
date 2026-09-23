import { expect, test } from "bun:test";
import { classifyContinuityTool, operationInputDigest, parseOperationJournal, buildOperationJournal } from "../ein-pi/agent/lib/continuity-operations.ts";
import { continuityToolOutcome } from "../ein-pi/agent/lib/continuity-operation-adapter.ts";

test("read classification is exact and never inferred from command substrings or agent prose", () => {
	for (const tool of ["read", "grep", "find", "Read", "Grep", "Glob"]) expect(classifyContinuityTool(tool, {})).toBe("read");
	for (const command of ["false", "true", "git diff --check", "git status --short", "git rev-parse HEAD"]) expect(classifyContinuityTool("bash", { command })).toBe("read");
	for (const command of ["git diff --check; rm data", "true > data", "ENV=x git status --short", "bun test", "git status --short | cat"]) expect(classifyContinuityTool("bash", { command })).toBe("external-or-unknown");
	expect(classifyContinuityTool("subagent", { agent: "ein-scout" })).toBe("external-or-unknown");
	expect(classifyContinuityTool("subagent", {}, true)).toBe("read");
	expect(classifyContinuityTool("new-plugin", {})).toBe("uncovered");
});
test("digests are key-order independent and malformed journals never become valid", () => {
	expect(operationInputDigest({ x: 1, y: 2 })).toBe(operationInputDigest({ y: 2, x: 1 }));
	const empty = buildOperationJournal([]); expect(parseOperationJournal(empty)).toEqual(empty);
	expect(parseOperationJournal({ ...empty, revision: `sha256:${"0".repeat(64)}` })).toBeNull();
	expect(parseOperationJournal({ ...empty, secret: "forbidden" })).toBeNull();
});
test("native child exit zero cannot erase an explicit JSON blocked or partial result", () => {
	const outcome = (status: string) => continuityToolOutcome({ toolName: "subagent", isError: false, input: { agent: "sdd-apply", task: "bounded work" }, details: { mode: "single", results: [{ agent: "sdd-apply", task: "bounded work", exitCode: 0, finalOutput: JSON.stringify({ status }) }] } });
	for (const status of ["blocked", "partial", "fail", "unavailable"]) expect(outcome(status)).toBe("unavailable");
	expect(outcome("complete")).toBe("succeeded");
	expect(outcome("pass")).toBe("unavailable");
});
