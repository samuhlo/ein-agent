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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isSafeChangeName, resolveChangesDir, resolveSddStatus } from "./sdd-router.ts";

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

export type FreshReceiptVerdict =
	| { ok: true; receipt: CandidateReceipt; fingerprint: string }
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

// SUGERENCIA, no manifiesto. Devuelve lo que el árbol tiene tocado ahora mismo
// para que quien emita el recibo pueda revisarlo y enumerarlo. NO se usa para
// emitir: en una sesión con varios agentes, "todo lo trackeado modificado"
// incluye el trabajo en curso de otro, y meterlo en un candidato "verificado"
// sería exactamente el accidente que este slice existe para evitar. Las rutas
// del recibo se DECLARAN.
type TrackedChanges = {
	paths: string[];
	removed: Set<string>;
};

function gitNul(cwd: string, args: string[]): string[] | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" },
		}).split("\0").filter(Boolean);
	} catch {
		return null;
	}
}

function trackedChanges(cwd: string): TrackedChanges {
	const entries = gitNul(cwd, ["diff", "--name-status", "-z", "--find-renames", "HEAD"]) ?? [];
	const paths: string[] = [];
	const removed = new Set<string>();
	for (let index = 0; index < entries.length;) {
		const status = entries[index++];
		if (status === undefined) break;
		if (status.startsWith("R") || status.startsWith("C")) {
			const oldPath = entries[index++];
			const newPath = entries[index++];
			if (oldPath === undefined || newPath === undefined) break;
			paths.push(oldPath, newPath);
			if (status.startsWith("R")) removed.add(oldPath);
			continue;
		}
		const path = entries[index++];
		if (path === undefined) break;
		paths.push(path);
		if (status.startsWith("D")) removed.add(path);
	}
	return { paths, removed };
}

export function suggestIntendedPaths(cwd: string): { tracked: string[]; untracked: string[] } {
	const tracked = trackedChanges(cwd).paths.sort();
	const untracked = (gitNul(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]) ?? []).sort();
	return { tracked, untracked };
}

// Una ruta del manifiesto es un FICHERO CONCRETO. Ni directorios ni pathspecs
// mágicos: `tests/` o `:(glob)**/*.ts` meten en el candidato ficheros que nadie
// enumeró, que es justo lo contrario de identificar bytes exactos.
export function validateIntendedPaths(cwd: string, paths: readonly string[]): string[] {
	const problems: string[] = [];
	if (paths.length === 0) return ["el manifiesto de rutas está vacío"];
	const changes = trackedChanges(cwd);
	const { untracked } = suggestIntendedPaths(cwd);
	const known = new Set([...changes.paths, ...untracked]);
	const seen = new Set<string>();
	for (const path of paths) {
		if (typeof path !== "string" || !path.trim()) {
			problems.push("hay una ruta vacía");
			continue;
		}
		if (seen.has(path)) {
			problems.push(`${path}: duplicada`);
			continue;
		}
		seen.add(path);
		if (path.startsWith(":")) {
			problems.push(`${path}: los pathspecs mágicos de git no valen; enumera ficheros`);
			continue;
		}
		if (isAbsolute(path) || path.split(/[\\/]+/).includes("..")) {
			problems.push(`${path}: debe ser una ruta relativa dentro del worktree, sin '..'`);
			continue;
		}
		if (path.endsWith("/")) {
			problems.push(`${path}: es un directorio; enumera los ficheros que entran`);
			continue;
		}
		const full = join(cwd, path);
		if (!existsSync(full) && !changes.removed.has(path)) {
			problems.push(`${path}: no existe en el worktree`);
			continue;
		}
		if (existsSync(full) && statSync(full).isDirectory()) {
			problems.push(`${path}: es un directorio; enumera los ficheros que entran`);
			continue;
		}
		// Debe ser parte real del cambio: o un trackeado que has modificado, o un
		// untracked. Un trackeado SIN cambios no aporta nada al candidato (ya está
		// en HEAD) y declararlo suele delatar un manifiesto copiado a ojo.
		if (!known.has(path)) {
			problems.push(`${path}: no está modificado ni sin trackear; no forma parte de este cambio`);
		}
	}
	return problems;
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
			const removedPaths = trackedChanges(cwd).removed;
			const removed = paths.filter((path) => removedPaths.has(path));
			if (removed.length > 0 && git(cwd, ["update-index", "--remove", "--", ...removed], env) === null) return null;
			const present = paths.filter((path) => !removedPaths.has(path));
			// `--` separa rutas de opciones: un fichero llamado `-x` no se lee como flag.
			if (present.length > 0 && git(cwd, ["add", "--", ...present], env) === null) return null;
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
	// Manifiesto EXPLÍCITO de ficheros que forman el candidato. Sin defecto a
	// propósito: inferirlo de "todo lo modificado" arrastra trabajo ajeno.
	paths: readonly string[];
	// Comandos/evidencia de verificación, tal y como se ejecutaron.
	commands: readonly string[];
};

export type EmitResult =
	| { ok: true; receipt: CandidateReceipt; path: string }
	| { ok: false; reason: string };

type ReceiptChangeLocation = {
	path: string;
	archived: boolean;
};

// La entrega ocurre después de close, cuando el cambio ya vive bajo archive/.
// FAIL CLOSED -> dos copias no permiten elegir evidencia arbitrariamente.
function resolveReceiptChangeLocation(cwd: string, change: string): ReceiptChangeLocation | null | "ambiguous" {
	const changes = resolveChangesDir(cwd);
	const locations = [
		{ path: join(changes, change), archived: false },
		{ path: join(changes, "archive", change), archived: true },
	].filter((location) => existsSync(location.path));
	if (locations.length === 0) return null;
	if (locations.length !== 1) return "ambiguous";
	return locations[0]!;
}

function receiptChangeBlocker(cwd: string, change: string): { location: ReceiptChangeLocation } | { reason: string } {
	if (!isSafeChangeName(change)) return { reason: `nombre de cambio inválido: ${JSON.stringify(change)}` };
	const location = resolveReceiptChangeLocation(cwd, change);
	if (location === null) return { reason: `el cambio '${change}' no existe` };
	if (location === "ambiguous") return { reason: `el cambio '${change}' existe tanto activo como archivado; la evidencia es ambigua` };
	return { location };
}

function verifyReportPath(location: ReceiptChangeLocation): string {
	return join(location.path, "verify-report.md");
}

// Precondición de EMISIÓN. Un recibo se llama "de candidato VERIFICADO": si se
// emite sobre un verify que falló, que está obsoleto o sobre un apply a medias,
// la palabra "verificado" deja de significar nada. Antes solo se comprobaba que
// el fichero del informe existiera, así que un `status: fail` producía un recibo
// perfectamente válido.
//
// NO se gatean las tareas pendientes: el estado autoritativo de que la
// implementación terminó lo escribe el ejecutor en `apply-progress.md`, y el
// recuento de tareas ya lo gobierna la guarda de cierre. Duplicarlo aquí
// añadiría un bloqueo más ante un `tasks.md` desactualizado sin ganar garantía.
export function assessReceiptPrecondition(cwd: string, change: string): string | null {
	const resolved = receiptChangeBlocker(cwd, change);
	if ("reason" in resolved) return resolved.reason;
	const { location } = resolved;
	if (!location.archived) {
		const status = resolveSddStatus(cwd, change);
		if (status.verify === "absent") return "no hay verify-report.md: no hay verificación que respaldar";
		if (status.verify !== "pass") return `verify no está en pass (está '${status.verify}'): un candidato no se llama verificado sin una verificación que pase`;
		if (status.verifyStale) return "el verify es OBSOLETO: hubo un apply posterior, así que el informe no describe el árbol actual";
		if (status.apply !== "complete") return `apply no está completo (está '${status.apply}'): lo verificado es trabajo a medias`;
		return null;
	}

	let apply: string;
	let verify: string;
	try {
		apply = readFileSync(join(location.path, "apply-progress.md"), "utf8");
		verify = readFileSync(verifyReportPath(location), "utf8");
		readFileSync(join(location.path, "summary.md"), "utf8");
	} catch {
		return "un cambio archivado requiere apply-progress.md, verify-report.md y summary.md actuales";
	}
	if (!/\bstatus\s*[:=]\s*complete\b/i.test(apply)) return "apply no está completo: lo verificado es trabajo a medias";
	if (!/\b(?:status|result|resultado)\s*[:=]\s*(pass|passed|ok|pasa)\b/i.test(verify)) return "verify no está en pass: un candidato no se llama verificado sin una verificación que pase";
	const applyMtime = statSync(join(location.path, "apply-progress.md")).mtimeMs;
	const verifyMtime = statSync(verifyReportPath(location)).mtimeMs;
	const summaryMtime = statSync(join(location.path, "summary.md")).mtimeMs;
	if (applyMtime > verifyMtime) return "el verify es OBSOLETO: hubo un apply posterior, así que el informe no describe el árbol actual";
	if (applyMtime > summaryMtime || verifyMtime > summaryMtime) return "el summary archivado es OBSOLETO: no describe la evidencia actual";
	return null;
}

// Emite el recibo. Publicación atómica: se escribe un temporal en el MISMO
// directorio y se renombra, para que una cancelación a mitad no deje un recibo
// parcial que luego se lea como evidencia.
export function emitCandidateReceipt(cwd: string, input: EmitInput): EmitResult {
	const identity = resolveWorktreeIdentity(cwd);
	if (!identity) return { ok: false, reason: "no es un repositorio git" };
	if (!identity.head) return { ok: false, reason: "el repositorio no tiene HEAD (sin commits)" };
	const blocker = assessReceiptPrecondition(cwd, input.change);
	if (blocker) return { ok: false, reason: blocker };
	const problems = validateIntendedPaths(cwd, input.paths);
	if (problems.length > 0) {
		return { ok: false, reason: `manifiesto de rutas inválido: ${problems.join("; ")}` };
	}
	// El informe se lee del disco, no lo aporta quien llama: el recibo debe
	// respaldar el verify REAL del cambio, no un texto que le pasen.
	let report: string;
	try {
		const resolved = receiptChangeBlocker(cwd, input.change);
		if ("reason" in resolved) return { ok: false, reason: resolved.reason };
		report = readFileSync(verifyReportPath(resolved.location), "utf8");
	} catch {
		return { ok: false, reason: "no se pudo leer verify-report.md" };
	}
	const paths = [...input.paths].sort();
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
		reportSha256: sha256(report),
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
export function receiptFingerprint(receipt: CandidateReceipt): string {
	return sha256(serializeReceipt(receipt));
}

// Relee y valida la evidencia en cada límite. Un fingerprint previo liga todas
// las comprobaciones de un intento a un único recibo, sin volver a publicarlo.
export function validateFreshCandidateReceipt(
	cwd: string,
	change: string,
	expectedFingerprint?: string,
): FreshReceiptVerdict {
	const verdict = validateCandidateReceipt(cwd, change);
	if (!verdict.ok) return verdict;
	const fingerprint = receiptFingerprint(verdict.receipt);
	if (expectedFingerprint && fingerprint !== expectedFingerprint) {
		return { ok: false, reason: "el recibo fue reemplazado durante este intento de entrega" };
	}
	return { ok: true, receipt: verdict.receipt, fingerprint };
}

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
	// El informe VIGENTE debe ser el mismo que respaldó el recibo. Guardar
	// `reportSha256` y no compararlo nunca convertía el campo en decoración: un
	// verify posterior (o un apply + verify B) dejaba el recibo viejo validando
	// como si nada. Es exactamente el fallo que se corrigió en el recibo
	// OpenSpec —serializar la identidad y no mirarla— repetido aquí.
	const resolved = receiptChangeBlocker(cwd, change);
	if ("reason" in resolved) return { ok: false, reason: resolved.reason };
	let current: string;
	try {
		current = readFileSync(verifyReportPath(resolved.location), "utf8");
	} catch {
		return { ok: false, reason: "el verify-report.md que respaldaba el recibo ya no existe" };
	}
	if (sha256(current) !== receipt.reportSha256) {
		return { ok: false, reason: "el recibo respalda un verify-report.md que ya NO es el vigente: vuelve a verificar y reemítelo" };
	}
	// Y el estado del cambio tiene que seguir siendo verificable: un apply
	// posterior invalida la evidencia aunque el informe no se haya tocado.
	const blocker = assessReceiptPrecondition(cwd, change);
	if (blocker) return { ok: false, reason: `el cambio ya no está en estado verificado: ${blocker}` };
	return { ok: true, receipt };
}

// ¿El árbol candidato del recibo sigue describiendo el worktree de AHORA? Es la
// pregunta que responde "lo que voy a entregar es lo que se verificó". La
// consume el slice 04; aquí se expone y se prueba.
export function candidateTreeMatches(cwd: string, receipt: CandidateReceipt): boolean {
	const current = buildCandidateTree(cwd, receipt.paths);
	return current !== null && current === receipt.treeSha;
}
