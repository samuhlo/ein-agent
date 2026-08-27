// =============================================================================
// TESTS: la CLI no escribe sobre un cambio elegido al azar
//   Con dos cambios abiertos, los subcomandos que aceptan el cambio activo por
//   defecto tomaban `active[0]` — el orden de `readdirSync`— y escribían en él.
//   Ahora se niegan, nombran a los candidatos y salen distinto de cero.
//   El caso de un solo cambio no gana ninguna ceremonia: sigue funcionando.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	runDeltaCommand,
	runLaneCommand,
	runPreflightCommand,
	runSummaryCommand,
} from "../ein-cc/sdd-cli/cli.ts";

function sandbox(...changes: string[]) {
	const cwd = mkdtempSync(join(tmpdir(), "ein-cli-ambiguous-"));
	mkdirSync(join(cwd, "openspec"), { recursive: true });
	writeFileSync(join(cwd, "openspec", "config.yaml"), "strict_tdd: true\n");
	for (const change of changes) {
		mkdirSync(join(cwd, "openspec", "changes", change), { recursive: true });
	}
	return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("con varios cambios abiertos y ninguno elegido", () => {
	test("lane se niega y nombra a los candidatos", () => {
		const box = sandbox("feat-b", "feat-a");
		try {
			const { text, exitCode } = runLaneCommand(box.cwd, []);
			expect(exitCode).toBe(1);
			expect(text).toContain("feat-a");
			expect(text).toContain("feat-b");
			// El mensaje viejo era una mentira: había dos, no ninguno.
			expect(text).not.toContain("no active change");
		} finally {
			box.cleanup();
		}
	});

	test("preflight se niega en vez de decidir la postura del cambio equivocado", () => {
		const box = sandbox("feat-a", "feat-b");
		try {
			const { text, exitCode } = runPreflightCommand(box.cwd, ["--tdd", "strict"]);
			expect(exitCode).toBe(1);
			expect(text).toContain("feat-a");
			expect(text).toContain("feat-b");
			// Y sobre todo: no ha escrito la postura en ninguno de los dos.
			for (const change of ["feat-a", "feat-b"]) {
				expect(existsSync(join(box.cwd, "openspec", "changes", change, "preflight.json"))).toBe(false);
			}
		} finally {
			box.cleanup();
		}
	});

	test("delta se niega sin escribir el fichero de specs", () => {
		const box = sandbox("feat-a", "feat-b");
		try {
			const { exitCode, text } = runDeltaCommand(box.cwd, ["--domain", "cualquiera"], "[]");
			expect(exitCode).toBe(1);
			expect(text).toContain("feat-a");
			for (const change of ["feat-a", "feat-b"]) {
				expect(existsSync(join(box.cwd, "openspec", "changes", change, "specs"))).toBe(false);
			}
		} finally {
			box.cleanup();
		}
	});

	test("summary se niega sin escribir summary.md", () => {
		const box = sandbox("feat-a", "feat-b");
		try {
			const { exitCode, text } = runSummaryCommand(box.cwd, [], "## // 000. RESUMEN\ntexto\n");
			expect(exitCode).toBe(1);
			expect(text).toContain("feat-a");
			for (const change of ["feat-a", "feat-b"]) {
				expect(existsSync(join(box.cwd, "openspec", "changes", change, "summary.md"))).toBe(false);
			}
		} finally {
			box.cleanup();
		}
	});

	test("una petición explícita sigue funcionando con varios abiertos", () => {
		const box = sandbox("feat-a", "feat-b");
		try {
			const { exitCode } = runPreflightCommand(box.cwd, ["feat-b", "--tdd", "strict", "--lane", "micro"]);
			expect(exitCode).toBe(0);
			expect(existsSync(join(box.cwd, "openspec", "changes", "feat-b", "preflight.json"))).toBe(true);
			expect(existsSync(join(box.cwd, "openspec", "changes", "feat-a", "preflight.json"))).toBe(false);
		} finally {
			box.cleanup();
		}
	});
});

describe("con un solo cambio abierto no cambia nada", () => {
	test("lane sigue resolviéndolo sin pedir nada", () => {
		const box = sandbox("feat-unico");
		try {
			const { text, exitCode } = runLaneCommand(box.cwd, []);
			expect(exitCode).toBe(0);
			expect(text).toContain("feat-unico");
		} finally {
			box.cleanup();
		}
	});

	test("sin ningún cambio abierto el mensaje sigue siendo el de siempre", () => {
		const box = sandbox();
		try {
			const { text, exitCode } = runLaneCommand(box.cwd, []);
			expect(exitCode).toBe(1);
			expect(text).toContain("no active change");
		} finally {
			box.cleanup();
		}
	});
});
