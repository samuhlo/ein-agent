// =============================================================================
// TESTS: lib/git-delivery
// Persistencia del modo de entrega (auto/ask/off) y la detección de intención
// de entrega en el mensaje del usuario (base del modo `auto`: si lo pides, no
// se vuelve a preguntar). Una pregunta o una negación NO autorizan.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	GIT_DELIVERY_OPTIONS,
	gitDeliveryConfigPath,
	messageRequestsDelivery,
	readGitDeliveryMode,
	writeGitDeliveryMode,
} = await import("../ein-pi/agent/lib/git-delivery");

function tmpProject(): string {
	return mkdtempSync(join(tmpdir(), "ein-git-delivery-"));
}

describe("readGitDeliveryMode / writeGitDeliveryMode", () => {
	test("default sin config = auto", () => {
		const cwd = tmpProject();
		try {
			expect(readGitDeliveryMode(cwd)).toBe("auto");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("round-trip de los tres modos", () => {
		const cwd = tmpProject();
		try {
			for (const mode of GIT_DELIVERY_OPTIONS) {
				writeGitDeliveryMode(cwd, mode);
				expect(readGitDeliveryMode(cwd)).toBe(mode);
			}
			expect(gitDeliveryConfigPath(cwd)).toBe(
				join(cwd, ".pi", "ein", "git.json"),
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("valor inválido en el fichero → default auto", () => {
		const cwd = tmpProject();
		try {
			writeGitDeliveryMode(cwd, "auto");
			// sobrescribe con basura
			const { writeFileSync } = require("node:fs");
			writeFileSync(gitDeliveryConfigPath(cwd), '{"mode":"yolo"}');
			expect(readGitDeliveryMode(cwd)).toBe("auto");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("messageRequestsDelivery", () => {
	test("peticiones de entrega → true", () => {
		expect(messageRequestsDelivery("haz commit y push")).toBe(true);
		expect(messageRequestsDelivery("sube la rama y abre el PR")).toBe(true);
		expect(messageRequestsDelivery("commitea esto")).toBe(true);
		expect(messageRequestsDelivery("abre un PR a main")).toBe(true);
		expect(messageRequestsDelivery("pushea los cambios")).toBe(true);
		expect(messageRequestsDelivery("mergea la rama")).toBe(true);
		expect(messageRequestsDelivery("publica el código")).toBe(true);
	});

	test("sin intención de entrega → false", () => {
		expect(messageRequestsDelivery("arregla el bug del login")).toBe(false);
		expect(messageRequestsDelivery("explora el repo y resume")).toBe(false);
		expect(messageRequestsDelivery("muéstrame el git status")).toBe(false);
		expect(messageRequestsDelivery("")).toBe(false);
	});

	test("una pregunta NO autoriza", () => {
		expect(messageRequestsDelivery("¿hago push ya?")).toBe(false);
		expect(messageRequestsDelivery("should I open a PR?")).toBe(false);
	});

	test("una negación NO autoriza", () => {
		expect(messageRequestsDelivery("no hagas push todavía")).toBe(false);
		expect(messageRequestsDelivery("haz el commit pero sin push")).toBe(false);
		expect(messageRequestsDelivery("don't push yet")).toBe(false);
	});
});
