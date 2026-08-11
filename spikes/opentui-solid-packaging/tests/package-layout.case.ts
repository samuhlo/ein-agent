import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relativeArtifactPath, sha256, stageCell } from "../src/package-layout";
import { TARGETS } from "../src/targets";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("spike-only package staging", () => {
  test("atomically stages a checksummed executable with explicit ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "ein-opentui-stage-"));
    roots.push(root);
    const source = join(root, "probe");
    const target = TARGETS[0];
    await writeFile(source, Buffer.concat([
      Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
      Buffer.from(`fixture-${target.nativePackage}`),
    ]));
    const inventory = await stageCell({
      root: join(root, "staged"),
      surface: "pi",
      target,
      sourceArtifact: source,
      provenance: {
        repository: "ein-agent",
        commit: "fixture",
        worktree: "dirty",
        lockSha256: "0".repeat(64),
        entrySha256: "1".repeat(64),
        buildRuntime: "bun-test",
      },
    });
    const destination = join(root, "staged", "pi", target.id, relativeArtifactPath("pi"));
    const bytes = await readFile(destination);

    expect(inventory.artifact.sha256).toBe(sha256(bytes));
    expect((await stat(destination)).mode & 0o777).toBe(0o755);
    expect(inventory.ownership.productionAssetsChanged).toBe(false);
    expect(await Bun.file(`${destination}.staging`).exists()).toBe(false);
  });
});
