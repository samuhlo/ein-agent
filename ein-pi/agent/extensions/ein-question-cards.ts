import { ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderQuestionCard } from "../lib/question-card.ts";
import { installToolCardBridge } from "../lib/tool-card-renderer-bridge.ts";

export default function questionCards(pi: ExtensionAPI): void {
  let release: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI || release) return;
    release = installToolCardBridge(ToolExecutionComponent.prototype, {
      matches: (name) => name === "ask_user_question",
      duration: () => undefined,
      render: renderQuestionCard,
    });
    if (!release) ctx.ui.notify("Esta versión de Pi no admite la presentación de respuestas de Ein; se mantiene la presentación nativa.", "warning");
  });
  pi.on("session_shutdown", () => { release?.(); release = undefined; });
}
