import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { targetById } from "../../spikes/opentui-solid-packaging/src/targets.ts";
import { DASHBOARD_SEED_ROOT, verifyCandidateInput } from "./dashboard-candidate-input.ts";

const ASSETS = ["template.tar.gz", "cc-ein-runtime.tar.gz"] as const;

export async function smokePackagedDashboard(targetId: string, sourceRevision: string, assetsRoot = join(import.meta.dir, "../src/assets")): Promise<void> {
	const target = targetById(targetId);
	const roots: string[] = [];
	try {
		for (const asset of ASSETS) {
			const root = mkdtempSync(join(tmpdir(), "ein-packaged-dashboard-"));
			roots.push(root);
			const unpack = Bun.spawnSync(["tar", "-xzf", join(assetsRoot, asset), "-C", root]);
			if (unpack.exitCode !== 0) throw new Error(`Cannot inspect ${asset}`);
			const packages = join(root, DASHBOARD_SEED_ROOT, "packages");
			if (readdirSync(packages).join(",") !== target.id) throw new Error(`${asset} contains unexpected candidate targets`);
			const packageRoot = join(packages, target.id);
			verifyCandidateInput({
				target,
				candidateBinary: join(packageRoot, `ein-opentui-dashboard-${target.id}`),
				candidateInventory: join(packageRoot, "candidate-inventory.json"),
				sourceRevision,
			});
		}

		const selector = await import(pathToFileURL(join(roots[0]!, DASHBOARD_SEED_ROOT, "selector/launcher/dashboard-selector.ts")).href);
		const selected = await selector.selectDashboardBinary({
			argv: [], cwd: roots[0]!, packageRoot: "fixture", legacyBinary: "legacy",
			ports: { platform: target.os, arch: target.arch, stdinTTY: true, stdoutTTY: true, validate: async () => ({ candidate: "candidate", legacy: "legacy" }) },
		});
		if (selected !== "candidate") throw new Error("Packaged interactive selector smoke failed");
	} finally {
		for (const root of roots) rmSync(root, { recursive: true, force: true });
	}
}

if (import.meta.main) smokePackagedDashboard(process.argv[2] ?? "", process.argv[3] ?? "").catch((error) => {
	console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
