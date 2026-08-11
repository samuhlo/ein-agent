import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acceptancePasses, validateAcceptanceEvidence, type AcceptanceEvidence } from "../installer/scripts/native-packaged-acceptance.ts";

const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/opentui-solid-packaging-spike.yml"), "utf8");
const checksum = "a".repeat(64);
const cell = { pass: true, packageSha256: checksum, candidateSha256: checksum, legacySha256: checksum, staticParity: true, tty: true, fallback: true, noDoubleLaunch: true, updateRollbackUninstall: true, offlineRuntime: true };
const evidence: AcceptanceEvidence = { schema: "ein-native-packaged-acceptance/v1", revision: "b".repeat(40), target: "linux-x64", runner: { os: "linux", arch: "x64" }, pi: cell, claude: cell, overallPass: true };

describe("native packaged acceptance contract", () => {
  test("accepts only bounded private machine evidence", () => {
    expect(validateAcceptanceEvidence(evidence)).toBe(true);
    const serialized = JSON.stringify(evidence);
    for (const forbidden of ["/Users/", "/home/", "username", "hostname", "HTTP_PROXY", "secret"]) expect(serialized).not.toContain(forbidden);
    expect(validateAcceptanceEvidence({ ...evidence, revision: "/Users/private" })).toBe(false);
    const failed = { ...cell, pass: false, packageSha256: "", candidateSha256: "", legacySha256: "", staticParity: false, tty: false, fallback: false, noDoubleLaunch: false, updateRollbackUninstall: false, offlineRuntime: false };
    expect(validateAcceptanceEvidence({ ...evidence, pi: failed, overallPass: false })).toBe(true);
  });

  test("fails closed unless both surface cells pass", () => {
    expect(acceptancePasses({ pass: true }, { pass: true })).toBe(true);
    expect(acceptancePasses({ pass: true }, { pass: false })).toBe(false);
    expect(acceptancePasses({ pass: false }, { pass: true })).toBe(false);
  });

  test("keeps the complete native matrix and ordered fail-closed acceptance", () => {
    for (const pair of ["darwin-arm64\n            runner: macos-15", "darwin-x64\n            runner: macos-15-intel", "linux-arm64\n            runner: ubuntu-24.04-arm", "linux-x64\n            runner: ubuntu-24.04"]) expect(workflow).toContain(pair);
    const build = workflow.indexOf("bun run build:candidate");
    const acceptanceStep = workflow.indexOf("Installed Pi and Claude package acceptance");
    const acceptance = workflow.indexOf("native-packaged-acceptance.ts");
    const stage = workflow.indexOf("scripts/stage.ts");
    expect(build).toBeGreaterThan(0); expect(acceptance).toBeGreaterThan(build); expect(stage).toBeGreaterThan(acceptance);
    expect(workflow.slice(acceptanceStep, stage)).toContain("if: always()");
    expect(workflow).toContain("evidence/packaged-${{ matrix.target }}.json");
  });
});
