import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PI_HOST_PACKAGE,
  PI_HOST_SPEC,
  PI_HOST_VERSION,
  REQUIRED_PI_PACKAGES,
  REQUIRED_PI_PACKAGE_SPECS,
} from "../ein-pi/agent/lib/runtime-compat.ts";
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

describe("contrato reproducible del runtime Pi", () => {
  test("settings, host de desarrollo y contrato comparten versiones exactas", () => {
    const settings = JSON.parse(readFileSync(join(ROOT, "ein-pi", "agent", "settings.json"), "utf8")) as { packages: string[] };
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { devDependencies: Record<string, string> };

    expect(settings.packages).toEqual([...REQUIRED_PI_PACKAGE_SPECS]);
    expect(PI_HOST_SPEC).toBe(`${PI_HOST_PACKAGE}@${PI_HOST_VERSION}`);
    expect(pkg.devDependencies[PI_HOST_PACKAGE]).toBe(PI_HOST_VERSION);
    expect(pkg.devDependencies["@earendil-works/pi-tui"]).toBe(PI_HOST_VERSION);
    expect(REQUIRED_PI_PACKAGES.length).toBeGreaterThan(0);
    for (const spec of REQUIRED_PI_PACKAGE_SPECS) {
      expect(spec).toMatch(/^npm:(?:@[^/]+\/[^@]+|[^@]+)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    }
  });

  test("ambos doctors fallan ante un paquete sin el pin compatible", () => {
    const home = mkdtempSync(join(tmpdir(), "ein-runtime-policy-"));
    roots.push(home);
    const context = resolvePiInstallContext(derivePiInstallPaths(home));
    mkdirSync(context.agentDir, { recursive: true });
    for (const pkg of REQUIRED_PI_PACKAGES) {
      const directory = join(context.agentDir, "npm", "node_modules", ...pkg.name.split("/"));
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ version: pkg.version }));
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
    writeFileSync(installedManifest, JSON.stringify({ version: "0.0.1" }));
    expect(checkLevel(runDoctor({ ...detectPlatform(), home }, context), checkName)).toBe("FAIL");
    expect(smokeLevel(doctorSmokeReport(context.agentDir, home), checkName)).toBe("FAIL");
  });
});
