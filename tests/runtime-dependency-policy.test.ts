import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PI_HOST_PACKAGE,
  PI_HOST_SPEC,
  PI_NODE_MIN_VERSION,
  PI_RUNTIME_DIST_TAG,
  REQUIRED_PI_PACKAGES,
  REQUIRED_PI_PACKAGE_SPECS,
} from "../shared/contracts/runtime-compat.ts";
import { detectPlatform } from "../installer/src/core/platform.ts";
import { derivePiInstallPaths, resolvePiInstallContext } from "../installer/src/core/paths.ts";
import { runDoctor, type DoctorReport } from "../installer/src/core/verify.ts";
import { doctorSmokeReport } from "../ein-pi/agent/extensions/ein-doctor.ts";

const ROOT = join(import.meta.dir, "..");
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function checkLevel(report: DoctorReport, name: string): string | undefined {
  return report.groups.flatMap((group) => group.checks).find((item) => item.name === name)?.level;
}

function smokeLevel(report: string, name: string): string | undefined {
  return report.match(new RegExp(`^- (OK|WARN|FAIL) - ${name}:`, "m"))?.[1];
}

describe("contrato latest del runtime Pi", () => {
  test("settings, host de desarrollo y CI siguen el dist-tag móvil", () => {
    const settings = JSON.parse(readFileSync(join(ROOT, "ein-pi", "agent", "settings.json"), "utf8")) as {
      npmCommand: string[];
      packages: string[];
    };
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    const release = readFileSync(join(ROOT, ".github", "workflows", "installer-release.yml"), "utf8");

    expect(settings.packages).toEqual([...REQUIRED_PI_PACKAGE_SPECS]);
    expect(settings.npmCommand).toEqual(["bun"]);
    expect(PI_RUNTIME_DIST_TAG).toBe("latest");
    expect(PI_HOST_SPEC).toBe(`${PI_HOST_PACKAGE}@latest`);
    expect(PI_NODE_MIN_VERSION).toBe("22.19.0");
    expect(pkg.devDependencies[PI_HOST_PACKAGE]).toBe("latest");
    expect(pkg.devDependencies["@earendil-works/pi-tui"]).toBe("latest");
    expect(pkg.scripts["sync:pi"]).toBe(
      "bun update --latest --no-save --force @earendil-works/pi-coding-agent @earendil-works/pi-tui",
    );
    expect(ci).toContain("bun run sync:pi");
    expect(ci).toContain("bun tooling/verify-latest-pi-runtime.ts");
    expect(release).toContain("bun update --latest --no-save --force");
    expect(release).toContain("bun tooling/verify-latest-pi-runtime.ts");
    expect(REQUIRED_PI_PACKAGES.length).toBeGreaterThan(0);
    for (const spec of REQUIRED_PI_PACKAGE_SPECS) {
      expect(spec).toMatch(/^npm:(?:@[^/]+\/[^@]+|[^@]+)@latest$/);
    }
  });

  test("ambos doctors exigen la declaración latest y una versión instalada válida", () => {
    const home = mkdtempSync(join(tmpdir(), "ein-runtime-policy-"));
    roots.push(home);
    const context = resolvePiInstallContext(derivePiInstallPaths(home));
    mkdirSync(context.agentDir, { recursive: true });
    for (const pkg of REQUIRED_PI_PACKAGES) {
      const directory = join(context.agentDir, "npm", "node_modules", ...pkg.name.split("/"));
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ version: "0.0.1" }));
    }
    const missing = REQUIRED_PI_PACKAGES[0]!;
    const checkName = `pi package ${missing.name}`;
    const wrong = REQUIRED_PI_PACKAGE_SPECS.map((spec) =>
      spec === missing.spec ? `npm:${missing.name}` : spec,
    );
    writeFileSync(join(context.agentDir, "settings.json"), JSON.stringify({ packages: wrong }));

    expect(checkLevel(runDoctor({ ...detectPlatform(), home }, context), checkName)).toBe("FAIL");
    expect(smokeLevel(doctorSmokeReport(context.agentDir, home), checkName)).toBe("FAIL");

    writeFileSync(join(context.agentDir, "settings.json"), JSON.stringify({ packages: REQUIRED_PI_PACKAGE_SPECS }));
    expect(checkLevel(runDoctor({ ...detectPlatform(), home }, context), checkName)).toBe("OK");
    expect(smokeLevel(doctorSmokeReport(context.agentDir, home), checkName)).toBe("OK");

    const installedManifest = join(context.agentDir, "npm", "node_modules", missing.name, "package.json");
    writeFileSync(installedManifest, JSON.stringify({ version: "not-semver" }));
    expect(checkLevel(runDoctor({ ...detectPlatform(), home }, context), checkName)).toBe("FAIL");
    expect(smokeLevel(doctorSmokeReport(context.agentDir, home), checkName)).toBe("FAIL");
  });
});
