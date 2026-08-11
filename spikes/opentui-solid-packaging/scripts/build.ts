import solidPlugin from "@opentui/solid/bun-plugin";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { artifactName, TARGETS, targetById, type Target } from "../src/targets";
import { assertNativePackage, ROOT } from "./shared";

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
