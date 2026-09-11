import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings, truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { DeliveryPreview } from "./delivery-preview.ts";

export class DeliveryConsent implements Component {
  private offset = 0;
  private selected = 0;
  private maxOffset = 0;
  constructor(private preview: DeliveryPreview, private theme: Pick<Theme, "fg" | "bold">, private rows: () => number, private done: (approved: boolean) => void, private refresh: () => void) {}
  invalidate() {}
  handleInput(data: string): void {
    const keys = getKeybindings();
    if (keys.matches(data, "tui.select.cancel")) { this.done(false); return; }
    if (keys.matches(data, "tui.select.confirm") || data === "\n") { this.done(this.selected === 0); return; }
    if (data === "\t" || data === "\x1b[C" || data === "\x1b[D") this.selected = 1 - this.selected;
    else if (keys.matches(data, "tui.select.up")) this.offset = Math.max(0, this.offset - 1);
    else if (keys.matches(data, "tui.select.down")) this.offset = Math.min(this.maxOffset, this.offset + 1);
    this.refresh();
  }
  render(width: number): string[] {
    const inner = Math.max(1, width - 2);
    const body = wrapTextWithAnsi(this.preview.body, inner);
    const budget = Math.max(1, Math.min(14, this.rows() - 9));
    this.maxOffset = Math.max(0, body.length - budget);
    this.offset = Math.min(this.offset, this.maxOffset);
    const title = this.theme.fg("accent", this.theme.bold(`ein · ${this.preview.title}`));
    const buttons = ["Autorizar entrega", "Cancelar"].map((label, i) => this.theme.fg(i === this.selected ? "accent" : "muted", `${i === this.selected ? "→ " : ""}${label}`)).join("    ");
    return [
      title, "",
      ...body.slice(this.offset, this.offset + budget).map((line) => this.theme.fg("text", line)),
      this.maxOffset ? this.theme.fg("dim", `Detalle ${this.offset + 1}–${Math.min(body.length, this.offset + budget)} de ${body.length} · ↑↓ desplazar`) : "",
      "", buttons,
      this.theme.fg("dim", "←→ opción · enter confirmar · esc cancelar"),
    ].map((line) => truncateToWidth(line, Math.max(1, width)));
  }
}

export async function askDeliveryConsent(ctx: ExtensionContext, preview: DeliveryPreview): Promise<boolean> {
  return ctx.ui.custom<boolean>((tui, theme, _keys, done) =>
    new DeliveryConsent(preview, theme, () => tui.terminal.rows, done, () => tui.requestRender()));
}
