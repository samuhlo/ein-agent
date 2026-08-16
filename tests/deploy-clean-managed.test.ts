// =============================================================================
// TESTS: installer deploy — reemplazo limpio de carpetas del template
// Protege el bug: la extracción del tarball solo añade/sobrescribe, nunca
// borra, así que un rename upstream (p. ej. ein-github.md → ein-git.md) dejaba
// el fichero viejo huérfano. cleanManagedDirs borra las carpetas 100% del
// template antes de extraer, sin tocar estado de usuario (skills/, raíz).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANAGED_DIRS, cleanManagedDirs } from "../installer/src/core/deploy";

const DIR = join(tmpdir(), "ein-agent-tests", "clean-managed");

function touch(rel: string): void {
	const full = join(DIR, rel);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, "x");
}

describe("cleanManagedDirs", () => {
	beforeEach(() => {
		rmSync(DIR, { recursive: true, force: true });
		mkdirSync(DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(DIR, { recursive: true, force: true });
	});

  test("borra las carpetas del template (incluido un huérfano)", () => {
    expect(MANAGED_DIRS).toContain("bin");
		for (const d of MANAGED_DIRS) touch(join(d, "file.md"));
		touch(join("agents", "ein-github.md")); // huérfano de un rename

		cleanManagedDirs(DIR);

		for (const d of MANAGED_DIRS) {
			expect(existsSync(join(DIR, d))).toBe(false);
		}
	});

	test("preserva estado de usuario: skills/ y ficheros de la raíz", () => {
		mkdirSync(join(DIR, "skills", "downloaded", "zod"), { recursive: true });
		writeFileSync(join(DIR, "skills", "downloaded", "zod", "SKILL.md"), "x");
		// symlink como el de omarchy: debe sobrevivir
		const target = join(DIR, "skills", "local");
		mkdirSync(target, { recursive: true });
		symlinkSync(target, join(DIR, "skills", "omarchy"));
		writeFileSync(join(DIR, "auth.json"), "{}");
		touch(join("agents", "ein-git.md"));

		cleanManagedDirs(DIR);

		expect(existsSync(join(DIR, "agents"))).toBe(false);
		expect(existsSync(join(DIR, "skills", "downloaded", "zod", "SKILL.md"))).toBe(true);
		expect(existsSync(join(DIR, "skills", "omarchy"))).toBe(true);
		expect(existsSync(join(DIR, "auth.json"))).toBe(true);
	});

	test("idempotente / fresh install: no revienta si las carpetas no existen", () => {
		expect(() => cleanManagedDirs(DIR)).not.toThrow();
	});
});
