// =============================================================================
// TESTS: Ein nombra el proyecto COMO LO NOMBRA ENGRAM
// -----------------------------------------------------------------------------
// EL FALLO -> Ein guardaba bajo `ein-git-<hash>` (un hash del remoto), y todo lo
// que usa las herramientas MCP —Claude, y cualquier otro agente— guarda y busca
// bajo el nombre que Engram deriva por su cuenta (`ein-agent`). Dos espacios de
// nombres dentro de la MISMA base de datos: unificar el fichero no unificaba la
// memoria, y Claude nunca habría visto lo que guardara Pi.
//
// El lado que lee en Claude es el servidor MCP, que no controlamos. Así que el
// que se alinea es Ein.
//
// LA REGLA NO SE ADIVINÓ: se midió interrogando al propio `engram mcp` con
// repositorios de prueba. Resultados observados:
//   git@github.com:samuhlo/ein-agent.git      -> ein-agent    (git_remote)
//   https://gitlab.com/grupo/sub/Mi_Proyecto.git -> mi_proyecto (git_remote)
//   git@github.com:Org/Repo.Name.git          -> repo.name    (git_remote)
//   repo sin remoto, carpeta `MAYUS-Dir`      -> mayus-dir    (git_root)
//   sin git, carpeta `sin-git-nada`           -> sin-git-nada (dir_basename)
// =============================================================================

import { describe, expect, test } from "bun:test";

import { engramProjectName } from "../ein-pi/agent/lib/memory-contract.ts";

describe("nombre derivado del remoto", () => {
	test("toma el último segmento y quita el `.git` final", () => {
		expect(engramProjectName({ originRemote: "git@github.com:samuhlo/ein-agent.git" })).toBe("ein-agent");
	});

	test("minúsculas, conservando guiones bajos y puntos internos", () => {
		expect(engramProjectName({ originRemote: "https://gitlab.com/grupo/sub/Mi_Proyecto.git" })).toBe("mi_proyecto");
		expect(engramProjectName({ originRemote: "git@github.com:Org/Repo.Name.git" })).toBe("repo.name");
	});

	test("da igual el transporte de la URL", () => {
		for (const remote of [
			"git@github.com:samuhlo/ein-agent.git",
			"https://github.com/samuhlo/ein-agent.git",
			"https://github.com/samuhlo/ein-agent",
			"ssh://git@github.com/samuhlo/ein-agent.git",
		]) {
			expect(engramProjectName({ originRemote: remote })).toBe("ein-agent");
		}
	});
});

describe("respaldos cuando no hay remoto", () => {
	test("sin remoto usa el nombre de la carpeta raíz del repo, en minúsculas", () => {
		expect(engramProjectName({ gitRoot: "/home/samu/proyectos/MAYUS-Dir" })).toBe("mayus-dir");
	});

	test("sin git usa el nombre del directorio de trabajo", () => {
		expect(engramProjectName({ cwd: "/home/samu/proyectos/sin-git-nada" })).toBe("sin-git-nada");
	});

	test("el remoto gana al directorio", () => {
		expect(
			engramProjectName({
				originRemote: "git@github.com:samuhlo/ein-agent.git",
				gitRoot: "/home/samu/otra-carpeta",
				cwd: "/home/samu/otra-carpeta",
			}),
		).toBe("ein-agent");
	});

	test("y la raíz del repo gana al cwd", () => {
		expect(engramProjectName({ gitRoot: "/home/samu/repo", cwd: "/home/samu/repo/sub/dir" })).toBe("repo");
	});
});

describe("fail closed", () => {
	test("sin nada de lo que derivar, no se inventa un nombre", () => {
		expect(engramProjectName({})).toBeUndefined();
	});

	test("un remoto ilegible cae al siguiente respaldo en vez de producir basura", () => {
		expect(engramProjectName({ originRemote: "   ", gitRoot: "/home/samu/repo" })).toBe("repo");
		expect(engramProjectName({ originRemote: "git@github.com:", gitRoot: "/home/samu/repo" })).toBe("repo");
	});

	test("una ruta que no deja nombre no produce cadena vacía", () => {
		expect(engramProjectName({ cwd: "/" })).toBeUndefined();
	});
});
