import solidPlugin from "@opentui/solid/bun-plugin";
import { dirname, join } from "node:path";
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
  const result = await Bun.build(terminalAppBuildOptions(target, outfile));
  if (!result.success) throw new AggregateError(result.logs, `Terminal app build failed for ${target.bunTarget}`);
}
