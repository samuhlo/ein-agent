import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { DeliveryPreview } from "./delivery-preview.ts";

export class DeliveryConsent implements Component {
  private offset = 0;
  private selected = 1;
  private maxOffset = 0;
  constructor(private preview: DeliveryPreview, private theme: Pick<Theme, "fg" | "bold">, private rows: () => number, private done: (approved: boolean) => void, private refresh: () => void) {}
  invalidate() {}
  handleInput(data: string): void {
    const keys = getKeybindings();
    if (keys.matches(data, "tui.select.cancel")) { this.done(false); return; }
    if (keys.matches(data, "tui.select.confirm") || data === "\n") { this.done(this.selected === 0); return; }
    if (matchesKey(data, "tab") || matchesKey(data, "left") || matchesKey(data, "right")) this.selected = 1 - this.selected;
    else if (keys.matches(data, "tui.select.up")) this.offset = Math.max(0, this.offset - 1);
    else if (keys.matches(data, "tui.select.down")) this.offset = Math.min(this.maxOffset, this.offset + 1);
    this.refresh();
  }
  render(width: number): string[] {
    const inner = Math.max(1, width - 4);
    const body = wrapTextWithAnsi(this.preview.body, inner);
    const height = Math.max(8, Math.min(24, this.rows() - 2));
    const options = ["Autorizar entrega", "Cancelar"].map((label, i) => i === this.selected
      ? this.theme.fg("accent", this.theme.bold(`[ ${label} ]`)) : this.theme.fg("muted", label));
    const buttons = inner < 40 ? options : [options.join("    ")];
    const hints = wrapTextWithAnsi("←→ / tab elegir · enter aceptar · esc cancelar", inner).map((line) => this.theme.fg("dim", line));
    const budget = Math.max(0, height - 6 - buttons.length - hints.length);
    this.maxOffset = Math.max(0, body.length - budget);
    this.offset = Math.min(this.offset, this.maxOffset);
    const title = this.theme.fg("accent", this.theme.bold(`ein · ${this.preview.title}`));
    const content = [title, "", ...body.slice(this.offset, this.offset + budget).map((line) => this.theme.fg("text", line)),
      this.theme.fg("dim", this.maxOffset ? `↑↓ Detalle ${this.offset + 1}–${Math.min(body.length, this.offset + budget)} de ${body.length}` : ""),
      "", ...buttons, ...hints];
    const edge = (left: string, right: string) => this.theme.fg("muted", left + "─".repeat(Math.max(0, width - 2)) + right);
    return [edge("╭", "╮"), ...content.map((line) => {
      const text = truncateToWidth(line, inner);
      return `${this.theme.fg("muted", "│")} ${text}${" ".repeat(Math.max(0, inner - visibleWidth(text)))} ${this.theme.fg("muted", "│")}`;
    }), edge("╰", "╯")].map((line) => truncateToWidth(line, Math.max(1, width)));
  }
}

export async function askDeliveryConsent(ctx: ExtensionContext, preview: DeliveryPreview): Promise<boolean> {
  return ctx.ui.custom<boolean>((tui, theme, _keys, done) =>
    new DeliveryConsent(preview, theme, () => tui.terminal.rows, done, () => tui.requestRender()), {
      overlay: true,
      overlayOptions: { width: 84, maxHeight: "95%", anchor: "center", margin: 1 },
    });
}
