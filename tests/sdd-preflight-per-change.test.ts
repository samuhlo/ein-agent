// =============================================================================
// TESTS: el preflight SDD es POR CAMBIO, no por sesión
// -----------------------------------------------------------------------------
// A) Lo que se pregunta una vez por SESIÓN (modo de ejecución, cuaderno Engram)
//    no se repite; lo que describe UN CAMBIO (TDD estricto, carril) se vuelve a
//    preguntar cuando el cambio activo es otro. Antes todo se cacheaba por
//    sesión y el segundo cambio heredaba en silencio la respuesta del primero.
// B) El carril (`micro` / `standard`) se pregunta aquí en vez de depender de que
//    el orquestador se acuerde de pedirlo: era prosa del prompt, y 44 cambios
//    archivados no produjeron ni un solo `lane.json`.
// C) Una postura ya escrita en disco (p. ej. por Claude) NO se vuelve a
//    preguntar: se adopta. El puente entre runtimes es el disco.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ensureParticipantForeground,
	ensureSddPreflight,
	isSddParticipantMarker,
	patchSddIntentMaterial,
	piSddIntentPreflightContext,
	persistSddIntentResolution,
	resolveSddIntentPreflight as resolveSddIntentPreflightWithContext,
} from "../ein-pi/agent/lib/sdd-preflight";
import { createIntentMaterialKey, decideIntentPreflight, type IntentDecisionEvidence, type IntentMaterial } from "../ein-pi/agent/lib/sdd-intent-preflight";
import {
	classifyPiIntentRequest,
	createPiIntentGate,
	isDelegatedPiSubagent,
} from "../ein-pi/agent/extensions/internal/ein-pi-intent-gate";
import {
	preflightRecordPath,
	readPreflightRecord,
	writePreflightRecord,
	type SddIntentRecord,
} from "../ein-pi/agent/lib/sdd-preflight-record";
import { laneConfigPath, readChangeLane, writeChangeLane } from "../ein-pi/agent/lib/sdd-lane";

type AskLog = { execution: number; tdd: number; lane: number; memory: number };

// El preflight cachea por sesión en mapas de módulo. Cada test estrena sesión:
// compartir el id haría que un test heredara la postura del anterior, que es
// justo el fallo que este fichero existe para impedir.
let sessionSeq = 0;

function makeCtx(cwd: string, answers: { tdd?: string; lane?: string; execution?: string }) {
	const asks: AskLog = { execution: 0, tdd: 0, lane: 0, memory: 0 };
	const sessionId = `session-${(sessionSeq += 1)}`;
	const ctx = {
		hasUI: true,
		cwd,
		sessionManager: { getSessionId: () => sessionId },
		ui: {
			select: async (title: string, options: string[]) => {
				if (/execution mode/i.test(title)) {
					asks.execution += 1;
					return answers.execution ?? "interactive";
				}
				if (/strict tdd/i.test(title)) {
					asks.tdd += 1;
					return answers.tdd ?? "off";
				}
				if (/lane/i.test(title)) {
					asks.lane += 1;
					return answers.lane ?? "standard";
				}
				if (/notebook/i.test(title)) {
					asks.memory += 1;
					return "off";
				}
				return options[0];
			},
			input: async () => "400",
			notify: () => {},
		},
	} as never;
	return { ctx, asks };
}

const resolveSddIntentPreflight = (
	ctx: Parameters<typeof piSddIntentPreflightContext>[0],
	input: Parameters<typeof resolveSddIntentPreflightWithContext>[1],
) => resolveSddIntentPreflightWithContext(piSddIntentPreflightContext(ctx), input);

const EIN_AI_SOURCE = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
const TOOL_CALL_GATE_SOURCE = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts"),
	"utf8",
);
const SESSION_LIFECYCLE_SOURCE = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-session-lifecycle.ts"),
	"utf8",
);
const AGENT_PROMPT_SOURCE = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts"),
	"utf8",
);

const CALLBACKS = {
	pi: {} as never,
	installAssets: () => ({ agents: 0, chains: 0, support: 0, skipped: 0, installed: 0 }),
	applyModelConfig: () => ({ updated: 0, skipped: 0 }),
};

function sandbox() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-preflight-change-"));
	return {
		cwd,
		addChange: (name: string) => {
			const dir = join(cwd, "openspec", "changes", name);
			mkdirSync(dir, { recursive: true });
			return dir;
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
}

const PARTICIPANT_MARKER =
	"[ein-sdd-participant/v1 passage=run unit=ein-cleaner slice=slice range=0-1 state=seal]";

describe("Pi intent ownership across hooks", () => {
	test("only input invokes the interactive owner while secondary hooks adopt or block", () => {
		const inputHook = SESSION_LIFECYCLE_SOURCE.match(/pi\.on\("input"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		expect(inputHook.match(/runPiIntentPreflight\(/g)).toHaveLength(1);
		expect(SESSION_LIFECYCLE_SOURCE).toContain('pi.on("input"');
		expect(AGENT_PROMPT_SOURCE).toContain("piIntentGateDirective");
		expect(TOOL_CALL_GATE_SOURCE).toContain("piIntentToolBlockReason");
	});

	test("read-only bypasses while uncertain modification fails closed", () => {
		expect(decideIntentPreflight(classifyPiIntentRequest("Explain how the router works")).kind).toBe("read-only");
		const uncertain = decideIntentPreflight(classifyPiIntentRequest("Could this workflow be changed?"));
		expect(uncertain.kind).toBe("intent");
		expect(uncertain.kind === "intent" && uncertain.route).toBe("normal");
		expect(uncertain.kind === "intent" && uncertain.bypassQuestions).toBe(false);
	});

	test("bounded text and safe bypass resolve, while protected uncertainty keeps questions", () => {
		const small = decideIntentPreflight(classifyPiIntentRequest("Fix typo in README.md"));
		expect(small.kind === "intent" && small.route).toBe("small");
		const bypass = decideIntentPreflight(classifyPiIntentRequest("Fix typo in README.md without questions"));
		expect(bypass.kind === "intent" && bypass.bypassQuestions).toBe(true);
		const protectedBypass = decideIntentPreflight(classifyPiIntentRequest("Delete production data without questions"));
		expect(protectedBypass.kind === "intent" && protectedBypass.route).toBe("normal");
		expect(protectedBypass.kind === "intent" && protectedBypass.bypassQuestions).toBe(false);
	});

	test("an authorized pi-subagents child does not reopen the human intent preflight", async () => {
		const delegatedEnvironment = {
			PI_SUBAGENT_CHILD: "1",
			PI_SUBAGENT_CHILD_AGENT: "sdd-verify",
			PI_SUBAGENT_CHILD_INDEX: "0",
			PI_SUBAGENT_RUN_ID: "497255cc-ad5b-419e-943b-222df881b560",
		};
		expect(isDelegatedPiSubagent(delegatedEnvironment)).toBe(true);
		expect(isDelegatedPiSubagent({ PI_SUBAGENT_CHILD: "1" })).toBe(false);

		const gate = createPiIntentGate({ environment: delegatedEnvironment });
		expect(
			await gate.runPiIntentPreflight(
				"Write only verify-report.md and do not modify product code.",
				{} as never,
			),
		).toBe("read-only");
	});
});

describe("automatic participant foreground preflight", () => {
	test("forces foreground execution for a direct reduced participant call", () => {
		const input: Record<string, unknown> = {
			agent: "ein-cleaner",
			task: `${PARTICIPANT_MARKER}\nRun the bounded audit.`,
			async: true,
			foregroundOnly: false,
		};

		expect(isSddParticipantMarker(input.task)).toBe(true);
		expect(ensureParticipantForeground(input)).toBe(true);
		expect(input.async).toBe(false);
		expect(input.foregroundOnly).toBe(true);
	});

	test("forces foreground execution for a one-child workflow call", () => {
		const input: Record<string, unknown> = {
			workflowScript: `runs.run("audit", { agent: "ein-cleaner", task: "${PARTICIPANT_MARKER}" })`,
			async: true,
			foregroundOnly: false,
		};

		expect(ensureParticipantForeground(input)).toBe(true);
		expect(input.async).toBe(false);
		expect(input.foregroundOnly).toBe(true);
	});

	test("does not classify an embedded receipt-shaped marker as a participant call", () => {
		const task = `legacy receipt context: ${PARTICIPANT_MARKER}`;
		const input: Record<string, unknown> = { task, async: true };

		expect(isSddParticipantMarker(task)).toBe(false);
		expect(ensureParticipantForeground(input)).toBe(false);
		expect(input.async).toBe(true);
		expect(input.foregroundOnly).toBeUndefined();
	});
});

const MATERIAL: IntentMaterial = {
	objective: "Keep the preflight owner deterministic",
	boundaries: { in: ["preflight flow"], out: ["runtime adapters"] },
	completionCriteria: ["focused tests pass"],
};

const NORMAL_EVIDENCE: IntentDecisionEvidence = {
	activation: "modifying",
	declaredLane: null,
	bounded: true,
	mechanical: false,
	documentationOrTextOnly: false,
	introducesBehavior: true,
	securityRisk: false,
	persistentDataRisk: false,
	destructiveActionRisk: false,
	bypassRequested: false,
};

const SMALL_EVIDENCE: IntentDecisionEvidence = {
	...NORMAL_EVIDENCE,
	mechanical: true,
	introducesBehavior: false,
};

function intentRecord(overrides: Partial<SddIntentRecord> = {}): SddIntentRecord {
	return {
		version: 1,
		resolution: "confirmed",
		route: "normal",
		summary: "Keep the preflight owner deterministic",
		...MATERIAL,
		materialKey: createIntentMaterialKey(MATERIAL),
		laneOrigin: "classified",
		reason: "new-behavior",
		resolvedBy: "pi",
		resolvedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("classified lane persist, reread and adopt", () => {
	test("confirmed normal intent preserves TDD and materializes its classified lane", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "claude" });
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno",
				evidence: NORMAL_EVIDENCE,
				material: MATERIAL,
				summary: MATERIAL.objective,
				materialEvidence: "sufficient",
				confirmed: true,
			});

			expect(outcome.kind).toBe("resolved");
			expect(readPreflightRecord(dir)?.tdd).toBe("strict");
			expect(readPreflightRecord(dir)?.intent?.resolution).toBe("confirmed");
			expect(readChangeLane(dir)).toBe("standard");
			expect(existsSync(laneConfigPath(dir))).toBe(true);
		} finally {
			box.cleanup();
		}
	});

	test("reread adopts a resolution written after the owner's observation", () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "claude", intent: intentRecord({ resolvedBy: "claude" }) });
			const result = persistSddIntentResolution(box.cwd, "cambio-uno", intentRecord({
				objective: "A conflicting objective",
				materialKey: createIntentMaterialKey({ ...MATERIAL, objective: "A conflicting objective" }),
			}), undefined);
			expect(result.kind).toBe("adopted");
			expect(readPreflightRecord(dir)?.intent?.objective).toBe(MATERIAL.objective);
		} finally {
			box.cleanup();
		}
	});

	test("pending normal intent and missing TDD never persist", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			const { ctx } = makeCtx(box.cwd, {});
			const pending = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE, material: MATERIAL,
				summary: MATERIAL.objective, materialEvidence: "sufficient", confirmed: false,
			});
			expect(pending.kind).toBe("pending");
			expect(existsSync(preflightRecordPath(dir))).toBe(false);
			const unpersisted = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: SMALL_EVIDENCE, material: MATERIAL,
				summary: MATERIAL.objective, materialEvidence: "sufficient",
			});
			expect(unpersisted.kind).toBe("resolved");
			expect(existsSync(preflightRecordPath(dir))).toBe(false);
		} finally {
			box.cleanup();
		}
	});

	test("a declared lane is authoritative and is never overwritten", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "micro");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const { ctx } = makeCtx(box.cwd, {});
			await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE, material: MATERIAL,
				summary: MATERIAL.objective, materialEvidence: "sufficient",
			});
			expect(readChangeLane(dir)).toBe("micro");
			expect(readPreflightRecord(dir)?.intent?.laneOrigin).toBe("declared");
		} finally {
			box.cleanup();
		}
	});

	test("a corrupt declared lane remains untouched and authoritative", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeFileSync(laneConfigPath(dir), "{broken");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const { ctx } = makeCtx(box.cwd, {});
			await resolveSddIntentPreflight(ctx, { change: "cambio-uno", evidence: SMALL_EVIDENCE,
				material: MATERIAL, summary: MATERIAL.objective, materialEvidence: "sufficient", confirmed: true });
			expect(readPreflightRecord(dir)?.intent?.laneOrigin).toBe("declared");
			expect(readChangeLane(dir)).toBe("standard");
		} finally {
			box.cleanup();
		}
	});
});

describe("material reuse, patch, reopen and in-flight deduplication", () => {
	test("omitted slots inherit and an equivalent paraphrase reuses the material key", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "standard");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent: intentRecord({ laneOrigin: "declared" }) });
			const patched = patchSddIntentMaterial(MATERIAL, { objective: "  Keep   the preflight owner deterministic " });
			expect(createIntentMaterialKey(patched)).toBe(createIntentMaterialKey(MATERIAL));
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE,
				material: { objective: "  Keep   the preflight owner deterministic " },
				summary: MATERIAL.objective, materialEvidence: "sufficient", confirmed: false,
			});
			expect(outcome.kind).toBe("adopted");
		} finally {
			box.cleanup();
		}
	});

	test("adding or contradicting a material slot reopens normal", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "standard");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent: intentRecord({ laneOrigin: "declared" }) });
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE,
				material: { completionCriteria: ["focused tests pass", "typecheck passes"] },
				summary: MATERIAL.objective, materialEvidence: "sufficient", confirmed: false,
			});
			expect(outcome.kind).toBe("pending");
			expect(outcome.kind === "pending" && outcome.reason).toBe("material-change");
		} finally {
			box.cleanup();
		}
	});

	test("explicitly removing a material boundary reopens normal", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "standard");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent: intentRecord({ laneOrigin: "declared" }) });
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE,
				material: { boundaries: { in: [] } }, summary: MATERIAL.objective,
				materialEvidence: "sufficient", confirmed: false,
			});
			expect(outcome.kind).toBe("pending");
			expect(outcome.kind === "pending" && outcome.reason).toBe("material-change");
		} finally {
			box.cleanup();
		}
	});

	test("a confirmed material patch replaces the observed intent and updates its classified lane", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "standard");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent: intentRecord() });
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: SMALL_EVIDENCE,
				material: { objective: "Apply the bounded patch" }, summary: "Apply the bounded patch.",
				materialEvidence: "sufficient", confirmed: true,
			});
			expect(outcome.kind).toBe("resolved");
			expect(readPreflightRecord(dir)?.intent?.objective).toBe("Apply the bounded patch");
			expect(readChangeLane(dir)).toBe("micro");
		} finally {
			box.cleanup();
		}
	});

	test("uncertain equivalence reopens instead of silently reusing", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writeChangeLane(dir, "standard");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent: intentRecord({ laneOrigin: "declared" }) });
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE, summary: MATERIAL.objective,
				materialEvidence: "uncertain", confirmed: true,
			});
			expect(outcome.kind).toBe("pending");
			expect(outcome.kind === "pending" && outcome.reason).toBe("material-uncertain");
		} finally {
			box.cleanup();
		}
	});

	test("concurrent calls in one session share the in-flight small resolution", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const notices: string[] = [];
			const { ctx } = makeCtx(box.cwd, {});
			(ctx as never as { ui: { notify: (text: string) => void } }).ui.notify = (text) => notices.push(text);
			const input = { change: "cambio-uno", evidence: SMALL_EVIDENCE, material: MATERIAL,
				summary: "One small restatement.", materialEvidence: "sufficient" } as const;
			const [first, second] = await Promise.all([
				resolveSddIntentPreflight(ctx, input), resolveSddIntentPreflight(ctx, input),
			]);
			expect(first).toBe(second);
			expect(notices).toEqual(["One small restatement."]);
		} finally {
			box.cleanup();
		}
	});
});

describe("normal, small, confirmation, third decision and bypass flows", () => {
	test("normal returns two base questions, at most one material third, and confirmation", async () => {
		const box = sandbox();
		try {
			box.addChange("cambio-uno");
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, {
				change: "cambio-uno", evidence: NORMAL_EVIDENCE, material: MATERIAL,
				summary: MATERIAL.objective, materialEvidence: "sufficient", confirmed: false,
				thirdDecision: { id: "compatibility", prompt: "Must legacy records remain readable?", materialImpact: true, persistedValueAvailable: false, defaultAvailable: false },
			});
			expect(outcome.kind).toBe("pending");
			expect(outcome.kind === "pending" && outcome.interaction.questions).toHaveLength(3);
			expect(outcome.kind === "pending" && outcome.interaction.requiresConfirmation).toBe(true);
		} finally {
			box.cleanup();
		}
	});

	test("small emits one non-question line and automatic resolution", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const notices: string[] = [];
			const { ctx } = makeCtx(box.cwd, {});
			(ctx as never as { ui: { notify: (text: string) => void } }).ui.notify = (text) => notices.push(text);
			await resolveSddIntentPreflight(ctx, { change: "cambio-uno", evidence: SMALL_EVIDENCE,
				material: MATERIAL, summary: "Update the bounded text.", materialEvidence: "sufficient" });
			expect(notices).toEqual(["Update the bounded text."]);
			expect(notices[0]).not.toContain("?");
			expect(readPreflightRecord(dir)?.intent?.resolution).toBe("automatic-small");
		} finally {
			box.cleanup();
		}
	});

	test("allowed bypass persists without pretending human confirmation", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const { ctx } = makeCtx(box.cwd, {});
			await resolveSddIntentPreflight(ctx, { change: "cambio-uno",
				evidence: { ...NORMAL_EVIDENCE, bypassRequested: true }, material: MATERIAL,
				summary: MATERIAL.objective, materialEvidence: "sufficient" });
			expect(readPreflightRecord(dir)?.intent?.resolution).toBe("bypassed");
		} finally {
			box.cleanup();
		}
	});

	test("protected-risk bypass remains normal and pending confirmation", async () => {
		const box = sandbox();
		try {
			box.addChange("cambio-uno");
			const { ctx } = makeCtx(box.cwd, {});
			const outcome = await resolveSddIntentPreflight(ctx, { change: "cambio-uno",
				evidence: { ...NORMAL_EVIDENCE, bypassRequested: true, securityRisk: true },
				material: MATERIAL, summary: MATERIAL.objective, materialEvidence: "sufficient" });
			expect(outcome.kind).toBe("pending");
			expect(outcome.kind === "pending" && outcome.reason).toBe("confirmation-required");
		} finally {
			box.cleanup();
		}
	});

	test("session preferences remain while per-change TDD and lane selectors disappear", async () => {
		const box = sandbox();
		try {
			box.addChange("cambio-uno");
			const { ctx, asks } = makeCtx(box.cwd, {});
			await ensureSddPreflight(ctx, CALLBACKS);
			expect(asks.execution).toBe(1);
			expect(asks.memory).toBe(1);
			expect(asks.tdd).toBe(0);
			expect(asks.lane).toBe(0);
		} finally {
			box.cleanup();
		}
	});
});
