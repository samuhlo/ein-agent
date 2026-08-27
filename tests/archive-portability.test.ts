import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleEinCcPayload } from "../installer/scripts/bundle-ein-cc.ts";
import { inspectTarGzPortability } from "./helpers/tar-portability.ts";

const ROOT = join(import.meta.dir, "..");
const TEMPLATE_BUNDLER = join(ROOT, "installer", "scripts", "bundle-template.ts");

function tarProbe(root: string, label: string): { env: Record<string, string>; log: string } {
  const bin = join(root, `${label}-bin`);
  const log = join(root, `${label}-environment.txt`);
  mkdirSync(bin);
  const wrapper = join(bin, "tar");
  writeFileSync(wrapper, '#!/bin/sh\nprintf "%s" "${COPYFILE_DISABLE-unset}" > "$EIN_TAR_ENV_LOG"\nexec "$EIN_REAL_TAR" "$@"\n');
  chmodSync(wrapper, 0o755);
  return {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      EIN_REAL_TAR: "/usr/bin/tar",
      EIN_TAR_ENV_LOG: log,
    } as Record<string, string>,
    log,
  };
}

function expectPortableArchive(path: string): void {
  expect(inspectTarGzPortability(readFileSync(path))).toEqual([]);
}

async function withEnvironment<T>(environment: Record<string, string>, operation: () => Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) process.env[key] = value;
  try {
    return await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("portable installer archives", () => {
  test("raw tar inspection rejects AppleDouble members", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-tar-inspection-"));
    const output = join(root, "apple-double.tar.gz");
    writeFileSync(join(root, "._payload"), "metadata");
    try {
      const result = Bun.spawnSync(["/usr/bin/tar", "--no-xattrs", "-czf", output, "-C", root, "._payload"], {
        env: { ...process.env, COPYFILE_DISABLE: "1" },
      });
      expect(result.exitCode).toBe(0);
      expect(inspectTarGzPortability(readFileSync(output))).toEqual([
        { kind: "apple-double", member: "._payload" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ein-cc payload suppresses macOS metadata in the tar producer", async () => {
    const root = mkdtempSync(join(tmpdir(), "ein-cc-portability-"));
    const output = join(root, "ein-cc-runtime.tar.gz");
    const probe = tarProbe(root, "ein-cc");
    try {
      await withEnvironment(probe.env, () => bundleEinCcPayload({ repoRoot: ROOT, outputPath: output }));
      expect(readFileSync(probe.log, "utf8")).toBe("1");
      expectPortableArchive(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Pi template suppresses macOS metadata in the tar producer", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-template-portability-"));
    const output = join(root, "template.tar.gz");
    const app = join(root, "ein-app");
    const probe = tarProbe(root, "template");
    writeFileSync(app, "APP");
    chmodSync(app, 0o755);
    try {
      const result = Bun.spawnSync(["bun", "run", TEMPLATE_BUNDLER], {
        cwd: ROOT,
        env: {
          ...probe.env,
          EIN_TEMPLATE_OUT: output,
          EIN_APP_BINARY: app,
          EIN_APP_TARGET: "test-target",
        },
      });
      expect(new TextDecoder().decode(result.stderr)).toBe("");
      expect(result.exitCode).toBe(0);
      expect(readFileSync(probe.log, "utf8")).toBe("1");
      expectPortableArchive(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});
