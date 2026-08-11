import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { artifactPath } from "../src/package-layout";
import type { SmokeResult } from "./smoke";
import { smokeSurface } from "./smoke";
import { currentTarget } from "../src/targets";
import { filesUnder, ROOT } from "./shared";

type PackageJson = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

async function runtimePackageClosure(nativePackage: string): Promise<string[]> {
  const pending = ["@opentui/core", "@opentui/solid", "solid-js", nativePackage];
  const found = new Set<string>();
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || found.has(name)) continue;
    const path = join(ROOT, "node_modules", ...name.split("/"));
    const packageJsonPath = join(path, "package.json");
    if (!await Bun.file(packageJsonPath).exists()) continue;
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
    found.add(name);
    for (const dependency of Object.keys(packageJson.dependencies ?? {})) pending.push(dependency);
    for (const dependency of Object.keys(packageJson.peerDependencies ?? {})) pending.push(dependency);
    for (const dependency of Object.keys(packageJson.optionalDependencies ?? {})) {
      if (!dependency.startsWith("@opentui/core-") || dependency === nativePackage) pending.push(dependency);
    }
  }
  return [...found].sort();
}

async function comparisonSize(nativePackage: string): Promise<{ packages: string[]; installedBytes: number; compressedBytes: number }> {
  const packages = await runtimePackageClosure(nativePackage);
  const chunks: Uint8Array[] = [];
  let installedBytes = 0;
  for (const packageName of packages) {
    const packageRoot = join(ROOT, "node_modules", ...packageName.split("/"));
    for (const file of await filesUnder(packageRoot)) {
      const bytes = await readFile(file);
      const header = new TextEncoder().encode(`${relative(ROOT, file)}\0${bytes.byteLength}\0`);
      chunks.push(header, bytes);
      installedBytes += bytes.byteLength;
    }
  }
  const content = Buffer.concat(chunks);
  return { packages, installedBytes, compressedBytes: Bun.gzipSync(content).byteLength };
}

function percentile(samples: number[], fraction: number): number {
  const sorted = samples.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

export async function collectMetrics(_firstRuns: SmokeResult[]): Promise<Record<string, unknown>> {
  const target = currentTarget();
  const binary = artifactPath(ROOT, target);
  const binaryBytes = await readFile(binary);
  await smokeSurface("pi");
  const samples: number[] = [];
  for (let index = 0; index < 5; index += 1) samples.push((await smokeSurface("pi")).elapsedMs);
  const comparison = await comparisonSize(target.nativePackage);
  return {
    scope: "current-host-only",
    target: target.id,
    primaryStandalone: {
      installedBytes: (await stat(binary)).size,
      compressedBytes: Bun.gzipSync(binaryBytes).byteLength,
    },
    comparisonPackageClosure: {
      ...comparison,
      runtimeRequirement: "external Bun runtime plus staged package resolution",
      acceptance: "partial",
    },
    startup: {
      harness: "real PTY, isolated HOME/PATH, blocked proxy, bounded --smoke",
      warmups: 1,
      samplesMs: samples,
      medianMs: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
    },
  };
}
