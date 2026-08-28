// =============================================================================
// TESTS: paridad cruzada Pi <-> Claude para el canal de intención
//   Gap que map.md marcó sin cubrir: ningún test comprobaba que un nombre de
//   comando existiera en AMBOS runtimes. Estos tres tests lo cierran (R1-R3).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listClaudeCommands } from "../ein-cc/sync.ts";
import {
	CANONICAL_COMMANDS,
	SKILL_NAME,
	resolveClaudeSkillPath,
	resolvePiSkillPath,
} from "../ein-pi/agent/lib/intent-channel.ts";

const REPO = join(import.meta.dir, "..");
const PI_EXTENSION = join(REPO, "ein-pi", "agent", "extensions", "ein-intent.ts");
const CLAUDE_COMMANDS_DIR = join(REPO, "ein-cc", "commands", "ein");
const SKILL_SOURCE = join(REPO, "ein-pi", "core", "skills", "local", "intent-channel", "SKILL.md");

function shortName(canonical: string): string {
	// "ein:intent" -> "intent"
	return canonical.split(":")[1] ?? canonical;
}

describe("command presence: cada nombre canónico existe en los dos runtimes", () => {
	test("Pi registra ambos comandos", () => {
		const src = readFileSync(PI_EXTENSION, "utf8");
		for (const name of CANONICAL_COMMANDS) {
			expect(src).toMatch(new RegExp(`registerCommand\\(\\s*(?:INTENT_COMMAND|EH_COMMAND|"${name}")`));
		}
		// las dos constantes deben mapear a los dos nombres canónicos, no a un subconjunto
		expect((src.match(/registerCommand\(/g) ?? []).length).toBe(CANONICAL_COMMANDS.length);
	});

	test("Claude publica un .md por cada comando canónico", () => {
		const claudeFiles = listClaudeCommands();
		for (const name of CANONICAL_COMMANDS) {
			expect(claudeFiles).toContain(`${shortName(name)}.md`);
		}
	});

	test("un nombre presente en solo un lado hace fallar la comparación (triangulación)", () => {
		const fakeCanonical = ["ein:intent", "ein:eh", "ein:only-on-one-side"];
		const claudeFiles = listClaudeCommands();
		const missingOnClaude = fakeCanonical.filter((name) => !claudeFiles.includes(`${shortName(name)}.md`));
		expect(missingOnClaude).toEqual(["ein:only-on-one-side"]);
	});
});

describe("skill identity: ambas superficies resuelven al mismo skill (R3)", () => {
	test("los resolutores derivan del mismo nombre de skill y del mismo fichero fuente", () => {
		expect(resolvePiSkillPath("/tmp/agent")).toContain(`/${SKILL_NAME}/SKILL.md`);
		expect(resolveClaudeSkillPath("/tmp/claude")).toContain(`/${SKILL_NAME}/SKILL.md`);

		const source = readFileSync(SKILL_SOURCE, "utf8");
		expect(source).toMatch(/name:\s*intent-channel/);
	});

	test("un segundo skill local resuelve a su propio par de destinos sin colisión", () => {
		const other = "comment-style";
		const piPath = resolvePiSkillPath("/tmp/agent").replace(SKILL_NAME, other);
		const claudePath = resolveClaudeSkillPath("/tmp/claude").replace(SKILL_NAME, other);
		expect(piPath).not.toBe(resolvePiSkillPath("/tmp/agent"));
		expect(claudePath).not.toBe(resolveClaudeSkillPath("/tmp/claude"));
		expect(piPath).toContain(`/${other}/SKILL.md`);
	});

	test("un nombre de skill inventado no resuelve silenciosamente al real", () => {
		const bogus = "not-a-real-skill";
		expect(resolvePiSkillPath("/tmp/agent")).not.toContain(bogus);
		expect(resolveClaudeSkillPath("/tmp/claude")).not.toContain(bogus);
	});
});

describe("no restatement: las superficies apuntan al skill, no repiten el protocolo (R1)", () => {
	const VOCAB_MARKERS = ["árbol de decisiones", "frontera", "Ronda 1 (first round)"];

	test("el extension Pi no repite el vocabulario del protocolo", () => {
		const src = readFileSync(PI_EXTENSION, "utf8");
		expect(src).toContain(SKILL_NAME); // referencia neutra: ok
		for (const marker of VOCAB_MARKERS) {
			expect(src).not.toContain(marker);
		}
	});

	test("los comandos Claude no repiten el vocabulario del protocolo", () => {
		for (const file of ["intent.md", "eh.md"]) {
			const src = readFileSync(join(CLAUDE_COMMANDS_DIR, file), "utf8");
			expect(src).toContain(SKILL_NAME);
			for (const marker of VOCAB_MARKERS) {
				expect(src).not.toContain(marker);
			}
		}
	});
});
