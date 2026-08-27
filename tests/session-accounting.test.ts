import { describe, expect, test } from "bun:test";
import {
	buildAccountingReport,
	type ArtifactAttempt,
	type ArtifactRecord,
	type RunObservation,
	type RunRef,
	type SessionCorpus,
	type TranscriptMessage,
	type UsageSample,
} from "../ein-pi/agent/lib/session-accounting";

// Fixtures puros en memoria: este slice no toca disco. Construimos corpus a
// mano exactamente con la forma que el store (slice 2) producirá.

function usage(partial: Partial<UsageSample> = {}): UsageSample {
	return {
		input: null,
		output: null,
		cacheRead: null,
		cacheWrite: null,
		total: null,
		cost: null,
		...partial,
	};
}

function message(partial: Partial<TranscriptMessage> = {}): TranscriptMessage {
	return {
		model: null,
		timestamp: null,
		usage: usage(),
		...partial,
	};
}

function ref(partial: Partial<RunRef> = {}): RunRef {
	return {
		project: "proj",
		sessionId: "sess",
		role: "parent",
		runId: null,
		runDir: null,
		runIndex: null,
		...partial,
	};
}

function attempt(partial: Partial<ArtifactAttempt> = {}): ArtifactAttempt {
	return { model: null, usage: null, turns: null, ...partial };
}

function artifact(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
	return {
		agent: null,
		exitCode: null,
		attemptedModels: [],
		attempts: null,
		integrity: "ok",
		...partial,
	};
}

function run(partial: Partial<RunObservation> = {}): RunObservation {
	return {
		ref: ref(),
		transcript: "present",
		messages: [],
		artifact: null,
		...partial,
	};
}

function corpus(partial: Partial<SessionCorpus> = {}): SessionCorpus {
	return {
		store: "present",
		generatedAt: "2026-01-01T00:00:00.000Z",
		runs: [],
		counts: { sessions: 0, transcripts: 0, artifacts: 0, corrupt: 0, missing: 0 },
		discovery: { scanned: 0, skipped: 0, scanLimitExceeded: false },
		...partial,
	};
}

// Recorre todas las cifras numéricas expuestas (Total/Stat) del reporte y
// asegura que ninguna con status "unknown" cuele un valor 0 disfrazado.
function assertNoZeroWhereUnknown(report: ReturnType<typeof buildAccountingReport>): void {
	const totals: Array<{ status: string }> = [
		report.overall.cost,
		report.overall.outputTokens,
		report.partition.parent.cost,
		report.partition.subagent.cost,
	];
	for (const total of totals) {
		if (total.status === "unknown") expect((total as { value?: number }).value).toBeUndefined();
	}
}

describe("session-accounting [CORE] aggregator", () => {
	test("empty corpus -> every figure unknown, no figure is 0", () => {
		const report = buildAccountingReport(corpus());
		expect(report.overall.cost.status).toBe("unknown");
		expect(report.overall.cost.coverage.status).toBe("unknown");
		expect(report.overall.cost.coverage.attributed).toBe(0);
		expect(report.overall.outputTokens.status).toBe("unknown");
		expect(report.overall.peakPromptTokens.status).toBe("unknown");
		expect(report.overall.peakSequenceTokens.status).toBe("unknown");
		expect(report.overall.turnsPerRun.status).toBe("unknown");
		expect(report.snapshot.corpusFrom.status).toBe("unknown");
		expect(report.snapshot.corpusTo.status).toBe("unknown");
		// sessions/transcripts/artifacts vienen del censo del store (siempre un
		// entero conocido, incluso 0); lo que puede ser unknown es el intervalo.
		expect(report.snapshot.sessions.status).toBe("known");
		assertNoZeroWhereUnknown(report);
	});

	test("all-zero explicit costs -> known 0 with complete coverage", () => {
		const c = corpus({
			runs: [
				run({ messages: [message({ model: "m1", usage: usage({ cost: 0 }) })] }),
				run({ ref: ref({ sessionId: "sess2" }), messages: [message({ model: "m1", usage: usage({ cost: 0 }) })] }),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(0);
		expect(report.overall.cost.coverage.status).toBe("complete");
	});

	test("run with both transcript and artifact cost is counted once via transcript channel", () => {
		const c = corpus({
			runs: [
				run({
					messages: [message({ model: "m1", usage: usage({ cost: 5 }) })],
					artifact: artifact({ attempts: [attempt({ model: "m1", usage: usage({ cost: 999 }) })] }),
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(5);
		expect(report.overall.channels.transcript).toBe(1);
		expect(report.overall.channels.artifact).toBe(0);
	});

	test("per-model breakdown preserves single-channel precedence when model labels differ", () => {
		const c = corpus({
			runs: [
				run({
					messages: [message({ model: "gpt-5.6-sol", usage: usage({ cost: 5, output: 7 }) })],
					artifact: artifact({
						attempts: [
							attempt({
								model: "openai-codex/gpt-5.6-sol:high",
								usage: usage({ cost: 5, output: 7 }),
								turns: 2,
							}),
						],
					}),
				}),
			],
		});
		const report = buildAccountingReport(c);
		const modelCost = report.byModel.reduce(
			(sum, entry) => sum + (entry.cost.status === "known" ? entry.cost.value : 0),
			0,
		);
		const modelOutput = report.byModel.reduce(
			(sum, entry) => sum + (entry.outputTokens.status === "known" ? entry.outputTokens.value : 0),
			0,
		);
		expect(report.overall.cost.status).toBe("known");
		expect(report.overall.outputTokens.status).toBe("known");
		expect(modelCost).toBe(5);
		expect(modelOutput).toBe(7);
	});

	test("both cost paths (message.usage.cost.total and usage.cost.total) attribute", () => {
		const c = corpus({
			runs: [
				run({
					messages: [
						message({ model: "m1", usage: usage({ cost: 2 }) }),
						message({ model: "m1", usage: usage({ cost: 3 }) }),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.cost.status).toBe("known");
		if (report.overall.cost.status === "known") expect(report.overall.cost.value).toBe(5);
	});

	test("messages with no resolvable model go to the null bucket, partial per-model coverage", () => {
		const c = corpus({
			runs: [
				run({
					messages: [
						message({ model: null, usage: usage({ cost: 7 }) }),
						message({ model: "m1", usage: usage({ cost: 3 }) }),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		const nullBucket = report.byModel.find((m) => m.model === null);
		const known = report.byModel.find((m) => m.model === "m1");
		expect(nullBucket).toBeDefined();
		expect(known).toBeDefined();
		if (nullBucket?.cost.status === "known") expect(nullBucket.cost.value).toBe(7);
		if (known?.cost.status === "known") expect(known.cost.value).toBe(3);
		expect(report.byModel.find((m) => m.model === null)?.coverage.status).not.toBe("unknown");
	});

	test("null model bucket is ordered last in byModel", () => {
		const c = corpus({
			runs: [
				run({
					messages: [
						message({ model: null, usage: usage({ cost: 1 }) }),
						message({ model: "zeta", usage: usage({ cost: 1 }) }),
						message({ model: "alpha", usage: usage({ cost: 1 }) }),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		const names = report.byModel.map((m) => m.model);
		expect(names).toEqual(["alpha", "zeta", null]);
	});

	test("peaks: prompt sample is 3-component sum, sequence uses reported/derived, message missing output stays eligible for prompt only", () => {
		const c = corpus({
			runs: [
				run({
					messages: [
						message({
							model: "m1",
							usage: usage({ input: 100, cacheRead: 10, cacheWrite: 5, output: null, total: null }),
						}),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.peakPromptTokens.status).toBe("known");
		if (report.overall.peakPromptTokens.status === "known") {
			expect(report.overall.peakPromptTokens.max).toBe(115);
			expect(report.overall.peakPromptTokens.n).toBe(1);
		}
		// sin output ni total reportado, el mensaje no es elegible para secuencia
		expect(report.overall.peakSequenceTokens.status).toBe("unknown");
	});

	test("peak sequence uses reported total when present, derived sum when absent", () => {
		const c = corpus({
			runs: [
				run({
					messages: [
						message({
							model: "m1",
							usage: usage({ input: 10, cacheRead: 0, cacheWrite: 0, output: 5, total: 999 }),
						}),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.peakSequenceTokens.status).toBe("known");
		if (report.overall.peakSequenceTokens.status === "known") {
			expect(report.overall.peakSequenceTokens.max).toBe(999);
			expect(report.overall.peakSequenceTokens.sources.reported).toBe(1);
			expect(report.overall.peakSequenceTokens.sources.derived).toBe(0);
		}

		const c2 = corpus({
			runs: [
				run({
					messages: [
						message({
							model: "m1",
							usage: usage({ input: 10, cacheRead: 1, cacheWrite: 2, output: 5, total: null }),
						}),
					],
				}),
			],
		});
		const report2 = buildAccountingReport(c2);
		expect(report2.overall.peakSequenceTokens.status).toBe("known");
		if (report2.overall.peakSequenceTokens.status === "known") {
			expect(report2.overall.peakSequenceTokens.max).toBe(18);
			expect(report2.overall.peakSequenceTokens.sources.derived).toBe(1);
			expect(report2.overall.peakSequenceTokens.sources.reported).toBe(0);
		}
	});

	test("percentiles: n=0 unknown, n=1 mean=p95=max, n=2 p95=max, >=20 matches nearest-rank", () => {
		// n=0 vía turnsPerRun sin ningún attempt con turns
		const empty = buildAccountingReport(corpus());
		expect(empty.overall.turnsPerRun.status).toBe("unknown");

		function runWithTurns(turnsValue: number, index: number): RunObservation {
			return run({
				ref: ref({ sessionId: `sess-${index}` }),
				artifact: artifact({ attempts: [attempt({ model: "m1", turns: turnsValue })] }),
			});
		}

		const one = buildAccountingReport(corpus({ runs: [runWithTurns(7, 0)] }));
		expect(one.overall.turnsPerRun.status).toBe("known");
		if (one.overall.turnsPerRun.status === "known") {
			expect(one.overall.turnsPerRun.mean).toBe(7);
			expect(one.overall.turnsPerRun.p95).toBe(7);
			expect(one.overall.turnsPerRun.max).toBe(7);
		}

		const two = buildAccountingReport(corpus({ runs: [runWithTurns(1, 0), runWithTurns(9, 1)] }));
		if (two.overall.turnsPerRun.status === "known") {
			expect(two.overall.turnsPerRun.p95).toBe(two.overall.turnsPerRun.max);
			expect(two.overall.turnsPerRun.max).toBe(9);
		}

		const values = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
		const twenty = buildAccountingReport(corpus({ runs: values.map((v, i) => runWithTurns(v, i)) }));
		if (twenty.overall.turnsPerRun.status === "known") {
			// nearest-rank p95 sobre 1..20 ascendente: index = ceil(0.95*20)-1 = 18 -> valor 19
			expect(twenty.overall.turnsPerRun.p95).toBe(19);
			expect(twenty.overall.turnsPerRun.max).toBe(20);
			expect(twenty.overall.turnsPerRun.n).toBe(20);
		}
	});

	test("turns: a run with one attempt missing usage.turns contributes no sample but keeps counting in total", () => {
		const c = corpus({
			runs: [
				run({
					artifact: artifact({
						attempts: [attempt({ model: "m1", turns: 3 }), attempt({ model: "m2", turns: null })],
					}),
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.turnsPerRun.status).toBe("unknown");
		expect(report.overall.turnsPerRun.coverage.total).toBe(1);
		expect(report.overall.turnsPerRun.coverage.attributed).toBe(0);
	});

	test("outcomes: missing exitCode -> failures.undetermined only", () => {
		const c = corpus({
			runs: [
				run({
					artifact: artifact({ exitCode: null, attemptedModels: ["m1"], attempts: [attempt({ model: "m1" })] }),
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.outcomes.failures.undetermined).toBe(1);
		expect(report.overall.outcomes.modelFallbacks.undetermined).toBe(0);
		expect(report.overall.outcomes.processReruns.undetermined).toBe(0);
	});

	test("outcomes: two modelAttempts -> one fallback", () => {
		const c = corpus({
			runs: [
				run({
					artifact: artifact({
						exitCode: 0,
						attempts: [attempt({ model: "m1" }), attempt({ model: "m2" })],
					}),
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.outcomes.modelFallbacks.count).toBe(1);
	});

	test("outcomes: runIndex 3 -> one rerun and maxRunIndex >= 3", () => {
		const c = corpus({
			runs: [run({ ref: ref({ role: "subagent", runId: "r1", runDir: "run-3", runIndex: 3 }) })],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.outcomes.processReruns.count).toBe(1);
		expect(report.overall.outcomes.maxRunIndex.status).toBe("known");
		if (report.overall.outcomes.maxRunIndex.status === "known") {
			expect(report.overall.outcomes.maxRunIndex.value).toBeGreaterThanOrEqual(3);
		}
	});

	test("outcomes: runIndex null on a subagent run -> processReruns.undetermined", () => {
		const c = corpus({
			runs: [run({ ref: ref({ role: "subagent", runId: "r1", runDir: "run-x", runIndex: null }) })],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.outcomes.processReruns.undetermined).toBe(1);
	});

	test("snapshot: corpus interval derived from message timestamps; unknown when no readable timestamp", () => {
		const withTimestamps = corpus({
			runs: [
				run({ messages: [message({ timestamp: "2026-01-01T00:00:00.000Z" })] }),
				run({ ref: ref({ sessionId: "s2" }), messages: [message({ timestamp: "2026-01-05T00:00:00.000Z" })] }),
			],
			counts: { sessions: 2, transcripts: 2, artifacts: 0, corrupt: 0, missing: 0 },
		});
		const report = buildAccountingReport(withTimestamps);
		expect(report.snapshot.corpusFrom.status).toBe("known");
		expect(report.snapshot.corpusTo.status).toBe("known");
		if (report.snapshot.corpusFrom.status === "known") expect(report.snapshot.corpusFrom.value).toBe("2026-01-01T00:00:00.000Z");
		if (report.snapshot.corpusTo.status === "known") expect(report.snapshot.corpusTo.value).toBe("2026-01-05T00:00:00.000Z");

		const noTimestamps = corpus({
			runs: [run({ messages: [message({ timestamp: null })] })],
			counts: { sessions: 1, transcripts: 1, artifacts: 0, corrupt: 0, missing: 0 },
		});
		const report2 = buildAccountingReport(noTimestamps);
		expect(report2.snapshot.corpusFrom.status).toBe("unknown");
		expect(report2.snapshot.corpusTo.status).toBe("unknown");
		expect(report2.snapshot.sessions.status).toBe("known");
		if (report2.snapshot.sessions.status === "known") expect(report2.snapshot.sessions.value).toBe(1);
	});

	test("snapshot: discovery is carried through unchanged", () => {
		const c = corpus({ discovery: { scanned: 42, skipped: 3, scanLimitExceeded: true } });
		const report = buildAccountingReport(c);
		expect(report.snapshot.discovery).toEqual({ scanned: 42, skipped: 3, scanLimitExceeded: true });
	});

	test("coverage arithmetic: complete/partial/unknown including total===0", () => {
		const c = corpus({
			runs: [
				run({ messages: [message({ model: "m1", usage: usage({ cost: 1 }) })] }),
				run({ ref: ref({ sessionId: "s2" }), messages: [message({ model: "m1", usage: usage({ cost: null }) })] }),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.cost.coverage.status).toBe("partial");
		expect(report.overall.cost.coverage.attributed).toBe(1);
		expect(report.overall.cost.coverage.total).toBe(2);

		const emptyReport = buildAccountingReport(corpus());
		expect(emptyReport.overall.cost.coverage.status).toBe("unknown");
		expect(emptyReport.overall.cost.coverage.total).toBe(0);
	});

	test("partial transcript keeps measured values but cannot claim complete coverage", () => {
		const c = corpus({
			runs: [
				run({
					transcript: "partial",
					messages: [
						message({
							model: "m1",
							usage: usage({ input: 10, output: 2, cacheRead: 3, cacheWrite: 0, total: 15, cost: 1 }),
						}),
					],
				}),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.overall.cost.status).toBe("known");
		expect(report.overall.cost.coverage).toMatchObject({ status: "partial", attributed: 1, total: 1 });
		expect(report.overall.outputTokens.coverage.status).toBe("partial");
		expect(report.overall.peakPromptTokens.coverage.status).toBe("partial");
		expect(report.overall.peakSequenceTokens.coverage.status).toBe("partial");
	});

	test("determinism: two serialisations of the same corpus are byte-identical", () => {
		const c = corpus({
			runs: [
				run({ messages: [message({ model: "zeta", usage: usage({ cost: 1 }) })] }),
				run({ ref: ref({ sessionId: "s2" }), messages: [message({ model: "alpha", usage: usage({ cost: 2 }) })] }),
			],
		});
		const r1 = JSON.stringify(buildAccountingReport(c));
		const r2 = JSON.stringify(buildAccountingReport(c));
		expect(r1).toBe(r2);
	});

	test("agent ordering puts the null bucket last", () => {
		const c = corpus({
			runs: [
				run({ artifact: artifact({ agent: "zeta", attempts: [attempt({ model: "m1" })] }) }),
				run({ ref: ref({ sessionId: "s2" }), artifact: artifact({ agent: null, attempts: [attempt({ model: "m1" })] }) }),
				run({ ref: ref({ sessionId: "s3" }), artifact: artifact({ agent: "alpha", attempts: [attempt({ model: "m1" })] }) }),
			],
		});
		const report = buildAccountingReport(c);
		expect(report.byAgent.map((a) => a.agent)).toEqual(["alpha", "zeta", null]);
	});

	test("tree never appears as the provenance of a cost or token figure", () => {
		const c = corpus({
			runs: [
				run({
					messages: [message({ model: "m1", usage: usage({ cost: 1, input: 1, cacheRead: 0, cacheWrite: 0 }) })],
					artifact: artifact({ attempts: [attempt({ model: "m1", turns: 1 })] }),
				}),
			],
		});
		const report = buildAccountingReport(c);
		const costFigures = [
			report.overall.cost,
			report.overall.outputTokens,
			report.partition.parent.cost,
			report.partition.subagent.cost,
		];
		for (const figure of costFigures) {
			expect(figure.coverage.provenance).not.toContain("tree");
		}
		expect(report.overall.peakPromptTokens.coverage.provenance).not.toContain("tree");
	});

	test("session-accounting.ts is [CORE]: no fs/path imports", async () => {
		const source = await Bun.file(
			new URL("../ein-pi/agent/lib/session-accounting.ts", import.meta.url),
		).text();
		expect(source).toContain("[CORE]");
		expect(source).not.toMatch(/from\s+["']node:fs["']/);
		expect(source).not.toMatch(/from\s+["']node:path["']/);
		expect(source).not.toMatch(/from\s+["']node:os["']/);
		expect(source).not.toContain("Date.now()");
		expect(source).not.toContain("new Date()");
	});
});
