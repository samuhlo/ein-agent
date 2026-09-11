import { AssistantMessageComponent, ToolExecutionComponent, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { adaptTranscriptRenderer, cleanHiddenThinking, cleanSubagentHeading, HIDDEN_THINKING_LABEL } from "../lib/terminal-transcript.ts";

export default function terminalActivity(pi: ExtensionAPI): void {
  pi.registerFlag("ein-motion", { description: "Animate Ein's working indicator (false uses a static star)", type: "boolean", default: true });
  let dispose: (() => void) | undefined;

  const configure = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    if (!dispose) {
      const releases = [
        adaptTranscriptRenderer(AssistantMessageComponent.prototype, cleanHiddenThinking),
        adaptTranscriptRenderer(ToolExecutionComponent.prototype, cleanSubagentHeading),
      ];
      dispose = () => releases.forEach((release) => release());
    }
    ctx.ui.setHiddenThinkingLabel(HIDDEN_THINKING_LABEL);
    const motion = pi.getFlag("ein-motion") !== false && process.env.TERM !== "dumb";
    const stars = motion ? ["·", "✧", "✦", "✧"] : ["✦"];
    ctx.ui.setWorkingIndicator({ frames: stars.map((star) => ctx.ui.theme.fg("accent", star)), intervalMs: 180 });
  };

  pi.on("session_start", (_event, ctx) => configure(ctx));
  pi.on("agent_start", (_event, ctx) => configure(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    dispose?.();
    dispose = undefined;
    if (ctx.hasUI) {
      ctx.ui.setHiddenThinkingLabel();
      ctx.ui.setWorkingIndicator();
    }
  });
}
