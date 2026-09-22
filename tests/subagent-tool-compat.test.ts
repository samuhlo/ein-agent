import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSubagentToolCompatibility, repairSubagentToolPlan } from "../installer/src/core/subagent-tool-compat.ts";
import { installDeclaredPackages } from "../installer/src/core/deps.ts";
import { resolvePiInstallContext } from "../installer/src/core/paths.ts";
import { subagentModulePath } from "../installer/src/core/subagent-module-path.ts";

const source = `const declared = ceilingFilteredBuiltinTools.filter((tool) => hostAvailableSet.has(tool) || NATIVE_COORDINATION_TOOL_NAMES.has(tool));
const omitted = ceilingFilteredBuiltinTools.filter((tool) => !hostAvailableSet.has(tool) && !NATIVE_COORDINATION_TOOL_NAMES.has(tool));`;

test("repairs both sides of the host filter once, preserving unrelated code", () => {
  const fixed = repairSubagentToolPlan(source + "\nconst sentinel = 1;");
  expect(fixed).toContain("!PI_BUILTIN_TOOL_NAMES.has(tool) || hostAvailableSet.has(tool)");
  expect(fixed).toContain("PI_BUILTIN_TOOL_NAMES.has(tool) && !hostAvailableSet.has(tool)");
  expect(fixed).toEndWith("const sentinel = 1;");
  expect(repairSubagentToolPlan(fixed)).toBe(fixed);
  expect(() => repairSubagentToolPlan("unknown upstream format")).toThrow("contrato de herramientas desconocido");
});

test("accepts the current upstream host filter without rewriting it", () => {
	const current = `const declaredBuiltinTools = hostAvailableSet
	  ? ceilingFilteredBuiltinTools.filter((tool) => !PI_BUILTIN_TOOL_NAMES.has(tool) || hostAvailableSet.has(tool))
	  : ceilingFilteredBuiltinTools;
const unavailableHostBuiltins = hostAvailableSet
	  ? ceilingFilteredBuiltinTools.filter((tool) => PI_BUILTIN_TOOL_NAMES.has(tool) && !hostAvailableSet.has(tool))
	  : [];`;
	expect(repairSubagentToolPlan(current)).toBe(current);
});

test("compiled child plans retain strict requirements and extension tools unchanged", () => {
  const current = `const declaredBuiltinTools = ceilingFilteredBuiltinTools;
const effectiveDeclaredBuiltinTools = declaredBuiltinTools.filter((tool) => !excludedToolSet.has(tool));
const requiredChildTools = explicitToolAllowlist ? [...(input.tools !== undefined ? effectiveDeclaredBuiltinTools : [])] : [];`;
  expect(repairSubagentToolPlan(current)).toBe(current);
  expect(() => repairSubagentToolPlan(current.replace("const requiredChildTools", "const ignored"))).toThrow();
  const home = mkdtempSync(join(tmpdir(), "ein-js-tools-"));
  const root = join(home, "npm/node_modules/pi-subagents");
  const relative = "src/runs/shared/child-tool-plan.ts";
  const file = join(root, relative.replace(/\.ts$/, ".js"));
  try {
    mkdirSync(join(file, ".."), { recursive: true });
    expect(() => subagentModulePath(root, relative)).toThrow("módulo no disponible");
    writeFileSync(file, current);
    ensureSubagentToolCompatibility(home);
    expect(readFileSync(file, "utf8")).toBe(current);
    expect(subagentModulePath(root, relative)).toBe(file);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("package installation reconciles child tools and rejects an unsupported upstream without changing it", async () => {
  const home = mkdtempSync(join(tmpdir(), "ein-subagent-compat-"));
  const ctx = resolvePiInstallContext(home);
  const file = join(ctx.agentDir, "npm/node_modules/pi-subagents/src/runs/shared/child-tool-plan.ts");
  try {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(join(ctx.agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-subagents@latest"] }));
    const deps = { lookPath: () => "/fake/pi", ensureWidget: () => {}, run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) };
    writeFileSync(file, source);
    expect((await installDeclaredPackages(ctx, deps)).ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(repairSubagentToolPlan(source));
    ensureSubagentToolCompatibility(ctx.agentDir);
    writeFileSync(file, "unsupported");
    expect((await installDeclaredPackages(ctx, deps)).ok).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("unsupported");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
