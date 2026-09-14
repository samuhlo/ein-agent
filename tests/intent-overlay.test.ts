import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import overlay from "../ein-pi/agent/extensions/ein-sdd-overlay.ts";
import { renderIntentOverlay, phaseStates, overlayWidth } from "../ein-pi/agent/lib/sdd-overlay.ts";
import { runIntentDiscovery, INTENT_STATE } from "../ein-pi/agent/lib/intent-discovery.ts";
import type { SddChangeStatus } from "../ein-pi/agent/lib/sdd-router.ts";

const material = { objective: "Acordar cuentas", boundaries: { in: ["Cuenta y centro"], out: ["Frontend"] }, completionCriteria: ["Contrato acordado"] };

test("TODO shows intent before SDD exists, restores it and advances to final review", () => {
 const cwd = mkdtempSync(join(tmpdir(), "ein-intent-overlay-"));
 try {
  const branch: any[] = []; const paints: string[][] = []; const handlers = new Map<string, Function>();
  const ctx: any = { cwd, hasUI: true, sessionManager: { getBranch: () => branch, getEntries: () => branch }, ui: { setWidget: (_key: string, lines?: string[]) => paints.push(lines ?? []) } };
  const append = (customType: string, data: unknown) => branch.push({ type: "custom", customType, data });
  const { agreement } = runIntentDiscovery(ctx, { action: "propose", work: "cuentas", material, questions: ["¿Una cuenta?"], decisions: [
   { id: "account", question: "¿Una cuenta?", dependsOn: [], status: "open" },
   { id: "entry", question: "¿Dónde entra?", dependsOn: ["account"], status: "open" },
  ] }, append);
  overlay({ on: (event: string, handler: Function) => handlers.set(event, handler), events: { on: () => () => {} }, appendEntry: append, registerShortcut: () => {} } as never);
  handlers.get("session_start")!({}, ctx);
  expect(paints.at(-1)?.join("\n")).toContain("intent · decisiones pendientes");
  expect(paints.at(-1)?.join("\n")).toContain("0/2 decisiones");
  expect(existsSync(join(cwd, "openspec"))).toBe(false);
  const reviewed = { ...agreement!, stage: "review" as const, decisions: agreement!.decisions!.map((d) => ({ ...d, status: "resolved" as const, resolution: "Respuesta del usuario" })) };
  append(INTENT_STATE, reviewed);
  handlers.get("tool_execution_end")!({}, ctx);
  expect(paints.at(-1)?.join("\n")).toContain("revisión final");
  expect(paints.at(-1)?.join("\n")).toContain("2/2 decisiones");
  handlers.get("session_start")!({}, ctx);
  expect(paints.at(-1)?.join("\n")).toContain("revisión final");
  for (const width of [40, 60, 80]) expect(overlayWidth(renderIntentOverlay(reviewed, { width }))).toBeLessThanOrEqual(width);
  handlers.get("session_shutdown")!({}, ctx);
 } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("the SDD rail includes confirmed intent and returns to intent on reopening", () => {
 const base = { lane: "standard", nextRecommended: "scope", present: {}, intent: { state: "confirmed" } } as unknown as SddChangeStatus;
 expect(phaseStates(base).slice(0, 2)).toEqual([{ phase: "intent", state: "done" }, { phase: "scope", state: "current" }]);
 expect(phaseStates({ ...base, intent: { state: "pending" } }).slice(0, 2)).toEqual([{ phase: "intent", state: "current" }, { phase: "scope", state: "pending" }]);
});
