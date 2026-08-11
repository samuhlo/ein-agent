import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { ProbeView, RENDER_MARKER, type ResizeObservation } from "./probe-view";

const DEFAULT_SMOKE_MS = 250;
const RESIZE_WIDTH = 47;
const RESIZE_HEIGHT = 13;

type ProbeEvidence = {
  format: "ein-opentui-solid-probe/v1";
  marker: string;
  resize: ResizeObservation[];
  destroyed: boolean;
  boundedMs: number;
};

async function delay(milliseconds: number): Promise<void> {
  await Bun.sleep(milliseconds);
}

async function main(): Promise<void> {
  const smoke = process.argv.includes("--smoke");
  if (!smoke) throw new Error("This isolated probe only supports bounded --smoke execution");

  const boundedMs = Number(process.env.EIN_SPIKE_SMOKE_MS ?? DEFAULT_SMOKE_MS);
  if (!Number.isFinite(boundedMs) || boundedMs < 50 || boundedMs > 5_000) {
    throw new Error("EIN_SPIKE_SMOKE_MS must be between 50 and 5000");
  }

  const resize: ResizeObservation[] = [];
  let destroyed = false;
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    clearOnShutdown: true,
    exitOnCtrlC: false,
    useKittyKeyboard: null,
    consoleMode: "disabled",
  });
  renderer.once(CliRenderEvents.DESTROY, () => {
    destroyed = true;
  });
  renderer.on(CliRenderEvents.RESIZE, (width: number, height: number) => {
    resize.push({ width, height });
  });

  const timeout = setTimeout(() => renderer.destroy(), boundedMs);
  try {
    await render(() => <ProbeView />, renderer);
    await delay(Math.min(75, boundedMs / 3));
    renderer.resize(RESIZE_WIDTH, RESIZE_HEIGHT);
    await delay(Math.min(75, boundedMs / 3));
  } finally {
    clearTimeout(timeout);
    renderer.destroy();
  }

  const evidence: ProbeEvidence = {
    format: "ein-opentui-solid-probe/v1",
    marker: RENDER_MARKER,
    resize,
    destroyed,
    boundedMs,
  };
  process.stdout.write(`\nEIN_OPENTUI_SOLID_EVIDENCE ${JSON.stringify(evidence)}\n`);

  if (!destroyed || !resize.some(({ width, height }) => width === RESIZE_WIDTH && height === RESIZE_HEIGHT)) {
    process.exitCode = 1;
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
