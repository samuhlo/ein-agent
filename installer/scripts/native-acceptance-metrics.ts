export const METRIC_CONTROLS = Object.freeze({
  warmups: 5,
  samples: 30,
  timer: "monotonic-performance-now",
  percentile: "nearest-rank-p95; middle-average-median",
  terminal: { columns: 80, rows: 24 },
  fixture: "isolated-installed-package",
  staticCommand: "--once",
  interactiveCommand: "--no-intro",
  environment: "offline-controlled",
} as const);

const MIB = 1024 * 1024;
export const METRIC_THRESHOLDS = Object.freeze({
  staticDeltaP95Ms: 25,
  interactiveDeltaP95Ms: 100,
  interactiveCandidateP95Ms: 500,
  installedDeltaBytes: 15 * MIB,
  compressedDeltaBytes: 10 * MIB,
  compressedDeltaPercent: 25,
} as const);

export type SampleSummary = Readonly<{ samplesMs: readonly number[]; medianMs: number; p95Ms: number }>;
export type StartupComparison = Readonly<{ baseline: SampleSummary; candidate: SampleSummary; deltaMedianMs: number; deltaP95Ms: number }>;
export type SizeComparison = Readonly<{ baselineBytes: number; candidateBytes: number; deltaBytes: number; deltaPercent: number }>;
export type InstalledSize = SizeComparison & Readonly<{ attributableBytes: { legacy: number; selector: number; candidate: number; manifest: number } }>;
export type AcceptanceMetrics = Readonly<{
  controls: typeof METRIC_CONTROLS;
  staticStartup: StartupComparison;
  interactiveStartup: StartupComparison;
  compressedPackage: SizeComparison;
  installedPackage: InstalledSize;
}>;
export type ThresholdFailure = "static-startup-p95" | "interactive-startup-delta-p95" | "interactive-startup-absolute-p95" | "installed-size-delta" | "compressed-size-delta" | "compressed-size-percent";

const rounded = (value: number): number => Math.round(value * 1000) / 1000;

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) throw new Error("invalid metric samples");
  const sorted = samples.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  return { samplesMs: samples.map(rounded), medianMs: rounded(median), p95Ms: rounded(p95) };
}

export async function measurePair(baseline: () => number | Promise<number>, candidate: () => number | Promise<number>): Promise<{ baseline: SampleSummary; candidate: SampleSummary }> {
  for (let index = 0; index < METRIC_CONTROLS.warmups; index += 1) { await baseline(); await candidate(); }
  const baselineSamples: number[] = []; const candidateSamples: number[] = [];
  for (let index = 0; index < METRIC_CONTROLS.samples; index += 1) {
    baselineSamples.push(await baseline()); candidateSamples.push(await candidate());
  }
  return { baseline: summarizeSamples(baselineSamples), candidate: summarizeSamples(candidateSamples) };
}

export function startupComparison(pair: { baseline: SampleSummary; candidate: SampleSummary }): StartupComparison {
  return { ...pair, deltaMedianMs: rounded(pair.candidate.medianMs - pair.baseline.medianMs), deltaP95Ms: rounded(pair.candidate.p95Ms - pair.baseline.p95Ms) };
}

export function sizeComparison(baselineBytes: number, candidateBytes: number): SizeComparison {
  if (!Number.isSafeInteger(baselineBytes) || baselineBytes <= 0 || !Number.isSafeInteger(candidateBytes) || candidateBytes <= 0) throw new Error("invalid metric size");
  const deltaBytes = candidateBytes - baselineBytes;
  return { baselineBytes, candidateBytes, deltaBytes, deltaPercent: rounded(deltaBytes / baselineBytes * 100) };
}

export function installedSize(attributableBytes: InstalledSize["attributableBytes"]): InstalledSize {
  const candidateBytes = Object.values(attributableBytes).reduce((total, bytes) => total + bytes, 0);
  return { ...sizeComparison(attributableBytes.legacy, candidateBytes), attributableBytes };
}

export function thresholdFailures(metrics: AcceptanceMetrics): ThresholdFailure[] {
  const failures: ThresholdFailure[] = [];
  if (metrics.staticStartup.deltaP95Ms > METRIC_THRESHOLDS.staticDeltaP95Ms) failures.push("static-startup-p95");
  if (metrics.interactiveStartup.deltaP95Ms > METRIC_THRESHOLDS.interactiveDeltaP95Ms) failures.push("interactive-startup-delta-p95");
  if (metrics.interactiveStartup.candidate.p95Ms > METRIC_THRESHOLDS.interactiveCandidateP95Ms) failures.push("interactive-startup-absolute-p95");
  if (metrics.installedPackage.deltaBytes > METRIC_THRESHOLDS.installedDeltaBytes) failures.push("installed-size-delta");
  if (metrics.compressedPackage.deltaBytes > METRIC_THRESHOLDS.compressedDeltaBytes) failures.push("compressed-size-delta");
  if (metrics.compressedPackage.deltaPercent > METRIC_THRESHOLDS.compressedDeltaPercent) failures.push("compressed-size-percent");
  return failures;
}

export function validMetrics(value: unknown): value is AcceptanceMetrics {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<AcceptanceMetrics>;
  const summary = (entry: SampleSummary | undefined): boolean => Boolean(entry && Array.isArray(entry.samplesMs) && entry.samplesMs.length === 30 && entry.samplesMs.every(Number.isFinite) && Number.isFinite(entry.medianMs) && Number.isFinite(entry.p95Ms));
  const startup = (entry: StartupComparison | undefined): boolean => Boolean(entry && summary(entry.baseline) && summary(entry.candidate) && Number.isFinite(entry.deltaMedianMs) && Number.isFinite(entry.deltaP95Ms));
  const size = (entry: SizeComparison | undefined): boolean => Boolean(entry && [entry.baselineBytes, entry.candidateBytes, entry.deltaBytes, entry.deltaPercent].every(Number.isFinite));
  return JSON.stringify(metric.controls) === JSON.stringify(METRIC_CONTROLS) && startup(metric.staticStartup) && startup(metric.interactiveStartup)
    && size(metric.compressedPackage) && size(metric.installedPackage) && Boolean(metric.installedPackage?.attributableBytes && Object.values(metric.installedPackage.attributableBytes).every(Number.isSafeInteger));
}
