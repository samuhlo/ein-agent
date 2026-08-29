import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ARCHIVE = join(ROOT, "openspec", "changes", "archive");

describe("archivo OpenSpec condensado", () => {
	test("cada cambio cerrado conserva únicamente summary.md", () => {
		const violations = readdirSync(ARCHIVE)
			.filter((change) => statSync(join(ARCHIVE, change)).isDirectory())
			.flatMap((change) => {
				const files = readdirSync(join(ARCHIVE, change)).sort();
				return files.length === 1 && files[0] === "summary.md" ? [] : [`${change}: ${files.join(", ")}`];
			});

		expect(violations).toEqual([]);
	});
});
