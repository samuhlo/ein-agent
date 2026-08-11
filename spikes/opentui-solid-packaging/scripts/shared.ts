import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceProvenance } from "../src/package-layout";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString().trim();
}

export async function sourceProvenance(): Promise<SourceProvenance> {
  return {
    repository: "ein-agent",
    commit: git("rev-parse", "HEAD"),
    worktree: git("status", "--short").length === 0 ? "clean" : "dirty",
    lockSha256: await fileSha256(join(ROOT, "bun.lock")),
    entrySha256: await fileSha256(join(ROOT, "src", "probe.tsx")),
    buildRuntime: `bun-${Bun.version}`,
  };
}

export async function filesUnder(path: string): Promise<string[]> {
  const metadata = await stat(path);
  if (metadata.isFile()) return [path];
  const files: string[] = [];
  for (const entry of (await readdir(path)).sort()) {
    if (entry === "node_modules") continue;
    files.push(...await filesUnder(join(path, entry)));
  }
  return files;
}
