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

import {
	buildSettingsBlock,
	buildStatusOutput,
	runClaudeIntentPreflight,
	runClaudePreflightCommand,
	runClaudePreflightInputCommand,
	runPreflightCommand,
} from "../ein-cc/sdd-cli/cli.ts";
import { readPreflightRecord } from "../ein-pi/agent/lib/sdd-preflight-record";
import { readChangeLane } from "../ein-pi/agent/lib/sdd-lane";

function modifyingEvidence(
	overrides: Partial<Parameters<typeof runClaudeIntentPreflight>[1]["evidence"]> = {},
): Parameters<typeof runClaudeIntentPreflight>[1]["evidence"] {
	return {
		activation: "modifying",
		declaredLane: null,
		bounded: true,
		mechanical: true,
		documentationOrTextOnly: false,
		introducesBehavior: false,
		securityRisk: false,
		persistentDataRisk: false,
		destructiveActionRisk: false,
		bypassRequested: false,
		...overrides,
	};
}

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

describe("ein-cc-sdd preflight — dispatch público", () => {
	test("entra por la intención compartida antes de conservar la salida de postura", async () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "strict"]);
			const result = await runClaudePreflightInputCommand(box.cwd, [], JSON.stringify({
				evidence: modifyingEvidence(),
				summary: "Ajustar un dispatch acotado.",
				material: {
					objective: "Ajustar el dispatch",
					boundaries: { in: ["CLI Claude"], out: ["core"] },
					completionCriteria: ["El comando público pasa por intención"],
				},
				materialEvidence: "sufficient",
			}));

			expect(result.intent?.kind).toBe("resolved");
			if (result.intent?.kind === "resolved") {
				expect(result.intent.resolution).toBe("automatic-small");
			}
			expect(result.exitCode).toBe(0);
			expect(result.text.split("\n")[0]).toBe("Ajustar un dispatch acotado.");
			expect(result.text).toContain("TDD estricto=strict");
			expect(readPreflightRecord(box.changeDir)?.intent?.resolution).toBe("automatic-small");
		} finally {
			box.cleanup();
		}
	});

	test("expone normal pendiente sin alterar la compatibilidad de consulta", async () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "off"]);
			const result = await runClaudePreflightCommand(box.cwd, [], {
				change: box.change,
				evidence: modifyingEvidence({ introducesBehavior: true, mechanical: false }),
				summary: "Añadir comportamiento.",
				material: {
					objective: "Añadir comportamiento",
					boundaries: { in: ["adapter"], out: ["router"] },
					completionCriteria: ["El comportamiento queda probado"],
				},
				materialEvidence: "sufficient",
			});

			expect(result.intent.kind).toBe("pending");
			expect(result.text).toContain("1. What outcome should this change achieve?");
			expect(result.text).toContain("2. What is in and out of scope");
			expect(result.text).toContain("TDD estricto=off");
			expect(readPreflightRecord(box.changeDir)?.intent).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});

	test("resuelve bypass seguro por la misma entrada y luego aplica flags legacy", async () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "strict"]);
			const result = await runClaudePreflightCommand(box.cwd, ["--lane", "standard"], {
				change: box.change,
				evidence: modifyingEvidence({ bypassRequested: true, mechanical: false }),
				summary: "Aplicar el cambio sin preguntas.",
				material: {
					objective: "Aplicar el cambio",
					boundaries: { in: ["adapter"], out: ["core"] },
					completionCriteria: ["La prueba pública pasa"],
				},
				materialEvidence: "sufficient",
			});

			expect(result.intent.kind).toBe("resolved");
			if (result.intent.kind === "resolved") expect(result.intent.resolution).toBe("bypassed");
			expect(readChangeLane(box.changeDir)).toBe("standard");
			expect(readPreflightRecord(box.changeDir)?.intent?.laneOrigin).toBe("declared");
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

	test("un `--lane` explícito conserva un record legacy escrito por Pi", () => {
		const box = sandbox();
		try {
			const legacy = JSON.stringify({
				tdd: "off",
				decidedBy: "pi",
				decidedAt: "2026-08-28T00:00:00.000Z",
			});
			writeFileSync(join(box.changeDir, "preflight.json"), legacy);

			expect(runPreflightCommand(box.cwd, ["--lane", "micro"]).exitCode).toBe(0);
			expect(readPreflightRecord(box.changeDir)).toEqual({
				tdd: "off",
				decidedBy: "pi",
				decidedAt: "2026-08-28T00:00:00.000Z",
			});
			expect(readChangeLane(box.changeDir)).toBe("micro");
		} finally {
			box.cleanup();
		}
	});

	test("un `--lane` explícito conserva la intención y adquiere autoridad declarada", async () => {
		const box = sandbox();
		try {
			runPreflightCommand(box.cwd, ["--tdd", "strict"]);
			const resolved = await runClaudeIntentPreflight(box.cwd, {
				change: box.change,
				evidence: {} as Parameters<typeof runClaudeIntentPreflight>[1]["evidence"],
				summary: "Actualizar el adapter sin ampliar el alcance.",
				material: {
					objective: "Actualizar el adapter",
					boundaries: { in: ["adapter"], out: ["coordinator"] },
					completionCriteria: ["La prueba focalizada pasa"],
				},
				materialEvidence: "sufficient",
				confirmed: true,
			});
			expect(resolved.kind).toBe("resolved");
			const before = readPreflightRecord(box.changeDir);

			expect(runPreflightCommand(box.cwd, ["--lane", "standard"]).exitCode).toBe(0);
			const after = readPreflightRecord(box.changeDir);
			expect(after?.intent?.laneOrigin).toBe("declared");
			expect(after?.intent?.resolvedBy).toBe("claude");
			expect(after?.intent?.materialKey).toBe(before?.intent?.materialKey);
			expect(after?.tdd).toBe("strict");
			expect(after?.decidedBy).toBe("claude");
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
