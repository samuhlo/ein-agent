# Scope — cleaner-read-only-audit

## SCOPE PACKET

```yaml
scope: Roadmap item H — cleaner-read-only-audit. Bound the cleaner to a strictly read-only audit that consumes B's projected state and G's reviewed-area evidence, emits traceable classified findings with visible uncertainty, and performs no mutations.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Outcome

Deliver a bounded audit slice for cleaner opportunities. The audit reads authoritative projected state and applicable reviewed-area ledger records, classifies observations and opportunities, links each finding to privacy-safe evidence and state identity, and distinguishes facts from uncertain or unavailable evidence. It never claims that a suggestion was applied.

## Dependencies and baseline

- **B — authoritative projected project/Git state:** consume its source-attributed values, quality/freshness, and exact-state identity; do not create a competing state store.
- **G — reviewed-area ledger:** consume bounded area records and privacy-safe evidence references read-only; honor reviewed, unreviewed, stale, invalid, unavailable, and unknown outcomes.
- Preserve G's human-review boundary: session existence, artifact presence, or automation success cannot become a review or approval claim.
- This is **H only**. It does not implement B/G, cleaner mutations, or any later roadmap slice.

## In scope

- Read-only cleaner audit entrypoint/flow over the existing cleaner domain.
- Inputs limited to B's projected state and G's applicable ledger/evidence contracts.
- Traceable findings with deterministic identity or location, classification, source/evidence references, observed state identity, and explicit confidence/uncertainty.
- Fail-closed handling for stale, invalid, unavailable, ambiguous, or missing state/evidence; such conditions remain visible rather than being treated as current facts.
- Output that separates observed facts, inferred opportunities, and unresolved questions, and explicitly states that no change was applied.
- Focused tests in later phases for read-only behavior, traceability, stale/unknown evidence, deterministic output, and mutation-attempt rejection.

## Explicit non-goals

- No applying or previewing mutations as if they were performed; no automatic cleaning or fixing.
- No writes to source files, Git index/worktree/history, OpenSpec state, project state, reviewed-area ledger, evidence, or cleaner-owned state.
- No parallel writers, autonomous cleaner, approval/review declaration, or human-review replacement.
- No new evidence/ledger/project-state authority, evidence refresh, stale-evidence repair, or inferred approval.
- No architect behavior, launcher/updater/installer behavior, broad repository cleanup, or roadmap I–J functionality.
- No implementation, test execution, build, typecheck, or verify work in scope phase.

## Bounded acceptance for later phases

1. Given valid B/G inputs, every finding identifies the relevant bounded area or source, evidence reference, and exact observed state identity.
2. Given stale, invalid, unavailable, ambiguous, or missing inputs, the audit preserves the condition and does not promote it to a current finding or approval.
3. Repeated equivalent inputs produce deterministic finding identity, classification, ordering, and uncertainty text.
4. The audit performs no filesystem, Git, ledger, project-state, or cleaner mutation; mutation attempts are rejected or impossible through the audit boundary.
5. Output explicitly distinguishes suggestions from applied changes and records zero applied changes.
6. Focused tests cover positive findings, uncertain evidence, read-only enforcement, traceability, and repeatability.

## Project and SDD configuration

- Stack: Node.js/TypeScript ESM; Bun package manager; GitHub Actions markers.
- `strict_tdd: true` is preserved from `openspec/config.yaml`.
- Test runner/commands are not reliably configured; configured typecheck is `cd installer && bun run typecheck`.
- Artifact store: canonical OpenSpec under `openspec/changes/`.
- Scope phase ran no test, build, typecheck, or source implementation.

## Canonical context and delta declaration

The behavior delta is declared by the validated structured delta at `openspec/changes/cleaner-read-only-audit/specs/sdd-lifecycle/spec.md`; this scope intentionally contains no `spec_delta: none` block. The roadmap and the archived G scope establish the B/G dependency boundary. The canonical file `openspec/specs/sdd-lifecycle/spec.md` is 39,387 bytes (SHA-256 `ff1c0d1274b517d16785e94db921c3b58036f5643b631b1bcfb1a9796c50cb9d`), exceeding the shared 32 KiB canonical-context limit, so it is not claimed as phase context; narrower explicit domain hints are required before relying on it in a later phase.

## Phase boundary and risks

This artifact scopes H only; map/design must select existing seams without redesigning B/G. Main risks are treating stale ledger evidence as current, leaking sensitive evidence references, and allowing a read-only audit path to acquire an implicit writer.

```acceptance-report
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"Only the bounded H audit scope and its OpenSpec delta declaration were added; implementation and later roadmap behavior are explicitly excluded."}],
  "changedFiles": ["openspec/changes/cleaner-read-only-audit/scope.md", "openspec/changes/cleaner-read-only-audit/specs/sdd-lifecycle/spec.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": ["Structured OpenSpec delta was validated and written by ein_openspec_delta_write."],
  "residualRisks": ["Canonical sdd-lifecycle context exceeds the 32 KiB phase budget and needs narrower hints in later phases."],
  "noStagedFiles": true,
  "diffSummary": "Added the H scope packet and one validated read-only cleaner audit behavior delta.",
  "reviewFindings": ["no blockers"],
  "manualNotes": "Scope only; no implementation or tests were run."
}
```