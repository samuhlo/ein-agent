import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensureSubagentWidgetCompatibility, SUBAGENT_WIDGET_FILES } from "../installer/src/core/subagent-widget-compat.ts";
import { installDeclaredPackages } from "../installer/src/core/deps.ts";
import { resolvePiInstallContext } from "../installer/src/core/paths.ts";

const upstream = [
  "export const WIDGET_ANIMATION_INTERVAL_MS = 1000;",
  "function animatedSeed(seed, frame) {\n\tif (frame === undefined) return seed;\n\treturn (seed ?? 0) + frame;\n}",
  "let nextWidgetAnimationAt = Date.now() + WIDGET_ANIMATION_INTERVAL_MS;\nif (runningJobIds.size > 0 && now >= nextWidgetAnimationAt) {\n\t\t\t\tnextWidgetAnimationAt = now + WIDGET_ANIMATION_INTERVAL_MS;\nrequestLastWidgetRender();\n}\nconst livenessIntervalMs = 5000;",
];

test("package install and repeated package refresh restore animation and preserve liveness cadence", async () => {
  const home = mkdtempSync(join(tmpdir(), "ein-widget-compat-"));
  const ctx = resolvePiInstallContext(home);
  const paths = SUBAGENT_WIDGET_FILES.map((file) => join(ctx.agentDir, "npm/node_modules/pi-subagents", file));
  try {
    mkdirSync(ctx.agentDir, { recursive: true });
    writeFileSync(join(ctx.agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-subagents@latest"] }));
    const install = () => installDeclaredPackages(ctx, {
      lookPath: () => "/fake/pi", ensureChildTools: () => {},
      run: async () => {
        paths.forEach((path, i) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, upstream[i]!); });
        return { ok: true, code: 0, stdout: "", stderr: "" };
      },
    });
    expect((await install()).ok).toBe(true);
    const fixed = paths.map((path) => readFileSync(path, "utf8"));
    const types = await import(`data:text/javascript,${encodeURIComponent(fixed[0]!)}`);
    expect(types.WIDGET_ANIMATION_INTERVAL_MS).toBe(80);
    const seed = new Function(`${fixed[1]}; return animatedSeed;`)();
    expect(seed(100, 5)).toBe(5); expect(seed(200, 5)).toBe(5); expect(seed(100, undefined)).toBe(100);
    expect(fixed[2]).toContain("const livenessIntervalMs = 5000;");
    ensureSubagentWidgetCompatibility(ctx.agentDir);
    expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(fixed);
    expect((await install()).ok).toBe(true);
    expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(fixed);
    paths.forEach((path, i) => writeFileSync(path, i === 2 ? "unknown upstream" : upstream[i]!));
    expect(() => ensureSubagentWidgetCompatibility(ctx.agentDir)).toThrow("contrato de animación desconocido");
    expect(readFileSync(paths[0]!, "utf8")).toBe(upstream[0]!);
    expect(readFileSync(paths[1]!, "utf8")).toBe(upstream[1]!);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
