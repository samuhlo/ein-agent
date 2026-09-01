import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EIN_CC_ORCHESTRATOR_ASSET,
  EIN_CC_PAYLOAD_FILES,
  EIN_CC_PAYLOAD_MANIFEST,
  EIN_CC_PAYLOAD_ROOTS,
  EIN_CC_PAYLOAD_SOURCE_ENTRIES,
} from "../installer/src/core/cc-payload-inventory.ts";

type BundlerModule = typeof import("../installer/scripts/bundle-ein-cc.ts");

async function loadBundler(): Promise<BundlerModule> {
  return import("../installer/scripts/bundle-ein-cc.ts");
}

const CANONICAL_BYTES = Buffer.from([
  0x23, 0x20, 0x6f, 0x72, 0x63, 0x68, 0x65, 0x73, 0x74, 0x72, 0x61, 0x74, 0x6f, 0x72,
  0x0a, 0x00, 0xff, 0x80, 0x0a,
]);
const CLOSURE_FIXTURE_ENTRY = "ein-pi/agent/surfaces/surface-runner.ts";

function writeSource(root: string, path: string, source: string): void {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, source);
}

function seedCheckout(root: string, asset: "valid" | "absent" | "directory" | "unreadable"): string {
  for (const payloadRoot of EIN_CC_PAYLOAD_ROOTS) {
    mkdirSync(join(root, payloadRoot), { recursive: true });
    writeFileSync(join(root, payloadRoot, "fixture.txt"), payloadRoot);
  }
  for (const entry of EIN_CC_PAYLOAD_SOURCE_ENTRIES) {
    const path = join(root, entry);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `export const fixture = ${JSON.stringify(entry)};\n`);
  }
  for (const file of EIN_CC_PAYLOAD_FILES) {
    if (file === EIN_CC_ORCHESTRATOR_ASSET) continue;
    const path = join(root, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `fixture:${file}\n`);
  }

  const assetPath = join(root, EIN_CC_ORCHESTRATOR_ASSET);
  if (asset === "directory") {
    mkdirSync(assetPath, { recursive: true });
  } else if (asset !== "absent") {
    mkdirSync(join(assetPath, ".."), { recursive: true });
    writeFileSync(assetPath, CANONICAL_BYTES);
    if (asset === "unreadable") chmodSync(assetPath, 0);
  }
  return assetPath;
}

async function runTar(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["tar", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

async function inspectArchive(archivePath: string, extractionRoot: string): Promise<{ names: string[]; bytes: Buffer; manifest: { format: string; files: { path: string; sha256: string }[] } }> {
  const listed = await runTar(["-tzf", archivePath]);
  expect(listed.code).toBe(0);
  const names = listed.stdout
    .split("\n")
    .map((name) => name.replace(/^\.\//, ""))
    .filter(Boolean);
  const extracted = await runTar(["-xzf", archivePath, "-C", extractionRoot]);
  expect(extracted.code).toBe(0);
  const bytes = readFileSync(join(extractionRoot, EIN_CC_ORCHESTRATOR_ASSET));
  const manifest = JSON.parse(readFileSync(join(extractionRoot, EIN_CC_PAYLOAD_MANIFEST), "utf8")) as {
    format: string;
    files: { path: string; sha256: string }[];
  };
  return { names, bytes, manifest };
}

async function assertInvalidSource(asset: "absent" | "directory" | "unreadable"): Promise<void> {
  const tempRoot = mkdtempSync(join(tmpdir(), "ein-cc-payload-bundle-invalid-"));
  const checkout = join(tempRoot, "checkout");
  const output = join(tempRoot, "payload.tar.gz");
  mkdirSync(checkout, { recursive: true });
  const assetPath = seedCheckout(checkout, asset);
  try {
    const { bundleEinCcPayload } = await loadBundler();
    let error: unknown;
    try {
      await bundleEinCcPayload({ repoRoot: checkout, outputPath: output });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(existsSync(output)).toBe(false);
  } finally {
    if (asset === "unreadable" && existsSync(assetPath)) chmodSync(assetPath, 0o644);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe("ein-cc payload bundler", () => {
  test("archives the canonical asset bytes and staged-byte manifest", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ein-cc-payload-bundle-valid-"));
    const checkout = join(tempRoot, "checkout");
    const output = join(tempRoot, "payload.tar.gz");
    const extraction = join(tempRoot, "extracted");
    mkdirSync(checkout, { recursive: true });
    mkdirSync(extraction, { recursive: true });
    const assetPath = seedCheckout(checkout, "valid");
    try {
      const { bundleEinCcPayload } = await loadBundler();
      const result = await bundleEinCcPayload({ repoRoot: checkout, outputPath: output });
      const archive = await inspectArchive(output, extraction);
      expect(archive.names.filter((name) => name === EIN_CC_ORCHESTRATOR_ASSET)).toHaveLength(1);
      expect(archive.bytes).toEqual(readFileSync(assetPath));
      expect(archive.bytes).toEqual(CANONICAL_BYTES);
      const entries = archive.manifest.files.filter((entry) => entry.path === EIN_CC_ORCHESTRATOR_ASSET);
      expect(entries).toHaveLength(1);
      expect(archive.manifest.format).toBe("ein-cc-payload/v1");
      expect(entries[0]?.sha256).toBe(createHash("sha256").update(archive.bytes).digest("hex"));
      expect(result.outputPath).toBe(output);
      expect(result.manifest.files.find((entry) => entry.path === EIN_CC_ORCHESTRATOR_ASSET)?.sha256)
        .toBe(entries[0]?.sha256);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("fails closed when the canonical asset is absent", () => assertInvalidSource("absent"));
  test("fails closed when the canonical asset is a directory", () => assertInvalidSource("directory"));
  test("fails closed when the canonical asset is unreadable", () => assertInvalidSource("unreadable"));

  test("follows runtime TypeScript edges and excludes edges that are only types", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ein-cc-payload-bundle-closure-"));
    const checkout = join(tempRoot, "checkout");
    const output = join(tempRoot, "payload.tar.gz");
    mkdirSync(checkout, { recursive: true });
    seedCheckout(checkout, "valid");
    const sources: Readonly<Record<string, string>> = {
      [CLOSURE_FIXTURE_ENTRY]: [
        "#!/usr/bin/env bun",
        'import "./runtime-side-effect.ts";',
        'import runtimeDefault from "./runtime-default.ts";',
        'import { runtimeValue } from "./runtime-value.ts";',
        'import type DefaultType from "./type-default.ts";',
        'import { type NamedType } from "./type-named.ts";',
        'import { runtimeMixed, type MixedType } from "./runtime-mixed.ts";',
        'export { runtimeExport } from "./runtime-export.ts";',
        'export type { ExportedType } from "./type-export.ts";',
        'export { type NamedExport } from "./type-named-export.ts";',
        'export * from "./runtime-star.ts";',
        'export type ImportedType = import("./type-import-expression.ts").ImportedType;',
        'export const dynamicImport = () => import("./runtime-dynamic.ts");',
        'export const dynamicTemplate = () => import /* fixture */ (`./runtime-dynamic-template.ts`);',
        'export const values = [runtimeDefault, runtimeValue, runtimeMixed];',
        'export type Types = DefaultType | NamedType | MixedType;',
        "",
      ].join("\n"),
      "ein-pi/agent/surfaces/runtime-side-effect.ts": "globalThis.runtimeFixture = true;\n",
      "ein-pi/agent/surfaces/runtime-default.ts": "export default 1;\n",
      "ein-pi/agent/surfaces/runtime-value.ts": 'export { nestedValue as runtimeValue } from "./runtime-transitive.ts";\n',
      "ein-pi/agent/surfaces/runtime-transitive.ts": "export const nestedValue = 2;\n",
      "ein-pi/agent/surfaces/runtime-mixed.ts": "export const runtimeMixed = 3; export type MixedType = string;\n",
      "ein-pi/agent/surfaces/runtime-export.ts": "export const runtimeExport = 4;\n",
      "ein-pi/agent/surfaces/runtime-star.ts": "export const runtimeStar = 5;\n",
      "ein-pi/agent/surfaces/runtime-dynamic.ts": "export const runtimeDynamic = 6;\n",
      "ein-pi/agent/surfaces/runtime-dynamic-template.ts": "export const runtimeDynamicTemplate = 7;\n",
      "ein-pi/agent/surfaces/type-default.ts": "export default interface DefaultType {}\n",
      "ein-pi/agent/surfaces/type-named.ts": "export type NamedType = string;\n",
      "ein-pi/agent/surfaces/type-export.ts": "export type ExportedType = string;\n",
      "ein-pi/agent/surfaces/type-named-export.ts": "export type NamedExport = string;\n",
      "ein-pi/agent/surfaces/type-import-expression.ts": "export type ImportedType = string;\n",
    };
    for (const [path, source] of Object.entries(sources)) writeSource(checkout, path, source);

    try {
      const { bundleEinCcPayload } = await loadBundler();
      const { manifest } = await bundleEinCcPayload({ repoRoot: checkout, outputPath: output });
      const paths = manifest.files.map((entry) => entry.path);
      for (const path of [
        "runtime-side-effect.ts",
        "runtime-default.ts",
        "runtime-value.ts",
        "runtime-transitive.ts",
        "runtime-mixed.ts",
        "runtime-export.ts",
        "runtime-star.ts",
        "runtime-dynamic.ts",
        "runtime-dynamic-template.ts",
      ]) expect(paths).toContain(`ein-pi/agent/surfaces/${path}`);
      for (const path of [
        "type-default.ts",
        "type-named.ts",
        "type-export.ts",
        "type-named-export.ts",
        "type-import-expression.ts",
      ]) expect(paths).not.toContain(`ein-pi/agent/surfaces/${path}`);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("fails closed before publishing when a discovered source cannot be parsed", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ein-cc-payload-bundle-parse-"));
    const checkout = join(tempRoot, "checkout");
    const output = join(tempRoot, "payload.tar.gz");
    mkdirSync(checkout, { recursive: true });
    seedCheckout(checkout, "valid");
    const brokenSource = "ein-pi/agent/surfaces/runtime-broken.ts";
    writeSource(checkout, CLOSURE_FIXTURE_ENTRY, 'import "./runtime-broken.ts";\nexport const entry = true;\n');
    writeSource(checkout, brokenSource, 'import { broken from "./runtime-missing.ts";\n');

    try {
      const { bundleEinCcPayload } = await loadBundler();
      let error: unknown;
      try {
        await bundleEinCcPayload({ repoRoot: checkout, outputPath: output });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(brokenSource);
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

});
