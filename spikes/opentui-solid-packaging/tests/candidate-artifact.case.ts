import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateArtifactName, TARGETS, targetById } from "../src/targets";
import { validateCandidateInventory, verifyCandidateArtifact, writeCandidateInventory } from "../src/candidate-artifact";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function fixture(target = TARGETS[0]): Record<string, unknown> {
  return {
    format: "ein-opentui-dashboard-candidate/v1",
    target: target.id,
    bunTarget: target.bunTarget,
    nativePackage: target.nativePackage,
    packageVersions: { "@opentui/core": "0.5.1", "@opentui/solid": "0.5.1", "solid-js": "1.9.12" },
    artifact: { filename: candidateArtifactName(target), sha256: "a".repeat(64), bytes: 42, mode: "0755" },
    verification: { binaryFormat: target.os === "darwin" ? "mach-o" : "elf", nativePackageMarker: target.nativePackage, result: "pass" },
  };
}

describe("dashboard candidate artifact contract", () => {
  test("names all and only the canonical target artifacts", () => {
    expect(TARGETS.map(candidateArtifactName)).toEqual([
      "ein-opentui-dashboard-darwin-arm64",
      "ein-opentui-dashboard-darwin-x64",
      "ein-opentui-dashboard-linux-arm64",
      "ein-opentui-dashboard-linux-x64",
    ]);
    expect(() => targetById("linux-x64-musl")).toThrow("Unknown target");
  });

  test("accepts the versioned pinned inventory schema", () => {
    expect(validateCandidateInventory(fixture(), TARGETS[0]).format).toBe("ein-opentui-dashboard-candidate/v1");
  });

  test("rejects target, filename, digest, bytes, mode, format, and marker mismatches", () => {
    const cases: Array<[string, unknown]> = [
      ["target", { ...fixture(), target: TARGETS[1].id }],
      ["filename", { ...fixture(), artifact: { ...fixture().artifact as object, filename: "wrong" } }],
      ["digest", { ...fixture(), artifact: { ...fixture().artifact as object, sha256: "bad" } }],
      ["bytes", { ...fixture(), artifact: { ...fixture().artifact as object, bytes: 0 } }],
      ["mode", { ...fixture(), artifact: { ...fixture().artifact as object, mode: "0644" } }],
      ["format", { ...fixture(), verification: { ...fixture().verification as object, binaryFormat: "elf" } }],
      ["marker", { ...fixture(), verification: { ...fixture().verification as object, nativePackageMarker: TARGETS[1].nativePackage } }],
    ];
    for (const [name, inventory] of cases) expect(() => validateCandidateInventory(inventory, TARGETS[0]), name).toThrow();
  });

  test("writes and verifies artifact bytes, mode, format, and native marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "ein-candidate-"));
    roots.push(root);
    const target = TARGETS[0];
    const artifact = join(root, "dist", candidateArtifactName(target));
    await mkdir(join(root, "dist"));
    await writeFile(artifact, Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from(target.nativePackage)]));
    expect(writeCandidateInventory(root, target)).rejects.toThrow("Binary format mismatch");
    await writeFile(artifact, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
    expect(writeCandidateInventory(root, target)).rejects.toThrow("Native package selection mismatch");
    await writeFile(artifact, Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(target.nativePackage)]));
    const inventory = await writeCandidateInventory(root, target);
    expect((await verifyCandidateArtifact(root, target)).artifact.sha256).toBe(inventory.artifact.sha256);
    await chmod(artifact, 0o644);
    expect(verifyCandidateArtifact(root, target)).rejects.toThrow("does not match inventory");
  });

  test("keeps generated candidate artifacts and inventories ignored", () => {
    const result = Bun.spawnSync(["git", "check-ignore", "--no-index", "dist/ein-opentui-dashboard-darwin-arm64", "dist/ein-opentui-dashboard-darwin-arm64.json"], { cwd: join(import.meta.dir, "..") });
    expect(result.exitCode).toBe(0);
  });
});
