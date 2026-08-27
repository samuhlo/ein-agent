import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	classifyLegacyRuntimeArtifact,
	legacyRuntimeArtifactInventory,
	observeLegacyRuntimeArtifact,
	type LegacyArtifactObservation,
} from "../installer/src/core/legacy-runtime-artifacts";

const HOME = "/home/ein-test";
const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function observation(overrides: Partial<LegacyArtifactObservation> = {}): LegacyArtifactObservation {
	return {
		kind: "file",
		realPath: join(HOME, ".config/fish/functions/pi-ein.fish"),
		sha256: "e411e86b455e44ebf15748f8c8bf74d97e85ca0e4d6e83243bd9da652e3b7692",
		markerVersion: null,
		...overrides,
	};
}

describe("legacy runtime artifact ownership", () => {
	test("classifies the exact alpha.2 Fish launchers by shipped bytes", () => {
		const [pi, claude] = legacyRuntimeArtifactInventory(HOME);
		expect(classifyLegacyRuntimeArtifact(pi!, observation())).toMatchObject({ status: "owned", proof: "known-sha256" });
		expect(classifyLegacyRuntimeArtifact(claude!, observation({
			realPath: claude!.path,
			sha256: "614676668b6298bc8f8db7322d08c9c256122ea24ab771ffaf27b89e26dba41f",
		}))).toMatchObject({ status: "owned", proof: "known-sha256" });
	});

	test("fails closed for collisions, links, directories and neighboring paths", () => {
		const [pi] = legacyRuntimeArtifactInventory(HOME);
		for (const candidate of [
			observation({ sha256: "0".repeat(64) }),
			observation({ kind: "symlink" }),
			observation({ kind: "directory" }),
			observation({ realPath: `${pi!.path}.backup` }),
		]) {
			expect(classifyLegacyRuntimeArtifact(pi!, candidate)).toMatchObject({ status: "collision" });
		}
		expect(classifyLegacyRuntimeArtifact(pi!, observation({ kind: "missing", realPath: null, sha256: null }))).toEqual({ status: "absent" });
	});

	test("does not hash a legacy-looking file reached through an escaping parent symlink", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-legacy-parent-link-"));
		temporaryRoots.push(root);
		const home = join(root, "home");
		const outside = join(root, "outside");
		const outsideLauncher = join(outside, "fish", "functions", "pi-ein.fish");
		mkdirSync(home, { recursive: true });
		mkdirSync(join(outside, "fish", "functions"), { recursive: true });
		writeFileSync(outsideLauncher, "external-owned-looking-bytes\n");
		symlinkSync(outside, join(home, ".config"));

		const artifact = legacyRuntimeArtifactInventory(home)[0]!;
		const observation = observeLegacyRuntimeArtifact(artifact, null);

		expect(observation).toMatchObject({ kind: "symlink", sha256: null });
		expect(classifyLegacyRuntimeArtifact(artifact, observation)).toMatchObject({ status: "collision" });
		expect(readFileSync(outsideLauncher, "utf8")).toBe("external-owned-looking-bytes\n");
	});

	test("admits the retired SDD binary only under the exact managed alpha.2 home", () => {
		const sdd = legacyRuntimeArtifactInventory(HOME)[2]!;
		expect(classifyLegacyRuntimeArtifact(sdd, observation({
			realPath: sdd.path,
			sha256: null,
			markerVersion: "0.91.0-alpha.2",
		}))).toMatchObject({ status: "owned", proof: "managed-alpha-inventory" });
		for (const candidate of [
			observation({ realPath: sdd.path, sha256: null, markerVersion: null }),
			observation({ realPath: sdd.path, sha256: null, markerVersion: "0.90.0-alpha.9" }),
			observation({ realPath: join(HOME, "outside/cc-ein-sdd"), sha256: null, markerVersion: "0.91.0-alpha.2" }),
			observation({ kind: "symlink", realPath: sdd.path, sha256: null, markerVersion: "0.91.0-alpha.2" }),
		]) {
			expect(classifyLegacyRuntimeArtifact(sdd, candidate)).toMatchObject({ status: "collision" });
		}
	});
});
