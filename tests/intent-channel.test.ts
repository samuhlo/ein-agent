// =============================================================================
// TESTS: intent-channel (modulo puro) + contrato estructural de SKILL.md
//   Unit: nombres canonicos, resolucion de rutas, filtro de nombres seguros.
//   Contract: SKILL.md existe, trae las secciones y el vocabulario requeridos.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	ARTIFACT_NAME,
	CANONICAL_COMMANDS,
	EH_COMMAND,
	INTENT_COMMAND,
	SKILL_NAME,
	buildEhKickoff,
	buildIntentKickoff,
	resolveClaudeSkillPath,
	resolveIntentPath,
	resolvePiSkillPath,
} from "../ein-pi/agent/lib/intent-channel.ts";

const SKILL_PATH = join(
	import.meta.dir,
	"..",
	"ein-pi",
	"core",
	"skills",
	"local",
	"intent-channel",
	"SKILL.md",
);

describe("nombres canonicos", () => {
	test("los comandos y la skill estan fijados", () => {
		expect(INTENT_COMMAND).toBe("ein:intent");
		expect(EH_COMMAND).toBe("ein:eh");
		expect(CANONICAL_COMMANDS).toEqual(["ein:intent", "ein:eh"]);
		expect(SKILL_NAME).toBe("intent-channel");
		expect(ARTIFACT_NAME).toBe("intent.md");
	});
});

describe("resolucion de rutas de skill (R3)", () => {
	test("Pi resuelve dentro de skills/local/<skill>/SKILL.md", () => {
		const p = resolvePiSkillPath("/tmp/agent-home");
		expect(p).toBe("/tmp/agent-home/skills/local/intent-channel/SKILL.md");
	});

	test("Claude resuelve dentro de skills/<skill>/SKILL.md (aplanado)", () => {
		const p = resolveClaudeSkillPath("/tmp/claude-home");
		expect(p).toBe("/tmp/claude-home/skills/intent-channel/SKILL.md");
	});
});

describe("resolveIntentPath (R9): nombre seguro antes de construir ruta", () => {
	let DIR: string;

	function withChangesDir(): string {
		DIR = mkdtempSync(join(tmpdir(), "intent-channel-"));
		mkdirSync(join(DIR, "openspec", "changes"), { recursive: true });
		return DIR;
	}

	test("rechaza nombres inseguros sin construir ruta", () => {
		const cwd = withChangesDir();
		for (const bad of ["../../etc", "a/b", "a\\b", "..", "", "archive"]) {
			const result = resolveIntentPath(cwd, bad);
			expect(result.ok).toBe(false);
		}
		rmSync(cwd, { recursive: true, force: true });
	});

	test("acepta un nombre valido y honra el fallback openspec/changes -> .sdd/changes", () => {
		const cwd = withChangesDir();
		const ok = resolveIntentPath(cwd, "add-intent-channel");
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.path).toBe(join(cwd, "openspec", "changes", "add-intent-channel", "intent.md"));
		}
		rmSync(cwd, { recursive: true, force: true });

		const legacyDir = mkdtempSync(join(tmpdir(), "intent-channel-legacy-"));
		mkdirSync(join(legacyDir, ".sdd", "changes"), { recursive: true });
		const legacy = resolveIntentPath(legacyDir, "add-intent-channel");
		expect(legacy.ok).toBe(true);
		if (legacy.ok) {
			expect(legacy.path).toBe(join(legacyDir, ".sdd", "changes", "add-intent-channel", "intent.md"));
		}
		rmSync(legacyDir, { recursive: true, force: true });
	});
});

describe("builders de kickoff (R8): nunca escriben, solo devuelven texto", () => {
	test("cada builder produce un mensaje que nombra la skill y su seccion", () => {
		const intent = buildIntentKickoff();
		const eh = buildEhKickoff();
		expect(intent.text).toContain(SKILL_NAME);
		expect(intent.text).toContain("/ein:intent");
		expect(eh.text).toContain(SKILL_NAME);
		expect(eh.text).toContain("/ein:eh");
	});
});

describe("contrato estructural de SKILL.md (grupo 002 dependencia)", () => {
	test("existe y trae frontmatter valido", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		expect(raw.startsWith("---\n")).toBe(true);
		expect(raw).toMatch(/name:\s*intent-channel/);
		expect(raw).toMatch(/description:/);
		expect(raw).toMatch(/license:/);
	});

	test("trae las secciones requeridas, en orden", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		const intentIdx = raw.indexOf("## /ein:intent");
		const ehIdx = raw.indexOf("## /ein:eh");
		const templateIdx = raw.indexOf("## Artefact template");
		expect(intentIdx).toBeGreaterThan(-1);
		expect(ehIdx).toBeGreaterThan(intentIdx);
		expect(templateIdx).toBeGreaterThan(ehIdx);
	});

	test("trae el vocabulario Spanish requerido (R16)", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		for (const word of ["árbol de decisiones", "frontera", "ronda"]) {
			expect(raw).toContain(word);
		}
		expect(raw).toContain("los hechos los busco yo, las decisiones son tuyas");
	});

	test("declara activacion solo por invocacion explicita del usuario (R5)", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		expect(raw.toLowerCase()).toContain("invocaci");
	});

	test("la ultima linea no vacia atribuye a grilling / Matt Pocock (R15)", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
		const last = lines[lines.length - 1] ?? "";
		expect(last).toContain("grilling");
		expect(last).toContain("Matt Pocock");
	});

	test("el primer round es una seccion addressable propia (R17)", () => {
		const raw = readFileSync(SKILL_PATH, "utf8");
		expect(raw).toMatch(/## .*[Rr]onda 1|## .*[Ff]irst [Rr]ound/);
	});
});
