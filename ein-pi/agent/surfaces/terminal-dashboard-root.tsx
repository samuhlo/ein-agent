import { useRenderer } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import type { TerminalAppController } from "../lib/terminal-app-controller.ts";
import { TerminalDashboardView } from "./terminal-dashboard-view.tsx";

export function TerminalDashboardRoot(props: Readonly<{ controller: TerminalAppController }>) {
  const renderer = useRenderer();
  const [model, setModel] = createSignal(props.controller.snapshot());
  const [size, setSize] = createSignal({ width: renderer.width, height: renderer.height });
  const unsubscribe = props.controller.subscribe(setModel);
  const onResize = (width: number, height: number): void => { setSize({ width, height }); };
  renderer.on("resize", onResize);
  onCleanup(() => {
    unsubscribe();
    renderer.off("resize", onResize);
  });
  return <TerminalDashboardView view={() => ({ model: model(), ...size() })} />;
}
