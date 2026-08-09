import { basename } from "node:path";
import type {
  ProjectStateQuality,
  ProjectStateReasonCode,
  ProjectStateRequest,
  ProjectStateV1,
} from "./project-state.ts";
import {
  getRuntimeCapabilities,
  projectBindingFromState,
  type AdapterResult,
  type LaunchExecutor,
  type ProjectBinding,
  type RuntimeProvider,
  type RuntimeSessionAdapter,
  type SessionMetadata,
} from "./runtime-session-adapters.ts";

export type ProjectCandidateSummary = {
  ordinal: number;
  label: string;
  availability: "usable" | "unavailable";
  quality: ProjectStateQuality;
  reason: ProjectStateReasonCode;
};

export type ConfirmedProjectSummary = {
  ordinal: number;
  label: string;
  status: "confirmed";
};

function safeCandidateLabel(candidate: string): string {
  const label = basename(candidate)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label || "project";
}

export function createCandidateSummary(
  index: number,
  candidate: string,
  state: ProjectStateV1,
): ProjectCandidateSummary {
  const usable = state.schemaVersion === 1 && state.identity.quality !== "unavailable";
  return {
    ordinal: index + 1,
    label: safeCandidateLabel(candidate),
    availability: usable ? "usable" : "unavailable",
    quality: state.identity.quality,
    reason: state.identity.reason,
  };
}

export function createConfirmedProjectSummary(
  candidate: ProjectCandidateSummary,
): ConfirmedProjectSummary {
  return { ordinal: candidate.ordinal, label: candidate.label, status: "confirmed" };
}

/** Pure, intentionally lossy projection of an already-computed snapshot. */
export function renderProjectState(state: ProjectStateV1): string {
  const phase = state.openspec.phase ?? "unknown";
  const next = state.openspec.next ?? "unknown";
  const gitStatus = state.git.dirty === true ? "dirty" : state.git.dirty === false ? "clean" : "unknown";
  return [
    `OpenSpec: selection=${state.openspec.selection} quality=${state.openspec.quality} reason=${state.openspec.reason} phase=${phase} next=${next}`,
    `Git: status=${gitStatus} quality=${state.git.quality} reason=${state.git.reason}`,
    `Verification: outcome=${state.verification.effectiveOutcome} freshness=${state.verification.freshness} quality=${state.verification.quality} reason=${state.verification.reason}`,
  ].join("\n");
}

const CAPABILITY_ORDER = ["list", "create", "resume", "launch"] as const;

export function renderRuntimeCapabilities(provider: RuntimeProvider): string {
  const byOperation = new Map(getRuntimeCapabilities(provider).map((capability) => [capability.operation, capability]));
  return `Capabilities: ${CAPABILITY_ORDER.map((operation) => {
    const capability = byOperation.get(operation)!;
    return `${operation}=${capability.support}${capability.requestOnly ? "(request-only)" : ""}`;
  }).join(" ")}`;
}

export function renderPiSessionList(sessions: readonly SessionMetadata[]): readonly string[] {
  return sessions.map((session, index) => `${index + 1}. modified=${new Date(session.modifiedAtMs).toISOString()}`);
}

export function renderAdapterOutcome(result: AdapterResult<unknown>): string {
  const label = result.operation[0]!.toUpperCase() + result.operation.slice(1);
  if (result.outcome === "success") {
    return result.operation === "create"
      ? `${label}: success — request prepared (not persisted)`
      : `${label}: success`;
  }
  const code = result.error?.code;
  return `${label}: ${result.outcome}${code ? ` (${code})` : ""}`;
}

const DOCTOR_UNAVAILABLE = "Doctor: unavailable — run `ein doctor` directly, then return to the workbench.";

export function renderDoctorResult(result: WorkbenchDoctorResult): string {
  if (result.outcome === "cancelled") return "Doctor: cancelled — no diagnostics changed.";
  if (result.outcome !== "success" || result.overall === "unavailable") {
    return DOCTOR_UNAVAILABLE;
  }
  const checks = result.checks.slice(0, 10).map((check) => {
    const name = safeCandidateLabel(check.name.includes("/") ? basename(check.name) : check.name);
    return `- ${name}: ${check.status}`;
  });
  return [`Doctor: overall=${result.overall}`, ...checks].join("\n");
}

/** Only capability-supported actions are visible. */
export function renderActionMenu(provider: RuntimeProvider): readonly string[] {
  const capabilities = getRuntimeCapabilities(provider);
  const supported = (operation: "list" | "create") => capabilities.some((item) => item.operation === operation && item.support === "supported");
  const choices: string[] = [];
  if (supported("list")) choices.push(`${choices.length + 1}. List sessions`);
  if (supported("create")) choices.push(`${choices.length + 1}. Create session`);
  choices.push(`${choices.length + 1}. Doctor`, `${choices.length + 2}. Exit`);
  return choices;
}

type ConfirmedSelection = {
  readonly state: ProjectStateV1;
  readonly binding: ProjectBinding;
  readonly summary: ConfirmedProjectSummary;
};

async function write(output: WorkbenchOutput, text: string): Promise<void> {
  await output.write(text);
}

/** Bounded group-003 flow: selection, confirmation, runtime, capability-gated menu. */
export async function runWorkbench(dependencies: WorkbenchDependencies): Promise<WorkbenchResult> {
  if (dependencies.signal.aborted) return workbenchCancellation("aborted");
  const projected: Array<{ state: ProjectStateV1; summary: ProjectCandidateSummary } | undefined> = [];
  for (const [index, candidate] of dependencies.candidates.entries()) {
    try {
      const state = dependencies.project({ cwd: candidate });
      if (state.schemaVersion !== 1) throw new Error("invalid schema");
      const summary = createCandidateSummary(index, candidate, state);
      projected.push({ state, summary });
      await write(dependencies.output, `${summary.ordinal}. ${summary.label} — ${summary.availability} quality=${summary.quality} reason=${summary.reason}`);
    } catch {
      projected.push(undefined);
      await write(dependencies.output, `${index + 1}. ${safeCandidateLabel(candidate)} — unavailable`);
    }
  }
  if (!projected.some((item) => item?.summary.availability === "usable")) return { outcome: "operational", reason: "no-usable-candidate" };

  let selected: NonNullable<(typeof projected)[number]> | undefined;
  while (!selected) {
    const selectedRaw = await dependencies.input.read("Select project number: ");
    if (selectedRaw === null) return workbenchCancellation("eof");
    const candidate = projected[Number(selectedRaw) - 1];
    if (!candidate || candidate.summary.availability !== "usable") continue;
    while (true) {
      const confirmation = await dependencies.input.read(`Confirm ${candidate.summary.label}? [yes/no]: `);
      if (confirmation === null) return workbenchCancellation("eof");
      const answer = confirmation.trim().toLowerCase();
      if (answer === "yes") {
        selected = candidate;
        break;
      }
      if (answer === "no") break;
    }
  }

  const confirmed: ConfirmedSelection = Object.freeze({
    state: selected.state,
    binding: projectBindingFromState(selected.state),
    summary: createConfirmedProjectSummary(selected.summary),
  });
  await write(dependencies.output, `Confirmed project: ${confirmed.summary.ordinal}. ${confirmed.summary.label}`);
  await write(dependencies.output, renderProjectState(confirmed.state));

  const runtimeRaw = await dependencies.input.read("Select runtime: 1. Pi 2. Claude: ");
  if (runtimeRaw === null) return workbenchCancellation("eof");
  const provider: RuntimeProvider | undefined = runtimeRaw === "1" ? "pi" : runtimeRaw === "2" ? "claude" : undefined;
  if (!provider) return { outcome: "usage", reason: "invalid-input" };
  const adapter = dependencies.adapter(provider);
  const canonicalCapabilities = getRuntimeCapabilities(provider);
  const capabilityMatches = adapter.capabilities.length === canonicalCapabilities.length
    && canonicalCapabilities.every((canonical) => adapter.capabilities.some((injected) =>
      injected.provider === canonical.provider
      && injected.operation === canonical.operation
      && injected.support === canonical.support
      && Boolean(injected.requestOnly) === Boolean(canonical.requestOnly),
    ));
  if (!capabilityMatches || adapter.provider !== provider || confirmed.binding.cwd !== confirmed.state.identity.cwd) {
    return { outcome: "operational", reason: "failure" };
  }
  await write(dependencies.output, `Runtime: ${provider}`);
  await write(dependencies.output, renderRuntimeCapabilities(provider));
  const menu = renderActionMenu(provider);
  const actions = menu.map((item) => item.replace(/^\d+\. /, ""));
  while (true) {
    await write(dependencies.output, menu.join("\n"));
    const actionRaw = await dependencies.input.read("Select action: ");
    if (actionRaw === null) return workbenchCancellation("eof");
    const action = actions[Number(actionRaw) - 1];
    if (action === "Exit") return { outcome: "normal", reason: "exit" };
    if (action === "List sessions") {
      const result = adapter.list(confirmed.state, undefined, { project: confirmed.binding });
      await write(dependencies.output, renderAdapterOutcome(result));
      if (result.outcome === "success") {
        const rows = renderPiSessionList(result.data);
        await write(dependencies.output, rows.length ? rows.join("\n") : "No sessions available");
      }
      continue;
    }
    if (action === "Doctor") {
      try {
        await write(dependencies.output, renderDoctorResult(await dependencies.doctor()));
      } catch {
        await write(dependencies.output, DOCTOR_UNAVAILABLE);
      }
      continue;
    }
    if (action === "Create session") {
      const result = adapter.create(confirmed.state, { project: confirmed.binding });
      await write(dependencies.output, renderAdapterOutcome(result));
      if (result.outcome !== "success") continue;

      await write(dependencies.output, `Launch confirmation: project=${confirmed.summary.label} provider=${provider} mode=${result.data.mode} default no`);
      const launchConfirmation = await dependencies.input.read("Confirm launch? [yes/no]: ");
      if (launchConfirmation === null) return workbenchCancellation("eof");
      if (launchConfirmation.trim().toLowerCase() !== "yes") continue;
      if (dependencies.signal.aborted) return workbenchCancellation("aborted");

      await write(dependencies.output, `Launch handoff: confirmed snapshot freshness=${confirmed.state.verification.freshness}`);
      const built = dependencies.launch.build(confirmed.state, result.data);
      await write(dependencies.output, renderAdapterOutcome(built));
      if (built.outcome === "cancelled") return workbenchCancellation("adapter-cancelled");
      if (built.outcome !== "success") {
        return { outcome: "operational", reason: built.outcome === "unavailable" ? "launch-unavailable" : "launch-failure" };
      }

      const launched = await dependencies.launch.execute(
        built.data,
        dependencies.launch.executor,
        dependencies.signal,
      );
      await write(dependencies.output, renderAdapterOutcome(launched));
      if (launched.outcome === "success") return { outcome: "normal", reason: "launch-exit-zero" };
      if (launched.outcome === "cancelled") return workbenchCancellation("adapter-cancelled");
      return { outcome: "operational", reason: launched.outcome === "unavailable" ? "launch-unavailable" : "launch-failure" };
    }
    return { outcome: "usage", reason: "invalid-input" };
  }
}

/** A cancelled read returns null; prompts never own terminal or process state. */
export type WorkbenchInput = {
  read(prompt: string): string | null | Promise<string | null>;
};

/** Intentionally lossy output boundary; callers decide where text is written. */
export type WorkbenchOutput = {
  write(text: string): void | Promise<void>;
};

export type WorkbenchDoctorStatus = "ok" | "warn" | "fail" | "unavailable";
export type WorkbenchDoctorResult = {
  outcome: "success" | "unavailable" | "error" | "cancelled";
  overall: WorkbenchDoctorStatus;
  checks: readonly {
    name: string;
    status: Exclude<WorkbenchDoctorStatus, "unavailable">;
  }[];
};

/** All authorities are supplied per run; this contract owns no global state. */
export type WorkbenchDependencies = {
  readonly candidates: readonly string[];
  readonly project: (request: ProjectStateRequest) => ProjectStateV1;
  readonly input: WorkbenchInput;
  readonly output: WorkbenchOutput;
  readonly adapter: (provider: RuntimeProvider) => RuntimeSessionAdapter;
  readonly launch: {
    readonly build: typeof import("./runtime-session-adapters.ts").buildLaunchPlan;
    readonly execute: typeof import("./runtime-session-adapters.ts").executeLaunchPlan;
    readonly executor: LaunchExecutor;
  };
  readonly doctor: () => WorkbenchDoctorResult | Promise<WorkbenchDoctorResult>;
  readonly signal: AbortSignal;
};

export type WorkbenchCancellationReason =
  | "eof"
  | "sigint"
  | "aborted"
  | "adapter-cancelled";

export type WorkbenchResult =
  | { outcome: "normal"; reason: "help" | "exit" | "launch-exit-zero" }
  | {
      outcome: "operational";
      reason: "failure" | "no-usable-candidate" | "launch-failure" | "launch-unavailable";
    }
  | { outcome: "usage"; reason: "invalid-invocation" | "invalid-input" | "non-tty" }
  | { outcome: "cancelled"; reason: WorkbenchCancellationReason };

export type WorkbenchExitCode = 0 | 1 | 2 | 130;

export function workbenchCancellation(
  reason: WorkbenchCancellationReason,
): Extract<WorkbenchResult, { outcome: "cancelled" }> {
  return { outcome: "cancelled", reason };
}

export function classifyWorkbenchExit(result: WorkbenchResult): WorkbenchExitCode {
  switch (result.outcome) {
    case "normal":
      return 0;
    case "operational":
      return 1;
    case "usage":
      return 2;
    case "cancelled":
      return 130;
  }
}
