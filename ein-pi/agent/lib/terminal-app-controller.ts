import { pick } from "./lang.ts";
import type { RuntimeProvider } from "./runtime-session-adapters.ts";
import type { RuntimeSessionList } from "./runtime-sessions.ts";
import type { ContinuityPrepareResult } from "./continuity-handoff-lifecycle.ts";
import { isContinueBriefTransportSafe } from "./terminal-continue-transport.ts";
import {
  RUNTIME_LABEL,
  buildConfigView,
  buildDashboard,
  buildSessionsView,
  buildStateView,
  buildSystemView,
  handleKey,
  initialModel,
  type AppEffect,
  type AppModel,
  type ProjectSummary,
  type Setting,
  type SystemComponent,
  type View,
  type ViewKind,
} from "./terminal-app.ts";

export type LaunchOutcome =
  | { kind: "exited"; code: number }
  | { kind: "unavailable"; reason: string };

export type TerminalAppControllerAction =
  | { kind: "key"; key: string }
  | { kind: "refresh" };

export type TerminalAppControllerPorts = Readonly<{
  readSummary: (focusedChange: string | undefined, sessions: number) => ProjectSummary;
  settings: Readonly<{
    read: () => readonly Setting[];
    apply: (settingId: string, value: string) => boolean;
  }>;
  readSessions: () => RuntimeSessionList;
  readSystem: () => readonly SystemComponent[];
  launch: (provider: RuntimeProvider, reference?: string) => Promise<LaunchOutcome>;
  prepareContinue?: (provider: RuntimeProvider) => Promise<ContinuityPrepareResult>;
  continueLaunch?: (provider: RuntimeProvider, brief: string) => Promise<LaunchOutcome>;
  run: (command: readonly string[]) => Promise<number>;
  lifecycle: Readonly<{
    release: () => void;
    resume: () => void;
    exit: (code: number) => void;
  }>;
}>;

export type TerminalAppController = Readonly<{
  snapshot: () => AppModel;
  subscribe: (listener: (snapshot: AppModel) => void) => () => void;
  dispatch: (action: TerminalAppControllerAction) => void;
}>;

function immutableModel(model: AppModel): AppModel {
  return Object.freeze({ ...model });
}

export function createTerminalAppController(ports: TerminalAppControllerPorts): TerminalAppController {
  let focusedChange: string | undefined;
  let sessionList = ports.readSessions();
  let summary = ports.readSummary(focusedChange, sessionList.entries.length);
  let model = initialModel(summary, buildDashboard(summary));
  const listeners = new Set<(snapshot: AppModel) => void>();
  let operationGeneration = 0, continueOwner: number | undefined;

  const publish = (next: AppModel): void => {
    model = immutableModel(next);
    for (const listener of listeners) listener(model);
  };

  const viewFor = (kind: ViewKind): View => {
    switch (kind) {
      case "config": return buildConfigView(ports.settings.read());
      case "sessions": {
        sessionList = ports.readSessions();
        return buildSessionsView(sessionList.entries, sessionList.unavailable);
      }
      case "state": return buildStateView(summary);
      case "system": return buildSystemView(ports.readSystem());
      default: return buildDashboard(summary);
    }
  };

  const exitSafely = (code: number): void => {
    try { ports.lifecycle.exit(code); } catch {}
  };

  const executeExternal = (effect: Extract<AppEffect, { kind: "launch" | "run" }>): void => {
    if (effect.kind === "launch" && continueOwner !== undefined) {
      publish({ ...model, status: pick("Continuación en curso", "Continue already in progress") });
      return;
    }
    ports.lifecycle.release();
    if (effect.kind === "run") {
      void ports.run(effect.command).then(
        (code) => exitSafely(code),
        () => exitSafely(1),
      );
      return;
    }

    void ports.launch(effect.provider, effect.reference).then(
      (result) => {
        try {
          if (result.kind === "exited") {
            ports.lifecycle.resume();
            publish({
              ...model,
              status: result.code === 0
                ? pick(`${RUNTIME_LABEL[effect.provider]} finalizó`, `${RUNTIME_LABEL[effect.provider]} finished`)
                : pick(`${RUNTIME_LABEL[effect.provider]} finalizó con código ${result.code}`, `${RUNTIME_LABEL[effect.provider]} exited with code ${result.code}`),
            });
            return;
          }
          ports.lifecycle.resume();
          publish({
            ...model,
            status: pick(
              `${RUNTIME_LABEL[effect.provider]} no está disponible (${result.reason})`,
              `${RUNTIME_LABEL[effect.provider]} is not available (${result.reason})`,
            ),
          });
        } catch {
          exitSafely(1);
        }
      },
      () => exitSafely(1),
    );
  };

  const executeContinue = (provider: RuntimeProvider): void => {
    if (continueOwner !== undefined) {
      publish({ ...model, status: pick("Continuación en curso", "Continue already in progress") });
      return;
    }
    if (!ports.prepareContinue || !ports.continueLaunch) {
      publish({ ...model, status: pick("Continuación no disponible", "Continue is not available") });
      return;
    }
    const owner = ++operationGeneration;
    continueOwner = owner;
    const ownsOperation = (): boolean => continueOwner === owner;
    const prepareContinue = ports.prepareContinue;
    const continueLaunch = ports.continueLaunch;
    void (async () => {
      let prepared: ContinuityPrepareResult;
      try {
        prepared = await prepareContinue(provider);
      } catch {
        if (!ownsOperation()) return;
        continueOwner = undefined;
        publish({ ...model, status: pick("Continuación bloqueada (refresh-failed)", "Continue blocked (refresh-failed)") });
        return;
      }
      if (!ownsOperation()) return;
      if (!prepared.ok) {
        continueOwner = undefined;
        publish({ ...model, status: pick(`Continuación bloqueada (${prepared.reason})`, `Continue blocked (${prepared.reason})`) });
        return;
      }
      if (!isContinueBriefTransportSafe(prepared.brief.content)) {
        continueOwner = undefined;
        publish({ ...model, status: pick("Continuación bloqueada (unsafe-brief)", "Continue blocked (unsafe-brief)") });
        return;
      }
      ports.lifecycle.release();
      let result: LaunchOutcome;
      try { result = await continueLaunch(provider, prepared.brief.content); }
      catch { if (ownsOperation()) exitSafely(1); return; }
      if (!ownsOperation()) return;
      if (result.kind === "exited") {
        continueOwner = undefined;
        ports.lifecycle.resume();
        publish({
          ...model,
          status: result.code === 0
            ? pick(`${RUNTIME_LABEL[provider]} finalizó`, `${RUNTIME_LABEL[provider]} finished`)
            : pick(`${RUNTIME_LABEL[provider]} finalizó con código ${result.code}`, `${RUNTIME_LABEL[provider]} exited with code ${result.code}`),
        });
        return;
      }
      continueOwner = undefined;
      ports.lifecycle.resume();
      publish({ ...model, status: pick(`${RUNTIME_LABEL[provider]} no está disponible`, `${RUNTIME_LABEL[provider]} is not available`) });
    })().catch(() => { if (ownsOperation()) exitSafely(1); });
  };

  const execute = (effect: AppEffect): void => {
    switch (effect.kind) {
      case "quit":
        operationGeneration += 1;
        continueOwner = undefined;
        ports.lifecycle.exit(0);
        return;
      case "open":
        publish({ ...model, view: viewFor(effect.view), cursor: 0, query: "", searching: false, status: "" });
        return;
      case "refresh": {
        const cursor = model.cursor;
        summary = ports.readSummary(focusedChange, sessionList.entries.length);
        publish({ ...model, summary, view: viewFor(model.view.kind), cursor });
        return;
      }
      case "apply-setting": {
        const cursor = model.cursor;
        const applied = ports.settings.apply(effect.settingId, effect.value);
        publish({
          ...model,
          view: buildConfigView(ports.settings.read()),
          cursor,
          status: applied
            ? ""
            : pick(`No se pudo escribir ${effect.settingId}`, `Could not write ${effect.settingId}`),
        });
        return;
      }
      case "focus-change":
        focusedChange = effect.change;
        summary = ports.readSummary(focusedChange, sessionList.entries.length);
        publish({ ...model, summary, view: buildStateView(summary) });
        return;
      case "launch":
      case "run":
        executeExternal(effect);
        return;
      case "continue":
        executeContinue(effect.provider);
        return;
      case "status":
      case "none":
        publish(model);
    }
  };

  return Object.freeze({
    snapshot: () => model,
    subscribe: (listener: (snapshot: AppModel) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch: (action: TerminalAppControllerAction) => {
      try {
        if (action.kind === "refresh") {
          execute({ kind: "refresh" });
          return;
        }
        const outcome = handleKey(model, action.key);
        model = immutableModel(outcome.model);
        execute(outcome.effect);
      } catch {
        exitSafely(1);
      }
    },
  });
}
