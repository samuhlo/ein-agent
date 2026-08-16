import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");

describe("packaged Cleaner runtime closure", () => {
  test("runs passive AST collectors from a bare extracted Pi payload", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-packaged-cleaner-"));
    try {
      const archive = join(root, "template.tar.gz");
      const payload = join(root, "payload");
      const project = join(root, "project");
      const home = join(root, "home");
      const cache = join(root, "cache");
      mkdirSync(payload); mkdirSync(join(project, "src"), { recursive: true }); mkdirSync(home); mkdirSync(cache);
      writeFileSync(join(project, "package.json"), JSON.stringify({ packageManager: "bun@1.3.14" }));
      writeFileSync(join(project, "src/sample.ts"), `export function first(value: number) { ${"if (value) value--; ".repeat(45)} return value; }\nexport function second(value: number) { ${"if (value) value--; ".repeat(45)} return value; }\n`);
      const app = join(root, "ein-app"); writeFileSync(app, "APP"); chmodSync(app, 0o755);
      execFileSync("git", ["init", "-q"], { cwd: project }); execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: project }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: project }); execFileSync("git", ["add", "."], { cwd: project }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: project });
      execFileSync("bun", ["run", join(ROOT, "installer/scripts/bundle-template.ts")], { cwd: ROOT, env: { ...process.env, EIN_TEMPLATE_OUT: archive, EIN_APP_BINARY: app, EIN_APP_TARGET: "test-target" } });
      execFileSync("tar", ["-xzf", archive, "-C", payload]);
      const manifest = JSON.parse(readFileSync(join(payload, "template-manifest.json"), "utf8")) as { runtimeDependencies: Array<{ name: string; version: string; path: string; sha256: string }> };
      const runtime = manifest.runtimeDependencies[0]!;
      expect(runtime).toMatchObject({ name: "typescript", version: "5.9.3", path: "lib/vendor/typescript/typescript.js" });
      expect(createHash("sha256").update(readFileSync(join(payload, runtime.path))).digest("hex")).toBe(runtime.sha256);
      const imports = ["cleaner-complexity-evidence.ts", "cleaner-duplication-evidence.ts", "cleaner-script-regions.ts"].map((file) => readFileSync(join(payload, "lib", file), "utf8"));
      expect(imports.every((source) => source.includes('from "./vendor/typescript/typescript.js"') && !source.includes('from "typescript"'))).toBe(true);
      const modules = ["cleaner-environment-evidence.ts", "cleaner-complexity-evidence.ts", "cleaner-duplication-evidence.ts", "cleaner-operational-evidence.ts"].map((file) => pathToFileURL(join(payload, "lib", file)).href);
      const driver = join(root, "driver.ts");
      writeFileSync(driver, `const [environmentModule, complexityModule, duplicationModule, operationalModule] = await Promise.all(${JSON.stringify(modules)}.map((path) => import(path))); const environment = environmentModule.collectCleanerEnvironmentEvidence(${JSON.stringify(project)}, {}, ["src/sample.ts"]); const complexity = complexityModule.collectCleanerComplexityEvidence(environment); const duplication = duplicationModule.collectCleanerDuplicationEvidence(environment); const operational = operationalModule.collectCleanerPassiveEvidence(${JSON.stringify(project)}, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); console.log(JSON.stringify({ environment: environment.version, complexity: complexity.aggregate.count, duplication: duplication.aggregate.groups, operational: operational.version }));`);
      const output = execFileSync("bun", ["run", driver], { cwd: project, encoding: "utf8", env: { ...process.env, HOME: home, NODE_PATH: "", BUN_INSTALL_CACHE_DIR: cache } });
      const evidence = JSON.parse(output) as { environment: string; complexity: number; duplication: number; operational: string };
      expect(evidence).toMatchObject({ environment: "cleaner-environment-evidence/v1", complexity: 2, operational: "cleaner-operational-evidence/v1" });
      expect(evidence.duplication).toBeGreaterThan(0);
      expect(readdirSync(cache)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
