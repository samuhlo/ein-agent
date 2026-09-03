// =============================================================================
// [CORE] SESSION ACCOUNTING — AGREGADOR PURO
//
// Convierte los bytes que Ein ya escribe en sesión (transcripts + artefactos de
// subagente) en un reporte de coste honesto: qué se midió, qué falta, y en qué
// canal se atribuyó cada cifra. Sin E/S: recibe un `SessionCorpus` ya leído por
// el módulo store (fuera de este fichero) y devuelve un `AccountingReport`.
//
// FAIL CLOSED -> ausencia nunca es 0. `Total`, `Stat` y `Known<T>` son uniones
// discriminadas: una cifra `unknown` no tiene campo `value` que leer. Un coste
// explícito de 0 con cobertura completa SÍ es una medición válida (el caso
// normal de un modelo local) y se distingue estructuralmente de "no medido".
//
// No lee el reloj: `Snapshot.generatedAt` entra como dato del corpus, nunca se
// consulta la hora del sistema aquí dentro. Hacerlo rompería el test de
// determinismo (R11).
// =============================================================================

import {
	summarizeApplyPacketObservations,
	type ApplyPacketObservationRecord,
	type ApplyPacketReadinessReport,
} from "./apply-packet-observation-record.ts";

export type Provenance = "transcript" | "artifact" | "tree";
export type RunRole = "parent" | "subagent";
export type SampleUnit = "run" | "run-model" | "attempt";

export type RunRef = Readonly<{
	project: string;
	sessionId: string;
	role: RunRole;
	runId: string | null;
	runDir: string | null;
	runIndex: number | null; // N de run-N; N > 0 = rerun de proceso
}>;

export type UsageSample = Readonly<{
	input: number | null;
	output: number | null;
	cacheRead: number | null;
	cacheWrite: number | null;
	total: number | null; // usage.totalTokens cuando se reporta
	cost: number | null; // null = campo ausente, NO cero
}>;

export type TranscriptMessage = Readonly<{
	model: string | null;
	timestamp: string | null;
	usage: UsageSample;
}>;

export type ArtifactAttempt = Readonly<{
	model: string | null;
	usage: UsageSample | null;
	turns: number | null;
}>;

export type ArtifactRecord = Readonly<{
	agent: string | null;
	exitCode: number | null;
	attemptedModels: readonly string[];
	attempts: readonly ArtifactAttempt[] | null;
	integrity: "ok" | "corrupt";
}>;

export type RunObservation = Readonly<{
	ref: RunRef;
	transcript: "present" | "partial" | "missing" | "unreadable";
	messages: readonly TranscriptMessage[];
	artifact: ArtifactRecord | null;
}>;

export type Discovery = Readonly<{ scanned: number; skipped: number; scanLimitExceeded: boolean }>;

export type SessionCorpus = Readonly<{
	store: "present" | "absent";
	generatedAt: string; // ISO-8601; el store posee el reloj
	runs: readonly RunObservation[];
	applyPacketObservations?: readonly ApplyPacketObservationRecord[];
	malformedApplyPacketObservations?: number;
	counts: Readonly<{ sessions: number; transcripts: number; artifacts: number; corrupt: number; missing: number }>;
	discovery: Discovery;
}>;

export type Coverage = Readonly<{
	status: "complete" | "partial" | "unknown";
	attributed: number;
	total: number;
	provenance: readonly Provenance[]; // ordenado, sin duplicados
}>;

export type Sources = Readonly<{ reported: number; derived: number }>;

export type Stat =
	| Readonly<{ status: "known"; unit: SampleUnit; n: number; mean: number; p95: number; max: number; sources: Sources; coverage: Coverage }>
	| Readonly<{ status: "unknown"; unit: SampleUnit; n: 0; sources: Sources; coverage: Coverage }>;

export type Total =
	| Readonly<{ status: "known"; value: number; coverage: Coverage }>
	| Readonly<{ status: "unknown"; coverage: Coverage }>;

export type Known<T> = Readonly<{ status: "known"; value: T }> | Readonly<{ status: "unknown" }>;

export type Tally = Readonly<{ count: number; undetermined: number; coverage: Coverage }>;

export type Outcomes = Readonly<{
	failures: Tally;
	modelFallbacks: Tally;
	processReruns: Tally;
	maxRunIndex: Known<number>;
}>;

export type ChannelUse = Readonly<{ transcript: number; artifact: number; unattributed: number }>;

export type Slice = Readonly<{
	runs: number;
	cost: Total;
	outputTokens: Total;
	peakPromptTokens: Stat;
	peakSequenceTokens: Stat;
	turnsPerRun: Stat;
	outcomes: Outcomes;
	channels: ChannelUse;
	coverage: Coverage;
}>;

export type ModelAccounting = Readonly<{ model: string | null } & Slice>;
export type AgentAccounting = Readonly<{ agent: string | null } & Slice>;

export type Snapshot = Readonly<{
	generatedAt: string;
	corpusFrom: Known<string>;
	corpusTo: Known<string>;
	sessions: Known<number>;
	transcripts: Known<number>;
	artifacts: Known<number>;
	corruptFiles: number;
	missingFiles: number;
	runsAttributed: number;
	runsUnattributable: number;
	discovery: Discovery;
}>;

export type AccountingReport = Readonly<{
	schemaVersion: 2;
	store: "present" | "absent";
	snapshot: Snapshot;
	applyPackets: ApplyPacketReadinessReport;
	overall: Slice;
	partition: Readonly<{ parent: Slice; subagent: Slice }>;
	byModel: readonly ModelAccounting[];
	byAgent: readonly AgentAccounting[];
	coverage: Coverage;
}>;

// --- narrowing local, todo lo que entra desde el corpus se trata como datos
// ya validados por el store, pero las funciones numéricas siguen defendiendo
// contra NaN/Infinity porque un campo mal formado no debe leerse como 0.

function finiteNonNegative(value: number | null): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finite(value: number | null): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

// --- cobertura: única función con las tres ramas (R1/C.3)

function coverageOf(attributed: number, total: number, provenance: readonly Provenance[], forcePartial = false): Coverage {
	const status: Coverage["status"] = attributed === 0 ? "unknown" : !forcePartial && attributed === total && total > 0 ? "complete" : "partial";
	const sorted = [...new Set(provenance)].sort();
	return { status, attributed, total, provenance: sorted };
}

function mergeCoverage(a: Coverage, b: Coverage): Coverage {
	return coverageOf(
		a.attributed + b.attributed,
		a.total + b.total,
		[...a.provenance, ...b.provenance],
		a.status === "partial" || b.status === "partial",
	);
}

const EMPTY_COVERAGE = coverageOf(0, 0, []);

// --- percentil nearest-rank (C.5)

function percentileIndex(p: number, n: number): number {
	return Math.min(Math.max(Math.ceil((p / 100) * n) - 1, 0), n - 1);
}

function statFromSamples(
	unit: SampleUnit,
	values: readonly number[],
	sources: Sources,
	total: number,
	provenance: readonly Provenance[],
	forcePartial = false,
): Stat {
	const n = values.length;
	const coverage = coverageOf(n, total, provenance, forcePartial);
	if (n === 0) return { status: "unknown", unit, n: 0, sources, coverage };
	const sorted = [...values].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, v) => acc + v, 0);
	const mean = sum / n;
	const max = sorted[n - 1]!;
	const p95 = sorted[percentileIndex(95, n)]!;
	return { status: "known", unit, n, mean, p95, max, sources, coverage };
}

function totalFromSamples(values: readonly number[], total: number, provenance: readonly Provenance[], forcePartial = false): Total {
	const coverage = coverageOf(values.length, total, provenance, forcePartial);
	if (values.length === 0) return { status: "unknown", coverage };
	const value = values.reduce((acc, v) => acc + v, 0);
	return { status: "known", value, coverage };
}

// --- coste single-channel por run (R3/R5): transcript > artifact

type RunCost = Readonly<{ value: number | null; channel: "transcript" | "artifact" | "none" }>;

function transcriptCost(messages: readonly TranscriptMessage[]): number | null {
	const withCost = messages.filter((m) => finiteNonNegative(m.usage.cost));
	if (withCost.length === 0) return null;
	return withCost.reduce((acc, m) => acc + m.usage.cost!, 0);
}

function artifactCost(artifact: ArtifactRecord | null): number | null {
	if (!artifact || !artifact.attempts) return null;
	const withCost = artifact.attempts.filter((a) => a.usage && finiteNonNegative(a.usage.cost));
	if (withCost.length === 0) return null;
	return withCost.reduce((acc, a) => acc + a.usage!.cost!, 0);
}

function runCostOf(run: RunObservation): RunCost {
	const t = transcriptCost(run.messages);
	if (t !== null) return { value: t, channel: "transcript" };
	const a = artifactCost(run.artifact);
	if (a !== null) return { value: a, channel: "artifact" };
	return { value: null, channel: "none" };
}

function transcriptOutputTokens(messages: readonly TranscriptMessage[]): number | null {
	const withOutput = messages.filter((m) => finiteNonNegative(m.usage.output));
	if (withOutput.length === 0) return null;
	return withOutput.reduce((acc, m) => acc + m.usage.output!, 0);
}

function artifactOutputTokens(artifact: ArtifactRecord | null): number | null {
	if (!artifact || !artifact.attempts) return null;
	const withOutput = artifact.attempts.filter((a) => a.usage && finiteNonNegative(a.usage.output));
	if (withOutput.length === 0) return null;
	return withOutput.reduce((acc, a) => acc + a.usage!.output!, 0);
}

function runOutputTokensOf(run: RunObservation): RunCost {
	const t = transcriptOutputTokens(run.messages);
	if (t !== null) return { value: t, channel: "transcript" };
	const a = artifactOutputTokens(run.artifact);
	if (a !== null) return { value: a, channel: "artifact" };
	return { value: null, channel: "none" };
}

// --- picos (R6/C.4): prompt = max(input+cacheRead+cacheWrite) elegible por
// mensaje; secuencia = totalTokens reportado, o la suma de 4 componentes.

function promptPeakOfRun(messages: readonly TranscriptMessage[]): number | null {
	let peak: number | null = null;
	for (const m of messages) {
		const { input, cacheRead, cacheWrite } = m.usage;
		if (!finiteNonNegative(input) || !finiteNonNegative(cacheRead) || !finiteNonNegative(cacheWrite)) continue;
		const value = input + cacheRead + cacheWrite;
		if (peak === null || value > peak) peak = value;
	}
	return peak;
}

type SequencePeak = Readonly<{ value: number; source: "reported" | "derived" }>;

function sequencePeakOfRun(messages: readonly TranscriptMessage[]): SequencePeak | null {
	let best: SequencePeak | null = null;
	for (const m of messages) {
		const { input, cacheRead, cacheWrite, output, total } = m.usage;
		let candidate: SequencePeak | null = null;
		if (finiteNonNegative(total)) {
			candidate = { value: total, source: "reported" };
		} else if (finiteNonNegative(input) && finiteNonNegative(cacheRead) && finiteNonNegative(cacheWrite) && finiteNonNegative(output)) {
			candidate = { value: input + cacheRead + cacheWrite + output, source: "derived" };
		}
		if (candidate && (best === null || candidate.value > best.value)) best = candidate;
	}
	return best;
}

// --- turnos (R7): solo desde modelAttempts[].usage.turns, muestra por run
// requiere que TODOS los attempts reporten turns finitos >= 0.

function runTurns(run: RunObservation): number | null {
	const attempts = run.artifact?.attempts;
	if (!attempts || attempts.length === 0) return null;
	if (!attempts.every((a) => finiteNonNegative(a.turns))) return null;
	return attempts.reduce((acc, a) => acc + a.turns!, 0);
}

// --- outcomes (R8): tres tallies independientes

function failureOutcome(run: RunObservation): "success" | "failure" | "undetermined" {
	const artifact = run.artifact;
	if (!artifact) return "undetermined";
	if (!finite(artifact.exitCode)) return "undetermined";
	return artifact.exitCode === 0 ? "success" : "failure";
}

function fallbackOutcome(run: RunObservation): "single" | "fallback" | "undetermined" {
	const attempts = run.artifact?.attempts;
	if (!attempts) return "undetermined";
	return attempts.length > 1 ? "fallback" : "single";
}

function rerunOutcome(run: RunObservation): "none" | "rerun" | "undetermined" {
	if (run.ref.role !== "subagent") return "none";
	const index = run.ref.runIndex;
	if (index === null) return "undetermined";
	if (!finite(index)) return "undetermined";
	return index > 0 ? "rerun" : "none";
}

function buildTally(runs: readonly RunObservation[], classify: (run: RunObservation) => "yes" | "no" | "undetermined"): Tally {
	let count = 0;
	let undetermined = 0;
	let attributed = 0;
	for (const run of runs) {
		const outcome = classify(run);
		if (outcome === "undetermined") {
			undetermined += 1;
			continue;
		}
		attributed += 1;
		if (outcome === "yes") count += 1;
	}
	return { count, undetermined, coverage: coverageOf(attributed, runs.length, runs.length > 0 ? (["tree"] as const) : []) };
}

function maxRunIndexOf(runs: readonly RunObservation[]): Known<number> {
	let best: number | null = null;
	for (const run of runs) {
		const index = run.ref.runIndex;
		if (finite(index) && (best === null || index > best)) best = index;
	}
	return best === null ? { status: "unknown" } : { status: "known", value: best };
}

function buildOutcomes(runs: readonly RunObservation[]): Outcomes {
	const failures = buildTally(runs, (r) => {
		const o = failureOutcome(r);
		return o === "undetermined" ? "undetermined" : o === "failure" ? "yes" : "no";
	});
	const modelFallbacks = buildTally(runs, (r) => {
		const o = fallbackOutcome(r);
		return o === "undetermined" ? "undetermined" : o === "fallback" ? "yes" : "no";
	});
	const processReruns = buildTally(runs, (r) => {
		const o = rerunOutcome(r);
		return o === "undetermined" ? "undetermined" : o === "rerun" ? "yes" : "no";
	});
	return { failures, modelFallbacks, processReruns, maxRunIndex: maxRunIndexOf(runs) };
}

// --- construcción de una Slice (bloque de métricas) a partir de un
// subconjunto de runs; el resto del reporte es sólo particionar `runs` y
// llamar a esta función con distintos subconjuntos.

function buildSlice(runs: readonly RunObservation[]): Slice {
	const costValues: number[] = [];
	let costProvenance: Provenance[] = [];
	const outputValues: number[] = [];
	let outputProvenance: Provenance[] = [];
	let transcriptChannel = 0;
	let artifactChannel = 0;
	let unattributedChannel = 0;
	let costIncomplete = false;
	let outputIncomplete = false;

	const promptSamples: number[] = [];
	const sequenceSamples: number[] = [];
	let promptIncomplete = false;
	let sequenceIncomplete = false;
	let sequenceReported = 0;
	let sequenceDerived = 0;

	const turnSamples: number[] = [];

	for (const run of runs) {
		const cost = runCostOf(run);
		if (cost.value !== null) {
			costValues.push(cost.value);
			costProvenance.push(cost.channel as Provenance);
			if (cost.channel === "transcript" && run.transcript !== "present") costIncomplete = true;
		}
		if (cost.channel === "transcript") transcriptChannel += 1;
		else if (cost.channel === "artifact") artifactChannel += 1;
		else unattributedChannel += 1;

		const output = runOutputTokensOf(run);
		if (output.value !== null) {
			outputValues.push(output.value);
			outputProvenance.push(output.channel as Provenance);
			if (output.channel === "transcript" && run.transcript !== "present") outputIncomplete = true;
		}

		const prompt = promptPeakOfRun(run.messages);
		if (prompt !== null) {
			promptSamples.push(prompt);
			if (run.transcript !== "present") promptIncomplete = true;
		}

		const sequence = sequencePeakOfRun(run.messages);
		if (sequence !== null) {
			sequenceSamples.push(sequence.value);
			if (run.transcript !== "present") sequenceIncomplete = true;
			if (sequence.source === "reported") sequenceReported += 1;
			else sequenceDerived += 1;
		}

		const turns = runTurns(run);
		if (turns !== null) turnSamples.push(turns);
	}

	const cost = totalFromSamples(costValues, runs.length, costProvenance, costIncomplete);
	const outputTokens = totalFromSamples(outputValues, runs.length, outputProvenance, outputIncomplete);
	const peakPromptTokens = statFromSamples(
		"run",
		promptSamples,
		{ reported: 0, derived: promptSamples.length },
		runs.length,
		promptSamples.length > 0 ? (["transcript"] as const) : [],
		promptIncomplete,
	);
	const peakSequenceTokens = statFromSamples(
		"run",
		sequenceSamples,
		{ reported: sequenceReported, derived: sequenceDerived },
		runs.length,
		sequenceSamples.length > 0 ? (["transcript"] as const) : [],
		sequenceIncomplete,
	);
	const turnsPerRun = statFromSamples("run", turnSamples, { reported: turnSamples.length, derived: 0 }, runs.length, turnSamples.length > 0 ? (["artifact"] as const) : []);
	const outcomes = buildOutcomes(runs);
	const channels: ChannelUse = { transcript: transcriptChannel, artifact: artifactChannel, unattributed: unattributedChannel };

	const coverage = [cost.coverage, outputTokens.coverage, peakPromptTokens.coverage, peakSequenceTokens.coverage, turnsPerRun.coverage].reduce(mergeCoverage, EMPTY_COVERAGE);

	return { runs: runs.length, cost, outputTokens, peakPromptTokens, peakSequenceTokens, turnsPerRun, outcomes, channels, coverage };
}

// --- particiones por modelo / agente; el bucket null va siempre al final,
// ambos ordenados por nombre (R11).

function modelsOfRun(run: RunObservation): readonly (string | null)[] {
	const fromMessages = run.messages.map((m) => m.model);
	const fromArtifact = run.artifact?.attempts?.map((a) => a.model) ?? [];
	const all = [...fromMessages, ...fromArtifact];
	return all.length > 0 ? [...new Set(all)] : [null];
}

// Vista de un run recortada a un único modelo: sólo sus mensajes y sus
// attempts de ese modelo. Así el desglose por modelo no reutiliza el coste
// completo del run (que mezclaría modelos distintos), sino sólo lo que ese
// modelo aportó.
function perModelRunView(run: RunObservation, model: string | null): RunObservation {
	const messages = run.messages.filter((m) => m.model === model);
	const transcriptOwnsCost = transcriptCost(run.messages) !== null;
	const transcriptOwnsOutput = transcriptOutputTokens(run.messages) !== null;
	const attempts = run.artifact?.attempts
		? run.artifact.attempts
				.filter((a) => a.model === model)
				.map((attempt) => ({
					...attempt,
					usage: attempt.usage
						? {
								...attempt.usage,
								cost: transcriptOwnsCost ? null : attempt.usage.cost,
								output: transcriptOwnsOutput ? null : attempt.usage.output,
							}
						: null,
				}))
		: run.artifact?.attempts ?? null;
	const artifact = run.artifact ? { ...run.artifact, attempts } : null;
	return { ...run, messages, artifact };
}

function buildByModel(runs: readonly RunObservation[]): readonly ModelAccounting[] {
	const buckets = new Map<string | null, RunObservation[]>();
	for (const run of runs) {
		for (const model of modelsOfRun(run)) {
			const bucket = buckets.get(model) ?? [];
			bucket.push(perModelRunView(run, model));
			buckets.set(model, bucket);
		}
	}
	const entries = [...buckets.entries()].map(([model, bucketRuns]) => ({ model, ...buildSlice(bucketRuns) }));
	return sortByNameNullLast(entries, (e) => e.model);
}

function buildByAgent(runs: readonly RunObservation[]): readonly AgentAccounting[] {
	const buckets = new Map<string | null, RunObservation[]>();
	for (const run of runs) {
		const agent = run.artifact?.agent ?? null;
		const bucket = buckets.get(agent) ?? [];
		bucket.push(run);
		buckets.set(agent, bucket);
	}
	const entries = [...buckets.entries()].map(([agent, bucketRuns]) => ({ agent, ...buildSlice(bucketRuns) }));
	return sortByNameNullLast(entries, (e) => e.agent);
}

function sortByNameNullLast<T>(entries: readonly T[], key: (entry: T) => string | null): readonly T[] {
	return [...entries].sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		if (ka === null && kb === null) return 0;
		if (ka === null) return 1;
		if (kb === null) return -1;
		return ka < kb ? -1 : ka > kb ? 1 : 0;
	});
}

// --- snapshot (R13)

function corpusInterval(runs: readonly RunObservation[]): Readonly<{ from: Known<string>; to: Known<string> }> {
	let min: string | null = null;
	let max: string | null = null;
	for (const run of runs) {
		for (const message of run.messages) {
			const ts = message.timestamp;
			if (typeof ts !== "string" || ts.length === 0) continue;
			if (min === null || ts < min) min = ts;
			if (max === null || ts > max) max = ts;
		}
	}
	return {
		from: min === null ? { status: "unknown" } : { status: "known", value: min },
		to: max === null ? { status: "unknown" } : { status: "known", value: max },
	};
}

function knownCount(value: number): Known<number> {
	return { status: "known", value };
}

function buildSnapshot(corpus: SessionCorpus, runs: readonly RunObservation[]): Snapshot {
	const interval = corpusInterval(runs);
	const attributed = runs.filter((r) => runCostOf(r).channel !== "none").length;
	return {
		generatedAt: corpus.generatedAt,
		corpusFrom: interval.from,
		corpusTo: interval.to,
		sessions: knownCount(corpus.counts.sessions),
		transcripts: knownCount(corpus.counts.transcripts),
		artifacts: knownCount(corpus.counts.artifacts),
		corruptFiles: corpus.counts.corrupt,
		missingFiles: corpus.counts.missing,
		runsAttributed: attributed,
		runsUnattributable: runs.length - attributed,
		discovery: corpus.discovery,
	};
}

// --- punto de entrada

export function buildAccountingReport(corpus: SessionCorpus): AccountingReport {
	const runs = corpus.runs;
	const parentRuns = runs.filter((r) => r.ref.role === "parent");
	const subagentRuns = runs.filter((r) => r.ref.role === "subagent");

	const overall = buildSlice(runs);
	const parent = buildSlice(parentRuns);
	const subagent = buildSlice(subagentRuns);
	const byModel = buildByModel(runs);
	const byAgent = buildByAgent(runs);
	const snapshot = buildSnapshot(corpus, runs);

	// La estructura (partición parent/subagent) es un hecho `tree`, aunque las
	// cifras dentro de cada mitad conserven su propia procedencia (R2).
	const partitionCoverage = coverageOf(runs.length, runs.length, runs.length > 0 ? (["tree"] as const) : []);
	const coverage = mergeCoverage(overall.coverage, partitionCoverage);

	return {
		schemaVersion: 2,
		store: corpus.store,
		snapshot,
		applyPackets: summarizeApplyPacketObservations(
			corpus.applyPacketObservations ?? [],
			corpus.malformedApplyPacketObservations ?? 0,
		),
		overall,
		partition: { parent, subagent },
		byModel,
		byAgent,
		coverage,
	};
}
