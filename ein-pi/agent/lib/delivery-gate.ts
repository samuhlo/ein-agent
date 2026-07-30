// =============================================================================
// PUERTA DE ENTREGA — cableado determinista del recibo (slice 04)
// =============================================================================
// `delivery-receipt.ts` es el NÚCLEO PURO: decide, dadas unas observaciones.
// Este módulo observa git y aplica esa decisión antes de que el comando corra.
//
// La autoridad se liga en la CREACIÓN DEL COMMIT: el pre-commit exige que el
// árbol del índice sea EXACTAMENTE el candidato verificado, y el post-commit
// prueba que `HEAD^{tree}` sigue siéndolo tras los hooks de git. La garantía
// fuerte aplica al commit exacto creado por esta ruta protegida.
//
// Push y PR NO reconstruyen qué publica el comando: modelar la semántica de
// `git push` —refspecs, `--all`/`--mirror`, comodines, `push.default`— es una
// superficie ilimitada que no converge. La puerta de publicación es un BACKSTOP
// de mejor esfuerzo: comprueba solo HEAD (`git push origin otra-rama`, un push
// de tags, o `gh pr create --head otra-rama` NO se cubren). Es una red contra
// descuidos, no un control estanco de la publicación.
//
// Un control exacto requeriría limitar las formas de publicación y observar el
// objetivo remoto. Esa complejidad queda fuera de esta ruta mientras el riesgo
// no justifique ampliarla.
//
// CUÁNDO APLICA (para no crear un callejón):
//   - sin recibo                      → nada que afirmar, pasa
//   - recibo que NO toca lo entregado → el recibo no habla de esto, pasa
//   - recibo que SÍ lo toca           → manda el recibo
//
// ALCANCE HONESTO: evita ACCIDENTES, no a alguien decidido. Cubre git —directo o
// vía `bash -c`— y no es un límite de seguridad. Borrar el recibo lo desactiva,
// y eso es deliberado: la salida existe y es explícita.
// =============================================================================

import { execFileSync } from "node:child_process";
import {
	buildCandidateTree,
	readCandidateReceipt,
	type CandidateReceipt,
} from "./candidate-receipt.ts";
import {
	validatePostCommitReceiptGate,
	validatePreCommitReceiptGate,
	validatePrePrReceiptGate,
	validatePrePushReceiptGate,
	type VerifiedDeliveryAttempt,
} from "./delivery-receipt.ts";
import { gitSubcommandArgs, invokesBinarySubcommand, invokesGitSubcommand } from "./git-staging.ts";

export type GateVerdict = { kind: "pass" } | { kind: "blocked"; reason: string };

export type DeliveryAttemptState = VerifiedDeliveryAttempt | undefined;

// `LC_ALL=C` por lo mismo que en git-staging y pi-contract: un parser que
// dependa del idioma de git falla en silencio.
function git(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" },
		}).trim();
	} catch {
		return null;
	}
}

export type DeliveryBoundary = "pre-commit" | "pre-push" | "pre-pr";

// Qué frontera cruza este comando. Reutiliza el tokenizador consciente de
// comillas y de `bash -c` de git-staging: un segundo parser propio reabriría el
// agujero de wrappers que ya se cerró allí.
export function deliveryBoundariesFor(command: string): DeliveryBoundary[] {
	const boundaries: DeliveryBoundary[] = [];
	if (invokesGitSubcommand(command, "commit")) boundaries.push("pre-commit");
	if (invokesGitSubcommand(command, "push")) boundaries.push("pre-push");
	if (invokesGhPrMutation(command)) boundaries.push("pre-pr");
	return boundaries;
}

export function deliveryBoundaryFor(command: string): DeliveryBoundary | null {
	return deliveryBoundariesFor(command)[0] ?? null;
}

// Flags de `git commit` que consumen un valor: su argumento NO es un pathspec.
const COMMIT_VALUE_FLAGS = new Set([
	"-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message",
	"--author", "--date", "--cleanup", "--squash", "--fixup", "-t", "--template", "--trailer",
]);

// Pathspecs de `git commit`. `--only`/`--include` y los posicionales commitean
// contenido del WORKTREE saltándose el índice, así que `git diff --cached` no
// los ve: sin esto, `git commit --only fichero-verificado.ts` colaría una
// versión divergente con el índice vacío.
export function commitPathspecs(command: string): string[] {
	const args = gitSubcommandArgs(command, "commit");
	if (!args) return [];
	const specs: string[] = [];
	let literal = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]!;
		if (literal) {
			if (arg) specs.push(arg);
			continue;
		}
		if (arg === "--") {
			literal = true;
			continue;
		}
		if (COMMIT_VALUE_FLAGS.has(arg)) {
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) continue;
		if (arg) specs.push(arg);
	}
	return specs;
}

// `gh pr create` y `gh pr edit` mutan lo publicado; `gh pr view/list` no.
export function invokesGhPrMutation(command: string): boolean {
	if (!invokesBinarySubcommand(command, "gh", "pr")) return false;
	return /\bpr\s+(create|edit)\b/.test(command);
}

// Ficheros con cambios preparados en el índice REAL.
function stagedPaths(cwd: string): string[] {
	return (git(cwd, ["diff", "--cached", "--name-only"]) ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

// ¿El commit toca ficheros que el recibo cubre? Es el interruptor que evita el
// callejón: sin solape, el recibo no opina y el trabajo mecánico sigue.
export function receiptCoversStaged(receipt: CandidateReceipt, staged: readonly string[]): boolean {
	const manifest = new Set(receipt.paths);
	return staged.some((path) => manifest.has(path));
}

// Un pathspec NO es una ruta: `lib` cubre un directorio y `lib/*.ts` es un
// patrón. Compararlos como cadenas literales dejaba pasar esas formas sobre
// ficheros del manifiesto.
export function pathspecCoversPath(spec: string, path: string): boolean {
	const clean = spec.replace(/^\.\//, "").replace(/\/+$/, "");
	if (!clean) return true; // pathspec vacío = todo el árbol
	if (clean === path) return true;
	if (path.startsWith(`${clean}/`)) return true; // prefijo de directorio
	if (!/[*?[]/.test(clean)) return false;
	try {
		return globToRegExp(clean).test(path);
	} catch {
		// Un patrón que no sabemos evaluar se trata como que cubre: ante la duda,
		// que decida el gate y no que se cuele.
		return true;
	}
}

// Glob → regex EN UNA PASADA. Una versión con `replace` encadenados usó un
// centinela que acabó siendo un byte NUL en el fuente: git trató este TypeScript
// como binario. Recorrerlo carácter a carácter no necesita centinela.
export function globToRegExp(glob: string): RegExp {
	let pattern = "";
	for (let index = 0; index < glob.length; index += 1) {
		const char = glob[index]!;
		if (char === "*") {
			if (glob[index + 1] === "*") {
				pattern += ".*"; // `**` cruza separadores
				index += 1;
			} else {
				pattern += "[^/]*"; // `*` no
			}
			continue;
		}
		if (char === "?") {
			pattern += "[^/]";
			continue;
		}
		pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${pattern}$`);
}

export function receiptCoversPathspecs(receipt: CandidateReceipt, specs: readonly string[]): boolean {
	return specs.some((spec) => receipt.paths.some((path) => pathspecCoversPath(spec, path)));
}

export type GateOutcome = { verdict: GateVerdict; attempt: DeliveryAttemptState };

// PRE-COMMIT: donde la divergencia entra en la historia — la puerta que importa.
// Exige base, árbol candidato y árbol REAL del índice.
export function evaluatePreCommit(cwd: string, attempt: DeliveryAttemptState, command = ""): GateOutcome {
	const receipt = readCandidateReceipt(cwd);
	if (!receipt) return { verdict: { kind: "pass" }, attempt };
	const pathspecs = commitPathspecs(command);
	const covered = receiptCoversStaged(receipt, stagedPaths(cwd)) || receiptCoversPathspecs(receipt, pathspecs);
	if (!covered) return { verdict: { kind: "pass" }, attempt };
	// Un commit con pathspecs sobre ficheros del recibo commitea el worktree
	// saltándose el índice, así que el árbol comprobado no sería el commiteado.
	// En vez de adivinar, se exige el camino observable: `git add` y luego commit.
	if (pathspecs.length > 0) {
		return {
			verdict: {
				kind: "blocked",
				reason: `Ein delivery gate (pre-commit): \`git commit\` con rutas (--only/--include o pathspec) sobre ficheros del candidato verificado de '${receipt.change}' commitea contenido del worktree saltándose el índice, así que la puerta no puede comprobar lo que realmente entra. Haz \`git add <rutas>\` y luego \`git commit\` sin rutas.`,
			},
			attempt,
		};
	}

	const result = validatePreCommitReceiptGate(cwd, receipt.change, {
		baseHead: () => git(cwd, ["rev-parse", "HEAD"]),
		// `write-tree` materializa el árbol del índice real: es una lectura, crea
		// un objeto, no toca el índice ni el worktree.
		indexTree: () => git(cwd, ["write-tree"]),
		candidateTree: () => buildCandidateTree(cwd, receipt.paths),
	});
	if (!result.decision.ok) {
		return {
			verdict: {
				kind: "blocked",
				reason: `Ein delivery gate (pre-commit): ${result.decision.reason}. Este commit toca ficheros del candidato verificado de '${receipt.change}', así que debe entregar EXACTAMENTE lo verificado. Si el contenido cambió a propósito, vuelve a sdd-verify y emite un recibo nuevo; si esta entrega no es ese candidato, no mezcles sus ficheros con ella.`,
			},
			attempt,
		};
	}
	return { verdict: { kind: "pass" }, attempt: result.attempt };
}

// POST-COMMIT: corre tras el comando, cuando los hooks de git ya pudieron
// reescribir el árbol. Solo aplica si el pre-commit validó algo. Captura el
// SHA del commit validado para que el backstop de publicación pueda revalidarlo.
export function evaluatePostCommit(cwd: string, attempt: DeliveryAttemptState): GateOutcome {
	if (!attempt?.receiptFingerprint) return { verdict: { kind: "pass" }, attempt };
	const receipt = readCandidateReceipt(cwd);
	if (!receipt) return { verdict: { kind: "pass" }, attempt: undefined };
	const result = validatePostCommitReceiptGate(cwd, receipt.change, attempt, {
		head: () => git(cwd, ["rev-parse", "HEAD"]),
		headTree: () => git(cwd, ["rev-parse", "HEAD^{tree}"]),
	});
	if (!result.decision.ok) {
		return {
			verdict: {
				kind: "blocked",
				reason: `Ein delivery gate (post-commit): ${result.decision.reason}. Un hook de git reescribió el árbol tras validarlo: lo commiteado ya no es el candidato verificado de '${receipt.change}'. Vuelve a sdd-verify, reemite el recibo y reinicia la entrega.`,
			},
			attempt: undefined,
		};
	}
	return { verdict: { kind: "pass" }, attempt: result.attempt };
}

// Entrada de árbol: MODO + OID. `rev-parse TREE:ruta` deja el modo fuera, así
// que un 100644 → 100755 conservaba el objeto y pasaba por idéntico. Distingue
// presente, DEMOSTRABLEMENTE ausente (git respondió vacío) y NO OBSERVABLE (git
// falló): antes ambos fallos daban `null`, y `null !== null` es falso, así que
// dos errores de lectura se leían como igualdad — fail-closed aprobando por no
// saber.
type TreeEntry = { observed: true; value: string } | { observed: false };

function treeEntry(cwd: string, tree: string, path: string): TreeEntry {
	const out = git(cwd, ["ls-tree", "--full-tree", tree, "--", path]);
	if (out === null) return { observed: false };
	const match = out.match(/^(\d{6}) \w+ ([0-9a-f]+)\t/);
	return { observed: true, value: match ? `${match[1]} ${match[2]}` : "(ausente)" };
}

export type ManifestDivergence = { path: string; reason: "divergente" | "no observable" };

// Rutas del manifiesto cuyo contenido en HEAD difiere del recibo. Blob a blob,
// no árbol contra árbol: HEAD lleva legítimamente mucho más que el candidato, y
// comparar árboles enteros bloquearía cualquier rama viva.
export function manifestDivergencesInHead(cwd: string, receipt: CandidateReceipt): ManifestDivergence[] {
	const out: ManifestDivergence[] = [];
	for (const path of receipt.paths) {
		const inHead = treeEntry(cwd, "HEAD", path);
		const inReceipt = treeEntry(cwd, receipt.treeSha, path);
		if (!inHead.observed || !inReceipt.observed) {
			out.push({ path, reason: "no observable" });
			continue;
		}
		if (inHead.value !== inReceipt.value) out.push({ path, reason: "divergente" });
	}
	return out;
}

export function manifestPathsDivergingInHead(cwd: string, receipt: CandidateReceipt): string[] {
	return manifestDivergencesInHead(cwd, receipt).map((entry) => entry.path);
}

// PRE-PUSH y PRE-PR: revalidan el vínculo del recibo contra el OBJETIVO VIVO
// (HEAD, resuelto por git — una referencia). No se parsea el comando: qué
// publica cada forma de `git push`/`gh pr` es una superficie ilimitada, y la
// garantía ya vive en el commit.
//
//   - con intento en curso → HEAD debe seguir siendo el head validado; si la
//     rama se movió tras validarla, se publicaría otra cosa;
//   - sin intento (sesión nueva) → los ficheros del manifiesto en HEAD deben
//     llevar el contenido verificado.
export function evaluatePublish(cwd: string, boundary: "pre-push" | "pre-pr", attempt: DeliveryAttemptState): GateOutcome {
	const receipt = readCandidateReceipt(cwd);
	if (!receipt) return { verdict: { kind: "pass" }, attempt };

	if (attempt?.validatedDeliveryHead) {
		const head = git(cwd, ["rev-parse", "HEAD"]);
		const tree = head ? git(cwd, ["rev-parse", "HEAD^{tree}"]) : null;
		const result = boundary === "pre-push"
			? validatePrePushReceiptGate(cwd, receipt.change, attempt, {
					selectedPushHead: () => head,
					selectedPushTree: () => tree,
				})
			: validatePrePrReceiptGate(cwd, receipt.change, attempt, {
					localHead: () => head,
					effectiveRemoteHead: () => head,
					existingPrHead: () => head,
				});
		if (!result.decision.ok) {
			return {
				verdict: {
					kind: "blocked",
					reason: `Ein delivery gate (${boundary}): ${result.decision.reason}. HEAD ya no es el head de entrega validado, así que publicarías algo distinto de lo verificado. Vuelve a sdd-verify, reemite el recibo y reinicia la entrega.`,
				},
				attempt,
			};
		}
		return { verdict: { kind: "pass" }, attempt };
	}

	// Sin intento: el recibo liga un árbol; HEAD debe llevarlo.
	const divergences = manifestDivergencesInHead(cwd, receipt);
	if (divergences.length === 0) return { verdict: { kind: "pass" }, attempt };
	const list = divergences.slice(0, 6).map((entry) => `${entry.path} (${entry.reason})`).join(", ");
	const more = divergences.length > 6 ? ` (+${divergences.length - 6})` : "";
	return {
		verdict: {
			kind: "blocked",
			reason: `Ein delivery gate (${boundary}): en HEAD, ficheros del candidato verificado de '${receipt.change}' NO tienen el contenido que se verificó: ${list}${more}. Publicarlos sería publicar algo distinto de lo verificado. Vuelve a sdd-verify y emite un recibo nuevo; si ese candidato ya no va a entregarse, retira su recibo.`,
		},
		attempt,
	};
}

// Punto de entrada del hook.
export function evaluateDeliveryGate(cwd: string, command: string, attempt: DeliveryAttemptState): GateOutcome {
	const boundaries = deliveryBoundariesFor(command);
	if (boundaries.length === 0) return { verdict: { kind: "pass" }, attempt };
	let state = attempt;
	// COMPUESTO: `git commit && git push` corre en el MISMO proceso bash, así que
	// `tool_result` llega con ambos ya ejecutados y la puerta post-commit —la que
	// detecta un hook que reescribe el árbol— no puede interponerse. Si el recibo
	// engancha, se exige separarlos; no es un callejón, es un comando de más.
	if (boundaries.includes("pre-commit") && boundaries.length > 1) {
		const pre = evaluatePreCommit(cwd, attempt, command);
		if (pre.verdict.kind === "blocked") return pre;
		const engaged = Boolean(pre.attempt?.receiptFingerprint) && pre.attempt !== attempt;
		if (engaged) {
			return {
				verdict: {
					kind: "blocked",
					reason: "Ein delivery gate: este comando commitea y publica a la vez, así que la comprobación post-commit no puede correr entre ambos y un hook de git podría publicar un árbol distinto del verificado. Ejecútalos en comandos separados.",
				},
				attempt,
			};
		}
	}
	if (boundaries.includes("pre-commit")) {
		const pre = evaluatePreCommit(cwd, state, command);
		if (pre.verdict.kind === "blocked") return pre;
		state = pre.attempt;
	}
	const publish = boundaries.find((boundary) => boundary !== "pre-commit") as "pre-push" | "pre-pr" | undefined;
	if (!publish) return { verdict: { kind: "pass" }, attempt: state };
	return evaluatePublish(cwd, publish, state);
}
