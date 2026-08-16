import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildTerminalApp } from "../../../installer/scripts/build-terminal-app.ts";
import { writeCandidateInventory } from "../src/candidate-artifact";
import { candidateArtifactName, targetById } from "../src/targets";
import { assertNativePackage, ROOT } from "./shared";

const requested = process.argv.slice(2);
if (requested.length !== 1) throw new Error("Usage: bun run build:candidate -- <target>");
const target = targetById(requested[0] ?? "");
await assertNativePackage(target);

await mkdir(join(ROOT, "dist"), { recursive: true });
const outfile = join(ROOT, "dist", candidateArtifactName(target));
await buildTerminalApp(target, outfile);
await writeCandidateInventory(ROOT, target);
console.log(`built ${target.id}: ${outfile}`);
