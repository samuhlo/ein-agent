// =============================================================================
// RECIBO DE CANDIDATO VERIFICADO (slice 03)
// =============================================================================
// Una verificación que pasa no dice QUÉ bytes pasaron. Entre el verify y el
// commit puede cambiar el árbol, colarse trabajo ajeno o entregarse otra cosa:
// "verificado" acaba siendo una afirmación sobre un momento, no sobre un
// contenido. Este módulo fija ese contenido.
//
// Mecanismo: se construye un ÁRBOL CANDIDATO sintético con un índice git
// temporal (`GIT_INDEX_FILE`), sembrado desde HEAD y con solo las rutas
// previstas. Produce un `tree` de git —content-addressed, sin mtime ni orden—
// SIN tocar el índice ni el worktree reales. Verificado: tras construirlo, un
// fichero modificado sigue apareciendo como no-staged.
//
// El recibo vive en el área administrativa del worktree (`.git/ein/`), NO en el
// repo: es evidencia local de una ejecución, no contenido versionado. Se usa
// `--git-dir` (no `.git/` a pelo) para que un worktree enlazado tenga el suyo.
//
// Qué liga el recibo: repositorio, worktree, cambio SDD, HEAD, árbol candidato,
// rutas previstas, informe de verify y comandos de evidencia. Falla CERRADO
// ante recibo ausente, corrupto, de otro repo/worktree o de otro cambio — esta
// última comprobación es la lección del recibo OpenSpec, que serializaba el
// cambio y no lo miraba, de forma que un recibo prestado pasaba por bueno.
//
// ALCANCE: este módulo PRODUCE y VALIDA el recibo. Gatear la entrega con él es
// el slice 04. Aquí no se bloquea ningún commit.
// =============================================================================

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const RECEIPT_VERSION = 1;

export type CandidateReceipt = {
	receiptVersion: number;
	repositoryId: string;
	worktreeId: string;
	change: string;
	head: string;
	branch: string;
	treeSha: string;
	paths: string[];
	pathsSha256: string;
	reportSha256: string;
	commandsSha256: string;
	createdAt: string;
};

export type ReceiptVerdict =
	| { ok: true; receipt: CandidateReceipt }
	| { ok: false; reason: string };

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

// `LC_ALL=C` por la misma razón que en git-staging: la salida de git pasa por
// su capa de traducción y un parser que dependa del idioma falla en silencio.
function git(cwd: string, args: string[], env: Record<string, string> = {}): string | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			env: { ...process.env, LC_ALL: "C", LANGUAGE: "C", ...env },
		}).trim();
	} catch {
		return null;
	}
}

export type WorktreeIdentity = {
	gitDir: string;
	commonDir: string;
	repositoryId: string;
	worktreeId: string;
	head: string;
	branch: string;
};

// Identidad del repo y del worktree. `--git-common-dir` es compartido por todos
// los worktrees de un clon (identidad de REPOSITORIO); `--git-dir` es propio de
// cada worktree enlazado (identidad de WORKTREE). Distinguirlos evita que un
// recibo emitido en un worktree valga en otro del mismo clon.
export function resolveWorktreeIdentity(cwd: string): WorktreeIdentity | null {
	const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
	if (!gitDir) return null;
	const commonRaw = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]) ?? gitDir;
	const commonDir = resolve(commonRaw);
	const head = git(cwd, ["rev-parse", "HEAD"]) ?? "";
	const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "";
	return {
		gitDir: resolve(gitDir),
		commonDir,
		repositoryId: sha256(commonDir),
		worktreeId: sha256(resolve(gitDir)),
		head,
		branch,
	};
}

// Rutas PREVISTAS = modificaciones sobre ficheros ya trackeados (staged o no)
// + los untracked que se nombren explícitamente. Misma doctrina que el guard de
// staging: lo trackeado que has tocado es tuyo por definición; lo no trackeado
// hay que nombrarlo, porque puede ser trabajo en curso de otro.
export function collectIntendedPaths(cwd: string, includeUntracked: readonly string[] = []): string[] {
	const tracked = git(cwd, ["diff", "--name-only", "HEAD"]);
	const paths = new Set<string>();
	for (const line of (tracked ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean)) {
		paths.add(line);
	}
	for (const entry of includeUntracked) {
		const normalized = entry.replace(/^\.\//, "").replace(/\/+$/, "");
		if (normalized) paths.add(normalized);
	}
	return [...paths].sort();
}

// Árbol candidato: índice temporal sembrado desde HEAD + solo las rutas
// previstas. El índice vive en el área administrativa y se borra siempre; el
// índice y el worktree REALES no se tocan en ningún momento.
export function buildCandidateTree(cwd: string, paths: readonly string[]): string | null {
	const identity = resolveWorktreeIdentity(cwd);
	if (!identity) return null;
	const indexPath = join(identity.gitDir, `ein-candidate-${process.pid}-${Math.random().toString(16).slice(2)}.idx`);
	const env = { GIT_INDEX_FILE: indexPath };
	try {
		if (git(cwd, ["read-tree", "HEAD"], env) === null) return null;
		if (paths.length > 0) {
			// `--` separa rutas de opciones: un fichero llamado `-x` no se lee como flag.
			if (git(cwd, ["add", "--", ...paths], env) === null) return null;
		}
		return git(cwd, ["write-tree"], env);
	} finally {
		rmSync(indexPath, { force: true });
	}
}

// Digest del manifiesto de rutas: ordenado y con separador explícito para que
// `["ab","c"]` y `["a","bc"]` no colisionen.
export function digestPaths(paths: readonly string[]): string {
	return sha256([...paths].sort().map((path) => `${path}\n`).join(""));
}

export function receiptPath(cwd: string): string | null {
	const identity = resolveWorktreeIdentity(cwd);
	if (!identity) return null;
	return join(identity.gitDir, "ein", "candidate-receipt.json");
}

export function serializeReceipt(receipt: CandidateReceipt): string {
	return `${JSON.stringify(receipt, null, 2)}\n`;
}

// Parser estricto: un recibo a medias o de otra versión NO se interpreta a la
// buena de dios — se rechaza. Un recibo que no se entiende no es evidencia.
export function parseReceipt(source: string): CandidateReceipt | null {
	let raw: unknown;
	try {
		raw = JSON.parse(source);
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null) return null;
	const value = raw as Record<string, unknown>;
	const strings = ["repositoryId", "worktreeId", "change", "head", "branch", "treeSha", "pathsSha256", "reportSha256", "commandsSha256", "createdAt"] as const;
	for (const key of strings) {
		if (typeof value[key] !== "string" || !(value[key] as string)) return null;
	}
	if (value.receiptVersion !== RECEIPT_VERSION) return null;
	if (!Array.isArray(value.paths) || value.paths.some((entry) => typeof entry !== "string")) return null;
	return {
		receiptVersion: RECEIPT_VERSION,
		repositoryId: value.repositoryId as string,
		worktreeId: value.worktreeId as string,
		change: value.change as string,
		head: value.head as string,
		branch: value.branch as string,
		treeSha: value.treeSha as string,
		paths: value.paths as string[],
		pathsSha256: value.pathsSha256 as string,
		reportSha256: value.reportSha256 as string,
		commandsSha256: value.commandsSha256 as string,
		createdAt: value.createdAt as string,
	};
}

export type EmitInput = {
	change: string;
	// Bytes del verify-report.md que respalda este candidato.
	report: string;
	// Comandos/evidencia de verificación, tal y como se ejecutaron.
	commands: readonly string[];
	includeUntracked?: readonly string[];
};

export type EmitResult =
	| { ok: true; receipt: CandidateReceipt; path: string }
	| { ok: false; reason: string };

// Emite el recibo. Publicación atómica: se escribe un temporal en el MISMO
// directorio y se renombra, para que una cancelación a mitad no deje un recibo
// parcial que luego se lea como evidencia.
export function emitCandidateReceipt(cwd: string, input: EmitInput): EmitResult {
	const identity = resolveWorktreeIdentity(cwd);
	if (!identity) return { ok: false, reason: "no es un repositorio git" };
	if (!identity.head) return { ok: false, reason: "el repositorio no tiene HEAD (sin commits)" };
	const paths = collectIntendedPaths(cwd, input.includeUntracked ?? []);
	const treeSha = buildCandidateTree(cwd, paths);
	if (!treeSha) return { ok: false, reason: "no se pudo construir el árbol candidato" };
	const receipt: CandidateReceipt = {
		receiptVersion: RECEIPT_VERSION,
		repositoryId: identity.repositoryId,
		worktreeId: identity.worktreeId,
		change: input.change,
		head: identity.head,
		branch: identity.branch,
		treeSha,
		paths,
		pathsSha256: digestPaths(paths),
		reportSha256: sha256(input.report),
		commandsSha256: sha256(input.commands.join("\n")),
		createdAt: new Date().toISOString(),
	};
	const target = join(identity.gitDir, "ein", "candidate-receipt.json");
	mkdirSync(dirname(target), { recursive: true });
	const temporary = `${target}.${process.pid}.tmp`;
	try {
		writeFileSync(temporary, serializeReceipt(receipt));
		// Atómico dentro del mismo sistema de ficheros: el temporal se crea en el
		// MISMO directorio que el destino, así que el rename no cruza dispositivo.
		renameSync(temporary, target);
	} catch {
		rmSync(temporary, { force: true });
		return { ok: false, reason: "no se pudo publicar el recibo" };
	}
	return { ok: true, receipt, path: target };
}

export function readCandidateReceipt(cwd: string): CandidateReceipt | null {
	const path = receiptPath(cwd);
	if (!path || !existsSync(path)) return null;
	try {
		return parseReceipt(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

// Validación FAIL-CLOSED. Cada motivo de rechazo se nombra: un "no válido" a
// secas obliga a adivinar, y adivinar sobre evidencia es justo lo que este
// recibo existe para evitar.
export function validateCandidateReceipt(cwd: string, change: string): ReceiptVerdict {
	const identity = resolveWorktreeIdentity(cwd);
	if (!identity) return { ok: false, reason: "no es un repositorio git" };
	const path = receiptPath(cwd);
	if (!path || !existsSync(path)) return { ok: false, reason: "no hay recibo de candidato verificado" };
	let receipt: CandidateReceipt | null;
	try {
		receipt = parseReceipt(readFileSync(path, "utf8"));
	} catch {
		return { ok: false, reason: "el recibo no se pudo leer" };
	}
	if (!receipt) return { ok: false, reason: "el recibo está corrupto o es de otra versión" };
	if (receipt.repositoryId !== identity.repositoryId) return { ok: false, reason: "el recibo es de OTRO repositorio" };
	if (receipt.worktreeId !== identity.worktreeId) return { ok: false, reason: "el recibo es de OTRO worktree" };
	if (receipt.change !== change) return { ok: false, reason: `el recibo pertenece al cambio '${receipt.change}', no a '${change}'` };
	if (receipt.pathsSha256 !== digestPaths(receipt.paths)) return { ok: false, reason: "el manifiesto de rutas del recibo no cuadra con su digest" };
	return { ok: true, receipt };
}

// ¿El árbol candidato del recibo sigue describiendo el worktree de AHORA? Es la
// pregunta que responde "lo que voy a entregar es lo que se verificó". La
// consume el slice 04; aquí se expone y se prueba.
export function candidateTreeMatches(cwd: string, receipt: CandidateReceipt): boolean {
	const current = buildCandidateTree(cwd, receipt.paths);
	return current !== null && current === receipt.treeSha;
}
