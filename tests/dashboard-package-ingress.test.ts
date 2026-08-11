import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { bundleCcEin } from "../installer/scripts/bundle-cc-ein.ts";
import { bundleTemplate } from "../installer/scripts/bundle-template.ts";
import { DASHBOARD_SEED_ROOT, type CandidateInput } from "../installer/scripts/dashboard-candidate-input.ts";
import { PACKAGE_VERSIONS } from "../spikes/opentui-solid-packaging/src/package-layout.ts";
import { targetById } from "../spikes/opentui-solid-packaging/src/targets.ts";

const target = targetById("darwin-arm64");
const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function fixture(root: string): CandidateInput {
	const filename = `ein-opentui-dashboard-${target.id}`;
	const candidateBinary = join(root, filename);
	const candidateInventory = `${candidateBinary}.json`;
	const bytes = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(`fixture:${target.nativePackage}`)]);
	writeFileSync(candidateBinary, bytes, { mode: 0o755 });
	writeFileSync(candidateInventory, `${JSON.stringify({
		format: "ein-opentui-dashboard-candidate/v1",
		target: target.id,
		bunTarget: target.bunTarget,
		nativePackage: target.nativePackage,
		packageVersions: {
			"@opentui/core": PACKAGE_VERSIONS["@opentui/core"],
			"@opentui/solid": PACKAGE_VERSIONS["@opentui/solid"],
			"solid-js": PACKAGE_VERSIONS["solid-js"],
		},
		artifact: { filename, sha256: hash(bytes), bytes: bytes.byteLength, mode: "0755" },
		verification: { binaryFormat: "mach-o", nativePackageMarker: target.nativePackage, result: "pass" },
	}, null, 2)}\n`);
	return { target, candidateBinary, candidateInventory };
}

function filesUnder(root: string, current = root): string[] {
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const path = join(current, entry.name);
		return entry.isDirectory() ? filesUnder(root, path) : [path.slice(root.length + 1)];
	}).sort();
}

async function extract(root: string, name: string, build: (out: string) => Promise<void>): Promise<string> {
	const archive = join(root, `${name}.tar.gz`);
	const unpacked = join(root, name);
	mkdirSync(unpacked);
	await build(archive);
	const result = Bun.spawnSync(["tar", "-xzf", archive, "-C", unpacked]);
	expect(result.exitCode).toBe(0);
	return unpacked;
}

const builders = [
	["pi", (candidate: CandidateInput, out: string) => bundleTemplate({ candidate, out }), "template-manifest.json"],
	["claude", (candidate: CandidateInput, out: string) => bundleCcEin({ candidate, out }), "ein-cc-payload-manifest.json"],
] as const;

describe("target-specific dashboard package ingress", () => {
	test("both surfaces embed one identical seed and bind every staged byte", async () => {
		const root = mkdtempSync(join(tmpdir(), "ein-package-ingress-"));
		try {
			const candidate = fixture(root);
			const archives = await Promise.all(builders.map(async ([name, build, manifest]) => {
				const unpacked = await extract(root, name, (out) => build(candidate, out));
				const inventory = JSON.parse(readFileSync(join(unpacked, manifest), "utf8")) as {
					dashboardSeed: { target: string }; files: Array<{ path: string; sha256: string }>;
				};
				expect(inventory.dashboardSeed.target).toBe(target.id);
				const actual = filesUnder(unpacked).filter((path) => path !== manifest);
				expect(inventory.files.map(({ path }) => path).sort()).toEqual(actual);
				for (const file of inventory.files) expect(file.sha256).toBe(hash(readFileSync(join(unpacked, file.path))));
				return unpacked;
			}));
			const seed = `${DASHBOARD_SEED_ROOT}/packages/${target.id}`;
			for (const unpacked of archives) {
				const candidates = filesUnder(join(unpacked, `${DASHBOARD_SEED_ROOT}/packages`)).filter((path) => basename(path).startsWith("ein-opentui-dashboard-"));
				expect(candidates).toEqual([`${target.id}/ein-opentui-dashboard-${target.id}`]);
				expect(readFileSync(join(unpacked, `${seed}/ein-opentui-dashboard-${target.id}`))).toEqual(readFileSync(candidate.candidateBinary));
				const selectorFiles = filesUnder(join(unpacked, `${DASHBOARD_SEED_ROOT}/selector`));
				expect(selectorFiles).toEqual(["launcher/dashboard-selector.ts", "lib/dashboard-package.ts", "lib/terminal-app-args.ts"]);
				for (const path of selectorFiles) {
					const source = readFileSync(join(unpacked, `${DASHBOARD_SEED_ROOT}/selector`, path), "utf8");
					for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) expect(match[1]!.startsWith("node:") || match[1]!.startsWith(".")).toBe(true);
				}
			}
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	test("both surfaces reject every partial or mismatched candidate before archive output", async () => {
		const mutations = [
			(input: CandidateInput) => unlinkSync(input.candidateInventory),
			(input: CandidateInput) => writeFileSync(input.candidateInventory, "{"),
			(input: CandidateInput) => writeFileSync(input.candidateBinary, "corrupt"),
			(input: CandidateInput) => chmodSync(input.candidateBinary, 0o700),
			(input: CandidateInput) => {
				const value = JSON.parse(readFileSync(input.candidateInventory, "utf8")) as Record<string, unknown>;
				value.target = "linux-arm64"; writeFileSync(input.candidateInventory, JSON.stringify(value));
			},
			(input: CandidateInput) => { const renamed = `${input.candidateBinary}-wrong`; renameSync(input.candidateBinary, renamed); return { ...input, candidateBinary: renamed }; },
		];
		for (const [name, build] of builders) for (const mutate of mutations) {
			const root = mkdtempSync(join(tmpdir(), "ein-package-reject-"));
			try {
				let input = fixture(root);
				input = mutate(input) ?? input;
				const out = join(root, `${name}.tar.gz`);
				expect(build(input, out)).rejects.toBeInstanceOf(Error);
				expect(existsSync(out)).toBe(false);
			} finally { rmSync(root, { recursive: true, force: true }); }
		}
	});

	test("legacy no-input archives retain their generic manifest shape", async () => {
		const root = mkdtempSync(join(tmpdir(), "ein-package-legacy-"));
		try {
			const pi = await extract(root, "legacy-pi", (out) => bundleTemplate({ out }));
			const claude = await extract(root, "legacy-claude", (out) => bundleCcEin({ out }));
			for (const [path, manifest] of [[pi, "template-manifest.json"], [claude, "ein-cc-payload-manifest.json"]]) {
				const value = JSON.parse(readFileSync(join(path, manifest), "utf8")) as Record<string, unknown>;
				expect(value.dashboardSeed).toBeUndefined();
				expect(filesUnder(path).some((file) => file.startsWith(`${DASHBOARD_SEED_ROOT}/`))).toBe(false);
			}
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
