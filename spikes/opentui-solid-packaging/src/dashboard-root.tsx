import { useRenderer } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import type { TerminalAppController } from "../../../ein-pi/agent/lib/terminal-app-controller.ts";
import { DashboardCandidate } from "./dashboard-view";

export function DashboardRoot(props: Readonly<{ controller: TerminalAppController }>) {
  const renderer = useRenderer();
  const [model, setModel] = createSignal(props.controller.snapshot());
  const [size, setSize] = createSignal({ width: renderer.width, height: renderer.height });
  const unsubscribe = props.controller.subscribe((snapshot) => { setModel(snapshot); });
  const onResize = (width: number, height: number): void => { setSize({ width, height }); };
  renderer.on("resize", onResize);
  onCleanup(() => {
    unsubscribe();
    renderer.off("resize", onResize);
  });

  return <DashboardCandidate view={() => ({ model: model(), ...size() })} />;
}
