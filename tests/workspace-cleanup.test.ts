import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanBunBuildArtifacts } from "../tooling/clean-workspace.ts";

describe("limpieza acotada del workspace", () => {
	test("elimina solo temporales Bun regulares de las raíces declaradas", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-clean-"));
		try {
			const artifact = join(root, ".18cd2bf69deff7e8-00000000.bun-build");
			const ordinary = join(root, "keep.bun-build");
			const nested = join(root, "nested");
			const outside = join(root, "outside");
			writeFileSync(artifact, "artifact");
			writeFileSync(ordinary, "keep");
			mkdirSync(nested);
			writeFileSync(join(nested, ".18cd2bf69deff7e8-00000000.bun-build"), "nested");
			writeFileSync(outside, "outside");
			symlinkSync(outside, join(root, ".18cd2bf69deff7e9-00000000.bun-build"));

			expect(cleanBunBuildArtifacts([root])).toEqual({ files: 1, bytes: 8 });
			expect(existsSync(artifact)).toBe(false);
			expect(existsSync(ordinary)).toBe(true);
			expect(existsSync(join(nested, ".18cd2bf69deff7e8-00000000.bun-build"))).toBe(true);
			expect(existsSync(outside)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("la compilación de la app confina y retira su temporal nativo", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-build-clean-"));
		try {
			const moduleUrl = pathToFileURL(join(import.meta.dir, "..", "installer", "scripts", "build-terminal-app.ts")).href;
			const script = `import { buildTerminalApp } from ${JSON.stringify(moduleUrl)}; await buildTerminalApp({ bunTarget: "bun-${process.platform}-${process.arch}", libc: ${process.platform === "linux" ? '"glibc"' : "null"} }, "ein");`;
			const result = spawnSync("bun", ["-e", script], { cwd: root, encoding: "utf8" });

			expect(result.status, result.stderr).toBe(0);
			expect(existsSync(join(root, "ein"))).toBe(true);
			expect(cleanBunBuildArtifacts([root])).toEqual({ files: 0, bytes: 0 });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
