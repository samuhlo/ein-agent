import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promotePiAppPackage } from "../src/core/app-package-promotion.ts";
import { removeAppPackage } from "../src/core/app-package-lifecycle.ts";
import { bundleCcEin } from "./bundle-cc-ein.ts";
import { bundleTemplate } from "./bundle-template.ts";
import { verifyCandidateInput, type CandidateInput } from "./dashboard-candidate-input.ts";
import { selectDashboardBinary } from "../../ein-pi/agent/launcher/dashboard-selector.ts";
import { validateDashboardRelease } from "../../ein-pi/agent/lib/dashboard-package.ts";
import { targetById } from "../../spikes/opentui-solid-packaging/src/targets.ts";
import { METRIC_CONTROLS, installedSize, measurePair, sizeComparison, startupComparison, thresholdFailures, validMetrics, type AcceptanceMetrics, type ThresholdFailure } from "./native-acceptance-metrics.ts";

type FailureCode = "" | "not-run" | "bundle" | "package" | "sync" | "inspect" | "lifecycle" | "checks" | "thresholds";
type Check = Readonly<{ pass: boolean; failureCode: FailureCode; failureDetail: string; thresholdFailures: readonly ThresholdFailure[]; packageSha256: string; candidateSha256: string; legacySha256: string; staticParity: boolean; tty: boolean; fallback: boolean; noDoubleLaunch: boolean; updateRollbackUninstall: boolean; offlineRuntime: boolean; metrics: AcceptanceMetrics | null }>;
export type AcceptanceEvidence = Readonly<{ schema: "ein-native-packaged-acceptance/v2"; revision: string; target: string; runner: { os: string; arch: string }; pi: Check; claude: Check; overallPass: boolean }>;

const INSPECTION_FAILURE_DETAILS = ["release", "fallback", "nonzero", "parity", "pty", "static-baseline", "static-candidate", "interactive-baseline-empty", "interactive-baseline-not-ready", "interactive-baseline-exit", "interactive-candidate-empty", "interactive-candidate-not-ready", "interactive-candidate-exit", "sizes"] as const;
type InspectionFailureDetail = typeof INSPECTION_FAILURE_DETAILS[number];

const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
function requireTrue(value: unknown): asserts value { if (!value) throw new Error("acceptance assertion failed"); }
const failedCheck = (failureCode: Exclude<FailureCode, "">, failureDetail = ""): Check => ({ pass: false, failureCode, failureDetail, thresholdFailures: [], packageSha256: "", candidateSha256: "", legacySha256: "", staticParity: false, tty: false, fallback: false, noDoubleLaunch: false, updateRollbackUninstall: false, offlineRuntime: false, metrics: null });
export const acceptancePasses = (pi: Pick<Check, "pass">, claude: Pick<Check, "pass">): boolean => pi.pass && claude.pass;
export const ptyReady = (output: string): boolean => /q (?:quit|salir)/.test(output);
export const boundedFailureDetail = (error: unknown): string => error instanceof Error && INSPECTION_FAILURE_DETAILS.includes(error.message as InspectionFailureDetail) ? error.message : "exception";
async function inspectStep<T>(detail: InspectionFailureDetail, operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); } catch { throw new Error(detail); }
}

export function validateAcceptanceEvidence(value: unknown): value is AcceptanceEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<AcceptanceEvidence>;
  const cell = (item: Check | undefined): boolean => {
    if (!item) return false;
    const outcomes = [item.staticParity, item.tty, item.fallback, item.noDoubleLaunch, item.updateRollbackUninstall, item.offlineRuntime];
    const checksum = (entry: string): boolean => /^[a-f0-9]{64}$/.test(entry) || (!item.pass && entry === "");
    const detail = INSPECTION_FAILURE_DETAILS.includes(item.failureDetail as InspectionFailureDetail) || /^(?:|exception|(?:staticParity|tty|fallback|noDoubleLaunch|updateRollbackUninstall|offlineRuntime)(?:,(?:staticParity|tty|fallback|noDoubleLaunch|updateRollbackUninstall|offlineRuntime))*)$/.test(item.failureDetail);
    const metricFailures = Array.isArray(item.thresholdFailures) && item.thresholdFailures.every((entry) => ["static-startup-p95", "interactive-startup-delta-p95", "interactive-startup-absolute-p95", "installed-size-delta", "compressed-size-delta", "compressed-size-percent"].includes(entry));
    return typeof item.pass === "boolean" && [item.packageSha256, item.candidateSha256, item.legacySha256].every(checksum)
      && ["", "not-run", "bundle", "package", "sync", "inspect", "lifecycle", "checks", "thresholds"].includes(item.failureCode) && detail && metricFailures
      && (item.pass ? item.failureCode === "" && item.failureDetail === "" : item.failureCode !== "")
      && outcomes.every((entry) => typeof entry === "boolean") && (item.metrics === null ? !item.pass : validMetrics(item.metrics))
      && item.pass === (outcomes.every(Boolean) && item.thresholdFailures.length === 0);
  };
  const privateData = /(?:\/Users\/|\/home\/|hostname|username|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|secret)/i;
  return !privateData.test(JSON.stringify(value)) && evidence.schema === "ein-native-packaged-acceptance/v2" && /^[a-f0-9]{40}$/.test(evidence.revision ?? "")
    && ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"].includes(evidence.target ?? "")
    && Boolean(evidence.runner && ["darwin", "linux"].includes(evidence.runner.os) && ["arm64", "x64"].includes(evidence.runner.arch))
    && cell(evidence.pi) && cell(evidence.claude) && evidence.overallPass === acceptancePasses(evidence.pi!, evidence.claude!);
}

function extract(archive: string, root: string): void {
  mkdirSync(root, { recursive: true });
  const result = Bun.spawnSync(["tar", "-xzf", archive, "-C", root]);
  requireTrue(result.exitCode === 0);
}

function verifyPackage(root: string, manifestName: string, candidate: CandidateInput): void {
  const manifest = JSON.parse(readFileSync(join(root, manifestName), "utf8")) as { dashboardSeed?: { format?: string; target?: string }; files?: Array<{ path?: string; sha256?: string }> };
  requireTrue(manifest.dashboardSeed?.format === "ein-dashboard-seed/v1" && manifest.dashboardSeed.target === candidate.target.id && Array.isArray(manifest.files));
  for (const entry of manifest.files) requireTrue(typeof entry.path === "string" && typeof entry.sha256 === "string" && digest(join(root, entry.path)) === entry.sha256);
  const seed = join(root, "ein/runtime-seed/dashboard/v1");
  const installedInput = { ...candidate, candidateBinary: join(seed, "packages", candidate.target.id, candidate.target.id ? `ein-opentui-dashboard-${candidate.target.id}` : ""), candidateInventory: join(seed, "packages", candidate.target.id, "candidate-inventory.json") };
  const verified = verifyCandidateInput(installedInput);
  requireTrue(verified.inventory.sourceRevision === candidate.sourceRevision && digest(installedInput.candidateBinary) === digest(candidate.candidateBinary));
  for (const path of ["selector/launcher/dashboard-selector.ts", "selector/lib/dashboard-package.ts", "selector/lib/terminal-app-args.ts"]) requireTrue(existsSync(join(seed, path)));
}

const offlineEnv = (home: string): Record<string, string> => ({ ...process.env, HOME: home, PATH: "/usr/bin:/bin", HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" }) as Record<string, string>;
function run(binary: string, args: string[], home: string): { code: number; stdout: Buffer; stderr: Buffer } {
  const result = Bun.spawnSync([binary, ...args], { cwd: home, env: offlineEnv(home), stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: Buffer.from(result.stdout), stderr: Buffer.from(result.stderr) };
}

function staticParity(app: string, legacy: string, home: string): boolean {
  return [[], ["--once"]].every((args) => {
    const direct = run(legacy, args, home);
    const selected = run(app, args, home);
    return direct.code === selected.code && direct.stdout.equals(selected.stdout) && direct.stderr.equals(selected.stderr);
  });
}

function staticSample(binary: string, home: string): number {
  const started = performance.now();
  const result = run(binary, [METRIC_CONTROLS.staticCommand], home);
  requireTrue(result.code === 0);
  return performance.now() - started;
}

async function interactiveSample(binary: string, home: string, sample: "interactive-baseline" | "interactive-candidate"): Promise<number> {
  let output = ""; let readyMs: number | undefined; const started = performance.now();
  const terminal = new Bun.Terminal({ cols: METRIC_CONTROLS.terminal.columns, rows: METRIC_CONTROLS.terminal.rows, data: (_terminal, bytes) => {
    output += new TextDecoder().decode(bytes);
    if (readyMs === undefined && ptyReady(output)) { readyMs = performance.now() - started; terminal.write("q"); }
  } });
  const child = Bun.spawn([binary, METRIC_CONTROLS.interactiveCommand], { cwd: home, env: offlineEnv(home), terminal, timeout: 8_000 });
  try {
    const code = await child.exited;
    if (readyMs === undefined) throw new Error(`${sample}-${output.length === 0 ? "empty" : "not-ready"}`);
    if (code !== 0) throw new Error(`${sample}-exit`);
    return readyMs;
  }
  finally { terminal.close(); }
}

async function pty(app: string, home: string): Promise<boolean> {
  let output = "";
  const terminal = new Bun.Terminal({ cols: 80, rows: 24, data: (_terminal, bytes) => { output += new TextDecoder().decode(bytes); } });
  const child = Bun.spawn([app], { cwd: home, env: offlineEnv(home), terminal, timeout: 8_000 });
  try {
    for (let attempt = 0; attempt < 50 && !ptyReady(output); attempt += 1) await Bun.sleep(100);
    requireTrue(ptyReady(output));
    terminal.write("q");
    const code = await child.exited;
    return code === 0 && output.includes("\x1b[?1049h") && output.includes("\x1b[?1049l");
  } finally { terminal.close(); }
}

async function fallbackBeforeStart(packageRoot: string, legacy: string, platform: string, arch: string): Promise<boolean> {
  const current = JSON.parse(readFileSync(join(packageRoot, "current.json"), "utf8")) as { release: string };
  const releaseRoot = join(packageRoot, "releases", current.release);
  const manifestPath = join(releaseRoot, "manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString()) as { candidate: { filename: string }; target: string };
  const candidate = join(releaseRoot, manifest.candidate.filename);
  const candidateBytes = readFileSync(candidate);
  const ports = { platform, arch, stdinTTY: true, stdoutTTY: true };
  let pass = true;
  for (const mutation of ["missing", "corrupt", "wrong-target"] as const) {
    if (mutation === "missing") renameSync(candidate, `${candidate}.missing`);
    if (mutation === "corrupt") writeFileSync(candidate, "corrupt", { mode: 0o755 });
    if (mutation === "wrong-target") writeFileSync(manifestPath, manifestBytes.toString().replace(`"target": "${manifest.target}"`, `"target": "${manifest.target === "linux-x64" ? "linux-arm64" : "linux-x64"}"`));
    pass &&= await selectDashboardBinary({ argv: [], cwd: packageRoot, packageRoot, legacyBinary: legacy, ports }) === legacy;
    if (mutation === "missing") renameSync(`${candidate}.missing`, candidate);
    else if (mutation === "corrupt") { writeFileSync(candidate, candidateBytes, { mode: 0o755 }); chmodSync(candidate, 0o755); }
    else writeFileSync(manifestPath, manifestBytes);
  }
  return pass;
}

async function nonzeroDoesNotLaunchLegacy(app: string, packageRoot: string, home: string): Promise<boolean> {
  const current = JSON.parse(readFileSync(join(packageRoot, "current.json"), "utf8")) as { release: string };
  const releaseRoot = join(packageRoot, "releases", current.release);
  const manifestPath = join(releaseRoot, "manifest.json");
  const originalManifest = readFileSync(manifestPath);
  const manifest = JSON.parse(originalManifest.toString()) as { candidate: { filename: string }; legacy: { filename: string } };
  const candidate = join(releaseRoot, manifest.candidate.filename); const legacy = join(releaseRoot, manifest.legacy.filename);
  const candidateBytes = readFileSync(candidate); const legacyBytes = readFileSync(legacy);
  const artifact = (path: string) => ({ filename: path.slice(path.lastIndexOf("/") + 1), sha256: digest(path), bytes: lstatSync(path).size, mode: "0755" });
  let output = "";
  try {
    writeFileSync(candidate, "#!/bin/sh\nprintf candidate-started\nexit 23\n", { mode: 0o755 });
    writeFileSync(legacy, "#!/bin/sh\nprintf legacy-double-launch\nexit 0\n", { mode: 0o755 });
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, candidate: artifact(candidate), legacy: artifact(legacy) }, null, 2)}\n`);
    const terminal = new Bun.Terminal({ data: (_terminal, bytes) => { output += new TextDecoder().decode(bytes); } });
    const child = Bun.spawn([app], { cwd: home, env: offlineEnv(home), terminal, timeout: 4_000 });
    try { return await child.exited === 23 && output.includes("candidate-started") && !output.includes("legacy-double-launch"); }
    finally { terminal.close(); }
  } finally {
    writeFileSync(candidate, candidateBytes, { mode: 0o755 }); writeFileSync(legacy, legacyBytes, { mode: 0o755 }); writeFileSync(manifestPath, originalManifest);
  }
}

async function inspectInstalled(app: string, packageRoot: string, candidate: CandidateInput, home: string, baselineArchive: string, candidateArchive: string): Promise<Pick<Check, "candidateSha256" | "legacySha256" | "staticParity" | "tty" | "fallback" | "noDoubleLaunch" | "offlineRuntime" | "metrics">> {
  const release = await inspectStep("release", async () => {
    const value = await validateDashboardRelease(packageRoot, candidate.target.id);
    requireTrue(value && digest(value.candidate) === digest(candidate.candidateBinary) && (lstatSync(app).mode & 0o777) === 0o755);
    return value;
  });
  const fallback = await inspectStep("fallback", () => fallbackBeforeStart(packageRoot, release.legacy, candidate.target.os, candidate.target.arch));
  const noDoubleLaunch = await inspectStep("nonzero", () => nonzeroDoesNotLaunchLegacy(app, packageRoot, home));
  const parity = await inspectStep("parity", () => staticParity(app, release.legacy, home));
  const tty = await inspectStep("pty", () => pty(app, home));
  const staticStartup = startupComparison(await measurePair(
    () => inspectStep("static-baseline", () => staticSample(release.legacy, home)),
    () => inspectStep("static-candidate", () => staticSample(app, home)),
  ));
  const interactiveStartup = startupComparison(await measurePair(
    () => interactiveSample(release.legacy, home, "interactive-baseline"),
    () => interactiveSample(app, home, "interactive-candidate"),
  ));
  const manifest = join(dirname(release.candidate), "manifest.json");
  const metrics = await inspectStep("sizes", (): AcceptanceMetrics => ({ controls: METRIC_CONTROLS, staticStartup, interactiveStartup,
    compressedPackage: sizeComparison(lstatSync(baselineArchive).size, lstatSync(candidateArchive).size),
    installedPackage: installedSize({ legacy: lstatSync(release.legacy).size, selector: lstatSync(app).size, candidate: lstatSync(release.candidate).size, manifest: lstatSync(manifest).size + lstatSync(join(packageRoot, "current.json")).size }) }));
  return { candidateSha256: digest(release.candidate), legacySha256: digest(release.legacy), staticParity: parity, tty, fallback, noDoubleLaunch, offlineRuntime: parity && tty, metrics };
}

async function piCell(root: string, archive: string, baselineArchive: string, candidate: CandidateInput): Promise<Check> {
  let stage: FailureCode = "package";
  try {
  const packageRoot = join(root, "package"); extract(archive, packageRoot); verifyPackage(packageRoot, "template-manifest.json", candidate); stage = "inspect";
  const bin = join(root, "home/bin");
  const first = await promotePiAppPackage({ binDir: bin, agentDir: packageRoot, platform: candidate.target.os, arch: candidate.target.arch, releaseId: "fixture-r1" }); first.commit();
  const app = join(bin, "ein"); const dashboard = join(bin, ".ein-dashboard");
  const inspected = await inspectInstalled(app, dashboard, candidate, join(root, "home"), baselineArchive, archive);
  const appBytes = readFileSync(app); const pointer = readFileSync(join(dashboard, "current.json"));
  const second = await promotePiAppPackage({ binDir: bin, agentDir: packageRoot, platform: candidate.target.os, arch: candidate.target.arch, releaseId: "fixture-r2" }); second.rollback();
  requireTrue(readFileSync(app).equals(appBytes) && readFileSync(join(dashboard, "current.json")).equals(pointer) && !existsSync(join(dashboard, "releases/fixture-r2")));
  stage = "lifecycle"; writeFileSync(join(bin, "unrelated"), "keep"); removeAppPackage({ root: bin, commands: ["ein"] });
  const lifecycle = !existsSync(app) && !existsSync(join(dashboard, "current.json")) && existsSync(join(bin, "unrelated"));
  const failures = Object.entries({ staticParity: inspected.staticParity, tty: inspected.tty, fallback: inspected.fallback, noDoubleLaunch: inspected.noDoubleLaunch, offlineRuntime: inspected.offlineRuntime, updateRollbackUninstall: lifecycle }).filter(([, pass]) => !pass).map(([name]) => name).join(",");
  const thresholds = thresholdFailures(inspected.metrics!); const pass = failures === "" && thresholds.length === 0;
  return { pass, failureCode: failures ? "checks" : thresholds.length ? "thresholds" : "", failureDetail: failures, thresholdFailures: thresholds, packageSha256: digest(archive), ...inspected, updateRollbackUninstall: lifecycle };
  } catch (error) { return failedCheck(stage as Exclude<FailureCode, "">, stage === "inspect" ? boundedFailureDetail(error) : "exception"); }
}

async function claudeCell(root: string, archive: string, baselineArchive: string, candidate: CandidateInput): Promise<Check> {
  let stage: FailureCode = "package";
  try {
  const payload = join(root, "payload"); extract(archive, payload); verifyPackage(payload, "ein-cc-payload-manifest.json", candidate); stage = "sync";
  const home = join(root, "home"); const destination = join(home, ".claude-ein"); mkdirSync(home, { recursive: true });
  process.env.HOME = home; process.env.CC_EIN_HOME = destination;
  const sync = await import(`${pathToFileURL(join(payload, "cc-ein/sync.ts")).href}?acceptance=${Date.now()}`) as {
    runSync: () => Promise<{ ok: boolean }>;
    promoteClaudeTerminalApp: (options: { repo: string; destination: string; platform: string; arch: string; releaseId: string }) => Promise<{ rollback: () => void }>;
  };
  const result = await sync.runSync(); requireTrue(result.ok); stage = "inspect";
  const bin = join(destination, "bin"); const app = join(bin, "ein-app"); const dashboard = join(bin, ".ein-dashboard");
  const inspected = await inspectInstalled(app, dashboard, candidate, home, baselineArchive, archive);
  const appBytes = readFileSync(app); const pointer = readFileSync(join(dashboard, "current.json"));
  const second = await sync.promoteClaudeTerminalApp({ repo: payload, destination: bin, platform: candidate.target.os, arch: candidate.target.arch, releaseId: "fixture-r2" }); second.rollback();
  requireTrue(readFileSync(app).equals(appBytes) && readFileSync(join(dashboard, "current.json")).equals(pointer));
  stage = "lifecycle"; writeFileSync(join(bin, "unrelated"), "keep"); removeAppPackage({ root: bin, commands: ["ein-app"] });
  const lifecycle = !existsSync(app) && !existsSync(join(dashboard, "current.json")) && existsSync(join(bin, "unrelated"));
  const failures = Object.entries({ staticParity: inspected.staticParity, tty: inspected.tty, fallback: inspected.fallback, noDoubleLaunch: inspected.noDoubleLaunch, offlineRuntime: inspected.offlineRuntime, updateRollbackUninstall: lifecycle }).filter(([, pass]) => !pass).map(([name]) => name).join(",");
  const thresholds = thresholdFailures(inspected.metrics!); const pass = failures === "" && thresholds.length === 0;
  return { pass, failureCode: failures ? "checks" : thresholds.length ? "thresholds" : "", failureDetail: failures, thresholdFailures: thresholds, packageSha256: digest(archive), ...inspected, updateRollbackUninstall: lifecycle };
  } catch (error) { return failedCheck(stage as Exclude<FailureCode, "">, stage === "inspect" ? boundedFailureDetail(error) : "exception"); }
}

export async function runAcceptance(targetId: string, revision: string, evidencePath: string): Promise<AcceptanceEvidence> {
  const target = targetById(targetId); requireTrue(target.os === process.platform && target.arch === process.arch);
  const root = mkdtempSync(join(tmpdir(), "ein-native-acceptance-"));
  const candidate: CandidateInput = { target, sourceRevision: revision, candidateBinary: join(process.cwd(), `dist/ein-opentui-dashboard-${target.id}`), candidateInventory: join(process.cwd(), `dist/ein-opentui-dashboard-${target.id}.json`) };
  let pi = failedCheck("not-run"); let claude = failedCheck("not-run");
  try {
    verifyCandidateInput(candidate);
    const piArchive = join(root, "template.tar.gz"); const piBaseline = join(root, "template-baseline.tar.gz");
    const claudeArchive = join(root, "cc-ein-runtime.tar.gz"); const claudeBaseline = join(root, "cc-ein-runtime-baseline.tar.gz");
    try { await bundleTemplate({ out: piBaseline }); await bundleTemplate({ candidate, out: piArchive }); pi = await piCell(join(root, "pi"), piArchive, piBaseline, candidate); } catch { pi = failedCheck("bundle", "exception"); }
    try { await bundleCcEin({ out: claudeBaseline }); await bundleCcEin({ candidate, out: claudeArchive }); claude = await claudeCell(join(root, "claude"), claudeArchive, claudeBaseline, candidate); } catch { claude = failedCheck("bundle", "exception"); }
  } finally {
    for (const [surface, check] of [["pi", pi], ["claude", claude]] as const) if (!check.pass) console.error(`native packaged acceptance ${surface} failed: ${check.failureCode}${check.failureDetail ? `/${check.failureDetail}` : ""}${check.thresholdFailures.length ? `/${check.thresholdFailures.join(",")}` : ""}`);
    const evidence: AcceptanceEvidence = { schema: "ein-native-packaged-acceptance/v2", revision, target: target.id, runner: { os: process.platform, arch: process.arch }, pi, claude, overallPass: acceptancePasses(pi, claude) };
    mkdirSync(dirname(evidencePath), { recursive: true }); writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    rmSync(root, { recursive: true, force: true });
    return evidence;
  }
}

if (import.meta.main) {
  const target = process.argv[2] ?? ""; const revision = process.argv[3] ?? ""; const output = process.argv[4] ?? `evidence/packaged-${target}.json`;
  const evidence = await runAcceptance(target, revision, output).catch(() => undefined);
  process.exitCode = evidence?.overallPass ? 0 : 1;
}
