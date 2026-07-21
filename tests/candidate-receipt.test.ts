// =============================================================================
// TESTS: lib/candidate-receipt — recibo de candidato verificado (slice 03)
// =============================================================================
// BLINDAJE -> Un verify que pasa no dice QUÉ bytes pasaron. El recibo fija ese
// contenido en un árbol git content-addressed y lo liga a repo, worktree,
// cambio, HEAD, rutas, informe y comandos.
//
// La propiedad NO NEGOCIABLE es el aislamiento: construir el árbol candidato
// NO puede tocar el índice ni el worktree reales. Si lo hiciera, una operación
// pensada para observar acabaría mutando el trabajo del usuario — mucho peor
// que el problema que resuelve.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const {
	buildCandidateTree,
	candidateTreeMatches,
	assessReceiptPrecondition,
	suggestIntendedPaths,
	validateIntendedPaths,
	digestPaths,
	emitCandidateReceipt,
	parseReceipt,
	readCandidateReceipt,
	receiptPath,
	resolveWorktreeIdentity,
	serializeReceipt,
	validateCandidateReceipt,
} = await import("../ein-pi/agent/lib/candidate-receipt");

// Repo con un cambio SDD en estado VERIFICADO: es la precondición para emitir.
// Sin ella un `status: fail` producía un recibo "verificado", que vacía la
// palabra de significado.
function repo(change = "mi-cambio", verify = "pass", applyStatus = "complete"): string {
	const dir = mkdtempSync(join(tmpdir(), "ein-receipt-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
	git("init", "-q");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	writeFileSync(join(dir, "a.ts"), "v1\n");
	writeFileSync(join(dir, "b.ts"), "v1\n");
	git("add", "a.ts", "b.ts");
	git("commit", "-qm", "init");
	sddChange(dir, change, verify, applyStatus);
	return dir;
}

function sddChange(dir: string, change: string, verify = "pass", applyStatus = "complete"): string {
	const base = join(dir, "openspec", "changes", change);
	mkdirSync(base, { recursive: true });
	writeFileSync(join(base, "scope.md"), "# Scope\n\nscope: x\nbudget_allocated: 1000\n");
	writeFileSync(join(base, "map.md"), "# Map\n\nledger: x\nbudget_consumed: 1\nscope_status: ok\n");
	writeFileSync(join(base, "design.md"), "# Design\n");
	writeFileSync(join(base, "tasks.md"), "# Tasks\n\n- [x] 1.1 hecho\n");
	writeFileSync(join(base, "apply-progress.md"), `# Apply\n\nstatus: ${applyStatus}\n`);
	writeFileSync(join(base, "verify-report.md"), `# Verify\n\nstatus: ${verify}\nbehavior_coverage: verified\n`);
	return base;
}

const gitOut = (dir: string, ...args: string[]) =>
	execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

function emitir(dir: string, change = "mi-cambio", paths: string[] = ["a.ts"]) {
	return emitCandidateReceipt(dir, { change, paths, commands: ["bun test"] });
}

describe("aislamiento: no se toca el índice ni el worktree reales", () => {
	test("construir el árbol candidato no muta el estado del usuario", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		writeFileSync(join(dir, "nuevo.ts"), "nuevo\n");
		const antes = gitOut(dir, "status", "--porcelain");

		const tree = buildCandidateTree(dir, ["a.ts", "nuevo.ts"]);
		expect(tree).toMatch(/^[a-f0-9]{40}$/);

		// El fichero modificado DEBE seguir apareciendo como no-staged: si el
		// índice temporal se hubiera filtrado, saldría como staged.
		expect(gitOut(dir, "status", "--porcelain")).toBe(antes);
		expect(gitOut(dir, "diff", "--cached", "--name-only")).toBe("");
	});

	test("un staging previo del usuario sobrevive intacto", () => {
		const dir = repo();
		writeFileSync(join(dir, "b.ts"), "staged por el usuario\n");
		execFileSync("git", ["add", "b.ts"], { cwd: dir, stdio: "ignore" });
		writeFileSync(join(dir, "a.ts"), "v2\n");

		buildCandidateTree(dir, ["a.ts"]);

		expect(gitOut(dir, "diff", "--cached", "--name-only")).toBe("b.ts");
	});

	test("no deja índices temporales tirados", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		buildCandidateTree(dir, ["a.ts"]);
		const sobrantes = execFileSync("ls", [join(dir, ".git")], { encoding: "utf8" })
			.split("\n")
			.filter((entry) => entry.includes("ein-candidate"));
		expect(sobrantes).toEqual([]);
	});
});

describe("el árbol candidato describe exactamente lo previsto", () => {
	test("incluye lo previsto y EXCLUYE el untracked ajeno", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		writeFileSync(join(dir, "previsto.ts"), "mío\n");
		writeFileSync(join(dir, "ajeno.ts"), "de otro\n");

		const tree = buildCandidateTree(dir, ["a.ts", "previsto.ts"])!;
		const contenido = gitOut(dir, "ls-tree", "-r", "--name-only", tree).split("\n").sort();
		expect(contenido).toEqual(["a.ts", "b.ts", "previsto.ts"]);
		expect(contenido).not.toContain("ajeno.ts");
	});

	test("es determinista: mismo contenido, mismo hash", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(buildCandidateTree(dir, ["a.ts"])).toBe(buildCandidateTree(dir, ["a.ts"])!);
	});

	test("cambia si cambian los bytes", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const primero = buildCandidateTree(dir, ["a.ts"])!;
		writeFileSync(join(dir, "a.ts"), "v3\n");
		expect(buildCandidateTree(dir, ["a.ts"])).not.toBe(primero);
	});

	test("representa una eliminación trackeada", () => {
		const dir = repo();
		rmSync(join(dir, "a.ts"));

		expect(validateIntendedPaths(dir, ["a.ts"])).toEqual([]);
		const tree = buildCandidateTree(dir, ["a.ts"])!;
		expect(gitOut(dir, "ls-tree", "-r", "--name-only", tree).split("\n")).toEqual(["b.ts"]);
	});

	test("representa un rename con la ruta antigua y la nueva", () => {
		const dir = repo();
		execFileSync("git", ["mv", "a.ts", "renombrado.ts"], { cwd: dir, stdio: "ignore" });

		const suggested = suggestIntendedPaths(dir);
		expect(suggested.tracked).toEqual(["a.ts", "renombrado.ts"]);
		expect(validateIntendedPaths(dir, suggested.tracked)).toEqual([]);
		const tree = buildCandidateTree(dir, suggested.tracked)!;
		const paths = gitOut(dir, "ls-tree", "-r", "--name-only", tree).split("\n").sort();
		expect(paths).toEqual(["b.ts", "renombrado.ts"]);
	});

	test("acepta un nombre de fichero legítimo con ..", () => {
		const dir = repo();
		writeFileSync(join(dir, "schema..legacy.ts"), "v1\n");
		execFileSync("git", ["add", "schema..legacy.ts"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-qm", "schema"], { cwd: dir, stdio: "ignore" });
		writeFileSync(join(dir, "schema..legacy.ts"), "v2\n");

		expect(validateIntendedPaths(dir, ["schema..legacy.ts"])).toEqual([]);
		const tree = buildCandidateTree(dir, ["schema..legacy.ts"])!;
		expect(gitOut(dir, "show", `${tree}:schema..legacy.ts`)).toBe("v2");
	});
});

describe("suggestIntendedPaths — sugiere, no decide", () => {
	test("separa lo trackeado modificado de lo sin trackear", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		writeFileSync(join(dir, "nuevo.ts"), "nuevo\n");
		const { tracked, untracked } = suggestIntendedPaths(dir);
		expect(tracked).toContain("a.ts");
		expect(untracked).toContain("nuevo.ts");
	});
});

// =============================================================================
// El manifiesto se DECLARA. Inferirlo de `git diff --name-only HEAD` metía
// automáticamente CUALQUIER fichero trackeado que otro trabajo hubiera tocado:
// se excluía el WIP sin trackear pero no el trackeado, que es igual de ajeno.
// =============================================================================
describe("manifiesto explícito de rutas", () => {
	test("un trackeado modificado por OTRO trabajo no entra solo", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "lo mío\n");
		writeFileSync(join(dir, "b.ts"), "WIP de otro agente\n");
		const emitted = emitir(dir, "mi-cambio", ["a.ts"]);
		expect(emitted.ok).toBe(true);
		if (!emitted.ok) return;
		expect(emitted.receipt.paths).toEqual(["a.ts"]);
		const contenido = gitOut(dir, "ls-tree", "-r", "--name-only", emitted.receipt.treeSha).split("\n");
		// b.ts entra en el árbol con su contenido de HEAD, NO con el WIP ajeno.
		expect(gitOut(dir, "show", `${emitted.receipt.treeSha}:b.ts`)).toBe("v1");
		expect(contenido).toContain("b.ts");
	});

	test("sin manifiesto no se emite", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const emitted = emitCandidateReceipt(dir, { change: "mi-cambio", paths: [], commands: [] });
		expect(emitted.ok).toBe(false);
	});

	const invalidas: [string, string][] = [
		["tests/", "directorio"],
		[":(glob)**/*.ts", "pathspec mágico"],
		["/etc/passwd", "ruta absoluta"],
		["../fuera.ts", "escape con .."],
		["no-existe.ts", "no existe"],
	];
	for (const [ruta, motivo] of invalidas) {
		test(`rechaza ${motivo}: ${ruta}`, () => {
			const dir = repo();
			writeFileSync(join(dir, "a.ts"), "v2\n");
			mkdirSync(join(dir, "tests"), { recursive: true });
			writeFileSync(join(dir, "tests", "uno.ts"), "1\n");
			expect(validateIntendedPaths(dir, [ruta]).length).toBeGreaterThan(0);
			expect(emitir(dir, "mi-cambio", [ruta]).ok).toBe(false);
		});
	}

	test("un trackeado SIN cambios no forma parte del candidato", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(validateIntendedPaths(dir, ["b.ts"]).length).toBeGreaterThan(0);
	});

	test("una ruta duplicada se detecta", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(validateIntendedPaths(dir, ["a.ts", "a.ts"]).length).toBeGreaterThan(0);
	});
});

// =============================================================================
// "Candidato VERIFICADO" tiene que significar algo. Antes solo se comprobaba
// que el fichero del informe existiera, así que un `status: fail` producía un
// recibo perfectamente válido.
// =============================================================================
describe("precondición: solo se emite sobre un verify válido", () => {
	test("un verify en FAIL no produce recibo", () => {
		const dir = repo("mi-cambio", "fail");
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const emitted = emitir(dir);
		expect(emitted.ok).toBe(false);
		if (!emitted.ok) expect(emitted.reason).toContain("pass");
	});

	test("un apply a medias no produce recibo", () => {
		const dir = repo("mi-cambio", "pass", "partial");
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(emitir(dir).ok).toBe(false);
	});

	test("un verify OBSOLETO (apply posterior) no produce recibo", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		// Un apply posterior deja el informe describiendo un árbol viejo.
		const applyPath = join(dir, "openspec", "changes", "mi-cambio", "apply-progress.md");
		const futuro = Date.now() / 1000 + 60;
		writeFileSync(applyPath, "# Apply\n\nstatus: complete\n");
		utimesSync(applyPath, futuro, futuro);
		const emitted = emitir(dir);
		expect(emitted.ok).toBe(false);
		if (!emitted.ok) expect(emitted.reason).toContain("OBSOLETO");
	});

	test("un nombre de cambio inseguro se rechaza", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		for (const malo of ["../fuera", "a/b", "", "archive"]) {
			expect(emitir(dir, malo).ok).toBe(false);
		}
	});

	test("un cambio inexistente se rechaza", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(emitir(dir, "no-existe").ok).toBe(false);
	});

	test("assessReceiptPrecondition no bloquea un estado sano", () => {
		const dir = repo();
		expect(assessReceiptPrecondition(dir, "mi-cambio")).toBeNull();
	});
});

describe("digestPaths", () => {
	test("no depende del orden de entrada", () => {
		expect(digestPaths(["b", "a"])).toBe(digestPaths(["a", "b"]));
	});
	test("distingue fronteras entre rutas", () => {
		expect(digestPaths(["ab", "c"])).not.toBe(digestPaths(["a", "bc"]));
	});
});

describe("emisión y validación", () => {
	test("emite un recibo válido y lo valida", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const emitted = emitir(dir);
		expect(emitted.ok).toBe(true);
		if (!emitted.ok) return;
		expect(emitted.receipt.paths).toEqual(["a.ts"]);
		expect(emitted.receipt.head).toBe(gitOut(dir, "rev-parse", "HEAD"));
		expect(validateCandidateReceipt(dir, "mi-cambio").ok).toBe(true);
	});

	test("el recibo vive en el área administrativa, NO en el repo", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir);
		expect(receiptPath(dir)).toContain(".git");
		// No debe aparecer como contenido del proyecto.
		expect(gitOut(dir, "status", "--porcelain")).not.toContain("candidate-receipt");
	});

	test("el árbol candidato del recibo coincide con el worktree de entonces", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const emitted = emitir(dir);
		if (!emitted.ok) throw new Error("no emitió");
		expect(candidateTreeMatches(dir, emitted.receipt)).toBe(true);
		// Y deja de coincidir en cuanto los bytes cambian: es el punto entero.
		writeFileSync(join(dir, "a.ts"), "v3\n");
		expect(candidateTreeMatches(dir, emitted.receipt)).toBe(false);
	});
});

// =============================================================================
// FAIL-CLOSED. Un recibo ausente, corrupto o de otro sitio NO es evidencia
// débil: no es evidencia. La lección viene del recibo OpenSpec, que serializaba
// el cambio y no lo miraba, así que uno prestado pasaba por bueno.
// =============================================================================
describe("validación fail-closed", () => {
	test("sin recibo, no hay evidencia", () => {
		const verdict = validateCandidateReceipt(repo(), "mi-cambio");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("no hay recibo");
	});

	test("un recibo corrupto se rechaza", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir);
		writeFileSync(receiptPath(dir)!, "{ esto no es json");
		expect(validateCandidateReceipt(dir, "mi-cambio").ok).toBe(false);
	});

	test("un recibo de OTRO cambio no vale", () => {
		const dir = repo("cambio-uno");
		sddChange(dir, "cambio-dos");
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(emitir(dir, "cambio-uno").ok).toBe(true);
		const verdict = validateCandidateReceipt(dir, "cambio-dos");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("cambio-uno");
	});

	test("un recibo de OTRO repositorio no vale", () => {
		const origen = repo();
		const destino = repo();
		writeFileSync(join(origen, "a.ts"), "v2\n");
		emitir(origen);
		// Se copia el recibo tal cual al otro repo: mismos bytes, otro dueño.
		const target = receiptPath(destino)!;
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, readFileSync(receiptPath(origen)!, "utf8"));
		const verdict = validateCandidateReceipt(destino, "mi-cambio");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("OTRO repositorio");
	});

	test("un manifiesto de rutas manipulado se detecta", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		const emitted = emitir(dir);
		if (!emitted.ok) throw new Error("no emitió");
		// Se añade una ruta al recibo sin recalcular su digest.
		const manipulado = { ...emitted.receipt, paths: [...emitted.receipt.paths, "colado.ts"] };
		writeFileSync(receiptPath(dir)!, serializeReceipt(manipulado));
		const verdict = validateCandidateReceipt(dir, "mi-cambio");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("digest");
	});

	test("un recibo de otra versión se rechaza (no se interpreta a medias)", () => {
		expect(parseReceipt(JSON.stringify({ receiptVersion: 99, change: "x" }))).toBeNull();
	});

	test("un recibo con campos que faltan se rechaza", () => {
		expect(parseReceipt(JSON.stringify({ receiptVersion: 1, change: "x" }))).toBeNull();
	});

	test("fuera de un repo git falla cerrado, sin reventar", () => {
		const fuera = mkdtempSync(join(tmpdir(), "ein-norepo-"));
		expect(resolveWorktreeIdentity(fuera)).toBeNull();
		expect(readCandidateReceipt(fuera)).toBeNull();
		const verdict = validateCandidateReceipt(fuera, "x");
		expect(verdict.ok).toBe(false);
	});
});

describe("publicación atómica", () => {
	test("no deja temporales tras emitir", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir);
		const carpeta = receiptPath(dir)!.replace(/\/[^/]+$/, "");
		const temporales = execFileSync("ls", [carpeta], { encoding: "utf8" })
			.split("\n")
			.filter((entry) => entry.endsWith(".tmp"));
		expect(temporales).toEqual([]);
		expect(existsSync(receiptPath(dir)!)).toBe(true);
	});
});

// =============================================================================
// El recibo guarda `reportSha256` y ANTES no lo comparaba nunca: verify A pasa,
// se emite el recibo, llega un verify B, y el recibo viejo seguía validando. Es
// el mismo fallo que se corrigió en el recibo OpenSpec —serializar la identidad
// y no mirarla— repetido aquí, en el módulo que presume de trazabilidad.
// =============================================================================
describe("el recibo debe respaldar el informe VIGENTE", () => {
	test("un verify posterior distinto invalida el recibo", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		expect(emitir(dir).ok).toBe(true);
		expect(validateCandidateReceipt(dir, "mi-cambio").ok).toBe(true);

		// Verify B: mismo veredicto, informe distinto.
		writeFileSync(
			join(dir, "openspec", "changes", "mi-cambio", "verify-report.md"),
			"# Verify\n\nstatus: pass\nbehavior_coverage: verified\nnota: segunda pasada\n",
		);
		const verdict = validateCandidateReceipt(dir, "mi-cambio");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("vigente");
	});

	test("si el informe desaparece, el recibo deja de valer", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir);
		rmSync(join(dir, "openspec", "changes", "mi-cambio", "verify-report.md"));
		expect(validateCandidateReceipt(dir, "mi-cambio").ok).toBe(false);
	});

	test("un apply posterior invalida el recibo aunque el informe no cambie", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir);
		const applyPath = join(dir, "openspec", "changes", "mi-cambio", "apply-progress.md");
		const futuro = Date.now() / 1000 + 60;
		writeFileSync(applyPath, "# Apply\n\nstatus: complete\n");
		utimesSync(applyPath, futuro, futuro);
		const verdict = validateCandidateReceipt(dir, "mi-cambio");
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toContain("ya no está en estado verificado");
	});
});
