import { chmod, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { inspectArtifact, PACKAGE_VERSIONS, sha256 } from "./package-layout";
import { candidateArtifactName, type Target } from "./targets";

export type CandidateInventory = {
  format: "ein-opentui-dashboard-candidate/v1";
  sourceRevision: string;
  target: Target["id"];
  bunTarget: Target["bunTarget"];
  nativePackage: Target["nativePackage"];
  packageVersions: Pick<typeof PACKAGE_VERSIONS, "@opentui/core" | "@opentui/solid" | "solid-js">;
  artifact: {
    filename: string;
    sha256: string;
    bytes: number;
    mode: "0755";
  };
  verification: {
    binaryFormat: "mach-o" | "elf";
    nativePackageMarker: Target["nativePackage"];
    result: "pass";
  };
};

function record(value: unknown, name: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Malformed ${name}`);
	return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], name: string): void {
	const actual = Object.keys(value).sort();
	if (actual.length !== keys.length || !keys.toSorted().every((key, index) => actual[index] === key)) {
		throw new Error(`Malformed ${name}`);
	}
}

export function validateCandidateInventory(value: unknown, target: Target): CandidateInventory {
	const inventory = record(value, "candidate inventory");
	const artifact = record(inventory.artifact, "candidate artifact");
	const verification = record(inventory.verification, "candidate verification");
	const versions = record(inventory.packageVersions, "candidate package versions");
	exact(inventory, ["artifact", "bunTarget", "format", "nativePackage", "packageVersions", "sourceRevision", "target", "verification"], "candidate inventory");
	exact(artifact, ["bytes", "filename", "mode", "sha256"], "candidate artifact");
	exact(versions, ["@opentui/core", "@opentui/solid", "solid-js"], "candidate package versions");
	exact(verification, ["binaryFormat", "nativePackageMarker", "result"], "candidate verification");
  const expectedFormat = target.os === "darwin" ? "mach-o" : "elf";
	if (inventory.format !== "ein-opentui-dashboard-candidate/v1") throw new Error("Unsupported candidate inventory format");
	if (typeof inventory.sourceRevision !== "string" || !/^[a-f0-9]{40}$/.test(inventory.sourceRevision)) throw new Error("Malformed candidate source revision");
  if (inventory.target !== target.id || inventory.bunTarget !== target.bunTarget || inventory.nativePackage !== target.nativePackage) {
    throw new Error(`Candidate inventory target mismatch for ${target.id}`);
  }
  if (artifact.filename !== candidateArtifactName(target)) throw new Error(`Candidate artifact filename mismatch for ${target.id}`);
  if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("Malformed candidate artifact digest");
  if (!Number.isSafeInteger(artifact.bytes) || (artifact.bytes as number) <= 0) throw new Error("Malformed candidate artifact byte count");
  if (artifact.mode !== "0755") throw new Error("Malformed candidate artifact mode");
  if (versions["@opentui/core"] !== PACKAGE_VERSIONS["@opentui/core"]
    || versions["@opentui/solid"] !== PACKAGE_VERSIONS["@opentui/solid"]
    || versions["solid-js"] !== PACKAGE_VERSIONS["solid-js"]) throw new Error("Candidate package version mismatch");
  if (verification.binaryFormat !== expectedFormat) throw new Error(`Candidate binary format mismatch for ${target.id}`);
  if (verification.nativePackageMarker !== target.nativePackage) throw new Error(`Candidate native marker mismatch for ${target.id}`);
  if (verification.result !== "pass") throw new Error("Candidate verification did not pass");
  return value as CandidateInventory;
}

export async function writeCandidateInventory(root: string, target: Target, sourceRevision: string): Promise<CandidateInventory> {
  const filename = candidateArtifactName(target);
  const artifactPath = join(root, "dist", filename);
  await chmod(artifactPath, 0o755);
  const bytes = await readFile(artifactPath);
  const metadata = await stat(artifactPath);
  const inspection = inspectArtifact(bytes, target);
	const inventory: CandidateInventory = {
		format: "ein-opentui-dashboard-candidate/v1",
		sourceRevision,
    target: target.id,
    bunTarget: target.bunTarget,
    nativePackage: target.nativePackage,
    packageVersions: {
      "@opentui/core": PACKAGE_VERSIONS["@opentui/core"],
      "@opentui/solid": PACKAGE_VERSIONS["@opentui/solid"],
      "solid-js": PACKAGE_VERSIONS["solid-js"],
    },
    artifact: { filename: basename(artifactPath), sha256: sha256(bytes), bytes: metadata.size, mode: "0755" },
    verification: { binaryFormat: inspection.binaryFormat, nativePackageMarker: inspection.nativePackageMarker, result: "pass" },
  };
  validateCandidateInventory(inventory, target);
  await Bun.write(`${artifactPath}.json`, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

export async function verifyCandidateArtifact(root: string, target: Target): Promise<CandidateInventory> {
  const artifactPath = join(root, "dist", candidateArtifactName(target));
  const inventory = validateCandidateInventory(JSON.parse(await readFile(`${artifactPath}.json`, "utf8")) as unknown, target);
  const bytes = await readFile(artifactPath);
  const metadata = await stat(artifactPath);
  inspectArtifact(bytes, target);
  if (inventory.artifact.sha256 !== sha256(bytes) || inventory.artifact.bytes !== metadata.size || (metadata.mode & 0o777) !== 0o755) {
    throw new Error(`Candidate artifact does not match inventory for ${target.id}`);
  }
  return inventory;
}
