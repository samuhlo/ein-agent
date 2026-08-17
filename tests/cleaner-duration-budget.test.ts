import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectCleanerDuplicationEvidence } from "../ein-pi/agent/lib/cleaner-duplication-evidence.ts";
import { collectCleanerComplexityEvidence } from "../ein-pi/agent/lib/cleaner-complexity-evidence.ts";
import { collectCleanerEnvironmentEvidence } from "../ein-pi/agent/lib/cleaner-environment-evidence.ts";

// =============================================================================
// El presupuesto de duración es un hecho de RENDIMIENTO, no de correctitud.
// Antes compartía un `throw` con el cambio de estado del árbol, así que una
// recogida correcta pero lenta —un runner de CI cargado— salía como fallo y
// tiraba el trabajo ya hecho. Tres apariciones en CI antes de arreglarlo.
// =============================================================================

const roots: string[] = [];

function fixture(options: { cloned?: boolean } = {}) {
	const root = mkdtempSync(join(tmpdir(), "ein-cleaner-duration-"));
	roots.push(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "package.json"), "{}");
	const cloned = options.cloned ?? true;
	// Con clones hay pares candidatos que recorrer; sin ellos el bucle no llega
	// a ejecutarse, que es lo que deja ver el camino FINAL del colector.
	for (const name of ["a.ts", "b.ts"]) {
		const body = Array.from({ length: 60 }, (_, i) =>
			cloned ? `  const value${i} = compute(${i}) + offset;` : `  const ${name[0]}${i} = compute(${i}) * ${i};`,
		).join("\n");
		writeFileSync(join(root, "src", name), `export function ${name[0]}(compute: (n: number) => number, offset: number) {\n${body}\n  return offset;\n}\n`);
	}
	const git = (...args: string[]): void => { execFileSync("git", args, { cwd: root, stdio: "ignore" }); };
	git("init", "-q");
	git("config", "user.email", "fixture@example.com");
	git("config", "user.name", "Fixture");
	git("add", ".");
	git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
	return { root, git, environment: collectCleanerEnvironmentEvidence(root) };
}

afterEach(() => {
	while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

// 1 ms es el mínimo que acepta la validación de presupuesto (enteros positivos)
// y se agota siempre: es "imposible de cumplir" sin ser un valor inválido.
const IMPOSSIBLE = { maxDurationMs: 1 };

describe("presupuesto de duración de los colectores", () => {
	// El caso que rompía CI: al llegar al final, lento ya no significa fallido.
	// Sin clones no hay pares candidatos, así que la guarda del bucle no llega a
	// evaluarse y se ejercita justo el camino que antes lanzaba.
	test("duplicación: lento pero completo reporta el hecho, no lanza", () => {
		const { environment } = fixture({ cloned: false });
		const evidence = collectCleanerDuplicationEvidence(environment, undefined, IMPOSSIBLE);
		expect(evidence.budget.durationExceeded).toBe(true);
		// Y la evidencia sigue siendo utilizable: midió un árbol real.
		expect(evidence.scope.files.length).toBeGreaterThan(0);
		expect(evidence.outputIdentity.digest).toMatch(/^[a-f0-9]{64}$/);
	});

	// Complejidad comprueba la duración DENTRO del recorrido AST, así que con un
	// presupuesto imposible aborta antes de llegar al final. Eso es la protección
	// contra runaway funcionando, no el fallo que se arregló aquí: su check final
	// también dejó de lanzar, y el default subió a 5 s para que un runner cargado
	// no lo dispare.
	test("complejidad: el presupuesto imposible aborta en el recorrido, no al final", () => {
		const { environment } = fixture();
		expect(() => collectCleanerComplexityEvidence(environment, undefined, IMPOSSIBLE))
			.toThrow(/duration budget exceeded/);
	});

	// El presupuesto de duración es el único que depende de la máquina; el resto
	// son deterministas y son los que acotan de verdad. Por eso tiene holgura.
	test("el default deja holgura sobre el peor caso medido", () => {
		const { environment } = fixture();
		expect(collectCleanerDuplicationEvidence(environment).budget.maxDurationMs).toBe(5_000);
		expect(collectCleanerComplexityEvidence(environment).budget.maxDurationMs).toBe(5_000);
	});

	test("con presupuesto holgado el hecho es falso", () => {
		const { environment } = fixture();
		expect(collectCleanerDuplicationEvidence(environment).budget.durationExceeded).toBe(false);
		expect(collectCleanerComplexityEvidence(environment).budget.durationExceeded).toBe(false);
	});

	// Lo que NO se relaja: la evidencia describe un estado concreto del árbol, y
	// si ese estado cambia deja de describir nada. Sigue siendo fatal.
	test("un árbol que cambió sigue siendo fatal", () => {
		const { root, git, environment } = fixture();
		writeFileSync(join(root, "src", "c.ts"), "export const c = 1;\n");
		git("add", ".");
		git("-c", "commit.gpgsign=false", "commit", "-qm", "movido");

		expect(() => collectCleanerDuplicationEvidence(environment)).toThrow(/source state/);
		expect(() => collectCleanerComplexityEvidence(environment)).toThrow(/source state/);
	});

	// La protección contra runaway vive DENTRO de los bucles, que es donde
	// abortar todavía ahorra trabajo. No se toca.
	test("un presupuesto de TRABAJO agotado sí aborta", () => {
		const { environment } = fixture();
		expect(() => collectCleanerDuplicationEvidence(environment, undefined, { maxCandidatePairs: 1 }))
			.toThrow(/budget exceeded/);
	});
});
