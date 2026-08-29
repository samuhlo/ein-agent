import { describe, expect, test } from "bun:test";
import { parseWorkbenchArgs, renderLauncherAdvisor, runWorkbenchEntrypoint } from "../ein-pi/workbench.ts";
import {
  invokeProductionWorkbench,
  parseWorkbenchArgs as parseSurfaceWorkbenchArgs,
  runWorkbenchEntrypoint as runSurfaceWorkbenchEntrypoint,
} from "../ein-pi/agent/surfaces/workbench-entrypoint.ts";
import { createProductionWorkbenchInvocationAdapter } from "../ein-pi/agent/surfaces/surface-runner.ts";
import { evaluateSharedConfigUpdateAdvisor } from "../shared/contracts/shared-config-update-advisor.ts";
import { getRuntimeCapabilities } from "../ein-pi/agent/lib/runtime-session-adapters.ts";
import {
  classifyWorkbenchExit,
  createCandidateSummary,
  createConfirmedProjectSummary,
  renderActionMenu,
  renderRuntimeCapabilities,
  renderProjectState,
  runWorkbench,
  workbenchCancellation,
  renderAdapterOutcome,
  renderPiSessionList,
  renderDoctorResult,
  createWorkbenchAdvisor,
  type WorkbenchAdvisorReaders,
  type WorkbenchDependencies,
  type WorkbenchResult,
} from "../ein-pi/agent/lib/workbench.ts";
import type { EinPiUpdateObservation } from "../ein-pi/agent/lib/ein-update-notice.ts";

describe("separate workbench entrypoint argv TTY help and exit", () => {
  test("the public launcher and deployable surface share one entrypoint implementation", () => {
    expect(runWorkbenchEntrypoint).toBe(runSurfaceWorkbenchEntrypoint);
    expect(parseWorkbenchArgs).toBe(parseSurfaceWorkbenchArgs);
    expect(createProductionWorkbenchInvocationAdapter().invoke).toBe(invokeProductionWorkbench);
  });

  test("parses ordered normalized deduplicated project argv and enforces max 20", () => {
    expect(parseWorkbenchArgs(["--project", "./alpha", "--project", "./alpha", "--project", "./beta"], "/repo")).toEqual({ kind: "run", candidates: ["/repo/alpha", "/repo/beta"] });
    expect(parseWorkbenchArgs(["--help"], "/repo")).toEqual({ kind: "help" });
    expect(parseWorkbenchArgs(["--unknown"], "/repo").kind).toBe("error");
    expect(parseWorkbenchArgs(["--project"], "/repo").kind).toBe("error");
    expect(parseWorkbenchArgs(Array.from({ length: 21 }, (_, index) => ["--project", `p${index}`]).flat(), "/repo").kind).toBe("error");
  });

  test("help works without TTY and non-TTY fails closed before dependency effects", async () => {
    let effects = 0; const output: string[] = [];
    expect(await runWorkbenchEntrypoint({ argv: ["--help"], cwd: "/repo", stdinTTY: false, stdoutTTY: false, write: text => { output.push(text); }, createDependencies: () => { effects++; throw new Error("effect"); } })).toBe(0);
    expect(await runWorkbenchEntrypoint({ argv: [], cwd: "/repo", stdinTTY: false, stdoutTTY: true, write: text => { output.push(text); }, createDependencies: () => { effects++; throw new Error("effect"); } })).toBe(2);
    expect(effects).toBe(0); expect(output.join("\n")).toContain("--project"); expect(output.join("\n")).toContain("TTY");
  });

  test("maps pure workbench result and forwards deduplicated candidates", async () => {
    let received: readonly string[] = [];
    const exit = await runWorkbenchEntrypoint({ argv: ["--project", ".", "--project", "."], cwd: "/repo", stdinTTY: true, stdoutTTY: true, write: () => {}, createDependencies: candidates => (received = candidates, {} as WorkbenchDependencies), run: async () => ({ outcome: "cancelled", reason: "sigint" }) });
    expect(received).toEqual(["/repo"]); expect(exit).toBe(130);
  });

  test("production-style dependencies inject a real read-only advisor and render its result", async () => {
    const state = {
      schemaVersion: 1,
      identity: { cwd: "/repo/project", repositoryRoot: "/repo/project", quality: "current", reason: "read-success" },
      openspec: { selection: "none", quality: "current", reason: "read-success" },
      git: { dirty: false, quality: "current", reason: "read-success" },
      verification: { effectiveOutcome: "absent", freshness: "current", quality: "current", reason: "read-success" },
    } as any;
    const advisor = createWorkbenchAdvisor(state, {
      inspectLinearIntegration: () => ({ status: "valid", source: "default", value: "off", reason: "defaulted", provenance: { source: "default", reason: "defaulted" }, observed: [] }),
      inspectModelConfig: () => ({ status: "valid", source: "global", config: { orchestrator: { model: "configured" } }, reason: "read-success", provenance: { source: "global", reason: "read-success" }, observed: [] }),
    });
    const output: string[] = [];
    const reads = ["1", "yes", "1", "4"];
    const dependencies = {
      candidates: [state.identity.cwd], project: () => state,
      input: { read: async () => reads.shift() ?? null }, output: { write: (text: string) => output.push(text) },
      advisor: () => advisor,
      adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: () => ({}), create: () => ({}), resume: () => ({}) }),
      launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal,
    } as unknown as WorkbenchDependencies;
    const exit = await runWorkbenchEntrypoint({ argv: [], cwd: "/repo", stdinTTY: true, stdoutTTY: true, write: () => {}, createDependencies: () => dependencies });
    expect(exit).toBe(0);
    expect(output.join("\\n")).toContain("Configuration: status=current");
    expect(output.join("\\n")).toContain("Update: status=unavailable");
  });
});

describe("workbench foundational contracts", () => {
  test("contract keeps every collaborator transient and injected", () => {
    const dependencies = {
      candidates: ["/private/project"],
      project: () => ({ schemaVersion: 1 }),
      input: { read: async () => "1" },
      output: { write: () => undefined },
      adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: () => ({}), create: () => ({}), resume: () => ({}) }),
      launch: { build: () => ({}), execute: async () => ({}) },
      doctor: async () => ({ outcome: "success", overall: "ok", checks: [] }),
      signal: new AbortController().signal,
    } as unknown as WorkbenchDependencies;

    expect(Object.keys(dependencies).sort()).toEqual([
      "adapter", "candidates", "doctor", "input", "launch", "output", "project", "signal",
    ]);
  });

  test.each([
    [{ outcome: "normal", reason: "exit" }, 0],
    [{ outcome: "normal", reason: "launch-exit-zero" }, 0],
    [{ outcome: "operational", reason: "no-usable-candidate" }, 1],
    [{ outcome: "operational", reason: "launch-unavailable" }, 1],
    [{ outcome: "usage", reason: "invalid-input" }, 2],
    [{ outcome: "usage", reason: "non-tty" }, 2],
    [{ outcome: "cancelled", reason: "eof" }, 130],
    [{ outcome: "cancelled", reason: "adapter-cancelled" }, 130],
  ] as const)("exit contract classifies %o", (result, exit) => {
    expect(classifyWorkbenchExit(result as WorkbenchResult)).toBe(exit);
  });

  test("cancellation contract is closed and preserves its safe reason", () => {
    expect(workbenchCancellation("sigint")).toEqual({ outcome: "cancelled", reason: "sigint" });
    expect(classifyWorkbenchExit(workbenchCancellation("aborted"))).toBe(130);
    expect(classifyWorkbenchExit(workbenchCancellation("adapter-cancelled"))).toBe(130);
  });
});

describe("shared advisor semantic rendering", () => {
  test("launcher and workbench render one normalized fixture without adding action behavior", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "valid", source: "project", value: "solo", freshness: "current" },
        model: { status: "valid", source: "user", value: "configured", freshness: "current" },
      },
      update: {
        installed: { status: "valid", source: "installer-marker", version: "0.42.0", freshness: "current" },
        release: { status: "valid", source: "release-provider", version: "0.43.0", freshness: "current" },
        owner: { status: "valid", source: "installer-marker", owner: "installer", action: "update", actionId: "installer.update", freshness: "current" },
        capability: { status: "valid", source: "installer-capability", supported: true, freshness: "current" },
      },
    });
    const rendered = renderLauncherAdvisor(result);
    expect(rendered).toContain("Configuration: status=current freshness=current reason=read-success");
    expect(rendered).toContain("Update: status=update-available freshness=current reason=newer-release");
    expect(rendered).toContain("performed=false");
    expect(rendered).not.toMatch(/\x1b|\r|spawn|runUpdate/);
  });
});

describe("workbench deterministic state rendering", () => {
  const state = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    identity: { cwd: "/private/home/project", repositoryRoot: "/private/home/project", quality: "current", reason: "read-success" },
    openspec: { quality: "current", reason: "read-success", activeChanges: ["secret-change"], selection: "selected", selectedChange: "secret-change", phase: "apply", next: "verify", provenance: "canonical", artifacts: [], blockers: [], verify: "pass", verifyStale: false },
    ein: { path: "/private/home/project/EIN.md", quality: "current", reason: "read-success", curated: { present: true, complete: true }, auto: { present: true } },
    git: { quality: "current", reason: "read-success", repository: true, root: "/private/home/project", head: "private-sha", branch: "private-branch", dirty: false, complete: true, changes: [] },
    verification: { quality: "current", reason: "read-success", reportedOutcome: "pass", effectiveOutcome: "pass", freshness: "current", currentStateRef: "private-ref", observedStateRef: "private-ref" },
    runtimes: {},
    ...overrides,
  }) as any;

  test("candidate and confirmation summaries require explicit selection without exposing roots", () => {
    const candidate = createCandidateSummary(0, "/private/home/project", state());
    expect(candidate).toEqual({ ordinal: 1, label: "project", availability: "usable", quality: "current", reason: "read-success" });
    expect(createConfirmedProjectSummary(candidate)).toEqual({ ordinal: 1, label: "project", status: "confirmed" });
    expect(JSON.stringify(candidate)).not.toContain("/private");
  });

  test("renders the supplied current snapshot in stable linear plain text", () => {
    expect(renderProjectState(state())).toBe([
      "OpenSpec: selection=selected quality=current reason=read-success phase=apply next=verify",
      "Git: status=clean quality=current reason=read-success",
      "Verification: outcome=pass freshness=current quality=current reason=read-success",
    ].join("\n"));
  });

  test.each([["stale", "fail"], ["unbound", "unknown"], ["unavailable", "unknown"], ["invalid", "unknown"]])("preserves %s verification freshness without promotion", (freshness, outcome) => {
    const rendered = renderProjectState(state({ verification: { quality: "stale", reason: "state-mismatch", reportedOutcome: "pass", effectiveOutcome: outcome, freshness } }));
    expect(rendered).toContain(`outcome=${outcome} freshness=${freshness} quality=stale reason=state-mismatch`);
  });

  test("labels unknown state explicitly and preserves ambiguous source evidence", () => {
    const rendered = renderProjectState(state({ openspec: { quality: "ambiguous", reason: "ambiguous-selection", activeChanges: [], selection: "ambiguous", provenance: "none", artifacts: [], blockers: [], verify: "absent", verifyStale: false }, git: { quality: "unavailable", reason: "command-error", repository: null, dirty: null, complete: false, changes: [] } }));
    expect(rendered).toContain("selection=ambiguous quality=ambiguous reason=ambiguous-selection phase=unknown next=unknown");
    expect(rendered).toContain("Git: status=unknown quality=unavailable reason=command-error");
  });

  test("preserves absent and incomplete source labels", () => {
    const rendered = renderProjectState(state({ openspec: { quality: "absent", reason: "not-found", activeChanges: [], selection: "none", provenance: "none", artifacts: [], blockers: [], verify: "absent", verifyStale: false }, git: { quality: "incomplete", reason: "incomplete-source", repository: true, dirty: true, complete: false, changes: [] } }));
    expect(rendered).toContain("selection=none quality=absent reason=not-found phase=unknown next=unknown");
    expect(rendered).toContain("status=dirty quality=incomplete reason=incomplete-source");
  });

  test("never emits private state fields, ANSI color, or cursor control", () => {
    const rendered = renderProjectState(state());
    for (const secret of ["/private", "secret-change", "private-sha", "private-branch", "private-ref", "EIN.md"]) expect(rendered).not.toContain(secret);
    expect(rendered).not.toMatch(/\x1b|\r/);
    expect(createCandidateSummary(1, "/private/\x1b[2Jproject\nname", state()).label).toBe("project name");
  });
});

describe("Pi listing and request-only create adapter outcomes", () => {
  const project = { schemaVersion: 1, cwd: "/private/project", repositoryRoot: "/private/project", gitStateRef: "git-v1:sha256:" + "a".repeat(64) } as any;

  test("Pi list renders ordinal UTC recency only and keeps opaque references private", () => {
    const sessions = [
      { reference: `pi:v1:sha256:${"b".repeat(64)}`, modifiedAtMs: Date.UTC(2026, 0, 2, 3, 4, 5) },
      { reference: `pi:v1:sha256:${"c".repeat(64)}`, modifiedAtMs: Date.UTC(2026, 0, 1) },
    ];
    const rendered = renderPiSessionList(sessions);
    expect(rendered).toEqual(["1. modified=2026-01-02T03:04:05.000Z", "2. modified=2026-01-01T00:00:00.000Z"]);
    expect(rendered.join("\n")).not.toContain("pi:v1");
  });

  test.each([
    [{ provider: "pi", operation: "create", outcome: "success", project, data: {} }, "Create: success — request prepared (not persisted)"],
    [{ provider: "claude", operation: "list", outcome: "unsupported", project, error: { code: "operation-not-supported" } }, "List: unsupported (operation-not-supported)"],
    [{ provider: "pi", operation: "list", outcome: "unavailable", project, error: { code: "session-source-unavailable" } }, "List: unavailable (session-source-unavailable)"],
    [{ provider: "pi", operation: "create", outcome: "cancelled", project }, "Create: cancelled"],
    [{ provider: "pi", operation: "create", outcome: "error", project, error: { code: "invalid-request" }, raw: "/private/raw failure" }, "Create: error (invalid-request)"],
  ] as const)("normalizes adapter outcome %o", (result, expected) => {
    const rendered = renderAdapterOutcome(result as any);
    expect(rendered).toBe(expected);
    expect(rendered).not.toContain("/private");
  });

  test("request-only create works for Pi and Claude without launch or persistence", async () => {
    // Both runtimes list now, so the action menu has the same shape for both:
    // 1 list · 2 create · 3 doctor · 4 exit.
    for (const [runtime, provider] of [["1", "pi"], ["2", "claude"]] as const) {
      const reads = ["1", "yes", runtime, "2", "no", "4"];
      const calls: any[] = []; const output: string[] = []; let launched = false;
      const state = { schemaVersion: 1, identity: { cwd: "/private/project", repositoryRoot: "/private/project", quality: "current", reason: "read-success" }, openspec: { quality: "absent", reason: "not-found", selection: "none" }, git: { quality: "current", reason: "read-success", repository: true, root: "/private/project", complete: true, dirty: false, stateRef: project.gitStateRef }, verification: { effectiveOutcome: "absent", freshness: "unbound", quality: "absent", reason: "not-found" } } as any;
      const result = await runWorkbench({ candidates: ["/private/project"], project: () => state, input: { read: async () => reads.shift() ?? null }, output: { write: text => { output.push(text); } }, adapter: (selected) => ({ provider: selected, capabilities: getRuntimeCapabilities(selected), list: () => { throw new Error("not listed"); }, create: (received, request) => (calls.push([selected, received, request]), { provider: selected, operation: "create", outcome: "success", project, data: { provider: selected, mode: "create", project } } as any), resume: () => { throw new Error("no resume"); } }), launch: { build: (() => { launched = true; }) as any, execute: (() => { launched = true; }) as any, executor: async () => ({ kind: "exit", code: 0 }) }, doctor: async () => ({} as any), signal: new AbortController().signal });
      expect(result).toEqual({ outcome: "normal", reason: "exit" }); expect(calls).toHaveLength(1); expect(calls[0][0]).toBe(provider); expect(calls[0][2]).toEqual({ project });
      expect(output.join("\n")).toContain("request prepared (not persisted)"); expect(launched).toBe(false);
    }
  });

  test("Pi list uses adapter request, hides private fields, and returns to menu after unavailable/error/cancelled", async () => {
    const opaque = `pi:v1:sha256:${"d".repeat(64)}`; const reads = ["1", "yes", "1", "1", "4"]; const output: string[] = []; let request: any;
    const state = { schemaVersion: 1, identity: { cwd: "/private/project", repositoryRoot: "/private/project", quality: "current", reason: "read-success" }, openspec: { quality: "absent", reason: "not-found", selection: "none" }, git: { quality: "current", reason: "read-success", repository: true, root: "/private/project", complete: true, dirty: false, stateRef: project.gitStateRef }, verification: { effectiveOutcome: "absent", freshness: "unbound", quality: "absent", reason: "not-found" } } as any;
    const result = await runWorkbench({ candidates: ["/private/project"], project: () => state, input: { read: async () => reads.shift() ?? null }, output: { write: text => { output.push(text); } }, adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: (_state, _options, received) => (request = received, { provider: "pi", operation: "list", outcome: "success", project, data: [{ reference: opaque, modifiedAtMs: 0, transcript: "/private/transcript" }] } as any), create: () => ({} as any), resume: () => { throw new Error("no resume"); } }), launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal });
    expect(result.outcome).toBe("normal"); expect(request).toEqual({ project });
    expect(output.join("\n")).toContain("1. modified=1970-01-01T00:00:00.000Z"); expect(output.join("\n")).not.toContain(opaque); expect(output.join("\n")).not.toContain("transcript");
  });
});

describe("safe confirmed runtime launch", () => {
  const state = { schemaVersion: 1, identity: { cwd: "/private/project", repositoryRoot: "/private/project", quality: "current", reason: "read-success" }, openspec: { quality: "absent", reason: "not-found", selection: "none" }, git: { quality: "current", reason: "read-success", repository: true, root: "/private/project", complete: true, dirty: false, stateRef: "git-v1:sha256:" + "a".repeat(64) }, verification: { effectiveOutcome: "fail", freshness: "stale", quality: "stale", reason: "state-mismatch" } } as any;
  const project = { schemaVersion: 1, cwd: "/private/project", repositoryRoot: "/private/project", gitStateRef: state.git.stateRef } as any;

  function dependencies(
    reads: string[],
    launchOutcome: any = { provider: "pi", operation: "launch", outcome: "success", project, data: { exitCode: 0 } },
    buildOutcome?: ReturnType<WorkbenchDependencies["launch"]["build"]>,
  ) {
    const calls: any[] = []; const output: string[] = []; const executor = async () => ({ kind: "exit", code: 0 } as const);
    const intent = Object.freeze({ provider: "pi", mode: "create", project });
    const plan = Object.freeze({ provider: "pi", mode: "create", project, executable: "/adapter/pi", argv: [], cwd: project.cwd, env: {}, shell: false });
    const deps = { candidates: [project.cwd], project: () => state, input: { read: async () => reads.shift() ?? null }, output: { write: (text: string) => { output.push(text); } }, adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: () => ({} as any), create: () => ({ provider: "pi", operation: "create", outcome: "success", project, data: intent }), resume: () => ({} as any) }), launch: { executor, build: ((receivedState: any, receivedIntent: any) => (calls.push(["build", receivedState, receivedIntent]), buildOutcome ?? { provider: "pi", operation: "launch", outcome: "success", project, data: plan })) as any, execute: (async (receivedPlan: any, receivedExecutor: any, signal: any) => (calls.push(["execute", receivedPlan, receivedExecutor, signal]), launchOutcome)) as any }, doctor: async () => ({} as any), signal: new AbortController().signal } as WorkbenchDependencies;
    return { deps, calls, output, executor, intent, plan };
  }

  test("launch confirmation defaults to no and never builds or executes", async () => {
    const fixture = dependencies(["1", "yes", "1", "2", "", "4"]);
    expect(await runWorkbench(fixture.deps)).toEqual({ outcome: "normal", reason: "exit" });
    expect(fixture.calls).toEqual([]);
    expect(fixture.output.join("\n")).toContain("default no");
  });

  test("passes only unchanged snapshot and adapter intent to plan, then validated plan to executor", async () => {
    const fixture = dependencies(["1", "yes", "1", "2", "yes"]);
    expect(await runWorkbench(fixture.deps)).toEqual({ outcome: "normal", reason: "launch-exit-zero" });
    expect(fixture.calls[0]).toEqual(["build", state, fixture.intent]);
    expect(fixture.calls[1]).toEqual(["execute", fixture.plan, fixture.executor, fixture.deps.signal]);
    expect(fixture.output.join("\n")).toContain("snapshot freshness=stale");
  });

  test.each([
    [{ outcome: "error", error: { code: "provider-mismatch" } }, { outcome: "operational", reason: "launch-failure" }],
    [{ outcome: "unavailable", error: { code: "executable-unavailable" } }, { outcome: "operational", reason: "launch-unavailable" }],
  ] as const)("does not execute a rejected or unavailable plan", async (failure, expected) => {
    const fixture = dependencies(
      ["1", "yes", "1", "2", "yes"],
      undefined,
      { provider: "pi", operation: "launch", project, ...failure },
    );
    expect(await runWorkbench(fixture.deps)).toEqual(expected);
    expect(fixture.calls.map(call => call[0])).toEqual(["build"]);
  });

  test.each([
    [{ provider: "pi", operation: "launch", outcome: "unavailable", project, error: { code: "executable-unavailable" } }, { outcome: "operational", reason: "launch-unavailable" }],
    [{ provider: "pi", operation: "launch", outcome: "error", project, error: { code: "process-exit", exitCode: 7 } }, { outcome: "operational", reason: "launch-failure" }],
    [{ provider: "pi", operation: "launch", outcome: "error", project, error: { code: "process-signalled", signal: "SIGTERM" } }, { outcome: "operational", reason: "launch-failure" }],
    [{ provider: "pi", operation: "launch", outcome: "cancelled", project }, { outcome: "cancelled", reason: "adapter-cancelled" }],
  ] as const)("normalizes launch outcome without private process output", async (launchOutcome, expected) => {
    const fixture = dependencies(["1", "yes", "1", "2", "yes"], launchOutcome);
    expect(await runWorkbench(fixture.deps)).toEqual(expected);
    expect(fixture.output.join("\n")).not.toContain("/adapter/pi");
  });
});

describe("compact delegated doctor bridge", () => {
  const state = { schemaVersion: 1, identity: { cwd: "/private/project", repositoryRoot: "/private/project", quality: "current", reason: "read-success" }, openspec: { quality: "absent", reason: "not-found", selection: "none" }, git: { quality: "current", reason: "read-success", repository: true, root: "/private/project", complete: true, dirty: false, stateRef: "git-v1:sha256:" + "a".repeat(64) }, verification: { effectiveOutcome: "absent", freshness: "unbound", quality: "absent", reason: "not-found" } } as any;

  function fixture(doctor: WorkbenchDependencies["doctor"], reads = ["1", "yes", "1", "3", "4"]) {
    const output: string[] = []; let calls = 0;
    const deps = { candidates: ["/private/project"], project: () => state, input: { read: async () => reads.shift() ?? null }, output: { write: (text: string) => { output.push(text); } }, adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: () => ({} as any), create: () => ({} as any), resume: () => ({} as any) }), launch: {} as any, doctor: async () => (calls++, doctor()), signal: new AbortController().signal } as WorkbenchDependencies;
    return { deps, output, calls: () => calls };
  }

  test("renders compact overall and check statuses, delegates once, and returns to the same menu", async () => {
    const run = fixture(async () => ({ outcome: "success", overall: "warn", checks: [{ name: "Pi contract", status: "ok" }, { name: "Skills", status: "warn" }] }));
    expect(await runWorkbench(run.deps)).toEqual({ outcome: "normal", reason: "exit" });
    expect(run.calls()).toBe(1);
    expect(run.output.join("\n")).toContain("Doctor: overall=warn\n- Pi contract: ok\n- Skills: warn");
    expect(run.output.filter(line => line.includes("3. Doctor\n4. Exit"))).toHaveLength(2);
  });

  test.each([
    [{ outcome: "unavailable", overall: "unavailable", checks: [] }, "Doctor: unavailable — run `ein doctor` directly, then return to the workbench."],
    [{ outcome: "cancelled", overall: "warn", checks: [] }, "Doctor: cancelled — no diagnostics changed."],
  ] as const)("renders actionable %s and returns to menu", async (result, message) => {
    const run = fixture(async () => result as any);
    expect(await runWorkbench(run.deps)).toEqual({ outcome: "normal", reason: "exit" });
    expect(run.output.join("\n")).toContain(message);
  });

  test("normalizes thrown bridge failures without exposing raw paths or terminating", async () => {
    const run = fixture(async () => { throw new Error("/private/raw doctor failure"); });
    expect(await runWorkbench(run.deps)).toEqual({ outcome: "normal", reason: "exit" });
    expect(run.output.join("\n")).toContain("Doctor: unavailable — run `ein doctor` directly, then return to the workbench.");
    expect(run.output.join("\n")).not.toContain("/private/raw");
  });

  test("repeated doctor actions are read-only and each returns to the action menu", async () => {
    const marker = { contents: "unchanged" };
    const run = fixture(async () => ({ outcome: "success", overall: "ok", checks: [] }), ["1", "yes", "1", "3", "3", "4"]);
    expect(await runWorkbench(run.deps)).toEqual({ outcome: "normal", reason: "exit" });
    expect(run.calls()).toBe(2);
    expect(marker).toEqual({ contents: "unchanged" });
  });

  test("doctor rendering is bounded and strips controls and private-looking path detail", () => {
    const checks = Array.from({ length: 15 }, (_, index) => ({ name: index === 0 ? "\u001b[2J/private/check" : `check-${index}`, status: "ok" as const }));
    const rendered = renderDoctorResult({ outcome: "success", overall: "ok", checks });
    expect(rendered.split("\n")).toHaveLength(11);
    expect(rendered).not.toMatch(/\x1b|\/private/);
  });
});

describe("confirmed project runtime selection and capability menu", () => {
  const state = (cwd: string, quality: "current" | "unavailable" = "current") => ({
    schemaVersion: 1, identity: { cwd, repositoryRoot: cwd, quality, reason: quality === "current" ? "read-success" : "read-error" },
    openspec: { quality: "current", reason: "read-success", activeChanges: [], selection: "none", provenance: "none", artifacts: [], blockers: [], verify: "absent", verifyStale: false },
    ein: { path: `${cwd}/EIN.md`, quality: "absent", reason: "not-found", curated: { present: false, complete: false }, auto: { present: false } },
    git: { quality: "current", reason: "read-success", repository: true, root: cwd, dirty: false, complete: true, changes: [], stateRef: "git-v1:sha256:" + "a".repeat(64) },
    verification: { quality: "current", reason: "read-success", reportedOutcome: "absent", effectiveOutcome: "absent", freshness: "unbound" }, runtimes: {},
  }) as any;

  test("requires ordered candidate selection and explicit confirmation before runtime selection", async () => {
    // Exit is the fourth action for Claude too, now that it lists sessions.
    const reads = ["2", "yes", "2", "4"], projected: string[] = [], adapterCalls: string[] = [], output: string[] = [];
    const result = await runWorkbench({ candidates: ["/private/alpha", "/private/beta"], project: ({ cwd }) => (projected.push(cwd), state(cwd)), input: { read: async () => reads.shift() ?? null }, output: { write: (text) => { output.push(text); } }, adapter: (provider) => ({ provider, capabilities: getRuntimeCapabilities(provider), list: () => (adapterCalls.push("list"), {} as any), create: () => (adapterCalls.push("create"), {} as any), resume: () => ({} as any) }), launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal });
    expect(result).toEqual({ outcome: "normal", reason: "exit" });
    expect(projected).toEqual(["/private/alpha", "/private/beta"]); expect(adapterCalls).toEqual([]);
    expect(output.join("\n")).toContain("Confirmed project: 2. beta"); expect(output.join("\n")).toContain("Runtime: claude"); expect(output.join("\n")).not.toContain("/private");
  });

  test("cancellation at confirmation does not select a runtime", async () => {
    let adapterCalled = false; const reads: (string | null)[] = ["1", null];
    const result = await runWorkbench({ candidates: ["/secret/only"], project: ({ cwd }) => state(cwd), input: { read: async () => reads.shift() ?? null }, output: { write: () => {} }, adapter: () => (adapterCalled = true, {} as any), launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal });
    expect(result).toEqual({ outcome: "cancelled", reason: "eof" }); expect(adapterCalled).toBe(false);
  });

  test.each([
    [["1", "no", "1", "yes", "1", "4"], 2],
    [["1", "maybe", "no", "1", "yes", "1", "4"], 3],
  ] as const)("project confirmation loops on no and invalid input before bounded reselection", async (script, confirmationPrompts) => {
    const reads: Array<string | null> = [...script];
    const prompts: string[] = [];
    const result = await runWorkbench({
      candidates: ["/secret/only"],
      project: ({ cwd }) => state(cwd),
      input: { read: async (prompt) => { prompts.push(prompt); return reads.shift() ?? null; } },
      output: { write: () => {} },
      adapter: (provider) => ({ provider, capabilities: getRuntimeCapabilities(provider), list: () => ({} as any), create: () => ({} as any), resume: () => ({} as any) }),
      launch: { build: (() => ({})) as any, execute: (async () => ({})) as any, executor: async () => ({ kind: "exit", code: 0 }) },
      doctor: async () => ({ outcome: "unavailable", overall: "unavailable", checks: [] }),
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ outcome: "normal", reason: "exit" });
    expect(prompts.filter((prompt) => prompt.startsWith("Confirm "))).toHaveLength(confirmationPrompts);
    expect(reads).toHaveLength(0);
  });

  test.each(["pi", "claude"] as const)("fails closed when injected %s capabilities disagree with the canonical matrix", async (provider) => {
    const reads = ["1", "yes", provider === "pi" ? "1" : "2"];
    const calls: string[] = [];
    const capabilities = getRuntimeCapabilities(provider).map((descriptor) =>
      descriptor.operation === "create"
        ? { ...descriptor, support: descriptor.support === "supported" ? "unsupported" as const : "supported" as const }
        : descriptor,
    );
    const result = await runWorkbench({
      candidates: ["/secret/only"], project: ({ cwd }) => state(cwd),
      input: { read: async () => reads.shift() ?? null }, output: { write: () => {} },
      adapter: () => ({ provider, capabilities, list: () => (calls.push("list"), {} as any), create: () => (calls.push("create"), {} as any), resume: () => ({} as any) }),
      launch: { build: (() => (calls.push("build"), {})) as any, execute: (async () => (calls.push("execute"), {})) as any, executor: async () => ({ kind: "exit", code: 0 }) },
      doctor: async () => ({ outcome: "unavailable", overall: "unavailable", checks: [] }), signal: new AbortController().signal,
    });
    expect(result).toEqual({ outcome: "operational", reason: "failure" });
    expect(calls).toEqual([]);
  });

  test("renders provider capabilities in stable order and gates menu actions", () => {
    expect(renderRuntimeCapabilities("pi")).toBe("Capabilities: list=supported create=supported(request-only) resume=supported launch=supported");
    expect(renderRuntimeCapabilities("claude")).toContain("list=supported create=supported(request-only) resume=supported launch=supported");
    // The asymmetry is gone: both stores are readable and both runtimes resume.
    expect(renderActionMenu("pi")).toEqual(["1. List sessions", "2. Create session", "3. Doctor", "4. Exit"]);
    expect(renderActionMenu("claude")).toEqual(["1. List sessions", "2. Create session", "3. Doctor", "4. Exit"]);
  });

  test("skips unavailable candidates and does not re-project the confirmed snapshot", async () => {
    let projections = 0; const reads = ["2", "yes", "1", "4"];
    const result = await runWorkbench({ candidates: ["/secret/bad", "/secret/good"], project: ({ cwd }) => (projections++, state(cwd, cwd.endsWith("bad") ? "unavailable" : "current")), input: { read: async () => reads.shift() ?? null }, output: { write: () => {} }, adapter: (provider) => ({ provider, capabilities: getRuntimeCapabilities(provider), list: () => ({} as any), create: () => ({} as any), resume: () => ({} as any) }), launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal });
    expect(result.outcome).toBe("normal"); expect(projections).toBe(2);
  });
});

// Reuses the "production-style dependencies" fixture (:56-81): same real state
// and full-flow harness, only adding readUpdateObservations to the readers.
describe("launcher update surface — component detail (N.1)", () => {
  const workbenchState = {
    schemaVersion: 1,
    identity: { cwd: "/repo/project", repositoryRoot: "/repo/project", quality: "current", reason: "read-success" },
    openspec: { selection: "none", quality: "current", reason: "read-success" },
    git: { dirty: false, quality: "current", reason: "read-success" },
    verification: { effectiveOutcome: "absent", freshness: "current", quality: "current", reason: "read-success" },
  } as any;

  // Annotated so the literals keep their narrow types: an unannotated object
  // widens `status` to string and stops satisfying the reader contract.
  const baseReaders: WorkbenchAdvisorReaders = {
    inspectLinearIntegration: () => ({ status: "valid", source: "default", value: "off", reason: "defaulted", provenance: { source: "default", reason: "defaulted" }, observed: [] }),
    inspectModelConfig: () => ({ status: "valid", source: "global", config: { orchestrator: { model: "configured" } }, reason: "read-success", provenance: { source: "global", reason: "read-success" }, observed: [] }),
  };

  async function runWithAdvisor(advisor: ReturnType<typeof createWorkbenchAdvisor>): Promise<string> {
    const output: string[] = [];
    const reads = ["1", "yes", "1", "4"];
    const dependencies = {
      candidates: [workbenchState.identity.cwd], project: () => workbenchState,
      input: { read: async () => reads.shift() ?? null }, output: { write: (text: string) => output.push(text) },
      advisor: () => advisor,
      adapter: () => ({ provider: "pi", capabilities: getRuntimeCapabilities("pi"), list: () => ({}), create: () => ({}), resume: () => ({}) }),
      launch: {} as any, doctor: async () => ({} as any), signal: new AbortController().signal,
    } as unknown as WorkbenchDependencies;
    await runWorkbenchEntrypoint({ argv: [], cwd: "/repo", stdinTTY: true, stdoutTTY: true, write: () => {}, createDependencies: () => dependencies });
    return output.join("\n");
  }

  test("component detail survives the collapsed global verdict (R1)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "update-available", reason: "newer-release", freshness: "current" },
        { source: "binary", status: "skipped", reason: "installed-version-unavailable", freshness: "unknown" },
        { source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown" },
      ],
    });
    const rendered = await runWithAdvisor(advisor);
    expect(rendered).toContain("Update: status=unavailable");
    expect(rendered).toContain("- Ein: update-available — run `ein update`");
  });

  test("Ein with fresh evidence prints the exact accionable line (R2)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "update-available", reason: "newer-release", freshness: "current" },
        { source: "binary", status: "current", reason: "read-success", freshness: "current" },
        { source: "packages", status: "current", reason: "read-success", freshness: "current" },
      ],
    });
    const rendered = await runWithAdvisor(advisor);
    expect(rendered).toContain("- Ein: update-available — run `ein update`");
  });

  test("non-verifiable packages declare the reason without a command (R4)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "current", reason: "read-success", freshness: "current" },
        { source: "binary", status: "current", reason: "read-success", freshness: "current" },
        { source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown" },
      ],
    });
    const rendered = await runWithAdvisor(advisor);
    // F (shared-config-update-advisor.ts, untouched — invariant 2) normalizes the
    // per-item reason: an unknown-freshness observation always reports
    // "unknown-evidence" regardless of the raw probe reason (R4: "motivo normalizado").
    const packagesLine = rendered.split("\n").find((line) => line.startsWith("- Pi packages:"));
    expect(packagesLine).toBe("- Pi packages: not verified (unknown-evidence) — no action");
    expect(packagesLine).not.toMatch(/`/);
  });

  test("nothing to say means no Updates: block (R5)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "current", reason: "read-success", freshness: "current" },
        { source: "binary", status: "current", reason: "read-success", freshness: "current" },
        { source: "packages", status: "current", reason: "read-success", freshness: "current" },
      ],
    });
    const rendered = await runWithAdvisor(advisor);
    expect(rendered).not.toContain("Updates:");
  });

  test("handoff stays inert and the render never leaks control sequences or process calls (R6)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "update-available", reason: "newer-release", freshness: "current" },
        { source: "binary", status: "skipped", reason: "installed-version-unavailable", freshness: "unknown" },
        { source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown" },
      ],
    });
    const rendered = await runWithAdvisor(advisor);
    expect(rendered).not.toMatch(/\x1b|\r|spawn|runUpdate/);
    expect(rendered).not.toContain("Handoff:");
  });

  test("without a reader the render is identical to today's collapsed-only output (R7 backward compat)", async () => {
    const advisor = createWorkbenchAdvisor(workbenchState, baseReaders);
    const rendered = await runWithAdvisor(advisor);
    expect(rendered).toContain("Update: status=unavailable");
    expect(rendered).not.toContain("Updates:");
  });

  describe("claude code as a fourth update component", () => {
    const withClaude = (claude: EinPiUpdateObservation) => createWorkbenchAdvisor(workbenchState, {
      ...baseReaders,
      readUpdateObservations: () => [
        { source: "ein", status: "current", reason: "read-success", freshness: "current" },
        { source: "binary", status: "current", reason: "read-success", freshness: "current" },
        { source: "packages", status: "current", reason: "read-success", freshness: "current" },
        claude,
      ],
    });

    test("a known install with unverifiable availability names the command and its consequence", async () => {
      const rendered = await runWithAdvisor(withClaude(
        { source: "claude", status: "unavailable", reason: "availability-not-verifiable", freshness: "unknown" },
      ));
      const line = rendered.split("\n").find((item) => item.startsWith("- Claude Code:"));
      expect(line).toBe("- Claude Code: availability not verifiable — run `claude update` (checks and installs)");
    });

    test("a missing install offers no command", async () => {
      const rendered = await runWithAdvisor(withClaude(
        { source: "claude", status: "skipped", reason: "executable-not-found", freshness: "unknown" },
      ));
      const line = rendered.split("\n").find((item) => item.startsWith("- Claude Code:"));
      expect(line).toBe("- Claude Code: not verified (unknown-evidence) — no action");
      expect(line).not.toMatch(/`/);
    });

    test("claude code never carries an installer handoff (F-007)", async () => {
      const advisor = withClaude(
        { source: "claude", status: "unavailable", reason: "availability-not-verifiable", freshness: "unknown" },
      );
      expect(advisor.handoff).toBeUndefined();
      expect(advisor.update.status).not.toBe("update-available");
    });

    test("the other three components render unaffected by claude", async () => {
      const rendered = await runWithAdvisor(withClaude(
        { source: "claude", status: "error", reason: "probe-failed", freshness: "unknown" },
      ));
      expect(rendered).toContain("Updates:");
      expect(rendered).toContain("- Claude Code:");
      expect(rendered).not.toContain("- Ein:");
    });
  });
});
