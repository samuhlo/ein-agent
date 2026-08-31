import solidPlugin from "@opentui/solid/bun-plugin";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type TerminalAppBuildTarget = Readonly<{
  bunTarget: string;
  libc: "glibc" | null;
}>;

export function terminalAppBuildOptions(target: TerminalAppBuildTarget, outfile: string): Bun.BuildConfig {
  return {
    entrypoints: [join(REPO_ROOT, "ein-pi", "agent", "app.ts")],
    target: "bun",
    plugins: [solidPlugin],
    define: target.libc ? { "process.env.OPENTUI_LIBC": JSON.stringify(target.libc) } : undefined,
    compile: { target: target.bunTarget as Bun.Build.CompileTarget, outfile },
  };
}

export async function buildTerminalApp(target: TerminalAppBuildTarget, outfile: string): Promise<void> {
  const originalCwd = process.cwd();
  const buildDirectory = mkdtempSync(join(tmpdir(), "ein-terminal-app-build-"));
  try {
    // Bun writes its native `.bun-build` scratch file into process.cwd().
    // This build helper is serialized by the packaging scripts, so isolate the
    // global cwd for the duration and always remove the owned directory.
    process.chdir(buildDirectory);
    const result = await Bun.build(terminalAppBuildOptions(target, resolve(originalCwd, outfile)));
    if (!result.success) throw new AggregateError(result.logs, `Terminal app build failed for ${target.bunTarget}`);
  } finally {
    process.chdir(originalCwd);
    rmSync(buildDirectory, { recursive: true, force: true });
  }
}
