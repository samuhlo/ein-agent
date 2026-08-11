import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { artifactPath, stageCell, type CellInventory } from "../src/package-layout";
import { SURFACES, TARGETS, targetById } from "../src/targets";
import { ROOT, sourceProvenance } from "./shared";

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested.map(targetById) : [...TARGETS];
const stagedRoot = join(ROOT, "staged");
const inventoryRoot = join(ROOT, "evidence", "inventories");
const provenance = await sourceProvenance();

if (requested.length === 0) {
  await rm(stagedRoot, { recursive: true, force: true });
  await rm(inventoryRoot, { recursive: true, force: true });
}
await mkdir(inventoryRoot, { recursive: true });

const inventories: CellInventory[] = [];
for (const surface of SURFACES) {
  for (const target of targets) {
    const inventory = await stageCell({
      root: stagedRoot,
      surface,
      target,
      sourceArtifact: artifactPath(ROOT, target),
      provenance,
    });
    inventories.push(inventory);
    await Bun.write(
      join(inventoryRoot, `${surface}-${target.id}.json`),
      `${JSON.stringify(inventory, null, 2)}\n`,
    );
  }
}

console.log(`staged ${inventories.length} package cells`);
