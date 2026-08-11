import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { relativeArtifactPath } from "../src/package-layout";
import { currentTarget, type Surface } from "../src/targets";
import { ROOT } from "./shared";

export type SmokeResult = {
  surface: Surface;
  target: string;
  status: "pass" | "blocked";
  exitCode: number | null;
  elapsedMs: number;
  markerObserved: boolean;
  resizeObserved: boolean;
  destroyed: boolean;
  pty: true;
  isolatedRuntime: true;
  rawEvidencePath: string;
};

async function runBounded(command: string[], env: Record<string, string | undefined>): Promise<{
  exitCode: number | null;
  output: string;
  elapsedMs: number;
}> {
  const started = performance.now();
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 5_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timeout));
  return { exitCode, output: `${stdout}${stderr}`, elapsedMs: performance.now() - started };
}

export async function smokeSurface(surface: Surface): Promise<SmokeResult> {
  const target = currentTarget();
  const binary = join(ROOT, "staged", surface, target.id, relativeArtifactPath(surface));
  const rawEvidencePath = join(ROOT, "evidence", "raw", `smoke-${surface}-${target.id}.txt`);
  await mkdir(join(ROOT, "evidence", "raw"), { recursive: true });

  const command = process.platform === "darwin"
    ? ["script", "-q", "/dev/null", binary, "--smoke"]
    : ["script", "-qefc", `${binary} --smoke`, "/dev/null"];
  const run = await runBounded(command, {
    HOME: "/nonexistent/ein-spike-home",
    PATH: "/usr/bin:/bin",
    BUN_INSTALL: "/nonexistent/ein-spike-bun",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "",
    OPENTUI_LIBC: target.libc ?? undefined,
    TERM: "xterm-256color",
    EIN_SPIKE_SMOKE_MS: "250",
  });
  await Bun.write(rawEvidencePath, run.output);

  const evidenceMatch = /EIN_OPENTUI_SOLID_EVIDENCE (\{[^\r\n]+\})/.exec(run.output);
  const evidence = evidenceMatch?.[1]
    ? JSON.parse(evidenceMatch[1]) as { marker?: string; resize?: Array<{ width: number; height: number }>; destroyed?: boolean }
    : null;
  const markerObserved = run.output.includes("EIN_OPENTUI_SOLID_RENDERED") && evidence?.marker === "EIN_OPENTUI_SOLID_RENDERED";
  const resizeObserved = evidence?.resize?.some(({ width, height }) => width === 47 && height === 13) ?? false;
  const destroyed = evidence?.destroyed === true;
  const status = run.exitCode === 0 && markerObserved && resizeObserved && destroyed ? "pass" : "blocked";
  return {
    surface,
    target: target.id,
    status,
    exitCode: run.exitCode,
    elapsedMs: Number(run.elapsedMs.toFixed(3)),
    markerObserved,
    resizeObserved,
    destroyed,
    pty: true,
    isolatedRuntime: true,
    rawEvidencePath: rawEvidencePath.slice(ROOT.length + 1),
  };
}

if (import.meta.main) {
  const requested = process.argv.slice(2) as Surface[];
  const surfaces = requested.length > 0 ? requested : ["pi", "claude"] satisfies Surface[];
  const results = [];
  for (const surface of surfaces) results.push(await smokeSurface(surface));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(({ status }) => status !== "pass")) process.exitCode = 1;
}
