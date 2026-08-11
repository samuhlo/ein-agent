export const RENDER_MARKER = "EIN_OPENTUI_SOLID_RENDERED";

export type ResizeObservation = {
  width: number;
  height: number;
};

export function ProbeView() {
  return (
    <box flexDirection="column" border padding={1}>
      <text>{RENDER_MARKER}</text>
      <text>resize:renderer-event</text>
    </box>
  );
}
