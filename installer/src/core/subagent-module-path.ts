import { existsSync } from "node:fs";
import { join } from "node:path";

// COMPAT -> Published 0.70 packages contain executable JS instead of TS sources.
export function subagentModulePath(root: string, sourcePath: string): string {
  for (const relative of [sourcePath.replace(/\.ts$/, ".js"), sourcePath]) {
    const path = join(root, relative);
    if (existsSync(path)) return path;
  }
  throw new Error(`pi-subagents: módulo no disponible: ${sourcePath}`);
}
