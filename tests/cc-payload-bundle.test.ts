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
  CC_EIN_ORCHESTRATOR_ASSET,
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_MANIFEST,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SOURCE_ENTRIES,
} from "../installer/src/core/cc-payload-inventory.ts";

type BundlerModule = typeof import("../installer/scripts/bundle-cc-ein.ts");

async function loadBundler(): Promise<BundlerModule> {
  return import("../installer/scripts/bundle-cc-ein.ts");
}

const CANONICAL_BYTES = Buffer.from([
  0x23, 0x20, 0x6f, 0x72, 0x63, 0x68, 0x65, 0x73, 0x74, 0x72, 0x61, 0x74, 0x6f, 0x72,
  0x0a, 0x00, 0xff, 0x80, 0x0a,
]);

function seedCheckout(root: string, asset: "valid" | "absent" | "directory" | "unreadable"): string {
  for (const payloadRoot of CC_EIN_PAYLOAD_ROOTS) {
    mkdirSync(join(root, payloadRoot), { recursive: true });
    writeFileSync(join(root, payloadRoot, "fixture.txt"), payloadRoot);
  }
  for (const entry of CC_EIN_PAYLOAD_SOURCE_ENTRIES) {
    const path = join(root, entry);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `export const fixture = ${JSON.stringify(entry)};\n`);
  }
  for (const file of CC_EIN_PAYLOAD_FILES) {
    if (file === CC_EIN_ORCHESTRATOR_ASSET) continue;
    const path = join(root, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `fixture:${file}\n`);
  }

  const assetPath = join(root, CC_EIN_ORCHESTRATOR_ASSET);
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
  const bytes = readFileSync(join(extractionRoot, CC_EIN_ORCHESTRATOR_ASSET));
  const manifest = JSON.parse(readFileSync(join(extractionRoot, CC_EIN_PAYLOAD_MANIFEST), "utf8")) as {
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
    const { bundleCcEinPayload } = await loadBundler();
    let error: unknown;
    try {
      await bundleCcEinPayload({ repoRoot: checkout, outputPath: output });
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

describe("cc-ein payload bundler", () => {
  test("archives the canonical asset bytes and staged-byte manifest", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ein-cc-payload-bundle-valid-"));
    const checkout = join(tempRoot, "checkout");
    const output = join(tempRoot, "payload.tar.gz");
    const extraction = join(tempRoot, "extracted");
    mkdirSync(checkout, { recursive: true });
    mkdirSync(extraction, { recursive: true });
    const assetPath = seedCheckout(checkout, "valid");
    try {
      const { bundleCcEinPayload } = await loadBundler();
      const result = await bundleCcEinPayload({ repoRoot: checkout, outputPath: output });
      const archive = await inspectArchive(output, extraction);
      expect(archive.names.filter((name) => name === CC_EIN_ORCHESTRATOR_ASSET)).toHaveLength(1);
      expect(archive.bytes).toEqual(readFileSync(assetPath));
      expect(archive.bytes).toEqual(CANONICAL_BYTES);
      const entries = archive.manifest.files.filter((entry) => entry.path === CC_EIN_ORCHESTRATOR_ASSET);
      expect(entries).toHaveLength(1);
      expect(archive.manifest.format).toBe("ein-cc-payload/v1");
      expect(entries[0]?.sha256).toBe(createHash("sha256").update(archive.bytes).digest("hex"));
      expect(result.outputPath).toBe(output);
      expect(result.manifest.files.find((entry) => entry.path === CC_EIN_ORCHESTRATOR_ASSET)?.sha256)
        .toBe(entries[0]?.sha256);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("fails closed when the canonical asset is absent", () => assertInvalidSource("absent"));
  test("fails closed when the canonical asset is a directory", () => assertInvalidSource("directory"));
  test("fails closed when the canonical asset is unreadable", () => assertInvalidSource("unreadable"));
});
