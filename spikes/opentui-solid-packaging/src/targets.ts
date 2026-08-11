export const TARGETS = [
  {
    id: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    os: "darwin",
    arch: "arm64",
    libc: null,
    nativePackage: "@opentui/core-darwin-arm64",
  },
  {
    id: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    os: "darwin",
    arch: "x64",
    libc: null,
    nativePackage: "@opentui/core-darwin-x64",
  },
  {
    id: "linux-arm64",
    bunTarget: "bun-linux-arm64",
    os: "linux",
    arch: "arm64",
    libc: "glibc",
    nativePackage: "@opentui/core-linux-arm64",
  },
  {
    id: "linux-x64",
    bunTarget: "bun-linux-x64",
    os: "linux",
    arch: "x64",
    libc: "glibc",
    nativePackage: "@opentui/core-linux-x64",
  },
] as const;

export type Target = (typeof TARGETS)[number];
export type TargetId = Target["id"];

export const SURFACES = ["pi", "claude"] as const;
export type Surface = (typeof SURFACES)[number];

export function targetById(id: string): Target {
  const target = TARGETS.find((candidate) => candidate.id === id);
  if (!target) throw new Error(`Unknown target: ${id}`);
  return target;
}

export function currentTarget(): Target {
  const id = `${process.platform}-${process.arch}`;
  return targetById(id);
}

export function artifactName(target: Target): string {
  return `opentui-solid-probe-${target.id}`;
}

export function candidateArtifactName(target: Target): string {
  return `ein-opentui-dashboard-${target.id}`;
}
