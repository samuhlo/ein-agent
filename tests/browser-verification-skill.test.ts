import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { browserVerificationSkillTask } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { extractTriggers, resolvePhaseSkills, type SkillEntry } from "../ein-pi/agent/extensions/ein-skill-registry.ts";

describe("browser verification is loaded only for a declared browser check", () => {
	test("selects the project-local skill for a verify command, not every phase", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-browser-skill-"));
		try {
			const dir = join(root, "openspec", "changes", "demo");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "tasks.md"), "- verify: `bun run test:e2e`\n");
			expect(browserVerificationSkillTask(root, "demo", "sdd-verify")).toBe("browser-verification");
			expect(browserVerificationSkillTask(root, "demo", "sdd-apply")).toBe("");
			writeFileSync(join(dir, "tasks.md"), "- verify: `bun test tests/unit.test.ts`\n");
			expect(browserVerificationSkillTask(root, "demo", "sdd-verify")).toBe("");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	test("its declared triggers resolve from the injected name", () => {
		const path = join(import.meta.dir, "../runtime/skills/local/browser-verification/SKILL.md");
		const loaded = loadSkillsFromDir({ dir: dirname(path), source: "ein-local" });
		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.skills.map((skill) => skill.name)).toEqual(["browser-verification"]);
		const description = loaded.skills[0]!.description;
		const entry: SkillEntry = { key: "browser-verification", name: "browser-verification", source: "local", scope: "user", path, description, stackTags: ["frontend"], triggers: extractTriggers(description) };
		expect(resolvePhaseSkills([entry], "browser-verification")).toEqual([entry]);
		expect(resolvePhaseSkills([entry], "verify a pure function with bun test")).toEqual([]);
	});
});
