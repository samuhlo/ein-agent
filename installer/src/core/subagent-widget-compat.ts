import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { subagentModulePath } from "./subagent-module-path.ts";

const RULES = {
  "src/shared/types.ts": [[
    "export const WIDGET_ANIMATION_INTERVAL_MS = 1000;",
    "export const WIDGET_ANIMATION_INTERVAL_MS = 80;",
  ]],
  "src/tui/render.ts": [[
    "\tif (frame === undefined) return seed;\n\treturn (seed ?? 0) + frame;",
    "\treturn frame ?? seed;",
  ]],
  "src/runs/background/async-job-tracker.ts": [
    ["let nextWidgetAnimationAt = Date.now() + WIDGET_ANIMATION_INTERVAL_MS;",
      "let lastWidgetAnimationFrame = Math.floor(Date.now() / WIDGET_ANIMATION_INTERVAL_MS);"],
    ["if (runningJobIds.size > 0 && now >= nextWidgetAnimationAt) {\n\t\t\t\tnextWidgetAnimationAt = now + WIDGET_ANIMATION_INTERVAL_MS;",
      "const animationFrame = Math.floor(now / WIDGET_ANIMATION_INTERVAL_MS);\n\t\t\tif (runningJobIds.size > 0 && animationFrame !== lastWidgetAnimationFrame) {\n\t\t\t\tlastWidgetAnimationFrame = animationFrame;"],
  ],
} as const;

export const SUBAGENT_WIDGET_FILES = Object.keys(RULES) as (keyof typeof RULES)[];

/** The clock owns animation phase; tool counters must not move the spinner. */
export function repairSubagentWidget(path: keyof typeof RULES, source: string): string {
  let result = source;
  for (const [before, after] of RULES[path]) {
    const compiledBefore = before.replaceAll("\t", "    ").replace("if (frame === undefined) return seed;", "if (frame === undefined)\n        return seed;");
    const compiledAfter = after.replaceAll("\t", "    ");
    const candidate = result.includes(before) || result.includes(after) ? [before, after] : [compiledBefore, compiledAfter];
    const [needle, replacement] = candidate as [string, string];
    if (result.includes(replacement) && !result.includes(needle)) continue;
    if (result.split(needle).length !== 2 || result.includes(replacement)) {
      throw new Error(`pi-subagents: contrato de animación desconocido en ${path}`);
    }
    result = result.replace(needle, replacement);
  }
  return result;
}

/** Validate all three files before changing any; package refreshes overwrite them. */
export function ensureSubagentWidgetCompatibility(agentDir: string): void {
  const root = join(agentDir, "npm/node_modules/pi-subagents");
  const changes = SUBAGENT_WIDGET_FILES.map((file) => {
    const path = subagentModulePath(root, file);
    const source = readFileSync(path, "utf8");
    return { path, source, repaired: repairSubagentWidget(file, source), mode: statSync(path).mode & 0o777,
      temporary: `${path}.${randomUUID()}.ein-tmp` };
  }).filter((change) => change.repaired !== change.source);
  const published: typeof changes = [];
  try {
    for (const change of changes) writeFileSync(change.temporary, change.repaired, { mode: change.mode, flag: "wx" });
    for (const change of changes) {
      renameSync(change.temporary, change.path);
      published.push(change);
    }
  } catch (error) {
    for (const change of published) writeFileSync(change.path, change.source, { mode: change.mode });
    throw error;
  } finally {
    for (const change of changes) rmSync(change.temporary, { force: true });
  }
}
