import solidPlugin from "@opentui/solid/bun-plugin";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeCandidateInventory } from "../src/candidate-artifact";
import { candidateArtifactName, targetById } from "../src/targets";
import { assertNativePackage, ROOT } from "./shared";

const requested = process.argv.slice(2);
if (requested.length !== 1) throw new Error("Usage: bun run build:candidate -- <target>");
const target = targetById(requested[0] ?? "");
const sourceRevision = process.env.EIN_SOURCE_REVISION ?? Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT }).stdout.toString().trim();
if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("EIN_SOURCE_REVISION must be a full commit SHA");
await assertNativePackage(target);

await mkdir(join(ROOT, "dist"), { recursive: true });
const outfile = join(ROOT, "dist", candidateArtifactName(target));
const result = await Bun.build({
  entrypoints: [join(ROOT, "src", "dashboard-candidate.tsx")],
  target: "bun",
  plugins: [solidPlugin],
  define: target.libc === "glibc" ? { "process.env.OPENTUI_LIBC": JSON.stringify("glibc") } : undefined,
  compile: { target: target.bunTarget, outfile },
});
if (!result.success) throw new AggregateError(result.logs, "Dashboard candidate build failed");
await writeCandidateInventory(ROOT, target, sourceRevision);
console.log(`built ${target.id}: ${outfile}`);
