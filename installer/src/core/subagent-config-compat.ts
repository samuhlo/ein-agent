import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// pi-subagents rejects this retired key before sessions can be opened.
export function removeRetiredSubagentConfig(agentDir: string): boolean {
  const path = join(agentDir, "extensions/subagent/config.json");
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isFile()) throw new Error("subagent/config.json debe ser un archivo regular");
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("subagent/config.json debe contener un objeto JSON");
  }
  if (!Object.hasOwn(config, "modelExclusions")) return false;
  delete config.modelExclusions;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return true;
}
