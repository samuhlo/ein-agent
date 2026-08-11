import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { artifactName, TARGETS, type Surface, type Target } from "./targets";

export type PackageVersions = {
  "@opentui/core": "0.5.1";
  "@opentui/solid": "0.5.1";
  "solid-js": "1.9.12";
  native: "0.5.1";
};

export type SourceProvenance = {
  repository: "ein-agent";
  commit: string;
  worktree: "clean" | "dirty";
  lockSha256: string;
  entrySha256: string;
  buildRuntime: string;
};

export type CellInventory = {
  format: "ein-opentui-solid-package-cell/v1";
  surface: Surface;
  target: Target["id"];
  bunTarget: Target["bunTarget"];
  libc: Target["libc"];
  nativePackage: Target["nativePackage"];
  packageVersions: PackageVersions;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    mode: "0755";
    binaryFormat: "mach-o" | "elf";
    nativePackageMarkers: [Target["nativePackage"]];
  };
  ownership: {
    owner: "spike-only";
    replacement: "sibling-staging-then-rename";
    rollback: "surface cell directory is independently removable";
    productionAssetsChanged: false;
  };
  provenance: SourceProvenance;
};

export const PACKAGE_VERSIONS: PackageVersions = {
  "@opentui/core": "0.5.1",
  "@opentui/solid": "0.5.1",
  "solid-js": "1.9.12",
  native: "0.5.1",
};

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function relativeArtifactPath(surface: Surface): string {
  return surface === "pi" ? "template/bin/ein-opentui-solid-probe" : "payload/bin/ein-opentui-solid-probe";
}

export async function stageCell(options: {
  root: string;
  surface: Surface;
  target: Target;
  sourceArtifact: string;
  provenance: SourceProvenance;
}): Promise<CellInventory> {
  const cellRoot = join(options.root, options.surface, options.target.id);
  const relativePath = relativeArtifactPath(options.surface);
  const destination = join(cellRoot, relativePath);
  const staging = `${destination}.staging`;
  await mkdir(dirname(destination), { recursive: true });
  await rm(staging, { force: true });
  await copyFile(options.sourceArtifact, staging);
  await chmod(staging, 0o755);

  const sourceBytes = await readFile(options.sourceArtifact);
  const stagedBytes = await readFile(staging);
  const digest = sha256(sourceBytes);
  if (sha256(stagedBytes) !== digest) throw new Error(`Staged checksum mismatch for ${options.surface}/${options.target.id}`);
  const binaryFormat = options.target.os === "darwin" ? "mach-o" : "elf";
  const expectedMagic = binaryFormat === "mach-o" ? [0xcf, 0xfa, 0xed, 0xfe] : [0x7f, 0x45, 0x4c, 0x46];
  if (!expectedMagic.every((byte, index) => stagedBytes[index] === byte)) {
    throw new Error(`Binary format mismatch for ${options.surface}/${options.target.id}`);
  }
  const nativePackageMarkers = [
    ...TARGETS.map(({ nativePackage }) => nativePackage),
    "@opentui/core-linux-arm64-musl",
    "@opentui/core-linux-x64-musl",
  ].filter((packageName) => stagedBytes.includes(Buffer.from(packageName)));
  if (nativePackageMarkers.length !== 1 || nativePackageMarkers[0] !== options.target.nativePackage) {
    throw new Error(`Native package selection mismatch for ${options.surface}/${options.target.id}: ${nativePackageMarkers.join(", ")}`);
  }

  await rename(staging, destination);
  const metadata = await stat(destination);
  if ((metadata.mode & 0o777) !== 0o755) throw new Error(`Executable mode mismatch for ${destination}`);

  const inventory: CellInventory = {
    format: "ein-opentui-solid-package-cell/v1",
    surface: options.surface,
    target: options.target.id,
    bunTarget: options.target.bunTarget,
    libc: options.target.libc,
    nativePackage: options.target.nativePackage,
    packageVersions: PACKAGE_VERSIONS,
    artifact: {
      path: relativePath,
      sha256: digest,
      bytes: metadata.size,
      mode: "0755",
      binaryFormat,
      nativePackageMarkers: [options.target.nativePackage],
    },
    ownership: {
      owner: "spike-only",
      replacement: "sibling-staging-then-rename",
      rollback: "surface cell directory is independently removable",
      productionAssetsChanged: false,
    },
    provenance: options.provenance,
  };
  await Bun.write(join(cellRoot, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

export function artifactPath(root: string, target: Target): string {
  return join(root, "dist", artifactName(target));
}
