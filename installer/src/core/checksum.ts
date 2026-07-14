import type { AssetDigest, Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type ChecksumError = UpdateStageError & { stage: "verifying" };

function checksumError(code: string, message: string): ChecksumError {
  return { stage: "verifying", code, message };
}

export function parseChecksums(text: string, assetName: string): Result<AssetDigest, ChecksumError> {
  const lines = text.split("\n");
  const matches: AssetDigest[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const parsed = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!parsed?.[1] || !parsed[2]) {
      return { ok: false, error: checksumError("malformed", "Malformed checksums.txt entry") };
    }
    if (parsed[2] === assetName) matches.push({ assetName, sha256: parsed[1] });
  }
  if (matches.length === 0) {
    return { ok: false, error: checksumError("missing-entry", `Missing checksum for ${assetName}`) };
  }
  if (matches.length !== 1) {
    return { ok: false, error: checksumError("duplicate-entry", `Duplicate checksum for ${assetName}`) };
  }
  return { ok: true, value: matches[0]! };
}

export async function verifyAsset(
  stagedPath: string,
  expected: AssetDigest,
  caps: Pick<UpdateCaps, "hashFile">,
): Promise<Result<AssetDigest, ChecksumError>> {
  try {
    const sha256 = await caps.hashFile(stagedPath);
    if (sha256 !== expected.sha256) {
      return { ok: false, error: checksumError("mismatch", `Checksum mismatch for ${expected.assetName}`) };
    }
    return { ok: true, value: expected };
  } catch {
    return { ok: false, error: checksumError("hash-failed", `Could not hash ${expected.assetName}`) };
  }
}
