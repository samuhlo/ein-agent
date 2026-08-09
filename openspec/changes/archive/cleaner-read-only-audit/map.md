status: complete
scope_status: bounded
change: cleaner-read-only-audit
phase: map

# Map — cleaner-read-only-audit

## Scope and routing

Roadmap H only: add a read-only cleaner audit over B's projected state and G's reviewed-area evidence. The implementation must not redesign or reimplement B/G, introduce a second authority, apply cleaner changes, refresh evidence, declare approval, or touch later I–J behavior. No source, test, build, typecheck, or verify work was performed in this phase.

Recommended implementation shape is a small cleaner-domain audit module plus focused tests, consuming existing public seams. There is no existing `cleaner` production module or cleaner audit entrypoint in `ein-pi`; the nearest current cleaner-like flow is skill maintenance and must not be reused as an audit writer.

## B contract — authoritative projected project/Git state

**Primary seam:** `ein-pi/agent/lib/project-state.ts`

- `projectProjectState({ cwd, selectedChange, runtime })` is the B authority. It returns `ProjectStateV1` with `schemaVersion: 1`, `identity`, `openspec`, `ein`, `git`, `verification`, and provider-scoped `runtimes`; it performs projection without persistence.
- Source quality is explicit (`current`, `absent`, `incomplete`, `ambiguous`, `legacy`, `stale`, `unbound`, `unavailable`) and each source carries a reason code. H must preserve these values and never coerce non-current values into facts.
- `git` is the exact identity-bearing input: `repository`, `complete`, `quality`, `dirty`, bounded repository-relative `changes`, and optional `stateRef` matching `git-v1:sha256:<64 hex>`. A missing `stateRef`, incomplete projection, non-repository, parse/read/command failure, or ambiguous source is non-current and must fail closed.
- `projectGitStateForReviewedArea(state)` is the explicit B→G projection seam. It returns a frozen, reduced object containing only `repository`, `complete`, `quality`, optional `stateRef`, and `dirty`; intentionally it excludes current `changes` because G's transition semantics require a separately attributable historical transition. `reviewedAreaGitInput` is its alias.
- Verification is state-bound through `ProjectVerificationState`: `reportedOutcome`, `effectiveOutcome`, `freshness` (`current`, `stale`, `unbound`, `unavailable`, `invalid`), and optional `currentStateRef`/`observedStateRef`. Only an exact complete Git binding with current freshness can support a current fact; stale/unbound/invalid/unavailable evidence remains uncertainty.
- B reads Git with `git --no-optional-locks`, preserving the read-only boundary. It hashes bounded status/content identity without exposing file contents. H should receive a supplied snapshot or call the authority once at the boundary; it must not shell out independently or create a project-state cache/store.
- B's OpenSpec and EIN fields retain active-change ambiguity, incomplete/legacy provenance, missing artifacts, blockers, and context boundaries. The audit must not infer a selected change, phase, approval, or freshness from presence of an artifact/session.

**Existing B tests:** `tests/shared-project-state.test.ts` covers schema/quality, deterministic output, no writes, exact Git identity, bounded overflow, stale verification, private runtime filtering, and degradation. H tests should compose these contracts rather than duplicate B projection logic.

## G contract — reviewed-area ledger and evidence

**Core seam:** `ein-pi/agent/lib/reviewed-area-ledger.ts`

- `Area` has deterministic `area-v1:sha256:<64 hex>` identity over canonical, sorted, non-overlapping selectors (`file` or `tree`). `areaPath(area, path)` tests whether a repository-relative source belongs to the bounded area.
- `LedgerRecord` is either explicit `unreviewed` with no evidence/Git binding, or `reviewed` with `Evidence` (`kind: human-review`, privacy-safe `review-evidence-v1:` reference, digest, reviewer reference) and `GitBinding.stateRef`.
- `normalizeLedger`/`parseLedger` enforce schema 1, bounded records/selectors/bytes, canonical identities, exact fields, safe relative paths, duplicate-key rejection, and fail-closed invalid/unsupported/oversized/unreadable outcomes. H must consume normalized records and must not accept ad hoc labels, absolute paths, raw evidence, or free-form reviewer claims.
- `evaluateReviewedArea(input, areaId, current, transition?, evidence?)` returns deterministic `LedgerEvaluation`: outcome `reviewed | unreviewed | stale | invalid | unavailable | unknown`; freshness `current | stale | unavailable | invalid | unknown`; a reason; and optional observed state reference. It requires current complete B Git (`quality=current`, repository true, valid stateRef), verifies evidence identity, and distinguishes exact binding, relevant change, unverifiable transition, mismatch, missing evidence, and explicit unreviewed.
- Critical classification rules: exact same state + verified evidence → `reviewed/current`; relevant transition → `stale`; changed state without verifiable transition or evidence mismatch → `unknown`; absent record → `unreviewed`; invalid ledger/evidence → `invalid`; unavailable source → `unavailable`. None implies approval.
- `intersects` is pure and validates transitions fail closed. Renames/copies include both paths; deleted paths can include prior path; unknown/unsafe/overflowed/incomplete transitions are unverifiable rather than safe.

**Store seam:** `ein-pi/agent/lib/reviewed-area-ledger-store.ts`

- `readWorkspaceLedger(cwd)` / `readReviewedAreaLedger` is the only H-compatible workspace reader. It returns `absent`, `valid` with ledger digest, `invalid`, or `unavailable`, checks workspace/OpenSpec boundaries and symlinks, caps bytes, and never repairs or creates the ledger.
- `evaluateWorkspaceLedger(cwd, areaId, current, transition?, evidence?)` composes the reader and core evaluator; store failures remain unavailable/invalid. This is the preferred read-only workspace seam when the audit has a bounded area ID.
- **Forbidden from H:** `replaceWorkspaceLedger` / `replaceReviewedAreaLedger`. It is an explicit writer using temp files, fsync, rename, compare-and-swap digest, and a B exclusion proof. The audit must not receive, import, or call this writer, nor any evidence/ledger refresh path.

**Existing G tests:** `tests/reviewed-area-ledger.test.ts` covers canonical boundaries, evidence/privacy validation, exact/stale/unknown/unreviewed outcomes, transition fail-closed behavior, B reduction, deterministic frozen output, workspace read-only behavior, and writer protections.

## H implementation seams and output contract

Because no cleaner audit exists, design should introduce one narrow public entrypoint in the existing `ein-pi/agent/lib` domain (or a clearly named cleaner submodule), with pure classification separated from filesystem/ledger input acquisition. The boundary should accept `ProjectStateV1` (or a B-owned reduced snapshot) and G records/evaluations/evidence references, not a path-based mutable service.

Every emitted finding must carry, at minimum:

- deterministic finding identity and stable source location/area (`area.id` and selector/path where available);
- classification separated into observed fact, inferred opportunity, or unresolved question;
- privacy-safe evidence reference/digest and the exact observed B `stateRef` (or explicit unavailable/unknown state identity);
- G outcome/freshness/reason and confidence/uncertainty text that is deterministic;
- explicit `appliedChanges: 0` / no-change statement. A suggestion is never represented as applied.

Ordering and identity must be canonical (byte-stable sort over area/source/classification/identity inputs); equivalent inputs must yield equivalent output. Invalid, stale, unavailable, ambiguous, missing, or unverifiable state/evidence remains visible as uncertainty or unresolved output and cannot produce a current actionable finding or approval. Evidence references must stay opaque/privacy-safe; no source content, prompts, transcripts, secrets, or private session history may enter findings.

The audit boundary should expose no writer callback, command executor, filesystem mutation capability, Git mutation capability, ledger replacement capability, or cleaner-owned persistence. If a mutation-capable dependency is injected for testing, the boundary must reject it or make it structurally impossible to reach. Focused later tests should snapshot source/ledger bytes and Git state before/after, assert writer/command callbacks are not called, and repeat equivalent inputs for deterministic output.

## Current mutation-capable paths H must not use

These are existing seams to keep outside the audit dependency graph; they are not implementation targets for H:

1. **Ledger writer:** `replaceWorkspaceLedger` / `replaceReviewedAreaLedger` in `ein-pi/agent/lib/reviewed-area-ledger-store.ts` writes temporary files and atomically renames the workspace ledger. H may use `readWorkspaceLedger`/`evaluateWorkspaceLedger` only.
2. **Project-context writer:** `writeEinMd` in `ein-pi/agent/lib/project-context.ts:71-90` creates/rewrites `EIN.md` and synchronizes its index. H must not call onboarding/context refresh or any `writeEinMd` path.
3. **Cleaner-like deletion:** `cleanSkills` in `ein-pi/agent/extensions/ein-skill-maintenance.ts:214-228`, reached by the `skills clean --yes` command at lines 252-254, calls `rmSync` on downloaded skill directories. H must report opportunities only and never route through this command or its `--yes` branch.
4. **Skill installation/update writers:** `installFromCatalog`, `copySkillFolder`, and `updateLocalFromRepo` in `ein-skill-maintenance.ts` create/copy/remove skill files and temporary roots. They are unrelated maintenance writers and must not be imported by the audit.
5. **Git delivery configuration:** `writeGitDeliveryMode` in `ein-pi/agent/lib/git-delivery.ts:63-67` writes `.pi/ein/git.json`; delivery execution/commit/push paths are outside H. `readGitDeliveryMode` is observation-only but is not B/G cleaner evidence and should not become an alternate authority.
6. **Git staging/mutation:** `git-staging.ts` contains command inspection plus an impure `inspectUntrackedSweep` that invokes `git add --dry-run`; although dry-run is not a mutation, H must not execute arbitrary Git commands. It must consume B's projected Git state, never `git add`, `commit`, `reset`, checkout, push, or history operations. The staging gate's mutation-capable commands are explicitly outside the audit.
7. **Model/config and mode writers:** `writeMode`, `updateGlobalDefaultModel`, `applyModelConfig`, `writeCodegraphMode`, `writeHypaMode`, and related `write*`/`apply*` functions mutate project or user state. They are not audit outputs and must not be reachable from H.
8. **OpenSpec synchronizers/SDD lifecycle writers:** `syncOpenSpec*`, `bootstrapOpenSpecConfig`, phase artifact writers, and any SDD apply/close path write canonical OpenSpec state. H must not refresh, repair, or create OpenSpec artifacts; `map.md` is the sole phase artifact write here.

The clean boundary is therefore: B projection supplied/read once; G ledger/evidence read and evaluated only; pure audit classification; immutable report returned. No direct `node:fs` write/remove/rename, no Git process invocation, no ledger replacement, no state cache, and no cleaner mutation callback.

## Risks and design handoff

- A current Git state alone is insufficient for a reviewed-area claim: G evidence must match the record and state, and transitions must be attributable; otherwise preserve `unknown`/`stale`/`unavailable`.
- “Reviewed”, “human review”, and “approval” remain distinct. Session existence, artifact presence, automation success, or a positive cleaner heuristic must not upgrade G status.
- Privacy-safe references are identifiers, not permission to expose evidence payloads or file contents.
- The absence of a pre-existing cleaner domain means the design phase must choose the smallest new seam and avoid coupling it to skill maintenance or broad agent extension code.

Next phase: `sdd-design`.

ledger:
  reads:
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/vueuse/SKILL.md, lines: 553, estimated_tokens: 3100}
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/nuxt-ui/SKILL.md, lines: 61, estimated_tokens: 500}
    - {path: /Users/.pi-ein/agent/skills/downloaded/vitest/SKILL.md, lines: 56, estimated_tokens: 350}
    - {path: /Users/.pi-ein/agent/skills/downloaded/web-design-guidelines/SKILL.md, lines: 34, estimated_tokens: 250}
    - {path: /Users/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 900}
    - {path: /Users/.pi-ein/agent/skills/local/architecture/SKILL.md, lines: 118, estimated_tokens: 1100}
    - {path: openspec/changes/cleaner-read-only-audit/scope.md, lines: 81, estimated_tokens: 1500}
    - {path: EIN.md, lines: 37, estimated_tokens: 300}
    - {path: docs/roadmap-features-ein.md, lines: 130-274, estimated_tokens: 1900}
    - {path: openspec/changes/cleaner-read-only-audit/specs/sdd-lifecycle/spec.md, lines: 11, estimated_tokens: 220}
    - {path: openspec/changes/archive/shared-project-state-contract/specs/sdd-lifecycle/spec.md, lines: 20, estimated_tokens: 600}
    - {path: openspec/changes/archive/reviewed-area-ledger/specs/sdd-lifecycle/spec.md, lines: 27, estimated_tokens: 800}
    - {path: ein-pi/agent/lib/project-state.ts, lines: 760, estimated_tokens: 6200}
    - {path: ein-pi/agent/lib/reviewed-area-ledger.ts, lines: 470, estimated_tokens: 4300}
    - {path: ein-pi/agent/lib/reviewed-area-ledger-store.ts, lines: 300, estimated_tokens: 2800}
    - {path: tests/shared-project-state.test.ts, lines: 620, estimated_tokens: 5200}
    - {path: tests/reviewed-area-ledger.test.ts, lines: 400, estimated_tokens: 3500}
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: {tokens: 27800, reads: 17}
  budget_exceeded: true

acceptance-report
```json
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"Only the canonical map artifact was written; the map is bounded to roadmap H and records B/G seams plus forbidden mutation paths without source implementation."}],
  "changedFiles": ["openspec/changes/cleaner-read-only-audit/map.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": ["Read-only structure/codegraph mapping completed; tests, build, typecheck, and verify were intentionally not run in map phase."],
  "residualRisks": ["No existing cleaner audit domain was found; design must introduce the smallest new seam without coupling to skill maintenance writers.", "Evidence payload resolution remains an external G boundary and must stay privacy-safe."],
  "noStagedFiles": true,
  "diffSummary": "Added the bounded H map artifact with exact B/G contracts, read-only seams, and mutation exclusions.",
  "reviewFindings": ["no blockers"],
  "manualNotes": "The ledger records budget_exceeded because source/test contract reads exceeded the 15,000-token estimate; mapping stopped after the bounded required seams were established."
}
```
