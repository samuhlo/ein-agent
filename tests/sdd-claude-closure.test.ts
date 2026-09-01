import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".json"] as const;
const TRANSPILERS = {
	js: new Bun.Transpiler({ loader: "js" }),
	ts: new Bun.Transpiler({ loader: "ts" }),
	tsx: new Bun.Transpiler({ loader: "tsx" }),
};

function resolveImport(from: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(dirname(from), specifier);
	for (const extension of EXTENSIONS) {
		const candidate = `${base}${extension}`;
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	for (const extension of EXTENSIONS) {
		const candidate = join(base, `index${extension}`);
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	throw new Error(`Unresolved runtime import ${specifier} from ${relative(ROOT, from)}`);
}

function runtimeClosure(entry: string): string[] {
	const pending = [join(ROOT, entry)];
	const found = new Set<string>();
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (found.has(current)) continue;
		found.add(current);
		let source = readFileSync(current, "utf8");
		if (source.startsWith("#!")) source = source.slice(source.indexOf("\n") + 1);
		const loader = current.endsWith(".tsx") ? "tsx" : current.endsWith(".js") ? "js" : "ts";
		for (const scanned of TRANSPILERS[loader].scanImports(source)) {
			const imported = resolveImport(current, scanned.path);
			if (imported) pending.push(imported);
		}
	}
	return [...found].map((path) => relative(ROOT, path)).sort();
}

describe("Claude SDD runtime closure", () => {
	test("keeps the intent cut below its measured Pi budget", () => {
		const closure = runtimeClosure("ein-cc/sdd-cli/cli.ts");
		const piFiles = closure.filter((path) => path.startsWith("ein-pi/"));
		const piLines = piFiles.reduce(
			(total, path) => total + readFileSync(join(ROOT, path), "utf8").split("\n").length - 1,
			0,
		);

		expect(piFiles).not.toContain("ein-pi/agent/lib/sdd-preflight.ts");
		expect(piFiles.length).toBeLessThanOrEqual(27);
		expect(piLines).toBeLessThanOrEqual(6_800);
		for (const collateral of [
			"ein-pi/agent/lib/engram-cli.ts",
			"ein-pi/agent/lib/memory-lifecycle.ts",
			"ein-pi/agent/lib/review-forecast.ts",
			"ein-pi/agent/lib/sdd-assets.ts",
			"ein-pi/agent/lib/sdd-session-memory.ts",
		]) expect(piFiles).not.toContain(collateral);
	});
});
