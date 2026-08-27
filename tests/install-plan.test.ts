import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createPiInstallHandlers, runInstall } from "../installer/src/cli/install.ts";
import { executeInstallPlan, InstallPlanExecutionError, type InstallPlanExecutionHandlers } from "../installer/src/core/install-executor.ts";
import { createInstallPlan, InstallPlanInputError, InstallPlanValidationError, renderInstallPlan, serializeInstallPlan, type InstallPlanInput, type InstallPlanV1 } from "../installer/src/core/install-plan.ts";
import { derivePiInstallPaths, resolvePiInstallContext } from "../installer/src/core/paths.ts";

const HOME = "/synthetic/home";
const ENTRY_ORACLE = { "shared.dependency.bun": "shared/ensure-dependency/external:selected|external:satisfied", "pi.dependency.pi": "pi/ensure-dependency/external:selected|external:satisfied", "pi.dependency.engram": "pi/ensure-dependency/external:selected|external:conditional|external:satisfied|external:skipped", "pi.dependency.gh": "pi/ensure-dependency/external:conditional|external:satisfied|external:skipped", "pi.dependency.hypa": "pi/ensure-dependency/external:conditional|external:satisfied|external:skipped", "pi.dependency.codegraph": "pi/ensure-dependency/external:conditional|external:satisfied|external:skipped", "pi.migrate-legacy": "pi/migrate/installer:selected|installer:skipped|unknown:blocked", "pi.backup-current": "pi/backup/installer:conditional|unknown:conditional", "pi.deploy-template": "pi/deploy/installer:selected|unknown:selected",
  "pi.configure-packages": "pi/configure/installer:selected|unknown:selected", "pi.configure-secrets": "pi/configure/installer:conditional|installer:skipped", "pi.configure-context7-export": "pi/configure/installer:conditional|installer:skipped", "pi.write-install-marker": "pi/write-marker/installer:selected|unknown:selected", "pi.verify-doctor": "pi/verify/installer:selected|unknown:selected", "pi.deploy-launcher": "pi/deploy/installer:selected|unknown:selected", "pi.promote-commands": "pi/promote-command/installer:conditional|unknown:conditional", "claude.deploy-runtime": "claude/deploy/installer:selected", "claude.deploy-launcher": "claude/deploy/installer:selected", "shared.retire-legacy": "shared/retire-legacy/installer:selected" } as const;

function input(target: InstallPlanInput["target"], patch: Partial<InstallPlanInput> = {}): InstallPlanInput {
  return {
    target,
    home: HOME,
    piAgentDir: join(HOME, ".pi-ein", "agent"),
    piAgentDirExists: false,
    piOwnership: { status: "absent" },
    claudeConfigHome: join(HOME, ".claude-ein"),
    platform: { os: "darwin", arch: "arm64" },
    dependencies: { bun: true, pi: false, engram: false, gh: true, hypa: false, codegraph: false },
    flags: { yes: false, noEngram: false, noSecrets: false, noHypa: false, noCodegraph: false, skipLinear: true },
    ...patch,
  };
}

function fakeHandlers(plan: InstallPlanV1, call: (id: string) => { ok: boolean; detail?: string } = () => ({ ok: true })): InstallPlanExecutionHandlers {
  return Object.fromEntries(plan.inventory.map(({ id }) => [id, () => call(id)])) as InstallPlanExecutionHandlers;
}

describe("managed install plan", () => {
  test("keeps stable target order and shared Bun exactly once", () => {
    const pi = createInstallPlan(input("pi"));
    const claude = createInstallPlan(input("claude"));
    const both = createInstallPlan(input("both"));

    expect(pi.inventory[0]?.id).toBe("shared.dependency.bun");
    expect(pi.inventory.every((entry) => entry.runtime !== "claude")).toBe(true);
    expect(claude.inventory.map((entry) => entry.id)).toEqual([
      "shared.dependency.bun", "claude.deploy-runtime", "claude.deploy-launcher", "shared.retire-legacy",
    ]);
    expect(both.inventory.filter((entry) => entry.id === "shared.dependency.bun")).toHaveLength(1);
    expect(both.inventory.map((entry) => entry.runtime)).toEqual([
      "shared", ...Array(15).fill("pi"), "claude", "claude",
      "shared",
    ]);
    expect(both.inventory.map((entry) => entry.id)).toEqual([
      ...pi.inventory.slice(0, -1).map((entry) => entry.id),
      "claude.deploy-runtime", "claude.deploy-launcher", "shared.retire-legacy",
    ]);
    expect([pi.status, claude.status, both.status]).toEqual(["ready", "ready", "ready"]);
  });

  test("derives synthetic HOME paths, flags, satisfaction, and ownership blockers", () => {
    const plan = createInstallPlan(input("both", {
      piAgentDirExists: true,
      piOwnership: { status: "ambiguous", reason: "unmarked-existing-target" },
      flags: { yes: true, noEngram: true, noSecrets: true, noHypa: true, noCodegraph: true, skipLinear: true },
    }));
    const byId = Object.fromEntries(plan.inventory.map((entry) => [entry.id, entry]));

    expect(byId["pi.migrate-legacy"]).toMatchObject({ state: "blocked", ownership: "unknown", destination: join(HOME, ".pi-ein", "agent") });
    expect(byId["pi.backup-current"]?.state).toBe("conditional");
    expect(byId["pi.dependency.gh"]?.state).toBe("satisfied");
    expect(byId["pi.dependency.engram"]?.state).toBe("skipped");
    expect(byId["pi.configure-secrets"]?.state).toBe("skipped");
    expect(byId["claude.deploy-runtime"]?.destination).toBe(join(HOME, ".claude-ein"));
    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual([{ code: "pi-ownership-ambiguous", reason: "Pi ownership cannot be proven safely" }]);
  });

  test("returns deterministic frozen JSON-safe data without private observations", () => {
    const first = createInstallPlan(input("pi"));
    const second = createInstallPlan(input("pi"));
    const json = serializeInstallPlan(first);

    expect(json).toBe(serializeInstallPlan(second));
    expect(JSON.parse(json)).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.inventory)).toBe(true);
    expect(first.inventory.every(Object.isFrozen)).toBe(true);
    expect(json).not.toMatch(/token|credential|stdout|stderr|commandOutput|private file/i);
    expect(renderInstallPlan(first)).toContain(`[satisfied] ${first.inventory[0]?.id}`);
  });

  test("describes Linear integration with canonical off/on vocabulary", () => {
    for (const [skipLinear, expected] of [[true, "Linear integration off"], [false, "Linear integration on"]] as const) {
      const plan = createInstallPlan(input("pi", { flags: { ...input("pi").flags, skipLinear } }));
      const reason = plan.inventory.find((entry) => entry.id === "pi.deploy-template")?.reason;
      const observablePlan = `${renderInstallPlan(plan)}\n${serializeInstallPlan(plan)}`;

      expect(reason).toContain(expected);
      expect(observablePlan).toContain(expected);
      expect(observablePlan).not.toMatch(/\b(?:solo|team)\b/i);
      expect(observablePlan).not.toContain("skipLinear");
    }
  });

  test("rejects malformed runtime input with bounded non-echoing errors", () => {
    const valid = input("pi");
    const malformed: unknown[] = [
      { ...valid, target: "PRIVATE-target" }, { ...valid, target: 7 }, { ...valid, platform: { os: "win32", arch: "x64" } }, { ...valid, platform: { os: "linux", arch: 7 } },
      { ...valid, home: "relative" }, { ...valid, home: "/synthetic/\u0000private" }, { ...valid, claudeConfigHome: "/synthetic/home/../PRIVATE" },
      { ...valid, dependencies: { ...valid.dependencies, bun: "present" } }, { ...valid, dependencies: { bun: true } }, { ...valid, dependencies: { ...valid.dependencies, extra: true } }, { ...valid, dependencies: [] },
      { ...valid, piOwnership: { status: "ambiguous", reason: "PRIVATE-reason" } }, { ...valid, piOwnership: [] }, { ...valid, flags: { ...valid.flags, extra: false } }, { ...valid, extra: true }, [],
      Object.assign(Object.create({ polluted: true }), valid), { ...valid, dependencies: Object.assign(Object.create({ polluted: true }), valid.dependencies) },
    ];
    for (const value of malformed) {
      try { createInstallPlan(value as InstallPlanInput); throw new Error("accepted malformed input"); }
      catch (error) { expect(error).toBeInstanceOf(InstallPlanInputError); expect(String(error)).toMatch(/invalid-(shape|target|platform|path|dependencies|ownership|flags)$/); expect(String(error)).not.toContain("PRIVATE"); }
    }
  });
});

describe("install dry-run wiring", () => {
  test("renders the canonical plan and never enters real orchestration", async () => {
    const planInput = input("both");
    let rendered: string | undefined;
    let mutationCalls = 0;
    const { target: _target, flags: _flags, platform, ...planObservations } = planInput;
    const observations = {
      ...planObservations,
      platform: { ...platform, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(HOME, ".profile"), home: HOME },
    };

    const code = await runInstall(["--dry-run", "--runtime", "both"], undefined, {
      observations,
      playBanner: async () => {},
      writePlan: (plan) => { rendered = renderInstallPlan(plan); },
    });

    expect(code).toBe(0);
    expect(mutationCalls).toBe(0);
    expect(rendered).toBe(renderInstallPlan(createInstallPlan(planInput)));
    expect(rendered?.indexOf("pi.deploy-template")).toBeLessThan(rendered?.indexOf("claude.deploy-runtime") ?? -1);
  });

  test("returns failure for an ambiguous plan without mutation or private leakage", async () => {
    const blocked = input("pi", { piOwnership: { status: "ambiguous", reason: "unmarked-existing-target" }, piAgentDirExists: true });
    const { target: _target, flags: _flags, platform, ...rest } = blocked;
    let plan; let mutationCalls = 0;
    const code = await runInstall(["--dry-run"], undefined, { observations: { ...rest, platform: { ...platform, distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(HOME, ".profile"), home: HOME } }, playBanner: async () => {}, writePlan: (value) => { plan = value; } });
    const output = renderInstallPlan(plan!);
    expect(code).toBe(1); expect(mutationCalls).toBe(0); expect(output).toContain("BLOCKED"); expect(output.split("\n")[0]).not.toContain("READY"); expect(output).not.toMatch(/PRIVATE|completed/i); expect(serializeInstallPlan(plan!)).not.toContain("PRIVATE");
  });

  test("blocks a real install before every execution handler", async () => {
    const blocked = input("pi", { piOwnership: { status: "ambiguous", reason: "unmarked-existing-target" } });
    const { target: _target, flags: _flags, platform, ...rest } = blocked;
    let calls = 0;
    const code = await runInstall([], undefined, { observations: { ...rest, platform: { ...platform, distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(HOME, ".profile"), home: HOME } }, playBanner: async () => {}, writePlan: () => {}, handlers: fakeHandlers(createInstallPlan(blocked), () => { calls += 1; return { ok: true }; }) });
    expect(code).toBe(1);
    expect(calls).toBe(0);
  });
});

describe("install plan executor", () => {
	test("retires legacy surfaces only after every selected current surface succeeds", async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "ein-install-retirement-")));
		try {
			const source = input("both", {
				home: root,
				piAgentDir: join(root, ".pi-ein", "agent"),
				claudeConfigHome: join(root, ".claude-ein"),
				dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false },
				flags: { yes: true, noEngram: true, noSecrets: true, noHypa: true, noCodegraph: true, skipLinear: true },
			});
			const events: string[] = [];
			const plan = createInstallPlan(source);
			const { target: _target, flags: _flags, platform, ...rest } = source;
			const code = await runInstall(["--yes", "--no-engram", "--no-secrets", "--no-hypa", "--no-codegraph", "--runtime", "both"], undefined, {
				observations: {
					...rest,
					platform: { ...platform, distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(root, ".profile"), home: root },
				},
				playBanner: async () => {},
				handlers: fakeHandlers(plan, (id) => { events.push(id); return { ok: true }; }),
				retireLegacy: (options) => {
					events.push("retire-legacy");
					expect(options).toMatchObject({ home: root, target: "both", validatedCurrentArtifacts: true });
					return { retired: [], collisions: [], absent: [] };
				},
			});
			expect(code).toBe(0);
			expect(events.at(-1)).toBe("retire-legacy");
			expect(events.slice(0, -1)).toEqual(plan.inventory.filter((entry) => (entry.state === "selected" || entry.state === "conditional") && entry.id !== "shared.retire-legacy").map((entry) => entry.id));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

  test("executes Pi, Claude, and Both strictly in executable inventory order", async () => {
    for (const target of ["pi", "claude", "both"] as const) {
      const plan = createInstallPlan(input(target, { dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false } }));
      const calls: string[] = [];
      const result = await executeInstallPlan(plan, fakeHandlers(plan, (id) => { calls.push(id); return { ok: true }; }));
      expect(result.ok).toBe(true);
      expect(calls).toEqual(plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional").map((entry) => entry.id));
      expect(calls.filter((id) => id === "shared.dependency.bun")).toHaveLength(1);
    }
  });

  test("never dispatches satisfied or skipped entries, but dispatches conditional entries", async () => {
    const plan = createInstallPlan(input("pi"));
    const calls: string[] = [];
    await executeInstallPlan(plan, fakeHandlers(plan, (id) => { calls.push(id); return { ok: true }; }));
    expect(calls).toContain("pi.dependency.engram");
    expect(calls).not.toContain("shared.dependency.bun");
    expect(calls).not.toContain("pi.migrate-legacy");
  });

  test("rejects ten forged plans and malformed registries before dispatch", async () => {
    const ready = createInstallPlan(input("pi", { dependencies: { ...input("pi").dependencies, bun: false } }));
    let calls = 0;
    const guarded = fakeHandlers(ready, () => { calls += 1; return { ok: true }; });
    const entries = ready.inventory;
    const forged = [{ ...ready, schemaVersion: 2 }, { ...ready, target: "claude" }, { ...ready, status: "blocked" },
      { ...ready, inventory: [{ ...entries[0]!, runtime: "pi" }, ...entries.slice(1)] }, { ...ready, inventory: [{ ...entries[0]!, action: "deploy" }, ...entries.slice(1)] }, { ...ready, inventory: [entries[1]!, entries[0]!, ...entries.slice(2)] }, { ...ready, inventory: entries.slice(0, -1) },
      { ...ready, inventory: [{ ...entries[0]!, state: "PRIVATE" }, ...entries.slice(1)] }, { ...ready, inventory: [{ ...entries[0]!, extra: true }, ...entries.slice(1)] }, { ...ready, blockers: [{ code: "pi-ownership-ambiguous", reason: "Pi ownership cannot be proven safely" }] }] as unknown as InstallPlanV1[];
    for (const plan of forged) {
      await expect(executeInstallPlan(plan, guarded)).rejects.toBeInstanceOf(InstallPlanValidationError); expect(calls).toBe(0);
    }
    const canonical = createInstallPlan(input("both")), canonicalHandlers = fakeHandlers(canonical, () => { calls += 1; return { ok: true }; });
    for (const [id, encoded] of Object.entries(ENTRY_ORACLE)) {
      const [runtime, action, allowed] = encoded.split("/");
      const index = canonical.inventory.findIndex((entry) => entry.id === id), entry = canonical.inventory[index]!;
      expect([entry.runtime, entry.action, allowed!.split("|").includes(`${entry.ownership}:${entry.state}`)] as unknown[]).toEqual([runtime, action, true]);
      const mutations = [{ runtime: runtime === "shared" ? "pi" : "shared" }, { action: action === "verify" ? "deploy" : "verify" }, { ownership: entry.ownership === "external" ? "installer" : "external" }, { state: id === "pi.migrate-legacy" ? "conditional" : "blocked" }];
      for (const mutation of mutations) { const inventory = [...canonical.inventory]; inventory[index] = { ...entry, ...mutation } as never; await expect(executeInstallPlan({ ...canonical, inventory } as InstallPlanV1, canonicalHandlers)).rejects.toBeInstanceOf(InstallPlanValidationError); expect(calls).toBe(0); }
    }
    const missing = Object.fromEntries(Object.entries(guarded).slice(1)), extra = { ...guarded, private: () => ({ ok: true }) }, nonFunction = { ...guarded, [entries[0]!.id]: "PRIVATE" };
    let getterCalls = 0, trapCalls = 0; const getter = { ...guarded }, setter = { ...guarded }, hidden = { ...guarded }, custom = Object.assign(Object.create({ inherited: true }), guarded), proxy = new Proxy({ ...guarded }, { get(target, key, receiver) { trapCalls += 1; return Reflect.get(target, key, receiver); }, ownKeys(target) { trapCalls += 1; return Reflect.ownKeys(target); }, getPrototypeOf(target) { trapCalls += 1; return Reflect.getPrototypeOf(target); } }), revoked = Proxy.revocable({ ...guarded }, {}); revoked.revoke();
    Object.defineProperty(getter, entries[0]!.id, { enumerable: true, get() { getterCalls += 1; return () => ({ ok: true }); } }); Object.defineProperty(setter, entries[0]!.id, { enumerable: true, set(_value) { getterCalls += 1; } }); Object.defineProperty(hidden, entries[0]!.id, { enumerable: false, value: () => ({ ok: true }) });
    for (const handlers of [missing, extra, nonFunction, Object.create(guarded), getter, setter, hidden, custom, proxy, revoked.proxy]) {
      await expect(executeInstallPlan(ready, handlers as InstallPlanExecutionHandlers)).rejects.toBeInstanceOf(InstallPlanExecutionError); expect(calls).toBe(0);
    }
    expect([getterCalls, trapCalls]).toEqual([0, 0]);
  });

  test("fault injection stops the failed runtime at every executable boundary", async () => {
    const plan = createInstallPlan(input("both", { dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false } }));
    const executable = plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional");
    for (const failed of executable) {
      const calls: string[] = [];
      const result = await executeInstallPlan(plan, fakeHandlers(plan, (id) => { calls.push(id); return id === failed.id ? { ok: false, detail: "fault" } : { ok: true }; }));
      expect(result.ok).toBe(false);
      const laterSameRuntime = executable.slice(executable.indexOf(failed) + 1).filter((entry) => entry.runtime === failed.runtime);
      expect(laterSameRuntime.every((entry) => !calls.includes(entry.id))).toBe(true);
      if (failed.runtime === "pi") expect(calls).toContain("claude.deploy-runtime");
      if (failed.runtime === "shared" && failed.id !== "shared.retire-legacy") expect(calls).toEqual([failed.id]);
    }
  });

  test("bounds returned and thrown private failures at shared, Pi, and Claude boundaries", async () => {
    const plan = createInstallPlan(input("both", { dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false } }));
    for (const [id, runtime, detail] of [["shared.dependency.bun", "shared", "Bun no disponible: shared.dependency.bun"], ["pi.dependency.pi", "pi", "Pi installation failed at pi.dependency.pi"], ["claude.deploy-runtime", "claude", "Claude Code installation failed at claude.deploy-runtime"]] as const) {
      for (const throws of [false, true]) {
        const result = await executeInstallPlan(plan, fakeHandlers(plan, (entry) => { if (entry !== id) return { ok: true, detail: "PRIVATE-success" }; if (throws) throw new Error("PRIVATE-secret-path-stdout"); return { ok: false, detail: "PRIVATE-secret-path-stdout" }; }));
        expect(result.failures[runtime]).toBe(detail); expect(JSON.stringify(result)).not.toContain("PRIVATE");
      }
    }
  });

  test("real wiring consumes one frozen snapshot even if observations change during execution", async () => {
    const testHome = mkdtempSync(join(realpathSync(tmpdir()), "ein-plan-wiring-"));
    const source = input("both", { home: testHome, piAgentDir: join(testHome, ".pi-ein", "agent"), claudeConfigHome: join(testHome, ".claude-ein"), dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, flags: { yes: true, noEngram: false, noSecrets: true, noHypa: false, noCodegraph: false, skipLinear: true } });
    const { target: _target, flags: _flags, platform, ...rest } = source;
    const observations = { ...rest, dependencies: { ...rest.dependencies }, platform: { ...platform, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(HOME, ".profile"), home: HOME } };
    const calls: string[] = [];
    const expected = createInstallPlan(source), code = await runInstall(["--yes", "--runtime", "both", "--no-secrets"], undefined, { observations, playBanner: async () => {}, handlers: fakeHandlers(expected, (id) => { calls.push(id); observations.dependencies.bun = true; observations.piOwnership = { status: "ambiguous", reason: "unmarked-existing-target" }; return { ok: true }; }) });
    expect(code).toBe(0);
    expect(calls).toEqual(createInstallPlan(source).inventory.filter((entry) => (entry.state === "selected" || entry.state === "conditional") && entry.id !== "shared.retire-legacy").map((entry) => entry.id));
    rmSync(testHome, { recursive: true, force: true });
  });

  test("Pi plan handlers retain deploy, packages, doctor, launcher, and promotion capabilities", async () => {
    const source = input("pi", { dependencies: { bun: true, pi: true, engram: true, gh: true, hypa: true, codegraph: true }, flags: { yes: true, noEngram: true, noSecrets: true, noHypa: true, noCodegraph: true, skipLinear: true } });
    const plan = createInstallPlan(source);
    const context = resolvePiInstallContext(derivePiInstallPaths(HOME));
    const calls: string[] = []; let spinnerStarts = 0, spinnerStops = 0;
    let promoteOptions: { binDir: string; selfPath: string; appArtifact: string } | undefined;
    const pi = createPiInstallHandlers({ platform: { os: "darwin", arch: "arm64", distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(HOME, ".profile"), home: HOME }, flags: { yes: true, noEngram: true, noSecrets: true, noLinear: true, noHypa: true, noCodegraph: true, dryRun: false, runtime: "pi" }, skipLinear: true, deps: Object.keys(source.dependencies).map((id) => ({ id: id as "bun", present: true, path: null, required: id === "bun" || id === "pi", hint: "fake" })), agentDir: context.agentDir, effects: {
      resolveContext: () => context, exists: () => true, spinner: () => ({ start: () => { spinnerStarts += 1; }, stop: () => { spinnerStops += 1; }, message: () => {} }), backup: async () => { calls.push("backup"); return { path: "backup", deduped: false, pruned: [] }; }, deploy: async () => { calls.push("deploy"); return { agentDir: context.agentDir, engramCommand: "engram", engramFound: true }; }, packages: async () => { calls.push("packages"); return { ok: true, detail: "ok" }; }, writePreference: () => ({ status: "explicit", channel: "stable" }), readPreference: () => ({ status: "explicit", channel: "stable" }), marker: () => { calls.push("marker"); return { version: "test", installedAt: "2026-01-01T00:00:00.000Z", channel: "stable" }; }, check: () => [], doctor: () => { calls.push("doctor"); return { groups: [], fail: 0, warn: 0, total: 0, result: "OK" }; }, launcher: () => { calls.push("launcher"); return { path: join(HOME, "ein-pi.fish"), changed: false }; }, promote: (options) => { calls.push("promote"); promoteOptions = options; return { installer: { path: "ein-install", written: false }, app: { path: "ein", written: true } }; },
    } });
    const handlers = { ...fakeHandlers(plan), ...pi.handlers };
    // El ejecutor captura cualquier throw del handler, asi que una asercion
    // dentro del efecto se degrada a un `ok:false` sin causa. Se afirma fuera.
    const execution = await executeInstallPlan(plan, handlers);
    expect(execution.failures).toEqual({});
    expect(execution.ok).toBe(true);
    expect(promoteOptions?.appArtifact).toBe(join(context.agentDir, "bin", "ein"));
    expect(promoteOptions?.binDir).toBe(context.localBinDir);
    // El spinner inyectado era efecto MUERTO: los handlers llamaban a
    // `p.spinner()` directo, así que un test no podía silenciar el de verdad ni
    // saber qué paso estaba corriendo. Ahora `deploy` y `packages` lo usan —uno
    // cada uno— y por eso la pantalla del avance puede alimentar su fila viva.
    expect(calls).toEqual(["backup", "deploy", "packages", "marker", "doctor", "launcher", "promote"]); expect([spinnerStarts, spinnerStops]).toEqual([2, 2]);
    expect(pi.detail()).toBe("Ein listo. Ejecuta `ein`.");
    calls.length = 0; const base = { platform: { ...source.platform, distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(HOME, ".profile"), home: HOME }, flags: { ...source.flags, noLinear: true, dryRun: false, runtime: "pi" }, skipLinear: true, deps: [], agentDir: context.agentDir } as Parameters<typeof createPiInstallHandlers>[0];
    const missing = createPiInstallHandlers({ ...base, effects: { resolveContext: () => context, promote: () => ({ installer: { path: "ein-install", written: true }, app: { path: "ein", written: false, reason: "app-artifact-missing" } }) } });
    expect(await missing.handlers["pi.promote-commands"]()).toEqual({ ok: false, detail: "app-artifact-missing" });
    const packageFailure = createPiInstallHandlers({ ...base, effects: { resolveContext: () => context, spinner: () => ({ start: () => {}, stop: () => {}, message: () => {} }), packages: async () => ({ ok: false, detail: "falló el pin" }) } });
    expect(await packageFailure.handlers["pi.configure-packages"]()).toEqual({ ok: false, detail: "falló el pin" });
    const absent = createPiInstallHandlers({ ...base, effects: { resolveContext: () => context, exists: () => false, spinner: () => ({ start: () => { spinnerStarts += 1; }, stop: () => { spinnerStops += 1; }, message: () => {} }), backup: async () => { calls.push("backup"); return { path: null, deduped: false, pruned: [] }; }, deploy: async () => { calls.push("deploy"); return { agentDir: context.agentDir, engramCommand: "engram", engramFound: true }; } } });
    // Sin backup que hacer, `pi.backup-current` sale antes de pedir spinner: el
    // único que gira aquí es el del deploy. Los contadores son ACUMULADOS — no
    // se reinician entre bloques —, así que a los dos de arriba se les suma uno.
    await absent.handlers["pi.backup-current"](); await absent.handlers["pi.deploy-template"](); expect(calls).toEqual(["deploy"]); expect([spinnerStarts, spinnerStops]).toEqual([3, 3]);
    for (const mode of ["returned", "thrown"] as const) { const lifecycle: string[] = [], failing = createPiInstallHandlers({ ...base, effects: { resolveContext: () => context, exists: () => true, spinner: () => { lifecycle.push("spinner"); return { start: () => {}, stop: () => {}, message: () => {} }; }, backup: async () => { lifecycle.push("backup"); if (mode === "thrown") throw new Error("PRIVATE"); return { ok: false } as never; }, deploy: async () => { lifecycle.push("deploy"); return { agentDir: context.agentDir, engramCommand: "engram", engramFound: true }; } } }); const result = await executeInstallPlan(plan, { ...fakeHandlers(plan), ...failing.handlers }); expect(result.failures.pi).toBe("Pi installation failed at pi.backup-current"); expect(lifecycle).toEqual(["backup"]); }
  });
});
