import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  [
    "ceilingFilteredBuiltinTools.filter((tool) => hostAvailableSet.has(tool) || NATIVE_COORDINATION_TOOL_NAMES.has(tool))",
    "ceilingFilteredBuiltinTools.filter((tool) => !PI_BUILTIN_TOOL_NAMES.has(tool) || hostAvailableSet.has(tool) || NATIVE_COORDINATION_TOOL_NAMES.has(tool))",
  ],
  [
    "ceilingFilteredBuiltinTools.filter((tool) => !hostAvailableSet.has(tool) && !NATIVE_COORDINATION_TOOL_NAMES.has(tool))",
    "ceilingFilteredBuiltinTools.filter((tool) => PI_BUILTIN_TOOL_NAMES.has(tool) && !hostAvailableSet.has(tool) && !NATIVE_COORDINATION_TOOL_NAMES.has(tool))",
  ],
] as const;

// COMPAT -> 0.67 confunde herramientas de extensión con nativas al aplicar el inventario del padre.
export function repairSubagentToolPlan(source: string): string {
	// pi-subagents 0.68 already prunes host builtins without the legacy
	// coordination exception; it is compatible as-is and needs no rewrite.
	if (source.includes("const declaredBuiltinTools = hostAvailableSet")
		&& source.includes("ceilingFilteredBuiltinTools.filter((tool) => !PI_BUILTIN_TOOL_NAMES.has(tool) || hostAvailableSet.has(tool))")
		&& source.includes("ceilingFilteredBuiltinTools.filter((tool) => PI_BUILTIN_TOOL_NAMES.has(tool) && !hostAvailableSet.has(tool))")) return source;
	let result = source;
  for (const [before, after] of RULES) {
    if (result.includes(after) && !result.includes(before)) continue;
    if (result.split(before).length !== 2 || result.includes(after)) throw new Error("pi-subagents: contrato de herramientas desconocido; actualiza la compatibilidad de Ein antes de instalar");
    result = result.replace(before, after);
  }
  return result;
}

export function ensureSubagentToolCompatibility(agentDir: string): void {
  const root = join(agentDir, "npm/node_modules/pi-subagents");
  const path = join(root, "src/runs/shared/child-tool-plan.ts");
  const source = readFileSync(path, "utf8");
  const repaired = repairSubagentToolPlan(source);
  if (repaired === source) return;
  const temporary = `${path}.${randomUUID()}.ein-tmp`;
  try {
    writeFileSync(temporary, repaired, { mode: 0o644, flag: "wx" });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
