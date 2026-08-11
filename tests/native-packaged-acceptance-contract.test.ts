import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acceptancePasses, ptyReady, validateAcceptanceEvidence, type AcceptanceEvidence } from "../installer/scripts/native-packaged-acceptance.ts";
import { METRIC_CONTROLS, METRIC_THRESHOLDS, installedSize, measurePair, sizeComparison, summarizeSamples, thresholdFailures, type AcceptanceMetrics, type StartupComparison, type ThresholdFailure } from "../installer/scripts/native-acceptance-metrics.ts";

const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/opentui-solid-packaging-spike.yml"), "utf8");
const checksum = "a".repeat(64);
const samples = Array.from({ length: 30 }, (_, index) => index + 1);
const startup = (baselineP95: number, candidateP95: number): StartupComparison => ({ baseline: { samplesMs: samples, medianMs: 10, p95Ms: baselineP95 }, candidate: { samplesMs: samples, medianMs: 12, p95Ms: candidateP95 }, deltaMedianMs: 2, deltaP95Ms: candidateP95 - baselineP95 });
const metrics: AcceptanceMetrics = { controls: METRIC_CONTROLS, staticStartup: startup(100, 125), interactiveStartup: startup(400, 500), compressedPackage: sizeComparison(40 * 1024 * 1024, 50 * 1024 * 1024), installedPackage: installedSize({ legacy: 10, selector: 1, candidate: 2, manifest: 3 }) };
const cell = { pass: true, failureCode: "" as const, failureDetail: "", thresholdFailures: [], packageSha256: checksum, candidateSha256: checksum, legacySha256: checksum, staticParity: true, tty: true, fallback: true, noDoubleLaunch: true, updateRollbackUninstall: true, offlineRuntime: true, metrics };
const evidence: AcceptanceEvidence = { schema: "ein-native-packaged-acceptance/v2", revision: "b".repeat(40), target: "linux-x64", runner: { os: "linux", arch: "x64" }, pi: cell, claude: cell, overallPass: true };

describe("native packaged acceptance contract", () => {
  test("accepts only bounded private machine evidence", () => {
    expect(validateAcceptanceEvidence(evidence)).toBe(true);
    const serialized = JSON.stringify(evidence);
    for (const forbidden of ["/Users/", "/home/", "username", "hostname", "HTTP_PROXY", "secret"]) expect(serialized).not.toContain(forbidden);
    expect(validateAcceptanceEvidence({ ...evidence, revision: "/Users/private" })).toBe(false);
    const failed = { ...cell, pass: false, failureCode: "inspect" as const, failureDetail: "exception", packageSha256: "", candidateSha256: "", legacySha256: "", staticParity: false, tty: false, fallback: false, noDoubleLaunch: false, updateRollbackUninstall: false, offlineRuntime: false, metrics: null };
    expect(validateAcceptanceEvidence({ ...evidence, pi: failed, overallPass: false })).toBe(true);
    expect(validateAcceptanceEvidence({ ...evidence, pi: { ...failed, failureDetail: "/Users/private" }, overallPass: false })).toBe(false);
  });

  test("uses deterministic median, nearest-rank p95, and paired sample counts", async () => {
    expect(summarizeSamples([4, 1, 3, 2]).medianMs).toBe(2.5);
    expect(summarizeSamples(Array.from({ length: 20 }, (_, index) => index + 1)).p95Ms).toBe(19);
    let baselineCalls = 0; let candidateCalls = 0;
    const measured = await measurePair(() => ++baselineCalls, () => ++candidateCalls);
    expect([baselineCalls, candidateCalls]).toEqual([35, 35]);
    expect(measured.baseline.samplesMs).toHaveLength(30);
  });

  test("calculates size attribution and enforces every inclusive threshold boundary", () => {
    const installed = installedSize({ legacy: 100, selector: 20, candidate: 30, manifest: 10 });
    expect(installed).toMatchObject({ baselineBytes: 100, candidateBytes: 160, deltaBytes: 60, deltaPercent: 60 });
    expect(thresholdFailures(metrics)).toEqual([]);
    const cases: Array<[keyof AcceptanceMetrics, AcceptanceMetrics[keyof AcceptanceMetrics], ThresholdFailure]> = [
      ["staticStartup", startup(100, 125.001), "static-startup-p95"],
      ["interactiveStartup", startup(400, 500.001), "interactive-startup-delta-p95"],
      ["installedPackage", { ...metrics.installedPackage, deltaBytes: METRIC_THRESHOLDS.installedDeltaBytes + 1 }, "installed-size-delta"],
      ["compressedPackage", { ...metrics.compressedPackage, deltaBytes: METRIC_THRESHOLDS.compressedDeltaBytes + 1 }, "compressed-size-delta"],
      ["compressedPackage", { ...metrics.compressedPackage, deltaPercent: METRIC_THRESHOLDS.compressedDeltaPercent + 0.001 }, "compressed-size-percent"],
    ];
    for (const [key, value, code] of cases) expect(thresholdFailures({ ...metrics, [key]: value })).toContain(code);
    expect(thresholdFailures({ ...metrics, interactiveStartup: startup(399.999, 500) })).not.toContain("interactive-startup-absolute-p95");
    expect(thresholdFailures({ ...metrics, interactiveStartup: startup(399.998, 500.001) })).toContain("interactive-startup-absolute-p95");
  });

  test("waits for rendered input readiness rather than terminal setup output", () => {
    expect(ptyReady("\x1b[?1049h")).toBe(false);
    expect(ptyReady("j/k move  enter select  q quit")).toBe(true);
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
    const acceptance = workflow.indexOf("native-packaged-acceptance.ts", acceptanceStep);
    const upload = workflow.indexOf("Upload packaged acceptance evidence");
    const gate = workflow.indexOf("Enforce packaged acceptance thresholds");
    const stage = workflow.indexOf("scripts/stage.ts");
    expect(build).toBeGreaterThan(0); expect(acceptance).toBeGreaterThan(build); expect(upload).toBeGreaterThan(acceptance); expect(gate).toBeGreaterThan(upload); expect(stage).toBeGreaterThan(gate);
    expect(workflow.slice(acceptanceStep, gate)).toContain("continue-on-error: true");
    expect(workflow.slice(upload, gate)).toContain("if: always()");
    expect(workflow).toContain("evidence/packaged-${{ matrix.target }}.json");
  });
});
