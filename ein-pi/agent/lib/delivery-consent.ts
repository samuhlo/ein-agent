import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { DeliveryPreview } from "./delivery-preview.ts";

export class DeliveryConsent implements Component {
  private offset = 0;
  private selected = 1;
  private expanded = false;
  private maxOffset = 0;
  constructor(private preview: DeliveryPreview, private theme: Pick<Theme, "fg" | "bold">, private rows: () => number, private done: (approved: boolean) => void, private refresh: () => void) {}
  invalidate() {}
  handleInput(data: string): void {
    const keys = getKeybindings();
    if (keys.matches(data, "tui.select.cancel")) { this.done(false); return; }
    if (keys.matches(data, "tui.select.confirm") || data === "\n") { this.done(this.selected === 0); return; }
    if (data.toLowerCase() === "d") { this.expanded = !this.expanded; this.offset = 0; }
    else if (matchesKey(data, "tab") || matchesKey(data, "left") || matchesKey(data, "right")) this.selected = 1 - this.selected;
    else if (this.expanded && keys.matches(data, "tui.select.up")) this.offset = Math.max(0, this.offset - 1);
    else if (this.expanded && keys.matches(data, "tui.select.down")) this.offset = Math.min(this.maxOffset, this.offset + 1);
    this.refresh();
  }
  render(width: number): string[] {
    const inner = Math.max(1, width - 4);
    const available = Math.max(4, this.rows() - 4);
    const summary = this.preview.summary ?? this.preview.body.split("\n").slice(0, 3);
    const details = wrapTextWithAnsi(this.preview.details ?? this.preview.body, inner);
    const optionLabels = ["Autorizar entrega", "Cancelar"];
    const options = optionLabels.map((label, i) => i === this.selected
      ? this.theme.fg("accent", this.theme.bold(`[ ${label} ]`)) : this.theme.fg("muted", label));
    const buttons = inner < 46 ? options : [options.join("    ")];
    const hint = inner < 42 ? "d/tab · enter · esc cancela" : "d detalles · ←→/tab elegir · enter aceptar · esc cancelar";
    const footer = [...buttons, this.theme.fg("dim", truncateToWidth(hint, inner))];
    const heading = this.theme.fg("accent", this.theme.bold("ein  /  ENTREGA"));
    const action = this.theme.fg("text", this.theme.bold(summary[0] ?? this.preview.title));
    const meta = summary.slice(1, this.expanded ? 3 : 5).map((line) => this.theme.fg("muted", line));
    const toggle = this.theme.fg("accent", this.expanded ? "▾ Ocultar detalles (d)" : "▸ Ver detalles (d)");
    const fixed = [heading, action, ...meta, toggle];
    const room = Math.max(0, available - fixed.length - footer.length);
    const detailBudget = this.expanded ? room : 0;
    this.maxOffset = Math.max(0, details.length - detailBudget);
    this.offset = Math.min(this.offset, this.maxOffset);
    const shown = this.expanded ? details.slice(this.offset, this.offset + detailBudget).map((line) => this.theme.fg("text", line)) : [];
    const content = [...fixed, ...shown, ...footer];
    const edge = (left: string, right: string) => this.theme.fg("borderAccent", left + "─".repeat(Math.max(0, width - 2)) + right);
    return [edge("╭", "╮"), ...content.map((line) => {
      const value = truncateToWidth(line, inner);
      return `${this.theme.fg("borderMuted", "│")} ${value}${" ".repeat(Math.max(0, inner - visibleWidth(value)))} ${this.theme.fg("borderMuted", "│")}`;
    }), edge("╰", "╯")].map((line) => truncateToWidth(line, Math.max(1, width)));
  }
}

export async function askDeliveryConsent(ctx: ExtensionContext, preview: DeliveryPreview): Promise<boolean> {
  return ctx.ui.custom<boolean>((tui, theme, _keys, done) =>
    new DeliveryConsent(preview, theme, () => tui.terminal.rows, done, () => tui.requestRender()), {
      overlay: true,
      overlayOptions: { width: 76, maxHeight: "90%", anchor: "center", margin: 1 },
    });
}
