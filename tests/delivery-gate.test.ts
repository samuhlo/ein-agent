// =============================================================================
// TESTS: lib/delivery-gate — el cableado que faltaba en el slice 04
// =============================================================================
// BLINDAJE -> El núcleo puro (`delivery-receipt.ts`) decidía bien, pero NADIE lo
// llamaba: solo lo importaba un test. Las cuatro puertas eran cuatro frases en
// el prompt de `ein-git` pidiéndole ejecutarlas a mano, con una librería que no
// puede alcanzar. Una entrega divergente pasaba igual que antes del slice.
//
// Los dos ejes que se prueban aquí:
//   1. que BLOQUEE la divergencia real (commit distinto de lo verificado);
//   2. que NO cree un callejón — el trabajo ajeno al recibo debe pasar. Un gate
//      que bloquea todo commit sin recibo mataría el carril mecánico, y esa es
//      la forma de fallo que más veces nos ha mordido en esta sesión.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	commitPathspecs,
	deliveryBoundariesFor,
	deliveryBoundaryFor,
	evaluateDeliveryGate,
	evaluatePostCommit,
	evaluatePreCommit,
	evaluatePublish,
	manifestDivergencesInHead,
	manifestPathsDivergingInHead,
	pathspecCoversPath,
	invokesGhPrMutation,
	receiptCoversStaged,
} = await import("../ein-pi/agent/lib/delivery-gate");
const {
	emitCandidateReceipt,
	readActiveCandidateReceiptEvidence,
	readCandidateReceipt,
	receiptPath,
	retiredCandidateReceiptPath,
	retireCandidateReceipt,
} = await import("../ein-pi/agent/lib/candidate-receipt");
const { evaluateCandidateReceiptRetirement } = await import("../ein-pi/agent/lib/delivery-receipt");
const { messageRequestsDelivery } = await import("../ein-pi/agent/lib/git-delivery");

const git = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
const gitOut = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
// Rama real del fixture: empujar una inventada haría que el push fallara solo y
// el test no probaría la puerta, sino la inexistencia de la referencia.
const rama = (dir: string) => gitOut(dir, "rev-parse", "--abbrev-ref", "HEAD");

// Repo con un cambio SDD verificado y un recibo emitido sobre `a.ts`.
function repoConRecibo(): string {
	const dir = mkdtempSync(join(tmpdir(), "ein-gate-"));
	git(dir, "init", "-q");
	git(dir, "config", "user.email", "t@t");
	git(dir, "config", "user.name", "t");
	writeFileSync(join(dir, "a.ts"), "v1\n");
	writeFileSync(join(dir, "otro.ts"), "v1\n");
	git(dir, "add", "a.ts", "otro.ts");
	git(dir, "commit", "-qm", "init");

	const base = join(dir, "openspec", "changes", "mi-cambio");
	mkdirSync(base, { recursive: true });
	writeFileSync(join(base, "scope.md"), "# Scope\n\nscope: x\nbudget_allocated: 1000\n");
	writeFileSync(join(base, "map.md"), "# Map\n\nledger: x\nbudget_consumed: 1\nscope_status: ok\n");
	writeFileSync(join(base, "design.md"), "# Design\n");
	writeFileSync(join(base, "tasks.md"), "# Tasks\n\n- [x] 1.1 hecho\n");
	writeFileSync(join(base, "apply-progress.md"), "# Apply\n\nstatus: complete\n");
	writeFileSync(join(base, "verify-report.md"), "# Verify\n\nstatus: pass\nbehavior_coverage: verified\n");

	writeFileSync(join(dir, "a.ts"), "verificado\n");
	const emitted = emitCandidateReceipt(dir, { change: "mi-cambio", paths: ["a.ts"], commands: ["bun test"] });
	if (!emitted.ok) throw new Error(`no se pudo emitir el recibo: ${emitted.reason}`);
	return dir;
}

describe("clasificación de fronteras", () => {
	test("reconoce las tres fronteras", () => {
		expect(deliveryBoundaryFor("git commit -m 'x'")).toBe("pre-commit");
		expect(deliveryBoundaryFor("git push origin main")).toBe("pre-push");
		expect(deliveryBoundaryFor("gh pr create --fill")).toBe("pre-pr");
	});

	test("los comandos de lectura no son una frontera", () => {
		for (const command of ["git status", "git diff --stat", "gh pr view 1", "gh pr list", "bun test"]) {
			expect(deliveryBoundaryFor(command)).toBeNull();
		}
	});

	test("un wrapper de shell no esconde la frontera", () => {
		// Mismo agujero que se cerró en git-staging: `bash -c` es lo normal.
		expect(deliveryBoundaryFor(`bash -lc 'git commit -m x'`)).toBe("pre-commit");
		expect(deliveryBoundaryFor(`sh -c "git push origin main"`)).toBe("pre-push");
	});

	test("solo las mutaciones de PR cuentan", () => {
		expect(invokesGhPrMutation("gh pr create --fill")).toBe(true);
		expect(invokesGhPrMutation("gh pr edit 3 --body x")).toBe(true);
		expect(invokesGhPrMutation("gh pr view 3")).toBe(false);
	});
});

// =============================================================================
// LO QUE MÁS IMPORTA: no crear un callejón. Un gate que bloquea trabajo
// legítimo es peor que no existir.
// =============================================================================
describe("no bloquea lo que no le corresponde", () => {
	test("sin recibo, un commit pasa", () => {
		const dir = mkdtempSync(join(tmpdir(), "ein-gate-libre-"));
		git(dir, "init", "-q");
		git(dir, "config", "user.email", "t@t");
		git(dir, "config", "user.name", "t");
		writeFileSync(join(dir, "x.ts"), "v1\n");
		git(dir, "add", "x.ts");
		expect(evaluatePreCommit(dir, undefined).verdict.kind).toBe("pass");
	});

	test("con recibo, un commit de ficheros AJENOS al manifiesto pasa", () => {
		// El carril mecánico sigue vivo: el recibo habla de `a.ts`, no de todo.
		const dir = repoConRecibo();
		writeFileSync(join(dir, "otro.ts"), "trabajo mecánico\n");
		git(dir, "add", "otro.ts");
		expect(evaluatePreCommit(dir, undefined).verdict.kind).toBe("pass");
	});

	test("fuera de un repo git no revienta ni bloquea", () => {
		const fuera = mkdtempSync(join(tmpdir(), "ein-gate-norepo-"));
		expect(evaluateDeliveryGate(fuera, "git commit -m x", undefined).verdict.kind).toBe("pass");
	});

	test("sin recibo, un push sin intento previo pasa", () => {
		const dir = mkdtempSync(join(tmpdir(), "ein-gate-libre-push-"));
		git(dir, "init", "-q");
		git(dir, "config", "user.email", "t@t");
		git(dir, "config", "user.name", "t");
		writeFileSync(join(dir, "x.ts"), "v1\n");
		git(dir, "add", "x.ts");
		git(dir, "commit", "-qm", "init");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});
});

// =============================================================================
// Y lo que SÍ debe bloquear: entregar algo distinto de lo verificado.
// =============================================================================
describe("bloquea la divergencia", () => {
	test("el commit del candidato EXACTO pasa y abre el intento", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const outcome = evaluatePreCommit(dir, undefined);
		expect(outcome.verdict.kind).toBe("pass");
		expect(outcome.attempt?.receiptFingerprint).toBeTruthy();
	});

	test("commitear una versión DISTINTA de un fichero verificado se bloquea", () => {
		const dir = repoConRecibo();
		// Alguien retoca el fichero después de verificarlo.
		writeFileSync(join(dir, "a.ts"), "cambiado despues de verificar\n");
		git(dir, "add", "a.ts");
		const outcome = evaluatePreCommit(dir, undefined);
		expect(outcome.verdict.kind).toBe("blocked");
		if (outcome.verdict.kind === "blocked") {
			expect(outcome.verdict.reason).toContain("pre-commit");
			// El mensaje debe decir cómo salir: reverificar y reemitir.
			expect(outcome.verdict.reason).toContain("sdd-verify");
		}
	});

	test("mezclar el candidato con un fichero de más se bloquea", () => {
		// El índice debe ser el candidato, no el candidato "y además esto".
		const dir = repoConRecibo();
		writeFileSync(join(dir, "otro.ts"), "colado\n");
		git(dir, "add", "a.ts", "otro.ts");
		expect(evaluatePreCommit(dir, undefined).verdict.kind).toBe("blocked");
	});

	test("post-commit: un hook que reescribe el árbol se detecta", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		expect(pre.verdict.kind).toBe("pass");
		// El commit lo hace un "hook" que además mete otro fichero.
		writeFileSync(join(dir, "otro.ts"), "metido por un hook\n");
		git(dir, "add", "otro.ts");
		git(dir, "commit", "-qm", "commit con hook travieso");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(post.verdict.kind).toBe("blocked");
		if (post.verdict.kind === "blocked") expect(post.verdict.reason).toContain("post-commit");
	});

	test("post-commit limpio captura el head de entrega validado", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		git(dir, "commit", "-qm", "entrega");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(post.verdict.kind).toBe("pass");
		expect(post.attempt?.validatedDeliveryHead).toBe(gitOut(dir, "rev-parse", "HEAD"));
	});

	test("si la rama se mueve entre el commit y el push, el push se bloquea", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		git(dir, "commit", "-qm", "entrega");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(post.verdict.kind).toBe("pass");
		// Llega otro commit encima: publicar ya no sería publicar lo verificado.
		writeFileSync(join(dir, "otro.ts"), "posterior\n");
		git(dir, "add", "otro.ts");
		git(dir, "commit", "-qm", "commit posterior");
		const push = evaluatePublish(dir, "pre-push", post.attempt);
		expect(push.verdict.kind).toBe("blocked");
		if (push.verdict.kind === "blocked") expect(push.verdict.reason).toContain("pre-push");
	});

	test("el push del head validado pasa", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		git(dir, "commit", "-qm", "entrega");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(evaluatePublish(dir, "pre-push", post.attempt).verdict.kind).toBe("pass");
	});
});

describe("receiptCoversStaged", () => {
	const receipt = { paths: ["a.ts", "b.ts"] } as never;
	test("hay solape", () => expect(receiptCoversStaged(receipt, ["b.ts", "z.ts"])).toBe(true));
	test("no hay solape", () => expect(receiptCoversStaged(receipt, ["z.ts"])).toBe(false));
	test("nada staged", () => expect(receiptCoversStaged(receipt, [])).toBe(false));
});

// =============================================================================
// BYPASSES. Seis casos adversariales concretos, todos reproducidos antes de
// arreglarlos. Son la diferencia entre una puerta y un cartel de puerta.
// =============================================================================
describe("bypasses cerrados", () => {
	test("un comando compuesto ve TODAS sus fronteras, no solo la primera", () => {
		// `deliveryBoundaryFor` devolvía la primera y se quedaba tan ancho: el push
		// salía en el mismo proceso bash, antes de que `tool_result` comprobara nada.
		expect(deliveryBoundariesFor("git commit -m x && git push origin main")).toEqual(["pre-commit", "pre-push"]);
		expect(deliveryBoundariesFor("git commit -m x && gh pr create --fill")).toEqual(["pre-commit", "pre-pr"]);
	});

	test("`git commit && git push` se bloquea cuando el recibo engancha", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const outcome = evaluateDeliveryGate(dir, "git commit -m x && git push origin main", undefined);
		expect(outcome.verdict.kind).toBe("blocked");
		if (outcome.verdict.kind === "blocked") expect(outcome.verdict.reason).toContain("comandos separados");
	});

	test("`git commit && gh pr create` también", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		expect(evaluateDeliveryGate(dir, "git commit -m x && gh pr create --fill", undefined).verdict.kind).toBe("blocked");
	});

	// El caso "mecánico compuesto" NO se decide solo por lo que se commitea: el
	// push saca la rama entera. Sus dos variantes —HEAD limpio pasa, HEAD
	// divergente bloquea— viven en el describe de la segunda ronda, que es donde
	// se cerró esa distinción.

	for (const forma of ["git commit --only a.ts -m x", "git commit --include a.ts -m x", "git commit -m x -- a.ts"]) {
		test(`pathspec de commit no esquiva el gate: ${forma}`, () => {
			// Estas formas commitean el WORKTREE saltándose el índice, así que
			// `git diff --cached` no las ve: con el índice vacío colaban una versión
			// divergente de un fichero verificado.
			const dir = repoConRecibo();
			writeFileSync(join(dir, "a.ts"), "DIVERGENTE\n");
			const outcome = evaluateDeliveryGate(dir, forma, undefined);
			expect(outcome.verdict.kind).toBe("blocked");
			if (outcome.verdict.kind === "blocked") expect(outcome.verdict.reason).toContain("git add");
		});
	}

	test("un pathspec de commit AJENO al recibo sigue pasando", () => {
		const dir = repoConRecibo();
		expect(evaluateDeliveryGate(dir, "git commit --only otro.ts -m x", undefined).verdict.kind).toBe("pass");
	});

	test("commitPathspecs no confunde el valor de -m con una ruta", () => {
		expect(commitPathspecs("git commit -m 'mensaje largo' a.ts")).toEqual(["a.ts"]);
		expect(commitPathspecs("git commit -m x")).toEqual([]);
		expect(commitPathspecs("git commit --author 'A <a@a>' -m x")).toEqual([]);
	});

	test("SESIÓN NUEVA: publicar contenido divergente se bloquea sin estado previo", () => {
		// Sin intento en memoria, `evaluatePublish` pasaba siempre. Era el estado
		// real del repo: un commit preparado antes, otra sesión, y puerta abierta.
		const dir = repoConRecibo();
		writeFileSync(join(dir, "a.ts"), "DIVERGENTE\n");
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "commit divergente");
		const outcome = evaluatePublish(dir, "pre-push", undefined);
		expect(outcome.verdict.kind).toBe("blocked");
		if (outcome.verdict.kind === "blocked") expect(outcome.verdict.reason).toContain("a.ts");
	});

	test("sesión nueva con HEAD que SÍ lleva lo verificado: pasa", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega verificada");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});

	test("sesión nueva con commits posteriores AJENOS: pasa", () => {
		// Una rama viva lleva mucho más que el candidato; comparar árboles enteros
		// bloquearía cualquier trabajo normal. Se compara blob a blob del manifiesto.
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega verificada");
		writeFileSync(join(dir, "otro.ts"), "posterior y ajeno\n");
		git(dir, "add", "otro.ts");
		git(dir, "commit", "-qm", "trabajo posterior");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});
});

// =============================================================================
// SEGUNDA RONDA DE BYPASSES. Cuatro equivalencias que las primeras correcciones
// dejaron abiertas: cerrar el ejemplo no es cerrar la clase.
// =============================================================================
describe("bypasses equivalentes cerrados", () => {
	test("un compuesto MECÁNICO no publica un HEAD divergente", () => {
		// El push saca la RAMA, no solo el commit. Si HEAD ya llevaba rutas del
		// recibo divergentes, saltarse la puerta de publicación las publicaba: el
		// solape del índice decide la autoridad del COMMIT, no lo que sale fuera.
		const dir = repoConRecibo();
		writeFileSync(join(dir, "a.ts"), "DIVERGENTE\n");
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "divergente");
		writeFileSync(join(dir, "otro.ts"), "mecánico\n");
		git(dir, "add", "otro.ts");
		const outcome = evaluateDeliveryGate(dir, `git commit -m "mecánico" && git push origin ${rama(dir)}`, undefined);
		expect(outcome.verdict.kind).toBe("blocked");
	});

	test("un compuesto mecánico con HEAD limpio sigue pasando", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega verificada");
		writeFileSync(join(dir, "otro.ts"), "mecánico\n");
		git(dir, "add", "otro.ts");
		expect(evaluateDeliveryGate(dir, `git commit -m "mec" && git push origin ${rama(dir)}`, undefined).verdict.kind).toBe("pass");
	});

	test("un pathspec de DIRECTORIO cubre las rutas de dentro", () => {
		// `Set.has("lib")` jamás iba a coincidir con `lib/a.ts`.
		expect(pathspecCoversPath("lib", "lib/a.ts")).toBe(true);
		expect(pathspecCoversPath("lib/", "lib/a.ts")).toBe(true);
		expect(pathspecCoversPath("otro", "lib/a.ts")).toBe(false);
	});

	test("un GLOB cubre lo que casa", () => {
		expect(pathspecCoversPath("lib/*.ts", "lib/a.ts")).toBe(true);
		expect(pathspecCoversPath("lib/*.ts", "lib/sub/a.ts")).toBe(false);
		expect(pathspecCoversPath("lib/**/*.ts", "lib/sub/a.ts")).toBe(true);
		expect(pathspecCoversPath("*.md", "lib/a.ts")).toBe(false);
	});

	test("un cambio de MODO cuenta como divergencia", () => {
		// `rev-parse TREE:ruta` da el blob y se deja el modo fuera: 100644 → 100755
		// conservaba el mismo objeto y pasaba por idéntico.
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega");
		expect(manifestPathsDivergingInHead(dir, readCandidateReceipt(dir)!)).toEqual([]);
		execFileSync("chmod", ["+x", join(dir, "a.ts")]);
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "solo cambia el modo");
		expect(manifestPathsDivergingInHead(dir, readCandidateReceipt(dir)!)).toEqual(["a.ts"]);
	});

	test("una ruta NO OBSERVABLE no se aprueba por no saber", () => {
		// Dos lecturas fallidas devolvían `null` y `null !== null` es falso, así que
		// se leían como igualdad: un gate fail-closed aprobando por ignorancia.
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega");
		const receipt = readCandidateReceipt(dir)!;
		// Un árbol de recibo inexistente hace irresolubles TODAS sus rutas.
		const roto = { ...receipt, treeSha: "0".repeat(40) };
		const divergences = manifestDivergencesInHead(dir, roto);
		expect(divergences.length).toBeGreaterThan(0);
		expect(divergences[0]?.reason).toBe("no observable");
	});

	test("un fichero borrado en el candidato Y en HEAD no es divergencia", () => {
		// "Demostrablemente ausente" en los dos lados es igualdad, no un fallo de
		// lectura: la distinción tiene que sobrevivir al arreglo anterior.
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega");
		const receipt = readCandidateReceipt(dir)!;
		const conFantasma = { ...receipt, paths: [...receipt.paths, "nunca-existio.ts"] };
		const divergences = manifestDivergencesInHead(dir, conFantasma);
		expect(divergences.map((entry) => entry.path)).not.toContain("nunca-existio.ts");
	});
});

// =============================================================================
// PUBLICACIÓN = REVALIDAR EL VÍNCULO, no reconstruir el comando. El push/PR ya
// no parsea refspecs: la garantía vive en el commit, y la publicación solo
// comprueba que HEAD (el objetivo vivo) siga siendo lo verificado. Esto colapsa
// la clase entera de bugs de refspec (--all/--mirror/comodines/push.default).
// =============================================================================
describe("decisión de retiro: solo el merge ligado es terminal", () => {
	const receipt = {
		receiptVersion: 1,
		repositoryId: "repo-id",
		worktreeId: "worktree-id",
		change: "mi-cambio",
		head: "base",
		branch: "main",
		treeSha: "tree",
		paths: ["a.ts"],
		pathsSha256: "paths",
		reportSha256: "report",
		commandsSha256: "commands",
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	const input = (overrides: Record<string, unknown> = {}) => ({
		activeReceiptFingerprint: "a".repeat(64),
		receipt,
		attempt: { receiptFingerprint: "a".repeat(64), validatedDeliveryHead: "validated-head" },
		repositoryId: "repo-id",
		worktreeId: "worktree-id",
		identity: { remoteRepository: "owner/repo", baseRef: "main", headRef: "feature", prNumber: 7 },
		observation: {
			repository: "owner/repo", prNumber: 7, url: "https://github.com/owner/repo/pull/7", state: "MERGED",
			headRepository: "owner/repo", headRef: "feature", headRefOid: "validated-head", baseRef: "main", mergeCommitOid: "merge-result",
		},
		...overrides,
	});

	test("acepta solo un PR merged del mismo repositorio ligado a la cabeza validada", () => {
		expect(evaluateCandidateReceiptRetirement(input()).ok).toBe(true);
		for (const observation of [
			{ ...input().observation, state: "OPEN" },
			{ ...input().observation, headRepository: "fork/repo" },
			{ ...input().observation, headRefOid: "other-head" },
		]) {
			expect(evaluateCandidateReceiptRetirement(input({ observation })).ok).toBe(false);
		}
	});

	test("un intento ausente o obsoleto no autoriza el recibo activo", () => {
		expect(evaluateCandidateReceiptRetirement(input({ attempt: undefined })).ok).toBe(false);
		expect(evaluateCandidateReceiptRetirement(input({ attempt: { receiptFingerprint: "b".repeat(64), validatedDeliveryHead: "validated-head" } })).ok).toBe(false);
	});
});

describe("solape mecánico tras retirar un recibo", () => {
	test("el retiro solo elimina el gate viejo y no autoriza una entrega posterior", () => {
		const dir = repoConRecibo();
		const active = readActiveCandidateReceiptEvidence(dir)!;
		const attempt = {
			receiptFingerprint: active.fingerprint,
			validatedDeliveryHead: active.receipt.head,
		};
		const identity = { remoteRepository: "owner/repo", baseRef: "main", headRef: "feature", prNumber: 7 };
		const observation = {
			repository: "owner/repo", prNumber: 7, url: "https://github.com/owner/repo/pull/7", state: "MERGED",
			headRepository: "owner/repo", headRef: "feature", headRefOid: active.receipt.head, baseRef: "main", mergeCommitOid: "merge-oid",
		};
		const retirement = {
			change: "mi-cambio",
			receiptFingerprint: active.fingerprint,
			attempt,
			identity,
			decision: { ok: true as const, result: "retire" as const, observation },
		};

		writeFileSync(join(dir, "a.ts"), "contenido posterior divergente\n");
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "contenido posterior");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("blocked");

		const archive = retiredCandidateReceiptPath(dir, active.fingerprint)!;
		mkdirSync(join(archive, ".."), { recursive: true });
		writeFileSync(archive, "conflicto");
		expect(retireCandidateReceipt(dir, retirement).ok).toBe(false);
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("blocked");

		writeFileSync(archive, active.bytes);
		expect(retireCandidateReceipt(dir, retirement)).toEqual({ ok: true, result: "retired" });
		expect(receiptPath(dir)).not.toBeNull();
		expect(readCandidateReceipt(dir)).toBeNull();
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
		expect(deliveryBoundariesFor("git push origin main")).toEqual(["pre-push"]);
		expect(messageRequestsDelivery("continúa")).toBe(false);
		expect(messageRequestsDelivery("haz push")).toBe(true);

		writeFileSync(join(dir, "a.ts"), "candidato nuevo\n");
		expect(emitCandidateReceipt(dir, { change: "mi-cambio", paths: ["a.ts"], commands: ["bun test"] }).ok).toBe(true);
		const replacement = readActiveCandidateReceiptEvidence(dir)!;
		expect(replacement.fingerprint).not.toBe(active.fingerprint);
		expect(retireCandidateReceipt(dir, {
			...retirement,
			receiptFingerprint: replacement.fingerprint,
			decision: { ok: true, result: "retire", observation },
		}).ok).toBe(false);
		expect(readCandidateReceipt(dir)?.change).toBe("mi-cambio");
	});
});

describe("publicación: revalidación contra HEAD", () => {
	test("con intento en curso, si la rama se mueve tras validar, se bloquea", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		git(dir, "commit", "-qm", "entrega");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(post.verdict.kind).toBe("pass");
		writeFileSync(join(dir, "otro.ts"), "posterior\n");
		git(dir, "add", "otro.ts");
		git(dir, "commit", "-qm", "commit posterior");
		expect(evaluatePublish(dir, "pre-push", post.attempt).verdict.kind).toBe("blocked");
	});

	test("con intento en curso y HEAD intacto, pasa", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		const pre = evaluatePreCommit(dir, undefined);
		git(dir, "commit", "-qm", "entrega");
		const post = evaluatePostCommit(dir, pre.attempt);
		expect(evaluatePublish(dir, "pre-push", post.attempt).verdict.kind).toBe("pass");
	});

	test("SESIÓN NUEVA: HEAD con contenido divergente se bloquea, sin estado", () => {
		const dir = repoConRecibo();
		writeFileSync(join(dir, "a.ts"), "DIVERGENTE\n");
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "commit divergente");
		const outcome = evaluatePublish(dir, "pre-push", undefined);
		expect(outcome.verdict.kind).toBe("blocked");
		if (outcome.verdict.kind === "blocked") expect(outcome.verdict.reason).toContain("a.ts");
	});

	test("sesión nueva con HEAD que lleva lo verificado, pasa", () => {
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega verificada");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});

	test("sesión nueva con commits posteriores AJENOS, pasa", () => {
		// Una rama viva lleva mucho más que el candidato; solo se miran las rutas
		// del manifiesto, no el árbol entero.
		const dir = repoConRecibo();
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "entrega verificada");
		writeFileSync(join(dir, "otro.ts"), "posterior y ajeno\n");
		git(dir, "add", "otro.ts");
		git(dir, "commit", "-qm", "trabajo posterior");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});

	test("mismo modelo para el PR: HEAD divergente se bloquea", () => {
		const dir = repoConRecibo();
		writeFileSync(join(dir, "a.ts"), "DIVERGENTE\n");
		git(dir, "add", "a.ts");
		git(dir, "commit", "-qm", "divergente");
		expect(evaluatePublish(dir, "pre-pr", undefined).verdict.kind).toBe("blocked");
	});

	test("sin recibo, la publicación no opina", () => {
		const dir = mkdtempSync(join(tmpdir(), "ein-gate-pub-libre-"));
		git(dir, "init", "-q");
		git(dir, "config", "user.email", "t@t");
		git(dir, "config", "user.name", "t");
		writeFileSync(join(dir, "x.ts"), "v1\n");
		git(dir, "add", "x.ts");
		git(dir, "commit", "-qm", "init");
		expect(evaluatePublish(dir, "pre-push", undefined).verdict.kind).toBe("pass");
	});
});
