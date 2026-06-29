import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OLD_AGENT = String.raw`sdd-(?:${"init"}|${"explore"}|${"archive"})`;
const OLD_ARTIFACT = String.raw`(?:${"init"}\.md|${"exploration"}\.md)`;
const OLD_COMMAND = String.raw`/ein:sdd-${"archive"}|/sdd-${"init"}`;
const BLOCKED = new RegExp(`${OLD_AGENT}|${OLD_ARTIFACT}|${OLD_COMMAND}`);

const roots = ["ein-pi/agent", "installer/src", "docs", "README.md"];
const allowed = [
	new RegExp(`ein-pi\\/agent\\/extensions\\/sdd-${"init"}\\.ts$`),
	/ein-pi\/agent\/docs\/PI_AGENTS_ARQUITECTURA\.md$/,
	/ein-pi\/agent\/extensions-manifest\.json$/,
	/ein-pi\/agent\/extensions\/ein-paths\.ts$/,
	/installer\/src\/core\/verify\.ts$/,
	/ein-pi\/agent\/lib\/model-config\.ts$/,
	/tests\/model-config\.test\.ts$/,
	/tests\/sdd-aliases\.test\.ts$/,
];

function files(path: string): string[] {
	const full = join(ROOT, path);
	const stat = statSync(full);
	if (stat.isFile()) return [full];
	const out: string[] = [];
	for (const entry of readdirSync(full)) {
		if (["node_modules", "downloaded", ".git", "sessions", "backups", ".sdd"].includes(entry)) continue;
		const child = join(full, entry);
		const childStat = statSync(child);
		if (childStat.isDirectory()) out.push(...files(relative(ROOT, child)));
		else if (/\.(?:ts|md|json)$/.test(entry)) out.push(child);
	}
	return out;
}

describe("SDD vocabulary", () => {
	test("primary surfaces use scope/map/close vocabulary", () => {
		const offenders = roots
			.flatMap(files)
			.map((file) => ({ file, rel: relative(ROOT, file), content: readFileSync(file, "utf8") }))
			.filter(({ rel }) => !allowed.some((pattern) => pattern.test(rel)))
			.filter(({ content }) => BLOCKED.test(content))
			.map(({ rel }) => rel);

		expect(offenders).toEqual([]);
	});
});
