import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
