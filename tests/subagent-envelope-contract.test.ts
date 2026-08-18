import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	auditEnvelopeConsumers,
	ENVELOPE_CONSUMER_INVENTORY,
	extractToolResultHandlerBody,
	findEnvelopeConsumers,
	type EnvelopeConsumerEntry,
} from "../ein-pi/agent/lib/subagent-envelope-contract.ts";

const EIN_AI_PATH = join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts");
const SDD_PREFLIGHT_PATH = join(import.meta.dir, "../ein-pi/agent/lib/sdd-preflight.ts");
const SCOUT_CONTRACT_PATH = join(import.meta.dir, "../ein-pi/agent/lib/scout-contract.ts");

const REAL_SOURCES = {
	sddPreflight: readFileSync(SDD_PREFLIGHT_PATH, "utf8"),
	scoutContract: readFileSync(SCOUT_CONTRACT_PATH, "utf8"),
};

describe("subagent envelope contract — T1 unitario (fixtures)", () => {
	test("marca hallazgo cuando un consumidor silent-incorrect-state declara foreground-forced y la fuente no lo tiene", () => {
		const inventory: Record<string, EnvelopeConsumerEntry> = {
			someConsumer: {
				failureMode: "silent-incorrect-state",
				protection: "foreground-forced",
				note: "fixture",
			},
		};
		const sourcesWithoutForce = {
			sddPreflight: "export function ensureParticipantForeground(input) { return false; }",
			scoutContract: "",
		};
		const result = auditEnvelopeConsumers(inventory, sourcesWithoutForce);
		expect(result.ok).toBe(false);
		expect(result.findings.some((f) => f.consumer === "someConsumer")).toBe(true);
	});

	test("no marca hallazgo cuando la protección declarada sí está en la fuente", () => {
		const inventory: Record<string, EnvelopeConsumerEntry> = {
			someConsumer: {
				failureMode: "silent-incorrect-state",
				protection: "foreground-forced",
				note: "fixture",
			},
		};
		const result = auditEnvelopeConsumers(inventory, REAL_SOURCES);
		expect(result.ok).toBe(true);
	});

	test("una entrada silent-incorrect-state con protección none SIEMPRE marca hallazgo (R2)", () => {
		const inventory: Record<string, EnvelopeConsumerEntry> = {
			someConsumer: {
				failureMode: "silent-incorrect-state",
				protection: "none",
				note: "fixture",
			},
		};
		const result = auditEnvelopeConsumers(inventory, REAL_SOURCES);
		expect(result.ok).toBe(false);
	});

	test("safe-degradation y loud-wasteful no se auditan por presencia de protección", () => {
		const inventory: Record<string, EnvelopeConsumerEntry> = {
			canary: { failureMode: "safe-degradation", protection: "none", note: "fixture" },
			scoutLike: { failureMode: "loud-wasteful", protection: "scout-launch-normalized", note: "fixture" },
		};
		const result = auditEnvelopeConsumers(inventory, { sddPreflight: "", scoutContract: "" });
		expect(result.ok).toBe(true);
	});
});

describe("subagent envelope contract — T2 integración (detector de novedad, mundo cerrado)", () => {
	test("los consumidores hallados en el handler tool_result real == las claves del inventario declarado", () => {
		const einAiSource = readFileSync(EIN_AI_PATH, "utf8");
		const body = extractToolResultHandlerBody(einAiSource);
		const found = findEnvelopeConsumers(body);
		const declared = new Set(Object.keys(ENVELOPE_CONSUMER_INVENTORY));
		expect(found).toEqual(declared);
	});

	test("una quinta llamada ficticia con event.content en el handler pone el detector en rojo", () => {
		const fictitious = `pi.on("tool_result", (event, ctx) => {
			if (event.toolName !== "subagent") return undefined;
			debugLogEnvelopePayload(event.content);
			return undefined;
		});`;
		const body = extractToolResultHandlerBody(fictitious);
		const found = findEnvelopeConsumers(body);
		expect(found.has("debugLogEnvelopePayload")).toBe(true);
		const declared = new Set(Object.keys(ENVELOPE_CONSUMER_INVENTORY));
		expect(found).not.toEqual(declared);
	});
});

describe("subagent envelope contract — T3 integración (la protección declarada existe hoy)", () => {
	test("el inventario real audita en verde contra las fuentes reales del árbol", () => {
		const result = auditEnvelopeConsumers(ENVELOPE_CONSUMER_INVENTORY, REAL_SOURCES);
		expect(result.ok).toBe(true);
		expect(result.findings).toEqual([]);
	});

	test("declarar temporalmente el consumidor 4 (reconciliación) como silent-incorrect-state pone la auditoría en rojo", () => {
		const mutated: Record<string, EnvelopeConsumerEntry> = {
			...ENVELOPE_CONSUMER_INVENTORY,
			originalError: {
				failureMode: "silent-incorrect-state",
				protection: ENVELOPE_CONSUMER_INVENTORY.originalError.protection,
				note: "reclasificación temporal de triangulación",
			},
		};
		const result = auditEnvelopeConsumers(mutated, REAL_SOURCES);
		expect(result.ok).toBe(false);
	});
});
