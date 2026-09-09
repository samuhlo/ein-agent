import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compressHeadroom, headroomSource, headroomPayload, headroomConfig, headroomNotice, headroomTableText, presentHeadroom, verifyHeadroomRepresentation, saveHeadroomOriginal, HEADROOM_DELIVERY_BYTES, type HeadroomConfig } from "../lib/headroom.ts";
import { HEADROOM_OPTIONS, writeHeadroomMode, noteHeadroomAvailability } from "../lib/headroom-settings.ts";
import { HeadroomService, inspectHeadroomService, resolveHeadroomBinary } from "../lib/headroom-service.ts";
import { pick } from "../lib/lang.ts";
import { maintainHeadroom } from "../lib/headroom-maintenance.ts";

/** Optional fixed config is a seam for replay tests; normal runtime reads project settings. */
export function createHeadroomExtension(fixed?: HeadroomConfig): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    if (fixed?.mode === "off") return;
    const service = new HeadroomService();
    let maintenance: AbortController | undefined;
    let consecutiveFailures = 0, sessionId = "", checkedServiceAt = 0;
    const counts = { eligible: 0, compressed: 0, fullRecovered: 0, unchanged: 0, rejected: 0, failed: 0, savedBytes: 0, promptSavedBytes: 0, wouldSaveBytes: 0, elapsedMs: 0 };
    const configuration = (cwd: string): HeadroomConfig => fixed ?? headroomConfig(process.env, cwd);
    const notify = (ctx: ExtensionContext, text: string, kind: "info" | "warning" = "info") => { if (ctx.hasUI) ctx.ui.notify(text, kind); };
    const restore = (ctx: ExtensionContext) => {
      const current = ctx.sessionManager.getSessionId(); if (current === sessionId) return;
      sessionId = current; consecutiveFailures = 0; checkedServiceAt = 0;
      const entries = ctx.sessionManager.getBranch?.() ?? [];
      const last = entries.filter((entry) => entry.type === "custom" && entry.customType === "ein-headroom").at(-1);
      const prior = last?.type === "custom" ? (last.data as { counts?: Record<string, unknown> })?.counts : undefined;
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = typeof prior?.[key] === "number" && Number.isFinite(prior[key]) ? prior[key] as number : 0;
    };
    pi.registerCommand("ein:headroom", {
      description: pick("Compresión verificada: on|observe|off, status, start, stop, retry, update VERSION, rollback.", "Verified compression: on|observe|off, status, start, stop, retry, update VERSION, rollback."),
      handler: async (args, ctx) => {
        restore(ctx);
        const command = args.trim() || "status";
        try {
          if (command.startsWith("update ") || command === "rollback") {
            if (command !== "rollback" && command.split(/\s+/).length !== 2) throw new Error("/ein:headroom update VERSION");
            if (maintenance) throw new Error("Ya hay un mantenimiento de Headroom en curso.");
            notify(ctx, pick("Validando la instalación de Headroom; la sesión actual conserva su servicio.", "Validating Headroom installation; the current session keeps its service."));
            maintenance = new AbortController();
            let message: string;
            try { message = await maintainHeadroom(command === "rollback" ? "rollback" : "update", command.split(/\s+/)[1], process.env, maintenance.signal); }
            finally { maintenance = undefined; }
            notify(ctx, pick("Versión verificada y seleccionada para el próximo arranque. Usa stop y start cuando quieras cambiar el servicio de esta sesión.", message));
            return;
          }
          if (HEADROOM_OPTIONS.includes(command as never)) {
            writeHeadroomMode(ctx.cwd, command as "on" | "off" | "observe"); consecutiveFailures = 0;
            if (configuration(ctx.cwd).mode !== "off" && resolveHeadroomBinary()) notify(ctx, await service.start(configuration(ctx.cwd)));
          }
          else if (command === "start") { notify(ctx, await service.start(configuration(ctx.cwd))); consecutiveFailures = 0; }
          else if (command === "stop") { notify(ctx, await service.stop()); noteHeadroomAvailability(ctx.cwd, "unknown"); return; }
          else if (command === "retry") consecutiveFailures = 0;
          else if (command !== "status") { notify(ctx, "/ein:headroom on|observe|off|status|start|stop|retry|update VERSION|rollback", "warning"); return; }
          const config = configuration(ctx.cwd), health = await inspectHeadroomService(config);
          const origin = process.env.EIN_HEADROOM_MODE ? "EIN_HEADROOM_MODE" : pick("proyecto", "project");
          noteHeadroomAvailability(ctx.cwd, health.ready ? "ready" : "unavailable");
          notify(ctx, pick(
            `Headroom: ${config.mode} (${origin}). Servicio: ${health.ready ? `disponible ${health.version ?? ""}` : "no disponible; se conserva la salida de Pi"}.\n${counts.compressed} salidas verificadas; ${counts.fullRecovered} originales completos recuperados; ${counts.savedBytes.toLocaleString()} bytes menos frente al original; ${counts.promptSavedBytes.toLocaleString()} frente a la vista de Pi.\nObservación: ${counts.wouldSaveBytes.toLocaleString()} bytes potenciales. Fallos: ${counts.failed}; circuito: ${consecutiveFailures >= 3 ? "pausado; usa retry" : "abierto a peticiones"}.`,
            `Headroom: ${config.mode} (${origin}). Service: ${health.ready ? `ready ${health.version ?? ""}` : "unavailable; preserving Pi output"}.\n${counts.compressed} verified outputs; ${counts.fullRecovered} full originals recovered; ${counts.savedBytes} bytes saved against originals; ${counts.promptSavedBytes} against Pi's view.\nObservation: ${counts.wouldSaveBytes} potential bytes. Failures: ${counts.failed}; circuit: ${consecutiveFailures >= 3 ? "paused; use retry" : "accepting requests"}.`
          ));
        } catch (error) {
          try { configuration(ctx.cwd); } catch { noteHeadroomAvailability(ctx.cwd, "invalid"); }
          notify(ctx, error instanceof Error ? error.message : "Headroom configuration error", "warning");
        }
      },
    });
    pi.registerCommand("ein:hypa", { description: "Compatibility: Hypa has been replaced by /ein:headroom.", handler: async (_args, ctx) => { notify(ctx, pick("Ein-Pi usa Headroom. Cambia la compresión con /ein:headroom on|observe|off; Hypa ya no envuelve los comandos.", "Ein-Pi uses Headroom. Configure /ein:headroom on|observe|off; Hypa no longer wraps commands.")); } });
    pi.on("session_start", (_event, ctx) => {
      restore(ctx);
      // Interactive Ein starts an already-installed service in the background.
      // Batch workers connect to it; they never race to spawn their own process.
      if (fixed || !ctx.hasUI) return;
      try {
        const config = configuration(ctx.cwd); if (config.mode === "off" || !resolveHeadroomBinary()) return;
        void service.start(config).then(async (message) => {
          const health = await inspectHeadroomService(config);
          noteHeadroomAvailability(ctx.cwd, health.ready ? "ready" : "unavailable");
          if (health.ready) consecutiveFailures = 0; else notify(ctx, message, "warning");
        }).catch(() => noteHeadroomAvailability(ctx.cwd, "unavailable"));
      } catch { noteHeadroomAvailability(ctx.cwd, "invalid"); }
    });
    pi.on("session_shutdown", async () => { maintenance?.abort(); await service.stop(); });
    pi.on("tool_result", async (event, ctx) => {
      restore(ctx);
      let config: HeadroomConfig;
      try { config = configuration(ctx.cwd); } catch { noteHeadroomAvailability(ctx.cwd, "invalid"); return; }
      if (config.mode === "off" || consecutiveFailures >= 3 || !pi.getActiveTools().includes("read")) return;
      let source: Awaited<ReturnType<typeof headroomSource>>;
      try { source = await headroomSource(event); } catch { return; }
      if (!source) return;
      const original = source.text;
      const { payload, prefix, suffix } = headroomPayload(original);
      counts.eligible++;
      const started = performance.now();
      let outcome = "unchanged", storing = false;
      try {
        if (!fixed && (!checkedServiceAt || Date.now() - checkedServiceAt > 30_000)) {
          if (!(await inspectHeadroomService(config)).ready) throw new Error("headroom-service-unavailable");
          checkedServiceAt = Date.now();
        }
        const result = await compressHeadroom(payload, config, ctx.signal);
        consecutiveFailures = 0; noteHeadroomAvailability(ctx.cwd, "ready");
        if (result.text === payload) { counts.unchanged++; return; }
        let compact = headroomTableText(result.text); const proof = verifyHeadroomRepresentation(payload, compact);
        if (proof) compact = presentHeadroom(compact, proof);
        if (proof && verifyHeadroomRepresentation(payload, compact) !== proof) { counts.rejected++; outcome = "rejected"; return; }
        compact = prefix + compact + suffix;
        if (!proof || Buffer.byteLength(compact) + 600 > Buffer.byteLength(original) * 0.90 || Buffer.byteLength(compact) + 600 > HEADROOM_DELIVERY_BYTES || compact.split("\n").length > 1800) { counts.rejected++; outcome = "rejected"; return; }
        if (config.mode === "observe") { counts.wouldSaveBytes += Buffer.byteLength(original) - Buffer.byteLength(compact) - 600; outcome = "would-compress"; return; }
        if (ctx.signal?.aborted) { outcome = "cancelled"; return; }
        storing = true;
        const path = await saveHeadroomOriginal(ctx.cwd, sessionId, original);
        if (ctx.signal?.aborted) { outcome = "cancelled"; return; }
        const text = headroomNotice(path, proof) + compact;
        if (Buffer.byteLength(text) > HEADROOM_DELIVERY_BYTES || Buffer.byteLength(text) > Buffer.byteLength(original) * 0.9) { counts.rejected++; outcome = "delivery-budget"; return; }
        const piBytes = event.content.reduce((sum, part) => sum + (part.type === "text" ? Buffer.byteLength(part.text) : 0), 0);
        counts.compressed++; if (source.full) counts.fullRecovered++;
        counts.savedBytes += Buffer.byteLength(original) - Buffer.byteLength(text);
        counts.promptSavedBytes += piBytes - Buffer.byteLength(text); outcome = "compressed";
        return { content: [{ type: "text" as const, text }] };
      } catch {
        if (ctx.signal?.aborted) { outcome = "cancelled"; return; }
        counts.failed++; consecutiveFailures++; checkedServiceAt = 0; outcome = storing ? "storage-error" : "unavailable";
        if (!storing) noteHeadroomAvailability(ctx.cwd, "unavailable");
        return; // Pi's details, error status and usage remain authoritative.
      } finally {
        const elapsedMs = performance.now() - started; counts.elapsedMs += elapsedMs;
        try { pi.appendEntry("ein-headroom", { version: 2, mode: config.mode, toolCallId: event.toolCallId, outcome, completeSource: source.full, elapsedMs, counts: { ...counts } }); } catch { /* Observation cannot break tools. */ }
      }
    });
  };
}
export default createHeadroomExtension();
