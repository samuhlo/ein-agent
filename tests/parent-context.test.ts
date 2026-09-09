import { describe, expect, test } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { formatSkillsForPrompt, type Skill } from "@earendil-works/pi-coding-agent";
import { compactParentSkillCatalog } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { getOrchestratorPrompt, loadOrchestratorCore, renderOrchestratorCore } from "../ein-pi/agent/lib/persona.ts";

const assets = join(import.meta.dir, "..", "runtime", "assets");
const contract = readFileSync(join(assets, "orchestrator.md"), "utf8");
const core = readFileSync(join(assets, "orchestrator-core.md"), "utf8");

function skill(name: string, disabled = false): Skill {
	return {
		name, description: "Detailed framework-specific instructions. ".repeat(30),
		filePath: `/skills/${name}/SKILL.md`, baseDir: `/skills/${name}`,
		sourceInfo: { source: "user" }, disableModelInvocation: disabled,
	} as Skill;
}

describe("parent skill catalogue", () => {
	test("keeps discoverable names and surrounding instructions without copying descriptions", () => {
		const skills = [skill("vue"), skill("zod"), skill("manual-only", true)];
		const original = `USER PREFIX${formatSkillsForPrompt(skills)}\nOTHER EXTENSION`;
		const compact = compactParentSkillCatalog(original, skills);
		expect(compact).toStartWith("USER PREFIX");
		expect(compact).toEndWith("\nOTHER EXTENSION");
		expect(compact).toContain('"vue", "zod"');
		expect(compact).not.toContain("Detailed framework");
		expect(compact).not.toContain("manual-only");
		expect(compact).toContain("ein_skill_resolve");
		expect(compact).toContain("ein_skill_registry");
		expect(compact).toContain("read the selected SKILL.md");
		expect(skills[2]!.disableModelInvocation).toBe(true);
		expect(skills[0]!.filePath).toBe("/skills/vue/SKILL.md");
		expect(Buffer.byteLength(compact)).toBeLessThan(Buffer.byteLength(original) / 2);
	});

	test("preserves a catalogue rewritten or duplicated by another extension", () => {
		const skills = [skill("vue")];
		const original = formatSkillsForPrompt(skills);
		const rewritten = original.replace("<description>", "<custom-description>");
		expect(compactParentSkillCatalog(rewritten, skills)).toBe(rewritten);
		expect(compactParentSkillCatalog(original + original, skills)).toBe(original + original);
	});

	test("preserves explicit prompts without a native catalogue and old events without options", () => {
		expect(compactParentSkillCatalog("CUSTOM PROMPT", [skill("vue")])).toBe("CUSTOM PROMPT");
		expect(compactParentSkillCatalog("PROMPT", undefined)).toBe("PROMPT");
		expect(compactParentSkillCatalog("PROMPT", [])).toBe("PROMPT");
	});

	test("does not expand a small catalogue and quotes unusual names as data", () => {
		const tiny = { ...skill("\0".repeat(150)), description: "", filePath: "/a", baseDir: "/" };
		const original = formatSkillsForPrompt([tiny]);
		expect(compactParentSkillCatalog(original, [tiny])).toBe(original);
		const unusual = skill('name\n"quoted"');
		const compact = compactParentSkillCatalog(formatSkillsForPrompt([unusual]), [unusual]);
		expect(compact).toContain(JSON.stringify(unusual.name));
	});
});

describe("orchestrator core and bounded references", () => {
	test("the injected core stays below 8 KiB including actual paths", () => {
		const prompt = getOrchestratorPrompt();
		expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(8192);
		expect(prompt).not.toContain("{{");
		expect(prompt).not.toContain("LINEAR OPERATION PACKET");
		expect(prompt).not.toContain("Scope Gate (before");
	});

	test("each read reaches the intended complete section, including after earlier lines are inserted", () => {
		for (const input of [contract, `New preamble\n\n${contract}`]) {
			const prompt = renderOrchestratorCore(core, input, "/a path/contract.md");
			const reads = [...prompt.matchAll(/\{"path":[^\n]+?\}/g)].map((m) => JSON.parse(m[0]));
			expect(reads).toHaveLength(4);
			const headings = ["## Subagent Inventory", "## SDD Flow", "## Delivery & board", "## Identity & voice"];
			for (const [i, read] of reads.entries()) {
				expect(read.path).toBe("/a path/contract.md");
				const selected = input.split("\n").slice(read.offset - 1, read.offset - 1 + read.limit).join("\n");
				expect(selected).toStartWith(headings[i]!);
				expect(read.limit).toBeGreaterThan(0);
				expect(read.limit).toBeLessThan(input.split("\n").length);
			}
		}
	});

	test("a removed canonical heading cannot silently produce a wrong read range", () => {
		expect(() => renderOrchestratorCore(core, contract.replace("## SDD Flow", "## Renamed"), "/contract.md")).toThrow("Missing orchestrator section");
	});
});


test("a partial installation preserves the full contract instead of starting without Ein policy", () => {
	const dir = mkdtempSync("/tmp/ein-core-fallback-");
	try {
		writeFileSync(join(dir, "orchestrator.md"), contract);
		expect(loadOrchestratorCore(dir)).toBe(contract.trim());
		writeFileSync(join(dir, "orchestrator-core.md"), "");
		expect(loadOrchestratorCore(dir)).toBe(contract.trim());
		writeFileSync(join(dir, "orchestrator-core.md"), core);
		writeFileSync(join(dir, "orchestrator.md"), contract.replace("## SDD Flow", "## Changed heading"));
		expect(loadOrchestratorCore(dir)).toContain("## Changed heading");
		expect(loadOrchestratorCore(dir)).not.toContain("{{SDD_READ}}");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
