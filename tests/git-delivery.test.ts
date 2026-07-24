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
	DELIVERY_INTENT_TTL_MS,
	GIT_DELIVERY_OPTIONS,
	deliveryIntentActive,
	gitDeliveryConfigPath,
	messageRequestsDelivery,
	nextDeliveryIntent,
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

	test("negación por cláusula: un 'no' de otra cosa no veta el push pedido", () => {
		// El negador negaba "romper", no el push; la coma corta la cláusula.
		expect(messageRequestsDelivery("no rompas nada, haz push")).toBe(true);
		expect(messageRequestsDelivery("no toques los tests y haz push de la rama")).toBe(true);
	});

	test("'push' como sustantivo (feature/API) no es una orden de entrega", () => {
		expect(messageRequestsDelivery("arregla las push notifications")).toBe(false);
		expect(messageRequestsDelivery("usa history.pushState en el router")).toBe(false);
		// La orden mínima sigue valiendo.
		expect(messageRequestsDelivery("push")).toBe(true);
		expect(messageRequestsDelivery("git push")).toBe(true);
	});
});

// =============================================================================
// Intención PEGAJOSA. Antes se recalculaba en cada mensaje y se pisaba: en una
// sesión real el usuario pidió "haz commit, push y PR", pegó un log de CI a
// mitad del trabajo (mensaje neutro → intención a false) y la delegación
// siguiente del MISMO encargo se quedó sin autorización y bloqueada.
// =============================================================================
describe("nextDeliveryIntent — intención pegajosa con TTL", () => {
	const T0 = 1_000_000;

	test("pedir la entrega la activa", () => {
		const intent = nextDeliveryIntent(undefined, "haz commit, push y PR", T0);
		expect(intent.requested).toBe(true);
		expect(deliveryIntentActive(intent, T0)).toBe(true);
	});

	test("un mensaje neutro la CONSERVA (el caso que rompía)", () => {
		const asked = nextDeliveryIntent(undefined, "haz commit, push y PR", T0);
		const afterLog = nextDeliveryIntent(
			asked,
			"Test (workbench + installer)\nProcess completed with exit code 1.\ntests/project-context.test.ts#L84",
			T0 + 60_000,
		);
		expect(afterLog).toBe(asked);
		expect(deliveryIntentActive(afterLog, T0 + 60_000)).toBe(true);
	});

	test("una negación explícita la cancela", () => {
		const asked = nextDeliveryIntent(undefined, "haz push", T0);
		const denied = nextDeliveryIntent(asked, "no hagas push todavía", T0 + 1000);
		expect(denied.requested).toBe(false);
	});

	test("caduca: un 'haz push' viejo no autoriza una entrega por iniciativa", () => {
		const asked = nextDeliveryIntent(undefined, "haz push", T0);
		const late = T0 + DELIVERY_INTENT_TTL_MS + 1;
		expect(deliveryIntentActive(asked, late)).toBe(false);
		// Y un mensaje neutro pasada la ventana no la resucita.
		expect(nextDeliveryIntent(asked, "sigue con eso", late).requested).toBe(false);
	});

	test("pedirla de nuevo refresca la ventana", () => {
		const asked = nextDeliveryIntent(undefined, "haz push", T0);
		const later = T0 + DELIVERY_INTENT_TTL_MS - 1;
		const renewed = nextDeliveryIntent(asked, "haz push otra vez", later);
		expect(renewed.at).toBe(later);
		expect(deliveryIntentActive(renewed, later + DELIVERY_INTENT_TTL_MS - 1)).toBe(true);
	});

	test("sin intención previa, un mensaje neutro no autoriza nada", () => {
		expect(nextDeliveryIntent(undefined, "mira este error", T0).requested).toBe(false);
	});
});
