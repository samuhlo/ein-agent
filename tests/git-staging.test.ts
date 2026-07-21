// =============================================================================
// TESTS: lib/git-staging — pathspec cerrado
// =============================================================================
// BLINDAJE -> Un commit contiene lo que se decidió entregar, no lo que hubiera
// en el árbol. El caso que lo motiva es real: un `git add -A tests/` se llevó un
// test SIN TRACKEAR del usuario dentro de un PR, y hubo que abrir un segundo PR
// para sacarlo. El fallo no fue el comando, fue que nada lo impedía.
//
// Los dos ejes que se prueban:
//   1. verbos a granel — se rechazan sin mirar el repo;
//   2. arrastre de untracked — un pathspec explícito de DIRECTORIO también
//      barre lo que hay dentro, y eso solo se ve preguntándole a git.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	addPathspecs,
	classifyStagingCommand,
	evaluateStaging,
	parseDryRunPaths,
	sweptUntracked,
} = await import("../ein-pi/agent/lib/git-staging");

describe("verbos de staging a granel", () => {
	const bloqueados = [
		"git add -A",
		"git add --all",
		"git add -A tests/",
		"git add -u",
		"git add --update",
		"git add .",
		"git add ./",
		"git add :/",
		"git commit -a -m 'x'",
		"git commit --all -m 'x'",
		"git commit -am 'x'",
		// Dentro de una cadena: el separador no lo esconde.
		"cd repo && git add -A && git commit -m x",
		"git status; git add -A",
		// Flags agrupados.
		"git add -Au",
		// Con flags globales de git por medio.
		"git -C /repo add -A",
	];

	for (const command of bloqueados) {
		test(`bloquea: ${command}`, () => {
			const verdict = classifyStagingCommand(command);
			expect(verdict.kind).toBe("blocked");
			if (verdict.kind === "blocked") {
				// El mensaje SIEMPRE debe decir cómo salir: un bloqueo sin salida
				// convierte un descuido en un callejón.
				expect(verdict.reason.toLowerCase()).toContain("add");
				expect(verdict.reason).toContain("Ein staging gate");
			}
		});
	}

	const permitidos = [
		"git add src/a.ts src/b.ts",
		"git add -- src/a.ts",
		"git commit -m 'mensaje con -a dentro'",
		"git status",
		"git diff --stat",
		"git log --oneline -5",
		// `-a` de otro comando no es el `-a` de commit.
		"ls -a",
		// Un fichero que se llame como un flag, tras `--`.
		"git add -- ./-raro.ts",
	];

	for (const command of permitidos) {
		test(`permite: ${command}`, () => {
			expect(classifyStagingCommand(command).kind).toBe("ok");
		});
	}
});

describe("parseDryRunPaths", () => {
	test("extrae rutas de la salida real de git", () => {
		expect(parseDryRunPaths("add 'sub/otro.txt'\nadd 'nuevo.txt'\n")).toEqual(["sub/otro.txt", "nuevo.txt"]);
	});
	test("ignora ruido", () => {
		expect(parseDryRunPaths("fatal: algo\n")).toEqual([]);
	});
});

describe("sweptUntracked", () => {
	test("detecta el untracked arrastrado sin nombrar", () => {
		expect(sweptUntracked(["a.ts", "wip.ts"], ["wip.ts"], ["."])).toEqual(["wip.ts"]);
	});
	test("un untracked NOMBRADO es deliberado y pasa", () => {
		expect(sweptUntracked(["wip.ts"], ["wip.ts"], ["wip.ts"])).toEqual([]);
	});
	test("tolera `./` y barra final al comparar nombres", () => {
		expect(sweptUntracked(["wip.ts"], ["wip.ts"], ["./wip.ts"])).toEqual([]);
	});
	test("un fichero ya trackeado no es arrastre", () => {
		expect(sweptUntracked(["a.ts"], ["wip.ts"], ["."])).toEqual([]);
	});
});

describe("addPathspecs", () => {
	test("separa flags de rutas y respeta `--`", () => {
		expect(addPathspecs("git add -v src/a.ts -- src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
	});
	test("sin `git add` no hay pathspecs", () => {
		expect(addPathspecs("git commit -m x")).toEqual([]);
	});
});

// =============================================================================
// Contra un repo real: es la única forma de probar el arrastre, porque depende
// de lo que git decida añadir, no de la forma del comando.
// =============================================================================
describe("arrastre de untracked (repo real)", () => {
	function repo(): string {
		const dir = mkdtempSync(join(tmpdir(), "ein-staging-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
		git("init", "-q");
		git("config", "user.email", "t@t");
		git("config", "user.name", "t");
		mkdirSync(join(dir, "tests"), { recursive: true });
		writeFileSync(join(dir, "tests", "trackeado.test.ts"), "viejo\n");
		git("add", "tests/trackeado.test.ts");
		git("commit", "-qm", "init");
		writeFileSync(join(dir, "tests", "trackeado.test.ts"), "modificado\n");
		// El WIP del usuario: existe en el árbol y NADIE lo ha trackeado.
		writeFileSync(join(dir, "tests", "wip-del-usuario.test.ts"), "no es mío\n");
		return dir;
	}

	test("EL INCIDENTE: `git add -A tests/` se bloquea", () => {
		const verdict = evaluateStaging(repo(), "git add -A tests/");
		expect(verdict.kind).toBe("blocked");
	});

	test("`git add tests/` tampoco pasa: arrastra el untracked igual", () => {
		// Sin `-A`, un pathspec de DIRECTORIO añade untracked de todos modos.
		// Este es el caso que la capa pura no puede ver.
		const verdict = evaluateStaging(repo(), "git add tests/");
		expect(verdict.kind).toBe("blocked");
		if (verdict.kind === "blocked") {
			expect(verdict.reason).toContain("wip-del-usuario.test.ts");
		}
	});

	test("nombrar la ruta trackeada exacta SÍ pasa", () => {
		expect(evaluateStaging(repo(), "git add tests/trackeado.test.ts").kind).toBe("ok");
	});

	test("nombrar el untracked a propósito SÍ pasa", () => {
		// Entregar un fichero nuevo es legítimo; lo que no vale es arrastrarlo.
		expect(evaluateStaging(repo(), "git add tests/wip-del-usuario.test.ts").kind).toBe("ok");
	});

	test("fuera de un repo git no rompe el flujo", () => {
		// El gate previene un descuido; no es un control de seguridad, y no debe
		// tumbar comandos legítimos si el repo no es consultable.
		expect(evaluateStaging(mkdtempSync(join(tmpdir(), "ein-norepo-")), "git add algo.ts").kind).toBe("ok");
	});

	test("un comando que no es `git add` no se toca", () => {
		expect(evaluateStaging(repo(), "bun test").kind).toBe("ok");
	});
});

// =============================================================================
// FALSOS POSITIVOS. En un gate que BLOQUEA, bloquear de más es peor que no
// existir: convierte trabajo legítimo en un callejón. El mensaje de commit es
// texto libre y puede contener cualquier cosa que parezca un flag.
// =============================================================================
describe("no bloquea texto entrecomillado que parece un flag", () => {
	const legitimos = [
		`git commit -m 'mensaje con -a dentro'`,
		`git commit -m "fix(git): git add -A ya no se permite"`,
		`git commit -m "documenta -A, -u y git add ."`,
		`git commit -m "arregla el bug; ahora sí"`,
		`git commit -m "soporta a && b"`,
		`git add "ruta con espacios.ts"`,
		`git add 'otra ruta.ts'`,
	];
	for (const command of legitimos) {
		test(`permite: ${command}`, () => {
			expect(classifyStagingCommand(command).kind).toBe("ok");
		});
	}

	test("las rutas entrecomilladas se leen enteras", () => {
		expect(addPathspecs(`git add "ruta con espacios.ts" otra.ts`)).toEqual(["ruta con espacios.ts", "otra.ts"]);
	});

	test("pero un `git add -A` REAL tras un commit sí se bloquea", () => {
		// La cadena tiene un mensaje inofensivo y luego el comando de verdad.
		expect(classifyStagingCommand(`git commit -m "ok" && git add -A`).kind).toBe("blocked");
	});
});

// =============================================================================
// La capa 1 debe seguir viva DENTRO de `evaluateStaging`, que es lo que el hook
// invoca. Sin estos casos, quitar la llamada a `classifyStagingCommand` del
// punto de entrada no rompía ningún test: los verbos a granel se probaban solo
// contra la función pura, y la capa 2 los tapaba por casualidad cuando había
// algo sin trackear que arrastrar.
// =============================================================================
describe("evaluateStaging conserva las DOS capas", () => {
	// Repo LIMPIO: nada sin trackear, solo una modificación ya trackeada. Aquí
	// la capa 2 no tiene nada que detectar — si el bloqueo ocurre, es la capa 1.
	function repoSinUntracked(): string {
		const dir = mkdtempSync(join(tmpdir(), "ein-staging-limpio-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
		git("init", "-q");
		git("config", "user.email", "t@t");
		git("config", "user.name", "t");
		writeFileSync(join(dir, "a.ts"), "viejo\n");
		git("add", "a.ts");
		git("commit", "-qm", "init");
		// Modificación de un fichero YA trackeado: podría ser WIP del usuario.
		writeFileSync(join(dir, "a.ts"), "modificado\n");
		return dir;
	}

	for (const command of ["git add -A", "git add -u", "git add .", "git commit -am 'x'"]) {
		test(`bloquea \`${command}\` aunque no haya nada sin trackear`, () => {
			expect(evaluateStaging(repoSinUntracked(), command).kind).toBe("blocked");
		});
	}

	test("y sigue permitiendo el add explícito en ese mismo repo", () => {
		expect(evaluateStaging(repoSinUntracked(), "git add a.ts").kind).toBe("ok");
	});
});

// =============================================================================
// PERÍMETRO DE COMANDOS. Los tres huecos que destapó la revisión del PR #42,
// todos reproducidos antes de arreglarlos.
// =============================================================================
describe("envoltorios de shell", () => {
	// `bash -c` es la forma NORMAL en que un agente ejecuta cosas, no un truco.
	// El tokenizador metía el comando entero en un token entrecomillado, así que
	// no parecía git y pasaba limpio: el incidente original podía repetirse tal
	// cual con una envoltura rutinaria.
	const bloqueados = [
		`bash -lc 'git add -A'`,
		`bash -c 'git add .'`,
		`sh -c "git commit -am x"`,
		`zsh -c 'git add -u'`,
		`/bin/bash -c 'git add -A'`,
		`/usr/bin/env bash -c 'git add -A'`,
		// Anidado.
		`bash -c "bash -c 'git add -A'"`,
		// El comando peligroso va después de uno inofensivo dentro del wrapper.
		`bash -lc 'echo hola && git add -A'`,
	];
	for (const command of bloqueados) {
		test(`bloquea: ${command}`, () => {
			expect(classifyStagingCommand(command).kind).toBe("blocked");
		});
	}

	test("un wrapper con un add explícito sigue pasando", () => {
		expect(classifyStagingCommand(`bash -lc 'git add src/a.ts'`).kind).toBe("ok");
	});

	test("un mensaje que MENCIONA bash no es un wrapper", () => {
		expect(classifyStagingCommand(`git commit -m "usa bash -c 'git add -A' nunca"`).kind).toBe("ok");
	});
});

describe("ficheros ignorados y fidelidad del dry-run", () => {
	// Reconstruir el dry-run solo con los pathspecs descartaba `-f`, que es
	// justo el flag que mete ficheros IGNORADOS. Un `git add -f dist/` podía
	// publicar un `.env` y el guard decía que todo bien.
	function repoConIgnorados(): string {
		const dir = mkdtempSync(join(tmpdir(), "ein-ignorados-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
		git("init", "-q");
		git("config", "user.email", "t@t");
		git("config", "user.name", "t");
		mkdirSync(join(dir, "dist"), { recursive: true });
		writeFileSync(join(dir, ".gitignore"), "dist/\n");
		writeFileSync(join(dir, "dist", "secreto.env"), "API_KEY=xxx\n");
		git("add", ".gitignore");
		git("commit", "-qm", "init");
		return dir;
	}

	test("`git add -f dist/` con un secreto ignorado dentro se bloquea", () => {
		const verdict = evaluateStaging(repoConIgnorados(), "git add -f dist/");
		expect(verdict.kind).toBe("blocked");
		if (verdict.kind === "blocked") expect(verdict.reason).toContain("dist/secreto.env");
	});

	test("nombrar el ignorado a propósito SÍ pasa", () => {
		expect(evaluateStaging(repoConIgnorados(), "git add -f dist/secreto.env").kind).toBe("ok");
	});

	test("los flags interactivos no se inspeccionan (colgarían el dry-run)", () => {
		expect(evaluateStaging(repoConIgnorados(), "git add -p").kind).toBe("ok");
	});
});

describe("independencia del idioma de git", () => {
	// `git add --dry-run` imprime `add '<ruta>'`, y ese texto pasa por la capa
	// de traducción de git. Hoy no se traduce en ningún locale probado, pero una
	// traducción futura dejaría la lista VACÍA y el guard diría que todo va bien
	// — un fallo silencioso en el peor sitio. Anclar el locale cuesta una línea.
	const source = readFileSync(join(import.meta.dir, "../ein-pi/agent/lib/git-staging.ts"), "utf8");
	test("las llamadas a git fijan el locale", () => {
		expect(source).toContain('LC_ALL: "C"');
		expect(source).toContain('LANGUAGE: "C"');
	});
	test("el parser solo acepta el formato del locale C", () => {
		expect(parseDryRunPaths("añadir 'ruta.ts'\n")).toEqual([]);
		expect(parseDryRunPaths("add 'ruta.ts'\n")).toEqual(["ruta.ts"]);
	});
});
