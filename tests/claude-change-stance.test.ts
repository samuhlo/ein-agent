// =============================================================================
// TESTS: Claude lee y escribe la MISMA postura de cambio que Pi
// -----------------------------------------------------------------------------
// El agujero que cierra: Pi decidía "este cambio va sin TDD estricto" y lo
// guardaba en la memoria de su sesión. Claude no tenía cómo leerlo, caía a
// `openspec/config.yaml` (`strict_tdd: true`) y continuaba el MISMO cambio en
// estricto. Un trabajo empezado en un runtime cambiaba de estándar al pasar al
// otro sin que nadie lo viera — § 003 y § 009.6 del manifiesto.
//
// La postura vive en `openspec/changes/<change>/preflight.json`. El puente es
// el disco, no la conversación.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSettingsBlock, buildStatusOutput, runPreflightCommand } from "../ein-cc/sdd-cli/cli.ts";
import { readPreflightRecord } from "../ein-pi/agent/lib/sdd-preflight-record";
import { readChangeLane } from "../ein-pi/agent/lib/sdd-lane";

function sandbox(change = "mi-cambio") {
	const cwd = mkdtempSync(join(tmpdir(), "ein-cc-stance-"));
	const changeDir = join(cwd, "openspec", "changes", change);
	mkdirSync(changeDir, { recursive: true });
	mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
	// El caso real de este repo: el proyecto declara TDD estricto en el config,
	// que es justo lo que la postura del cambio tiene que poder desactivar.
	mkdirSync(join(cwd, "openspec"), { recursive: true });
	writeFileSync(join(cwd, "openspec", "config.yaml"), "strict_tdd: true\n");
	return { cwd, change, changeDir, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("ein-cc-sdd preflight — leer", () => {
	test("sin postura decidida lo dice, y no inventa una", () => {
		const box = sandbox();
		try {
			const { text, exitCode } = runPreflightCommand(box.cwd, []);
			expect(exitCode).toBe(0);
			expect(text).toContain("sin decidir");
			expect(readPreflightRecord(box.changeDir)).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});

	test("sin cambio activo sale con error en vez de fingir un cambio", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-cc-stance-vacio-"));
		try {
			expect(runPreflightCommand(cwd, []).exitCode).toBe(1);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("un nombre de cambio inseguro se rechaza", () => {
		const box = sandbox();
		try {
			expect(runPreflightCommand(box.cwd, ["../fuera"]).exitCode).toBe(1);
		} finally {
			box.cleanup();
		}
	});
});

describe("ein-cc-sdd preflight — escribir", () => {
	test("`--tdd off` deja la decisión en disco firmada por claude", () => {
		const box = sandbox();
		try {
			const { text, exitCode } = runPreflightCommand(box.cwd, ["--tdd", "off"]);
			expect(exitCode).toBe(0);
			expect(text).toContain("off");
			const record = readPreflightRecord(box.changeDir);
			expect(record?.tdd).toBe("off");
			expect(record?.decidedBy).toBe("claude");
		} finally {
			box.cleanup();
		}
	});

	test("`--lane micro` declara el carril del cambio", () => {
		const box = sandbox();
		try {
			expect(runPreflightCommand(box.cwd, ["--tdd", "off", "--lane", "micro"]).exitCode).toBe(0);
			expect(readChangeLane(box.changeDir)).toBe("micro");
		} finally {
			box.cleanup();
		}
	});

	test("una postura ya decidida no se pisa sin `--force`", () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "strict"]);
			const second = runPreflightCommand(box.cwd, ["--tdd", "off"]);
			expect(second.exitCode).toBe(1);
			expect(readPreflightRecord(box.changeDir)?.tdd).toBe("strict");

			runPreflightCommand(box.cwd, ["--tdd", "off", "--force"]);
			expect(readPreflightRecord(box.changeDir)?.tdd).toBe("off");
		} finally {
			box.cleanup();
		}
	});

	test("un valor de TDD desconocido se rechaza en vez de caer a un default", () => {
		const box = sandbox();
		try {
			expect(runPreflightCommand(box.cwd, ["--tdd", "quizá"]).exitCode).toBe(1);
			expect(readPreflightRecord(box.changeDir)).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});
});

describe("la postura del cambio manda sobre el config del proyecto", () => {
	test("el bloque de ajustes incluye la postura y dice que sobrescribe", () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "off"]);
			const block = buildSettingsBlock(box.cwd);
			expect(block).toContain("SDD change stance");
			expect(block).toContain("OFF");
			expect(block).toMatch(/overrides/i);
		} finally {
			box.cleanup();
		}
	});

	test("sin postura decidida el bloque no gana una sección vacía", () => {
		const box = sandbox();
		try {
			expect(buildSettingsBlock(box.cwd)).not.toContain("SDD change stance");
		} finally {
			box.cleanup();
		}
	});

	test("una postura escrita por Pi la lee Claude tal cual", () => {
		const box = sandbox();
		try {
			writeFileSync(
				join(box.changeDir, "preflight.json"),
				JSON.stringify({ tdd: "off", decidedBy: "pi", decidedAt: new Date().toISOString() }),
			);
			expect(buildSettingsBlock(box.cwd)).toContain("OFF");
			expect(buildStatusOutput(box.cwd, undefined)).toContain("off (pi)");
		} finally {
			box.cleanup();
		}
	});
});

describe("el status enseña la postura", () => {
	test("una postura sin decidir se dibuja como desconocida, no como su default", () => {
		const box = sandbox();
		try {
			const out = buildStatusOutput(box.cwd, undefined);
			expect(out).toContain("Postura del cambio");
			expect(out).toContain("sin decidir");
		} finally {
			box.cleanup();
		}
	});
});
