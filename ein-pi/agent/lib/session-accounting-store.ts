// =============================================================================
// SESSION ACCOUNTING STORE — LA E/S DEL AGREGADOR
//
// Recorre `~/.pi-ein/agent/sessions/` (raíz resuelta por llamada, nunca en
// carga de módulo — ver `sessions.ts`) y produce un `SessionCorpus` que
// `session-accounting.ts` (puro, sin E/S) convierte en un `AccountingReport`.
//
// Ninguna lectura lanza (R10): fichero ausente, corrupto, truncado o no-fichero
// se convierte en un estado tipado, nunca en una excepción ni en un registro
// descartado en silencio. El reloj y el censo (conteos, `discovery`) viven
// aquí, no en `[CORE]` — eso es lo que hace determinista R11.
// =============================================================================

import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { AGENT_DIR } from "../extensions/ein-paths";
import {
	buildAccountingReport,
	type AccountingReport,
	type ArtifactAttempt,
	type ArtifactRecord,
	type Discovery,
	type RunObservation,
	type RunRole,
	type SessionCorpus,
	type TranscriptMessage,
	type UsageSample,
} from "./session-accounting";

export const MAX_PROJECTS_SCANNED = 500;
export const MAX_RUNS_SCANNED = 20_000;
export const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
export const MAX_MESSAGES_PER_RUN = 20_000;
export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

const EMPTY_USAGE: UsageSample = { input: null, output: null, cacheRead: null, cacheWrite: null, total: null, cost: null };

// Resuelto por llamada, no en carga de módulo: el mismo bug que `sessions.ts`
// ya documenta y evita (el runtime adopta el home aislado después de cargar
// el módulo, y los tests mueven el home entre casos).
function sessionsRoot(): string {
	return join(process.env.EIN_PI_AGENT_HOME ?? AGENT_DIR, "sessions");
}

// --- narrowing local: todo lo que entra desde disco se trata como `unknown`.

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): readonly unknown[] | null {
	return Array.isArray(value) ? value : null;
}

function statOrNull(path: string): ReturnType<typeof statSync> | null {
	try {
		return statSync(path);
	} catch {
		return null;
	}
}

function listDir(path: string): readonly string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

function isDirectory(path: string): boolean {
	return statOrNull(path)?.isDirectory() ?? false;
}

// --- parseo de una línea de transcript: usage puede vivir en `message.usage`
// (forma primaria) o directamente en `usage` a nivel de línea (forma
// alternativa que R5 exige tolerar).

function usageSourceOf(line: Record<string, unknown>): unknown {
	const message = line.message;
	if (isRecord(message) && isRecord(message.usage)) return message.usage;
	if (isRecord(line.usage)) return line.usage;
	return null;
}

function parseTranscriptUsage(raw: unknown): UsageSample | null {
	if (!isRecord(raw)) return null;
	const costRaw = raw.cost;
	const cost = isRecord(costRaw) ? asFiniteNumber(costRaw.total) : asFiniteNumber(costRaw);
	return {
		input: asFiniteNumber(raw.input),
		output: asFiniteNumber(raw.output),
		cacheRead: asFiniteNumber(raw.cacheRead),
		cacheWrite: asFiniteNumber(raw.cacheWrite),
		total: asFiniteNumber(raw.totalTokens),
		cost,
	};
}

function timestampOf(line: Record<string, unknown>): string | null {
	const top = line.timestamp;
	if (typeof top === "string" && top.length > 0) return top;
	if (typeof top === "number" && Number.isFinite(top)) return new Date(top).toISOString();
	const message = line.message;
	const inner = isRecord(message) ? message.timestamp : undefined;
	if (typeof inner === "string" && inner.length > 0) return inner;
	if (typeof inner === "number" && Number.isFinite(inner)) return new Date(inner).toISOString();
	return null;
}

type TranscriptRead = Readonly<{
	status: RunObservation["transcript"];
	messages: readonly TranscriptMessage[];
	cwdProject: string | null;
}>;

// Lectura línea a línea, acotada en bytes y en número de mensajes (R10). Una
// línea sin parsear se cuenta y se descarta; el transcript pasa a "partial"
// pero no se abandona: la última línea de una sesión viva suele venir a
// medio escribir.
function readTranscript(path: string): TranscriptRead {
	const st = statOrNull(path);
	if (!st) return { status: "missing", messages: [], cwdProject: null };
	if (!st.isFile()) return { status: "unreadable", messages: [], cwdProject: null };

	let raw: Buffer;
	let truncatedByBytes = false;
	try {
		if (st.size > MAX_TRANSCRIPT_BYTES) {
			const fd = openSync(path, "r");
			try {
				const buf = Buffer.alloc(MAX_TRANSCRIPT_BYTES);
				readSync(fd, buf, 0, MAX_TRANSCRIPT_BYTES, 0);
				raw = buf;
			} finally {
				closeSync(fd);
			}
			truncatedByBytes = true;
		} else {
			raw = readFileSync(path);
		}
	} catch {
		return { status: "unreadable", messages: [], cwdProject: null };
	}

	const lines = raw.toString("utf8").split("\n");
	let unparsedCount = 0;
	let lastLineIncomplete = truncatedByBytes;
	let messagesTruncated = false;
	let cwdProject: string | null = null;
	let lastModel: string | null = null;
	const messages: TranscriptMessage[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (line.length === 0) continue;
		const isLastLine = i === lines.length - 1;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			if (isLastLine) lastLineIncomplete = true;
			else unparsedCount += 1;
			continue;
		}
		if (!isRecord(parsed)) {
			unparsedCount += 1;
			continue;
		}
		if (parsed.type === "session" && cwdProject === null) {
			const cwd = asString(parsed.cwd);
			cwdProject = cwd ? basename(cwd) : null;
			continue;
		}
		if (parsed.type === "model_change") {
			const modelId = asString(parsed.modelId);
			if (modelId) lastModel = modelId;
			continue;
		}
		if (parsed.type !== "message") continue;
		if (messages.length >= MAX_MESSAGES_PER_RUN) {
			messagesTruncated = true;
			continue;
		}
		const usageSource = usageSourceOf(parsed);
		if (!usageSource) continue; // mensaje sin telemetría, no aporta muestra
		const usage = parseTranscriptUsage(usageSource) ?? EMPTY_USAGE;
		messages.push({ model: lastModel, timestamp: timestampOf(parsed), usage });
	}

	const partial = lastLineIncomplete || unparsedCount > 0 || messagesTruncated;
	return { status: partial ? "partial" : "present", messages, cwdProject };
}

// --- artefactos de subagente (`<runId>_<agent>_meta.json`)

function parseAttempt(raw: unknown): ArtifactAttempt | null {
	if (!isRecord(raw)) return null;
	const model = asString(raw.model);
	const usageRaw = raw.usage;
	const usage: UsageSample | null = isRecord(usageRaw)
		? {
				input: asFiniteNumber(usageRaw.input),
				output: asFiniteNumber(usageRaw.output),
				cacheRead: asFiniteNumber(usageRaw.cacheRead),
				cacheWrite: asFiniteNumber(usageRaw.cacheWrite),
				total: null, // los artefactos no reportan usage.totalTokens
				cost: asFiniteNumber(usageRaw.cost), // escalar, no {total}
			}
		: null;
	const turns = isRecord(usageRaw) ? asFiniteNumber(usageRaw.turns) : null;
	return { model, usage, turns };
}

const CORRUPT_ARTIFACT: ArtifactRecord = { agent: null, exitCode: null, attemptedModels: [], attempts: null, integrity: "corrupt" };

function readArtifactMeta(path: string): ArtifactRecord {
	const st = statOrNull(path);
	if (!st || !st.isFile() || st.size > MAX_ARTIFACT_BYTES) return CORRUPT_ARTIFACT;
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return CORRUPT_ARTIFACT;
	}
	if (!isRecord(parsed)) return CORRUPT_ARTIFACT;
	const attemptedModelsRaw = asArray(parsed.attemptedModels) ?? [];
	const attemptedModels = attemptedModelsRaw.filter((m): m is string => typeof m === "string");
	const attemptsRaw = asArray(parsed.modelAttempts);
	const attempts = attemptsRaw ? attemptsRaw.map(parseAttempt).filter((a): a is ArtifactAttempt => a !== null) : null;
	return {
		agent: asString(parsed.agent),
		exitCode: asFiniteNumber(parsed.exitCode),
		attemptedModels,
		attempts,
		integrity: "ok",
	};
}

// El nombre de fichero es `<runId>_<agente>_meta.json`; el `runId` es un UUID
// sin guiones bajos, así que es siempre el primer segmento.
function runIdOfArtifactFile(fileName: string): string | null {
	const idx = fileName.indexOf("_");
	if (idx <= 0) return null;
	return fileName.slice(0, idx);
}

const RUN_INDEX_PATTERN = /^run-(\d+)$/;

export type ReadSessionCorpusOptions = Readonly<Record<string, never>>;

/** Recorre el árbol de sesiones y devuelve el corpus crudo. Nunca lanza. */
export function readSessionCorpus(_options: ReadSessionCorpusOptions = {}): SessionCorpus {
	const generatedAt = new Date().toISOString();
	const root = sessionsRoot();
	const rootStat = statOrNull(root);
	if (!rootStat || !rootStat.isDirectory()) {
		return {
			store: "absent",
			generatedAt,
			runs: [],
			counts: { sessions: 0, transcripts: 0, artifacts: 0, corrupt: 0, missing: 0 },
			discovery: { scanned: 0, skipped: 0, scanLimitExceeded: false },
		};
	}

	const projectNames = listDir(root).filter((name) => isDirectory(join(root, name)));
	const scannedProjectNames = projectNames.slice(0, MAX_PROJECTS_SCANNED);
	let projectsSkipped = projectNames.length - scannedProjectNames.length;
	let runsSkippedByCap = 0;
	let runsScanned = 0;

	const runs: RunObservation[] = [];
	let sessions = 0;
	let transcripts = 0;
	let artifacts = 0;
	let corrupt = 0;
	let missing = 0;

	function canScanMore(): boolean {
		if (runsScanned >= MAX_RUNS_SCANNED) {
			runsSkippedByCap += 1;
			return false;
		}
		runsScanned += 1;
		return true;
	}

	function recordTranscript(read: TranscriptRead): void {
		if (read.status === "missing") missing += 1;
		else transcripts += 1;
	}

	for (const dirName of scannedProjectNames) {
		const projectDir = join(root, dirName);
		const entries = listDir(projectDir);
		const parentFiles = entries.filter((e) => e.endsWith(".jsonl"));
		const subDirs = entries.filter((e) => e !== "subagent-artifacts" && isDirectory(join(projectDir, e)));

		// Artefactos del proyecto, indexados por runId; `subagent-artifacts` NO
		// es un directorio de sesión y queda excluido del recorrido de árbol.
		const artifactsByRunId = new Map<string, ArtifactRecord>();
		const artifactsDir = join(projectDir, "subagent-artifacts");
		if (isDirectory(artifactsDir)) {
			for (const file of listDir(artifactsDir)) {
				if (!file.endsWith("_meta.json")) continue;
				const runId = runIdOfArtifactFile(file);
				artifacts += 1;
				const record = readArtifactMeta(join(artifactsDir, file));
				if (record.integrity === "corrupt") corrupt += 1;
				if (runId) artifactsByRunId.set(runId, record);
			}
		}

		const projectByStem = new Map<string, string>();
		const consumedArtifactRunIds = new Set<string>();

		for (const fileName of parentFiles) {
			if (!canScanMore()) continue;
			sessions += 1;
			const sessionId = fileName.replace(/\.jsonl$/, "");
			const read = readTranscript(join(projectDir, fileName));
			recordTranscript(read);
			const project = read.cwdProject ?? dirName;
			projectByStem.set(sessionId, project);
			const role: RunRole = "parent";
			runs.push({
				ref: { project, sessionId, role, runId: null, runDir: null, runIndex: null },
				transcript: read.status,
				messages: read.messages,
				artifact: null,
			});
		}

		for (const sessionDirName of subDirs) {
			const sessionDir = join(projectDir, sessionDirName);
			const project = projectByStem.get(sessionDirName) ?? dirName;
			const runIds = listDir(sessionDir).filter((e) => isDirectory(join(sessionDir, e)));
			for (const runId of runIds) {
				if (artifactsByRunId.has(runId)) consumedArtifactRunIds.add(runId);
				const runIdDir = join(sessionDir, runId);
				const runDirNames = listDir(runIdDir).filter((e) => isDirectory(join(runIdDir, e)));
				for (const runDirName of runDirNames) {
					if (!canScanMore()) continue;
					const match = RUN_INDEX_PATTERN.exec(runDirName);
					const runIndex = match ? Number(match[1]) : null;
					const runDir = join(runIdDir, runDirName);
					const read = readTranscript(join(runDir, "session.jsonl"));
					recordTranscript(read);
					const role: RunRole = "subagent";
					runs.push({
						ref: { project, sessionId: sessionDirName, role, runId, runDir, runIndex },
						transcript: read.status,
						messages: read.messages,
						artifact: artifactsByRunId.get(runId) ?? null,
					});
				}
			}
		}

		// Artefactos huerfanos: subagent-artifacts/<runId>_..._meta.json cuyo
		// runId nunca aparece como directorio bajo ningun sessionDir del arbol.
		// Sin observacion sintetica, ese coste desaparece del informe en
		// silencio. Procedencia artifact: no hay run-N/session.jsonl, asi que
		// el transcript es "missing" y el coste entra por el unico canal
		// disponible.
		for (const [runId, record] of artifactsByRunId) {
			if (consumedArtifactRunIds.has(runId)) continue;
			if (!canScanMore()) continue;
			missing += 1;
			runs.push({
				ref: { project: dirName, sessionId: runId, role: "subagent", runId, runDir: null, runIndex: null },
				transcript: "missing",
				messages: [],
				artifact: record,
			});
		}
	}

	const skipped = projectsSkipped + runsSkippedByCap;
	const discovery: Discovery = { scanned: runs.length, skipped, scanLimitExceeded: skipped > 0 };

	return {
		store: "present",
		generatedAt,
		runs,
		counts: { sessions, transcripts, artifacts, corrupt, missing },
		discovery,
	};
}

/** Composición E/S + agregador puro: un único punto de entrada para el comando. */
export function readAccountingReport(options: ReadSessionCorpusOptions = {}): AccountingReport {
	return buildAccountingReport(readSessionCorpus(options));
}
