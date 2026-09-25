import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("legacy branch-pr no longer invents an approved GitHub issue gate", () => {
	const skill = readFileSync(join(import.meta.dir, "../runtime/skills/local/branch-pr/SKILL.md"), "utf8");
	expect(skill).toContain("github-workflow` owns");
	expect(skill).toContain("A GitHub issue is optional");
	expect(skill).not.toContain("status:approved");
	expect(skill).not.toContain("Every PR MUST link");
});
