import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import einPiFish from "../../../ein-pi/ein-pi.fish" with { type: "text" };
import einCcFish from "../../../ein-cc/ein-cc.fish" with { type: "text" };
import { run } from "./exec.ts";
import { installFishLauncher } from "./launcher.ts";
import { readInstallMarkerVersion } from "./legacy-runtime-artifacts.ts";
import { isValidInstallMarker } from "./paths.ts";
import { retireOwnedLegacyRuntimeArtifacts, type RuntimeSurfaceRetirementResult } from "./runtime-surface-transaction.ts";
import { stageEinCcPayload } from "./cc-payload.ts";
import type { InstallTarget, RuntimeInstallTarget } from "./install-plan.ts";

type RuntimeObservation = Readonly<{ managed: boolean; markerVersion: string | null }>;

export type RuntimeSurfaceUpgradeEffects = Readonly<{
	observe: (runtime: RuntimeInstallTarget) => RuntimeObservation;
	materialize: (runtime: RuntimeInstallTarget) => Promise<void>;
	validate: (runtime: RuntimeInstallTarget) => boolean;
	retire: (options: {
		home: string;
		target: InstallTarget;
		validatedCurrentArtifacts: true;
		claudeMarkerVersion: string | null;
		transactionId?: string;
	}) => RuntimeSurfaceRetirementResult;
}>;

export type RuntimeSurfaceUpgradeResult =
	| Readonly<{ status: "ok"; target: InstallTarget | null; collisions: readonly string[] }>
	| Readonly<{ status: "failed"; runtime: RuntimeInstallTarget | "shared"; reason: "materialize-failed" | "validation-failed" | "retirement-failed" }>;

function markerPath(home: string, runtime: RuntimeInstallTarget): string {
	return runtime === "pi"
		? join(home, ".pi-ein", "agent", ".ein-install.json")
		: join(home, ".claude-ein", ".ein-install.json");
}

function fileEquals(path: string, expected: string): boolean {
	try {
		return lstatSync(path).isFile() && readFileSync(path, "utf8") === expected;
	} catch {
		return false;
	}
}

function defaultEffects(home: string): RuntimeSurfaceUpgradeEffects {
	return {
		observe(runtime) {
			const path = markerPath(home, runtime);
			return { managed: isValidInstallMarker(path), markerVersion: readInstallMarkerVersion(path) };
		},
		async materialize(runtime) {
			if (runtime === "pi") {
				installFishLauncher({ home, name: "ein-pi.fish", content: einPiFish });
				return;
			}

			const stage = await stageEinCcPayload();
			try {
				const result = await run("bun", ["ein-cc/sync.ts"], {
					cwd: stage.root,
					env: { HOME: home, EIN_CC_HOME: join(home, ".claude-ein") },
					extraPath: [join(home, ".bun", "bin")],
				});
				if (!result.ok) throw new Error("ein-cc-sync-failed");
				installFishLauncher({ home, name: "ein-cc.fish", content: einCcFish });
			} finally {
				stage.cleanup();
			}
		},
		validate(runtime) {
			const launcher = join(home, ".config", "fish", "functions", runtime === "pi" ? "ein-pi.fish" : "ein-cc.fish");
			if (!fileEquals(launcher, runtime === "pi" ? einPiFish : einCcFish)) return false;
			if (runtime === "pi") return true;
			try {
				const sdd = lstatSync(join(home, ".claude-ein", "bin", "ein-cc-sdd"));
				return sdd.isFile() && (sdd.mode & 0o111) !== 0;
			} catch {
				return false;
			}
		},
		retire: retireOwnedLegacyRuntimeArtifacts,
	};
}

export async function refreshManagedRuntimeSurfaces(options: {
	home: string;
	transactionId?: string;
	effects?: RuntimeSurfaceUpgradeEffects;
}): Promise<RuntimeSurfaceUpgradeResult> {
	const effects = options.effects ?? defaultEffects(options.home);
	const pi = effects.observe("pi");
	const claude = effects.observe("claude");
	const selected: RuntimeInstallTarget[] = [
		...(pi.managed ? ["pi" as const] : []),
		...(claude.managed ? ["claude" as const] : []),
	];
	if (selected.length === 0) return { status: "ok", target: null, collisions: [] };

	for (const runtime of selected) {
		try {
			await effects.materialize(runtime);
		} catch {
			return { status: "failed", runtime, reason: "materialize-failed" };
		}
		if (!effects.validate(runtime)) return { status: "failed", runtime, reason: "validation-failed" };
	}

	const target: InstallTarget = selected.length === 2 ? "both" : selected[0]!;
	try {
		const retired = effects.retire({
			home: options.home,
			target,
			validatedCurrentArtifacts: true,
			claudeMarkerVersion: claude.markerVersion,
			...(options.transactionId ? { transactionId: options.transactionId } : {}),
		});
		return { status: "ok", target, collisions: retired.collisions };
	} catch {
		return { status: "failed", runtime: "shared", reason: "retirement-failed" };
	}
}
