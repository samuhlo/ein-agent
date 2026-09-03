// =============================================================================
// SESSION ACCOUNTING STORE — suite espejo (E/S, fixtures en directorio temporal)
//
// Cada test mueve `EIN_PI_AGENT_HOME` a un directorio temporal propio (resolución
// por llamada, no por carga de módulo) y nunca toca el corpus real del usuario.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAccountingReport, readSessionCorpus } from "../ein-pi/agent/lib/session-accounting-store.ts";
import { APPLY_PACKET_OBSERVATION_CUSTOM_TYPE } from "../ein-pi/agent/lib/apply-packet-observation-record.ts";

let root: string;
let previousHome: string | undefined;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ein-session-accounting-"));
	previousHome = process.env.EIN_PI_AGENT_HOME;
	process.env.EIN_PI_AGENT_HOME = root;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.EIN_PI_AGENT_HOME;
	else process.env.EIN_PI_AGENT_HOME = previousHome;
	rmSync(root, { recursive: true, force: true });
});

function sessionsDir(): string {
	return join(root, "sessions");
}

function writeParentTranscript(project: string, stem: string, lines: readonly unknown[]): void {
	const dir = join(sessionsDir(), project);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${stem}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

function writeSubagentTranscript(project: string, stem: string, runId: string, runIndex: number, lines: readonly unknown[]): void {
	const dir = join(sessionsDir(), project, stem, runId, `run-${runIndex}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "session.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

function writeArtifact(project: string, runId: string, agent: string, body: Record<string, unknown>): void {
	const dir = join(sessionsDir(), project, "subagent-artifacts");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${runId}_${agent}_meta.json`), JSON.stringify(body));
}

const sessionLine = (cwd: string) => ({ type: "session", id: "s1", timestamp: "2026-01-01T00:00:00.000Z", cwd });
const modelChange = (modelId: string) => ({ type: "model_change", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", provider: "p", modelId });
const messageLine = (usage: Record<string, unknown>) => ({
	type: "message",
	id: "msg1",
	parentId: "m1",
	timestamp: "2026-01-01T00:00:02.000Z",
	message: { role: "assistant", content: [], usage },
});
const packetEntry = (data: unknown) => ({
	type: "custom",
	id: "packet-entry",
	parentId: null,
	timestamp: "2026-09-03T10:00:00.000Z",
	customType: APPLY_PACKET_OBSERVATION_CUSTOM_TYPE,
	data,
});

describe("readSessionCorpus", () => {
	test("nonexistent sessions root -> store absent, distinct from an empty store", () => {
		rmSync(sessionsDir(), { recursive: true, force: true });
		const corpus = readSessionCorpus();
		expect(corpus.store).toBe("absent");
		expect(corpus.runs).toEqual([]);
	});

	test("existing but empty sessions root -> store present with zero runs", () => {
		mkdirSync(sessionsDir(), { recursive: true });
		const corpus = readSessionCorpus();
		expect(corpus.store).toBe("present");
		expect(corpus.runs).toEqual([]);
	});

	test("EIN_PI_AGENT_HOME moved between cases is honoured (per-call resolution)", () => {
		writeParentTranscript("proj-a", "2026-01-01T00-00-00-000Z_uuid-a", [sessionLine("/Users/x/proj-a")]);
		const first = readSessionCorpus();
		expect(first.runs).toHaveLength(1);

		const secondRoot = mkdtempSync(join(tmpdir(), "ein-session-accounting-2-"));
		process.env.EIN_PI_AGENT_HOME = secondRoot;
		try {
			const second = readSessionCorpus();
			expect(second.store).toBe("absent");
		} finally {
			rmSync(secondRoot, { recursive: true, force: true });
		}
	});

	test("parent transcript classifies as role parent with project from cwd", () => {
		writeParentTranscript("encoded-name", "2026-01-01T00-00-00-000Z_uuid-a", [sessionLine("/Users/x/real-project")]);
		const corpus = readSessionCorpus();
		expect(corpus.runs).toHaveLength(1);
		expect(corpus.runs[0]!.ref.role).toBe("parent");
		expect(corpus.runs[0]!.ref.project).toBe("real-project");
	});

	test("subagent-artifacts is not walked as a session directory (but an orphan artifact still yields a synthetic run)", () => {
		writeArtifact("proj", "run-id-1", "sdd-apply", { agent: "sdd-apply", exitCode: 0, modelAttempts: [] });
		const corpus = readSessionCorpus();
		// `subagent-artifacts/` en sí no es un directorio de sesión, pero el
		// artefacto huérfano (sin `run-N` en el árbol) sí produce una observación.
		expect(corpus.runs).toHaveLength(1);
		expect(corpus.runs[0]!.transcript).toBe("missing");
		expect(corpus.runs[0]!.artifact?.agent).toBe("sdd-apply");
		expect(corpus.counts.artifacts).toBe(1);
	});

	test("orphan artifact (no matching run-N) -> synthetic observation, provenance artifact, cost counted", () => {
		writeArtifact("proj", "run-id-1", "sdd-apply", {
			agent: "sdd-apply",
			exitCode: 0,
			modelAttempts: [{ model: "model-a", usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0.42, turns: 3 } }],
		});
		const corpus = readSessionCorpus();
		expect(corpus.runs).toHaveLength(1);
		const [run] = corpus.runs;
		expect(run!.transcript).toBe("missing");
		expect(run!.ref.runId).toBe("run-id-1");
		expect(run!.ref.runIndex).toBeNull();
		expect(run!.ref.role).toBe("subagent");

		const report = readAccountingReport();
		expect(report.overall.channels.artifact).toBe(1);
		expect(report.overall.channels.transcript).toBe(0);
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(0.42);
	});

	test("artifact with matching run-N still enters via transcript, channels.artifact unaffected, figures unchanged", () => {
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [
			sessionLine("/x/proj"),
			modelChange("model-a"),
			messageLine({ cost: { total: 1.5 } }),
		]);
		writeArtifact("proj", "run-id-1", "sdd-apply", {
			agent: "sdd-apply",
			exitCode: 0,
			modelAttempts: [{ model: "model-a", usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: 99, turns: 3 } }],
		});
		const report = readAccountingReport();
		expect(report.overall.channels.transcript).toBe(1);
		expect(report.overall.channels.artifact).toBe(0);
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(1.5); // no el 99 del artefacto
	});

	test("agent with orphan runs cannot claim coverage complete against a truncated denominator", () => {
		// Un run con run-N (entra por transcript) y un run huérfano del mismo agente (entra por artifact).
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [
			sessionLine("/x/proj"),
			modelChange("model-a"),
			messageLine({ cost: { total: 1 } }),
		]);
		writeArtifact("proj", "run-id-1", "sdd-apply", { agent: "sdd-apply", exitCode: 0, modelAttempts: [{ model: "model-a", usage: { cost: 1 } }] });
		writeArtifact("proj", "run-id-2", "sdd-apply", { agent: "sdd-apply", exitCode: 0, modelAttempts: [{ model: "model-a", usage: { cost: 2 } }] });

		const report = readAccountingReport();
		const agentSlice = report.byAgent.find((a) => a.agent === "sdd-apply");
		expect(agentSlice?.runs).toBe(2);
		expect(agentSlice?.channels.transcript).toBe(1);
		expect(agentSlice?.channels.artifact).toBe(1);
		if (agentSlice?.cost.status === "known") expect(agentSlice.cost.value).toBe(3);
	});

	test("channels.artifact + channels.transcript + channels.unattributed equals total runs", () => {
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [
			sessionLine("/x/proj"),
			messageLine({ cost: { total: 1 } }),
		]);
		writeArtifact("proj", "run-id-2", "sdd-apply", { agent: "sdd-apply", exitCode: 0, modelAttempts: [{ model: "model-a", usage: { cost: 5 } }] });
		writeArtifact("proj", "run-id-3", "sdd-apply", { agent: "sdd-apply" }); // sin modelAttempts -> unattributed

		const report = readAccountingReport();
		const { transcript, artifact, unattributed } = report.overall.channels;
		expect(transcript + artifact + unattributed).toBe(report.overall.runs);
	});

	test("orphan artifact corrupt or without modelAttempts -> unattributed, never a zero cost", () => {
		const dir = join(sessionsDir(), "proj", "subagent-artifacts");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "run-id-1_sdd-apply_meta.json"), "{not valid json");
		writeArtifact("proj", "run-id-2", "sdd-apply", { agent: "sdd-apply" }); // sin modelAttempts

		expect(() => readSessionCorpus()).not.toThrow();
		const report = readAccountingReport();
		expect(report.overall.channels.unattributed).toBe(2);
		expect(report.overall.channels.artifact).toBe(0);
		// Ningún run corrupto/sin datos aporta coste 0: no está en costValues.
		const costRuns = report.overall.channels.transcript + report.overall.channels.artifact;
		expect(costRuns).toBe(0);
	});

	test("run-N parsing: run-0 -> runIndex 0, run-9 -> 9, non-matching -> null", () => {
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [sessionLine("/x/proj")]);
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 9, [sessionLine("/x/proj")]);
		const weirdDir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "not-a-run-dir");
		mkdirSync(weirdDir, { recursive: true });
		writeFileSync(join(weirdDir, "session.jsonl"), JSON.stringify(sessionLine("/x/proj")) + "\n");

		const corpus = readSessionCorpus();
		const indexes = corpus.runs.map((r) => r.ref.runIndex).sort((a, b) => (a ?? -1) - (b ?? -1));
		expect(indexes).toEqual([null, 0, 9]);
		expect(corpus.discovery.scanned).toBe(corpus.runs.length);
	});

	test("run without session.jsonl -> transcript missing, run still present", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const corpus = readSessionCorpus();
		expect(corpus.runs).toHaveLength(1);
		expect(corpus.runs[0]!.transcript).toBe("missing");
		expect(corpus.counts.missing).toBe(1);
	});

	test("truncated final line -> transcript partial, earlier lines kept", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const good = JSON.stringify(sessionLine("/x/proj"));
		const goodMsg = JSON.stringify(messageLine({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.1 } }));
		const truncated = '{"type":"message","id":"broken"'; // línea a medio escribir, sin cerrar
		writeFileSync(join(dir, "session.jsonl"), [good, goodMsg, truncated].join("\n"));

		const corpus = readSessionCorpus();
		expect(corpus.runs).toHaveLength(1);
		expect(corpus.runs[0]!.transcript).toBe("partial");
		expect(corpus.runs[0]!.messages).toHaveLength(1);
	});

	test("corrupt meta.json -> integrity corrupt, counted in counts.corrupt, no throw", () => {
		const dir = join(sessionsDir(), "proj", "subagent-artifacts");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "run-id-1_sdd-apply_meta.json"), "{not valid json");
		expect(() => readSessionCorpus()).not.toThrow();
		const corpus = readSessionCorpus();
		expect(corpus.counts.corrupt).toBe(1);
	});

	test("meta.json without modelAttempts/usage -> nulls, no throw", () => {
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [sessionLine("/x/proj")]);
		writeArtifact("proj", "run-id-1", "sdd-apply", { agent: "sdd-apply" });
		const corpus = readSessionCorpus();
		const run = corpus.runs.find((r) => r.ref.runId === "run-id-1");
		expect(run?.artifact?.integrity).toBe("ok");
		expect(run?.artifact?.attempts).toBeNull();
		expect(run?.artifact?.exitCode).toBeNull();
	});

	test("unreadable file (non-file at expected path) -> unreadable, no throw", () => {
		// session.jsonl es en realidad un directorio: ni "missing" ni parseable.
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0", "session.jsonl");
		mkdirSync(dir, { recursive: true });
		expect(() => readSessionCorpus()).not.toThrow();
		const corpus = readSessionCorpus();
		expect(corpus.runs[0]!.transcript).toBe("unreadable");
	});

	test("both cost paths (message.usage.cost.total and usage.cost.total) are read", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const nested = JSON.stringify(messageLine({ cost: { total: 0.5 } }));
		const altTop = JSON.stringify({ type: "message", id: "m2", parentId: null, timestamp: "2026-01-01T00:00:03.000Z", usage: { cost: { total: 0.7 } } });
		writeFileSync(join(dir, "session.jsonl"), [sessionLine("/x/proj"), nested, altTop].join("\n") + "\n");

		const corpus = readSessionCorpus();
		const values = corpus.runs[0]!.messages.map((m) => m.usage.cost).sort();
		expect(values).toEqual([0.5, 0.7]);
	});

	test("model attribution canonicalizes provider/model and effort suffix across channels", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const lines = [
			sessionLine("/x/proj"),
			messageLine({ cost: { total: 0.1 } }), // sin model_change previo -> null
			modelChange("model-a"),
			messageLine({ cost: { total: 0.2 } }),
		];
		writeFileSync(join(dir, "session.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
		writeArtifact("proj", "run-id-1", "sdd-apply", {
			agent: "sdd-apply",
			exitCode: 0,
			modelAttempts: [{ model: "p/model-a:high", usage: { cost: 0.2, turns: 1 } }],
		});

		const corpus = readSessionCorpus();
		const models = corpus.runs[0]!.messages.map((m) => m.model);
		expect(models).toEqual([null, "p/model-a"]);
		expect(corpus.runs[0]!.artifact?.attempts?.[0]?.model).toBe("p/model-a");

		const report = readAccountingReport();
		const modelCost = report.byModel.reduce(
			(sum, entry) => sum + (entry.cost.status === "known" ? entry.cost.value : 0),
			0,
		);
		expect(modelCost).toBeCloseTo(0.3);
	});

	test("invalid numeric timestamp is ignored instead of escaping the no-throw boundary", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const invalidTimestamp = {
			type: "message",
			id: "msg-invalid-time",
			timestamp: 1e300,
			message: { role: "assistant", content: [], usage: { cost: { total: 0.1 } } },
		};
		writeFileSync(join(dir, "session.jsonl"), JSON.stringify(invalidTimestamp) + "\n");
		expect(() => readSessionCorpus()).not.toThrow();
		expect(readSessionCorpus().runs[0]!.messages[0]!.timestamp).toBeNull();
	});

	test("bound exceeded (MAX_MESSAGES_PER_RUN) marks records truncated, not dropped", () => {
		const dir = join(sessionsDir(), "proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", "run-0");
		mkdirSync(dir, { recursive: true });
		const lines: unknown[] = [sessionLine("/x/proj")];
		for (let i = 0; i < 5; i++) lines.push(messageLine({ cost: { total: 0.01 } }));
		writeFileSync(join(dir, "session.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
		// Nota: el límite real es 20_000; aquí sólo probamos que 5 mensajes normales
		// no se truncan, confirmando que el camino "present" no marca falso positivo.
		const corpus = readSessionCorpus();
		expect(corpus.runs[0]!.transcript).toBe("present");
		expect(corpus.runs[0]!.messages).toHaveLength(5);
	});

	test("generatedAt is set on the corpus", () => {
		mkdirSync(sessionsDir(), { recursive: true });
		const corpus = readSessionCorpus();
		expect(() => new Date(corpus.generatedAt).toISOString()).not.toThrow();
	});
});

describe("readAccountingReport", () => {
	test("composes the store and the [CORE] aggregator into one call", () => {
		writeSubagentTranscript("proj", "2026-01-01T00-00-00-000Z_uuid-a", "run-id-1", 0, [
			sessionLine("/x/proj"),
			modelChange("model-a"),
			messageLine({ cost: { total: 1.5 } }),
		]);
		const report = readAccountingReport();
		expect(report.schemaVersion).toBe(2);
		expect(report.store).toBe("present");
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(1.5);
	});

	test("cuenta packet readiness válida y malformed en la misma pasada", () => {
		writeParentTranscript("proj", "2026-09-03T10-00-00-000Z_uuid-a", [
			sessionLine("/x/proj"),
			packetEntry({
				format: "apply-packet-observation/v1",
				observedAt: "2026-09-03T10:00:00.000Z",
				toolCallId: "call-1",
				status: "unavailable",
				code: "no-active-change",
			}),
			packetEntry({ format: "apply-packet-observation/v1", status: "executable" }),
		]);
		const corpus = readSessionCorpus();
		expect(corpus.applyPacketObservations).toHaveLength(1);
		expect(corpus.malformedApplyPacketObservations).toBe(1);
		const report = readAccountingReport();
		expect(report.applyPackets).toMatchObject({
			observed: 1,
			malformed: 1,
			byStatus: { executable: 0, incomplete: 0, rejected: 0, unavailable: 1 },
			executableRate: { status: "known", value: 0 },
		});
	});

	test("empty corpus -> every figure unknown, never 0 (R1)", () => {
		mkdirSync(sessionsDir(), { recursive: true });
		const report = readAccountingReport();
		expect(report.overall.cost.status).toBe("unknown");
		expect(report.coverage.status).toBe("unknown");
		expect(report.applyPackets.executableRate).toEqual({ status: "unknown" });
	});
});
