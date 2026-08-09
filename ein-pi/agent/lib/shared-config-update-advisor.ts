// =============================================================================
// [CORE] SHARED CONFIG + UPDATE ADVISOR
// Pure normalization boundary. It observes evidence; it never reads, writes, or runs.
// =============================================================================

export const ADVISOR_SCHEMA_VERSION = 1 as const;
export const MAX_ADVISOR_PROVENANCE = 8;

export type AdvisorFreshness = "current" | "stale" | "unknown";
export type AdvisorConfigurationStatus =
  | "current"
  | "incomplete"
  | "unavailable"
  | "unsupported"
  | "ambiguous"
  | "error";
export type AdvisorUpdateStatus =
  | "current"
  | "update-available"
  | "unavailable"
  | "unsupported"
  | "ambiguous"
  | "error";
export type AdvisorRecommendationKind =
  | "none"
  | "inspect-configuration"
  | "retry-read"
  | "resolve-ambiguity"
  | "installer-handoff"
  | "unsupported-action";
export type InstallerAction = "install" | "update" | "repair" | "configure";
export type EvidenceStatus =
  | "valid"
  | "current"
  | "update-available"
  | "missing"
  | "invalid"
  | "unreadable"
  | "malformed"
  | "unavailable"
  | "unsupported"
  | "ambiguous"
  | "unknown"
  | "error"
  | "skipped";

export type AdvisorEvidence = Readonly<{
  status: EvidenceStatus;
  source: string;
  freshness?: AdvisorFreshness;
  reason?: string;
}>;

export type ConfigurationEvidence = AdvisorEvidence & Readonly<{ value?: unknown }>;
export type VersionEvidence = AdvisorEvidence & Readonly<{ version?: unknown }>;
export type OwnershipEvidence = AdvisorEvidence & Readonly<{
  owner?: "installer" | "external" | "ambiguous" | "unknown";
  action?: InstallerAction;
  actionId?: string;
}>;
export type CapabilityEvidence = AdvisorEvidence & Readonly<{ supported?: boolean }>;

export type AdvisorInput = Readonly<{
  configuration?: Readonly<{
    mode?: ConfigurationEvidence;
    model?: ConfigurationEvidence;
    project?: AdvisorEvidence;
    conflicts?: boolean;
  }>;
  /** Alias accepted by adapters migrating from the old `config` spelling. */
  config?: Readonly<{
    mode?: ConfigurationEvidence;
    model?: ConfigurationEvidence;
    project?: AdvisorEvidence;
    conflicts?: boolean;
  }>;
  update?: Readonly<{
    installed?: VersionEvidence;
    release?: VersionEvidence;
    owner?: OwnershipEvidence;
    capability?: CapabilityEvidence;
    observations?: readonly AdvisorEvidence[];
    conflicts?: boolean;
  }>;
}>;

export type AdvisorProvenance = Readonly<{
  source: string;
  quality: EvidenceStatus;
  reason: string;
  freshness: AdvisorFreshness;
}>;

export type AdvisorFacet<TStatus extends string> = Readonly<{
  status: TStatus;
  freshness: AdvisorFreshness;
  reason: string;
  provenance: readonly AdvisorProvenance[];
}>;

export type InstallerHandoff = Readonly<{
  owner: "installer";
  action: InstallerAction;
  actionId: string;
  performed: false;
}>;

export type AdvisorRecommendation = Readonly<{
  kind: AdvisorRecommendationKind;
  reason: string;
  handoff?: InstallerHandoff;
}>;

export type SharedConfigUpdateAdvisorResult = Readonly<{
  schemaVersion: typeof ADVISOR_SCHEMA_VERSION;
  configuration: AdvisorFacet<AdvisorConfigurationStatus>;
  update: AdvisorFacet<AdvisorUpdateStatus>;
  recommendation: AdvisorRecommendation;
  handoff?: InstallerHandoff;
}>;

const ACTIONS: readonly InstallerAction[] = ["install", "update", "repair", "configure"];
const SAFE_TOKEN = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^(?:v)?(\d+)(?:\.(\d+))(?:\.(\d+))(?:[-+][0-9A-Za-z.-]+)?$/;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function safeToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f\r\n]/g, "-")
    .trim()
    .toLowerCase();
  return SAFE_TOKEN.test(normalized) ? normalized : fallback;
}

function freshnessOf(evidence: AdvisorEvidence | undefined): AdvisorFreshness {
  return evidence?.freshness === "stale" || evidence?.freshness === "unknown"
    ? evidence.freshness
    : "current";
}

function reasonFor(evidence: AdvisorEvidence | undefined): string {
  if (!evidence) return "missing";
  if (freshnessOf(evidence) === "stale") return "stale-evidence";
  if (freshnessOf(evidence) === "unknown") return "unknown-evidence";
  switch (evidence.status) {
    case "valid":
    case "current": return "read-success";
    case "update-available": return "newer-release";
    case "missing": return "missing";
    case "unavailable":
    case "skipped": return "unavailable";
    case "unsupported": return "unsupported";
    case "ambiguous": return "ambiguous-evidence";
    case "invalid":
    case "unreadable":
    case "malformed":
    case "error": return "invalid-evidence";
    default: return "invalid-evidence";
  }
}

function provenanceFor(evidence: AdvisorEvidence | undefined): AdvisorProvenance {
  return Object.freeze({
    source: safeToken(evidence?.source, "unknown-source"),
    quality: evidence?.status ?? "missing",
    reason: reasonFor(evidence),
    freshness: freshnessOf(evidence),
  });
}

function collectProvenance(evidence: readonly (AdvisorEvidence | undefined)[]): readonly AdvisorProvenance[] {
  const entries: AdvisorProvenance[] = [];
  for (const item of evidence) {
    if (!item || entries.length >= MAX_ADVISOR_PROVENANCE) continue;
    entries.push(provenanceFor(item));
  }
  return Object.freeze(entries);
}

function facetFreshness(evidence: readonly (AdvisorEvidence | undefined)[]): AdvisorFreshness {
  if (evidence.some((item) => freshnessOf(item) === "stale")) return "stale";
  if (evidence.some((item) => freshnessOf(item) === "unknown")) return "unknown";
  return "current";
}

function hasStatus(evidence: readonly (AdvisorEvidence | undefined)[], ...statuses: EvidenceStatus[]): boolean {
  return evidence.some((item) => item !== undefined && statuses.includes(item.status));
}

function configurationFacet(input: AdvisorInput): AdvisorFacet<AdvisorConfigurationStatus> {
  const evidence = input.configuration ?? input.config;
  const items = [evidence?.mode, evidence?.model, evidence?.project] as const;
  const provenance = collectProvenance(items);
  const freshness = facetFreshness(items);
  let status: AdvisorConfigurationStatus;
  let reason: string;

  if (!evidence) {
    status = "unavailable";
    reason = "unavailable";
  } else if (evidence.conflicts || hasStatus(items, "ambiguous")) {
    status = "ambiguous";
    reason = "ambiguous-evidence";
  } else if (freshness !== "current") {
    status = "unavailable";
    reason = freshness === "stale" ? "stale-evidence" : "unknown-evidence";
  } else if (hasStatus(items, "unsupported")) {
    status = "unsupported";
    reason = "unsupported";
  } else if (hasStatus(items, "invalid", "unreadable", "malformed", "error")) {
    status = "error";
    reason = "invalid-evidence";
  } else if (hasStatus(items, "unavailable", "skipped", "unknown")) {
    status = "unavailable";
    reason = "unavailable";
  } else if (hasStatus(items, "missing") || !evidence.mode || !evidence.model) {
    status = "incomplete";
    reason = "missing";
  } else {
    status = "current";
    reason = "read-success";
  }

  return Object.freeze({ status, freshness, reason, provenance });
}

function versionOf(value: unknown): [number, number, number] | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(VERSION);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index]! > right[index]! ? 1 : -1;
  }
  return 0;
}

function validAction(value: unknown): value is InstallerAction {
  return typeof value === "string" && ACTIONS.includes(value as InstallerAction);
}

function validActionId(value: unknown): value is string {
  return typeof value === "string" && /^installer\.(install|update|repair|configure)$/.test(value);
}

function coherentAction(action: unknown, actionId: unknown): action is InstallerAction {
  return validAction(action) && validActionId(actionId) && actionId === `installer.${action}`;
}

function hasKnownStatus(evidence: AdvisorEvidence | undefined): boolean {
  return evidence?.status === "valid" || evidence?.status === "current";
}

function failClosedUpdateEvidence(
  evidence: AdvisorEvidence | undefined,
  base: { freshness: AdvisorFreshness; provenance: readonly AdvisorProvenance[] },
): AdvisorFacet<AdvisorUpdateStatus> & { handoff?: InstallerHandoff } {
  if (!evidence) return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
  if (evidence.status === "ambiguous") return Object.freeze({ ...base, status: "ambiguous", reason: "ambiguous-evidence" });
  if (evidence.status === "unsupported") return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
  if (evidence.status === "unknown") return Object.freeze({ ...base, status: "unavailable", reason: "unknown-evidence" });
  if (["invalid", "unreadable", "malformed", "error"].includes(evidence.status)) {
    return Object.freeze({ ...base, status: "error", reason: "invalid-evidence" });
  }
  return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
}

function updateFacet(input: AdvisorInput): AdvisorFacet<AdvisorUpdateStatus> & { handoff?: InstallerHandoff } {
  const evidence = input.update;
  const observations = evidence?.observations ?? [];
  const items = [evidence?.installed, evidence?.release, evidence?.owner, evidence?.capability, ...observations];
  const provenance = collectProvenance(items);
  const freshness = facetFreshness(items);
  const base = { freshness, provenance };

  if (!evidence) return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
  if (observations.length) {
    if (freshness !== "current") {
      return Object.freeze({ ...base, status: "unavailable", reason: freshness === "stale" ? "stale-evidence" : "unknown-evidence" });
    }
    if (hasStatus(observations, "ambiguous")) return Object.freeze({ ...base, status: "ambiguous", reason: "ambiguous-evidence" });
    if (hasStatus(observations, "error", "invalid", "unreadable", "malformed")) return Object.freeze({ ...base, status: "error", reason: "invalid-evidence" });
    if (hasStatus(observations, "unsupported")) return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
    if (hasStatus(observations, "unavailable", "skipped", "unknown")) return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
    if (hasStatus(observations, "update-available")) return Object.freeze({ ...base, status: "update-available", reason: "newer-release" });
    if (observations.every((item) => item.status === "current")) return Object.freeze({ ...base, status: "current", reason: "read-success" });
    return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
  }
  if (evidence.conflicts || hasStatus(items, "ambiguous") || evidence.owner?.owner === "ambiguous") {
    return Object.freeze({ ...base, status: "ambiguous", reason: "ambiguous-evidence" });
  }
  if (evidence.owner?.owner === "unknown") {
    return Object.freeze({ ...base, status: "unavailable", reason: "unknown-evidence" });
  }
  if (freshness !== "current") {
    return Object.freeze({ ...base, status: "unavailable", reason: freshness === "stale" ? "stale-evidence" : "unknown-evidence" });
  }
  const ownerEvidence = evidence.owner;
  const capabilityEvidence = evidence.capability;
  if (!ownerEvidence || !hasKnownStatus(ownerEvidence)) return failClosedUpdateEvidence(ownerEvidence, base);
  if (!capabilityEvidence || !hasKnownStatus(capabilityEvidence)) return failClosedUpdateEvidence(capabilityEvidence, base);
  if (capabilityEvidence.supported !== true) {
    return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
  }
  if (hasStatus([evidence.installed, evidence.release], "invalid", "unreadable", "malformed", "error")) {
    return Object.freeze({ ...base, status: "error", reason: "invalid-evidence" });
  }
  if (hasStatus(items, "unsupported")) {
    return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
  }
  if (hasStatus(items, "missing", "unavailable", "skipped", "unknown") || items.some((item) => item === undefined)) {
    return Object.freeze({ ...base, status: "unavailable", reason: "unavailable" });
  }

  const installed = versionOf(evidence.installed?.version);
  const release = versionOf(evidence.release?.version);
  if (!installed || !release) {
    return Object.freeze({ ...base, status: "error", reason: "invalid-evidence" });
  }
  const comparison = compareVersions(release, installed);
  if (comparison < 0) {
    return Object.freeze({ ...base, status: "ambiguous", reason: "version-regression" });
  }
  if (comparison === 0) {
    if (ownerEvidence.owner !== "installer") {
      return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
    }
    return Object.freeze({ ...base, status: "current", reason: "read-success" });
  }
  if (ownerEvidence.owner !== "installer") {
    return Object.freeze({ ...base, status: "unsupported", reason: "unsupported" });
  }

  const action = ownerEvidence.action;
  const actionId = ownerEvidence.actionId;
  if (!coherentAction(action, actionId)) {
    return Object.freeze({ ...base, status: "ambiguous", reason: "ambiguous-owner" });
  }
  const handoff: InstallerHandoff = Object.freeze({
    owner: "installer",
    action,
    actionId: actionId!,
    performed: false,
  });
  return Object.freeze({ ...base, status: "update-available", reason: "newer-release", handoff });
}

function recommendation(
  configuration: AdvisorFacet<AdvisorConfigurationStatus>,
  update: AdvisorFacet<AdvisorUpdateStatus>,
  handoff: InstallerHandoff | undefined,
): AdvisorRecommendation {
  if (update.status === "update-available" && handoff) {
    return Object.freeze({ kind: "installer-handoff", reason: "newer-release", handoff });
  }
  if (configuration.status === "ambiguous" || update.status === "ambiguous") {
    return Object.freeze({ kind: "resolve-ambiguity", reason: "ambiguous-evidence" });
  }
  if (configuration.status === "unsupported" || update.status === "unsupported") {
    return Object.freeze({ kind: "unsupported-action", reason: "unsupported" });
  }
  if (configuration.status === "error") return Object.freeze({ kind: "inspect-configuration", reason: configuration.reason });
  if (configuration.status === "incomplete") return Object.freeze({ kind: "inspect-configuration", reason: configuration.reason });
  if (update.status === "error" || update.status === "unavailable") return Object.freeze({ kind: "retry-read", reason: update.reason });
  return Object.freeze({ kind: "none", reason: "read-success" });
}

/** Evaluates observed evidence only; no filesystem, network, clock, process, or mutation dependency. */
export function evaluateSharedConfigUpdateAdvisor(input: AdvisorInput): SharedConfigUpdateAdvisorResult {
  const configuration = configurationFacet(input);
  const evaluatedUpdate = updateFacet(input);
  const { handoff, ...updateFields } = evaluatedUpdate;
  const update = freeze(updateFields) as AdvisorFacet<AdvisorUpdateStatus>;
  const result: SharedConfigUpdateAdvisorResult = {
    schemaVersion: ADVISOR_SCHEMA_VERSION,
    configuration,
    update,
    recommendation: recommendation(configuration, update, handoff),
    ...(handoff ? { handoff } : {}),
  };
  return freeze(result);
}

/** Stable semantic text shared by surfaces; layout belongs to each caller. */
export function renderAdvisorSemantics(result: SharedConfigUpdateAdvisorResult): string {
  const lines = [
    `Configuration: status=${safeToken(result.configuration.status, "unknown")} freshness=${safeToken(result.configuration.freshness, "unknown")} reason=${safeToken(result.configuration.reason, "unknown")}`,
    `Update: status=${safeToken(result.update.status, "unknown")} freshness=${safeToken(result.update.freshness, "unknown")} reason=${safeToken(result.update.reason, "unknown")}`,
    `Recommendation: kind=${safeToken(result.recommendation.kind, "none")} reason=${safeToken(result.recommendation.reason, "unknown")}`,
  ];
  if (result.handoff && result.handoff.owner === "installer" && result.handoff.performed === false) {
    const action = validAction(result.handoff.action) ? result.handoff.action : "configure";
    const actionId = validActionId(result.handoff.actionId) ? result.handoff.actionId : "installer.unknown";
    lines.push(`Handoff: owner=installer action=${action} actionId=${actionId} performed=false`);
  }
  return lines.join("\n");
}

/** Short alias for adapters that call the boundary an evaluator. */
export const evaluateAdvisor = evaluateSharedConfigUpdateAdvisor;
export const normalizeAdvisorEvidence = evaluateSharedConfigUpdateAdvisor;
