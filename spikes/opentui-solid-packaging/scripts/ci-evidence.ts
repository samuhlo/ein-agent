import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CellInventory } from "../src/package-layout";
import { currentTarget, SURFACES, targetById } from "../src/targets";
import { smokeSurface } from "./smoke";
import { ROOT } from "./shared";

const requested = process.argv[2];
if (!requested) throw new Error("Target id is required");
const target = targetById(requested);
if (currentTarget().id !== target.id) {
  throw new Error(`Fail closed: runner is ${currentTarget().id}, requested native target is ${target.id}`);
}

const inventories: CellInventory[] = [];
const runtime = [];
for (const surface of SURFACES) {
  inventories.push(JSON.parse(await readFile(join(ROOT, "evidence", "inventories", `${surface}-${target.id}.json`), "utf8")) as CellInventory);
  runtime.push(await smokeSurface(surface));
}
const status = runtime.every((result) => result.status === "pass") ? "pass" : "blocked";
const fragment = {
  format: "ein-opentui-solid-native-evidence/v1",
  target: target.id,
  runner: { os: process.platform, arch: process.arch, libc: target.libc },
  status,
  inventories,
  runtime,
};
await Bun.write(join(ROOT, "evidence", `native-${target.id}.json`), `${JSON.stringify(fragment, null, 2)}\n`);
console.log(JSON.stringify(fragment, null, 2));
if (status !== "pass") process.exitCode = 1;
