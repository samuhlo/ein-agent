import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInstall } from "../installer/src/cli/install.ts";
import { executeInstallPlanJournaled } from "../installer/src/core/install-journal.ts";
import type { InstallPlanExecutionHandlers } from "../installer/src/core/install-executor.ts";
import { createInstallPlan, type InstallPlanInput, type InstallPlanV1 } from "../installer/src/core/install-plan.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const home = (): string => { const value = mkdtempSync(join(realpathSync(tmpdir()), "ein-install-reentry-")); roots.push(value); return value; };

function plan(target: InstallPlanInput["target"], root: string): InstallPlanV1 {
	return createInstallPlan({ target, home: root, piAgentDir: join(root, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership: { status: "absent" }, claudeConfigHome: join(root, ".claude-ein"), platform: { os: "darwin", arch: "arm64" }, dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, flags: { yes: true, noEngram: false, noSecrets: true, noHypa: false, noCodegraph: false, skipLinear: true } });
}
const handlers = (value: InstallPlanV1, call: (id: string) => { ok: boolean } = () => ({ ok: true })): InstallPlanExecutionHandlers =>
	Object.fromEntries(value.inventory.map(({ id }) => [id, () => call(id)])) as InstallPlanExecutionHandlers;
const observationsFor = (root: string) => ({ home: root, piAgentDir: join(root, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership: { status: "absent" } as const, claudeConfigHome: join(root, ".claude-ein"), dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, platform: { os: "darwin" as const, arch: "arm64" as const, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(root, ".profile"), home: root } });

describe("install re-entry over a completed journal", () => {
	// Un diario COMPLETO de otro objetivo describe una instalación anterior
	// terminada, no un estado a recuperar. Bloquearlo dejaba sin salida a quien
	// tenía Pi instalado y quería añadir Claude.
	test("a completed journal for another target does not block a new install", async () => {
		const root = home();
		const done = plan("pi", root);
		await executeInstallPlanJournaled(done, handlers(done));

		const errors: string[] = [], originalError = console.error;
		let executed = 0;
		console.error = (...parts: unknown[]) => { errors.push(parts.join(" ")); };
		try {
			const code = await runInstall(["--yes", "--no-secrets", "--runtime", "both"], undefined, {
				observations: observationsFor(root),
				playBanner: async () => {},
				handlers: handlers(plan("both", root), () => { executed += 1; return { ok: true }; }),
			});
			expect(code).toBe(0);
		} finally { console.error = originalError; }

		expect(errors).toEqual([]);
		expect(executed).toBeGreaterThan(0);
	});

	// El recibo de "ya está instalado" se construía y se descartaba: la orden
	// salía con código 0 y sin una sola línea, indistinguible de un binario roto.
	test("the idempotent re-entry reports instead of exiting silently", async () => {
		const root = home();
		const done = plan("pi", root);
		await executeInstallPlanJournaled(done, handlers(done));

		const lines: string[] = [], originalWrite = process.stdout.write.bind(process.stdout);
		let executed = 0;
		process.stdout.write = ((chunk: string | Uint8Array) => { lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)); return true; }) as typeof process.stdout.write;
		try {
			const code = await runInstall(["--yes", "--no-secrets", "--runtime", "pi"], undefined, {
				observations: observationsFor(root),
				playBanner: async () => {},
				handlers: handlers(done, () => { executed += 1; return { ok: true }; }),
			});
			expect(code).toBe(0);
		} finally { process.stdout.write = originalWrite; }

		expect(executed).toBe(0);
		expect(lines.join("\n")).toContain("already complete");
	});
});
