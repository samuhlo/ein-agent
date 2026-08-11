import solidPlugin from "@opentui/solid/bun-plugin";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactName, TARGETS, targetById, type Target } from "../src/targets";
import { ROOT } from "./shared";

async function assertNativePackage(target: Target): Promise<void> {
  const packageJsonPath = join(ROOT, "node_modules", ...target.nativePackage.split("/"), "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { name?: string; version?: string };
  if (packageJson.name !== target.nativePackage || packageJson.version !== "0.5.1") {
    throw new Error(`Expected ${target.nativePackage}@0.5.1; run bun install --frozen-lockfile --os=\"*\" --cpu=\"*\"`);
  }
}

async function buildTarget(target: Target): Promise<void> {
  await assertNativePackage(target);
  const outfile = join(ROOT, "dist", artifactName(target));
  const result = await Bun.build({
    entrypoints: [join(ROOT, "src", "probe.tsx")],
    target: "bun",
    plugins: [solidPlugin],
    define: target.libc === "glibc" ? { "process.env.OPENTUI_LIBC": JSON.stringify("glibc") } : undefined,
    compile: {
      target: target.bunTarget,
      outfile,
    },
  });
  if (!result.success) {
    throw new AggregateError(result.logs, `Build failed for ${target.id}`);
  }
  console.log(`built ${target.id}: ${outfile}`);
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested.map(targetById) : [...TARGETS];
await mkdir(join(ROOT, "dist"), { recursive: true });
for (const target of targets) await buildTarget(target);
