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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const {
	buildCandidateTree,
	candidateTreeMatches,
	collectIntendedPaths,
	digestPaths,
	emitCandidateReceipt,
	parseReceipt,
	readCandidateReceipt,
	receiptPath,
	resolveWorktreeIdentity,
	serializeReceipt,
	validateCandidateReceipt,
} = await import("../ein-pi/agent/lib/candidate-receipt");

function repo(): string {
	const dir = mkdtempSync(join(tmpdir(), "ein-receipt-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
	git("init", "-q");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	writeFileSync(join(dir, "a.ts"), "v1\n");
	writeFileSync(join(dir, "b.ts"), "v1\n");
	git("add", "a.ts", "b.ts");
	git("commit", "-qm", "init");
	return dir;
}

const gitOut = (dir: string, ...args: string[]) =>
	execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

function emitir(dir: string, change = "mi-cambio", untracked: string[] = []) {
	return emitCandidateReceipt(dir, {
		change,
		report: "# Verify\nstatus: pass\n",
		commands: ["bun test"],
		includeUntracked: untracked,
	});
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
});

describe("collectIntendedPaths", () => {
	test("recoge lo trackeado modificado y NO lo untracked sin nombrar", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		writeFileSync(join(dir, "ajeno.ts"), "de otro\n");
		expect(collectIntendedPaths(dir)).toEqual(["a.ts"]);
	});

	test("un untracked NOMBRADO sí entra", () => {
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		writeFileSync(join(dir, "mio.ts"), "mío\n");
		expect(collectIntendedPaths(dir, ["mio.ts"])).toEqual(["a.ts", "mio.ts"]);
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
		const dir = repo();
		writeFileSync(join(dir, "a.ts"), "v2\n");
		emitir(dir, "cambio-uno");
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
