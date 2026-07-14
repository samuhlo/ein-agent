import type { AssetDigest, ReleaseRecord, Result } from "./release-types.ts";

export type AssetPlatform = {
  os: string;
  arch: string;
  isWsl?: boolean;
};

export type AssetSelection = {
  assetName: string;
  os: "darwin" | "linux";
  arch: "arm64" | "x64";
  wsl: boolean;
};

export type AssetError = {
  code: "unsupported-platform" | "unsupported-arch" | "missing-asset-on-release" | "duplicate-asset-on-release";
  message: string;
};

export function assetNameFor(os: "darwin" | "linux", arch: "arm64" | "x64"): string {
  return `ein-installer-${os}-${arch}`;
}

export function selectAsset(
  platform: AssetPlatform,
  release?: Pick<ReleaseRecord, "assets">,
): Result<AssetSelection, AssetError> {
  const os = platform.isWsl ? "linux" : platform.os;
  if (os !== "darwin" && os !== "linux") {
    return { ok: false, error: { code: "unsupported-platform", message: `Unsupported platform: ${platform.os}` } };
  }
  if (platform.arch !== "arm64" && platform.arch !== "x64") {
    return { ok: false, error: { code: "unsupported-arch", message: `Unsupported architecture: ${platform.arch}` } };
  }
  const assetName = assetNameFor(os, platform.arch);
  const matches = release?.assets.filter((asset) => asset.name === assetName) ?? [];
  if (release && matches.length === 0) {
    return { ok: false, error: { code: "missing-asset-on-release", message: `Missing release asset: ${assetName}` } };
  }
  if (matches.length > 1) {
    return { ok: false, error: { code: "duplicate-asset-on-release", message: `Duplicate release asset: ${assetName}` } };
  }
  return { ok: true, value: { assetName, os, arch: platform.arch, wsl: platform.isWsl === true } };
}

export function selectedAssetDigest(assetName: string, sha256: string): AssetDigest {
  return { assetName, sha256 };
}
