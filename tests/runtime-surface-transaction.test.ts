import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	finalizeRuntimeSurfaceRetirement,
	retireOwnedLegacyRuntimeArtifacts,
	rollbackRuntimeSurfaceRetirement,
} from "../installer/src/core/runtime-surface-transaction";

const temporaryHomes: string[] = [];

const LEGACY_PI_LAUNCHER = `function pi-ein --description "Pi Coding Agent con el cerebro de Ein (aislado en ~/.pi-ein)"
    # Aislamiento simétrico con cc-ein. Ambas envs quedan en el scope de la
    # función (se exportan al proceso pi hijo, NO contaminan tu shell ni tu
    # \`pi\` vanilla):
    #   PI_CODING_AGENT_DIR → Pi carga su config/agente/auth/sesiones de ahí.
    #   EIN_PI_AGENT_HOME    → el código de EIN (ein-paths) resuelve sus rutas ahí.
    set -x PI_CODING_AGENT_DIR "$HOME/.pi-ein/agent"
    set -x EIN_PI_AGENT_HOME "$HOME/.pi-ein/agent"
    set -fx ENGRAM_DATA_DIR "$HOME/.engram-ein"

    # One-shot session binding is trusted only when the validated Pi child
    # adapter adds it back. Ordinary Fish entrypoints must not inherit it.
    set -e EIN_SDD_SESSION_BINDING_V1

    set -l namespace ""
    if test (count $argv) -gt 0
        set namespace $argv[1]
    end

    switch $namespace
        case app
            set -l terminal_app "$EIN_PI_AGENT_HOME/app.ts"
            if not test -f "$terminal_app"
                printf "pi-ein: terminal app unavailable\\n" >&2
                return 69
            end
            command bun "$terminal_app" $argv[2..-1]
        case cleaner workbench
            set -l surface_runner "$EIN_PI_AGENT_HOME/surfaces/surface-runner.ts"
            if not test -f "$surface_runner"
                printf "pi-ein: surface runner unavailable\\n" >&2
                return 69
            end
            command bun "$surface_runner" $argv
        case '*'
            command pi $argv
    end
end
`;

function fixture(): { home: string; legacyPath: string } {
	const home = mkdtempSync(join(tmpdir(), "ein-runtime-surface-transaction-"));
	temporaryHomes.push(home);
	const legacyPath = join(home, ".config", "fish", "functions", "pi-ein.fish");
	mkdirSync(join(home, ".config", "fish", "functions"), { recursive: true });
	writeFileSync(legacyPath, LEGACY_PI_LAUNCHER, { mode: 0o744 });
	return { home, legacyPath };
}

afterEach(() => {
	for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("runtime surface retirement transaction", () => {
	test("requires validated new surfaces before moving owned legacy bytes", () => {
		const value = fixture();
		expect(() => retireOwnedLegacyRuntimeArtifacts({
			...value,
			target: "pi",
			validatedCurrentArtifacts: false as never,
		})).toThrow("current-surfaces-not-validated");
		expect(readFileSync(value.legacyPath, "utf8")).toBe(LEGACY_PI_LAUNCHER);
	});

	test("retires exact owned bytes and preserves a user collision", () => {
		const owned = fixture();
		const result = retireOwnedLegacyRuntimeArtifacts({ ...owned, target: "pi", validatedCurrentArtifacts: true });
		expect(result).toMatchObject({ retired: ["LEGACY_PI_LAUNCHER"], collisions: [] });
		expect(existsSync(owned.legacyPath)).toBe(false);

		const collision = fixture();
		writeFileSync(collision.legacyPath, "function pi-ein; echo mine; end\n");
		const preserved = retireOwnedLegacyRuntimeArtifacts({ ...collision, target: "pi", validatedCurrentArtifacts: true });
		expect(preserved.collisions).toEqual(["LEGACY_PI_LAUNCHER"]);
		expect(readFileSync(collision.legacyPath, "utf8")).toBe("function pi-ein; echo mine; end\n");
	});

	test("restores exact bytes and mode after an injected quarantine failure", () => {
		const value = fixture();
		chmodSync(value.legacyPath, 0o741);
		expect(() => retireOwnedLegacyRuntimeArtifacts({
			...value,
			target: "pi",
			validatedCurrentArtifacts: true,
			fault: (point) => {
				if (point === "after-move:LEGACY_PI_LAUNCHER") throw new Error("injected-after-move");
			},
		})).toThrow("injected-after-move");
		expect(readFileSync(value.legacyPath, "utf8")).toBe(LEGACY_PI_LAUNCHER);
		expect(statSync(value.legacyPath).mode & 0o777).toBe(0o741);
	});

	test("publishes durable intent before each move and durable completion after it", () => {
		const value = fixture();
		const transactionId = "intent-order-0001";
		const manifestPath = join(value.home, ".ein-installer", "runtime-surface-recovery", transactionId, "manifest.json");
		let beforeMove: unknown;
		let afterMove: unknown;

		retireOwnedLegacyRuntimeArtifacts({
			...value,
			target: "pi",
			validatedCurrentArtifacts: true,
			transactionId,
			fault: (point) => {
				if (point === "before-move:LEGACY_PI_LAUNCHER") beforeMove = JSON.parse(readFileSync(manifestPath, "utf8"));
				if (point === "after-move:LEGACY_PI_LAUNCHER") afterMove = JSON.parse(readFileSync(manifestPath, "utf8"));
			},
		});

		expect(beforeMove).toMatchObject({ state: "preparing", entries: [{ id: "LEGACY_PI_LAUNCHER", status: "moving" }] });
		expect(afterMove).toMatchObject({ state: "preparing", entries: [{ id: "LEGACY_PI_LAUNCHER", status: "moved" }] });
	});

	test("reenters the same transaction after interruption without rescanning a moved artifact as absent", () => {
		const value = fixture();
		chmodSync(value.legacyPath, 0o741);
		const transactionId = "interrupt-reentry-0001";
		const probe = join(import.meta.dir, "fixtures", "runtime-surface-interruption-probe.ts");
		const interrupted = spawnSync(process.execPath, [probe, value.home, transactionId], { encoding: "utf8" });
		expect(interrupted.status).not.toBe(0);

		const resumed = retireOwnedLegacyRuntimeArtifacts({
			...value,
			target: "pi",
			validatedCurrentArtifacts: true,
			transactionId,
		});
		expect(resumed).toMatchObject({ retired: ["LEGACY_PI_LAUNCHER"], absent: [] });
		expect(existsSync(value.legacyPath)).toBe(false);
		const recovery = join(resumed.recoveryDirectory!, "files", "LEGACY_PI_LAUNCHER");
		expect(readFileSync(recovery, "utf8")).toBe(LEGACY_PI_LAUNCHER);
		expect(statSync(recovery).mode & 0o777).toBe(0o741);
	});

	test("restores on global rollback and deletes quarantine only after global commit", () => {
		const rollback = fixture();
		chmodSync(rollback.legacyPath, 0o741);
		const rollbackId = "global-rollback-0001";
		const prepared = retireOwnedLegacyRuntimeArtifacts({
			...rollback,
			target: "pi",
			validatedCurrentArtifacts: true,
			transactionId: rollbackId,
		});
		expect(existsSync(prepared.recoveryDirectory!)).toBe(true);
		rollbackRuntimeSurfaceRetirement({ home: rollback.home, target: "pi", transactionId: rollbackId });
		expect(readFileSync(rollback.legacyPath, "utf8")).toBe(LEGACY_PI_LAUNCHER);
		expect(statSync(rollback.legacyPath).mode & 0o777).toBe(0o741);
		expect(existsSync(prepared.recoveryDirectory!)).toBe(false);

		const commit = fixture();
		const commitId = "global-commit-0001";
		const quarantined = retireOwnedLegacyRuntimeArtifacts({
			...commit,
			target: "pi",
			validatedCurrentArtifacts: true,
			transactionId: commitId,
		});
		expect(existsSync(quarantined.recoveryDirectory!)).toBe(true);
		finalizeRuntimeSurfaceRetirement({ home: commit.home, target: "pi", transactionId: commitId, globalCommit: true });
		expect(existsSync(commit.legacyPath)).toBe(false);
		expect(existsSync(quarantined.recoveryDirectory!)).toBe(false);
	});
});
