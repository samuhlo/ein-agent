# Scope — reviewed-area-ledger

## SCOPE PACKET

```yaml
scope: Implement roadmap block G only: a read-only reviewed-area ledger that records bounded areas, review state, privacy-safe fresh evidence identity, and exact Git-linked freshness so future audits distinguish reviewed, unreviewed, stale, invalid, and unknown areas.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Outcome

Deliver the smallest deterministic ledger contract and focused implementation slice for reviewed areas. A consumer must be able to tell what boundary was reviewed, what evidence supports it, whether that evidence is fresh against relevant Git state, and when the answer is unknown or stale. The ledger is read-only to future audits and never substitutes for human review or SDD lifecycle gates.

## Dependencies and merged baseline

- Depends on merged roadmap blocks **B** (authoritative project/Git state and fail-closed freshness) and **F** (shared evidence/configuration discipline).
- Preserve **E** evidence discipline: evidence is attributable, privacy-safe, reproducible, and never upgraded from absence or ambiguity into fact.
- This is **G only**. Do not absorb H–L behavior or redesign A–F contracts.

## In scope

- Define area boundaries and granularity: each area is an explicit, bounded, deterministic set of paths or named review seam; overlapping areas must remain separately identifiable, and an empty, unbounded, ambiguous, or unknown boundary is not reviewable.
- Record stable area identity, boundary description, review state, reviewer/evidence provenance permitted by the existing evidence contract, and a fresh evidence reference.
- Define evidence identity without raw prompts, transcripts, private session paths, secrets, or other sensitive payloads; references must be opaque or repository-safe and sufficient for deterministic lookup.
- Bind evidence to exact relevant Git state, including the state identity needed by B. A relevant committed, index, tracked-worktree, or explicitly in-scope untracked change invalidates freshness for the affected area.
- Expose deterministic states at minimum: reviewed/current, unreviewed, stale, invalid, unavailable, and unknown, with actionable reasons and observed/current Git references where applicable.
- Permit future audits to consume records read-only; consumers must not rewrite the ledger or mutate source, Git, cleaner/architect state, or review status.
- Add focused strict-TDD tests in later phases for boundary determinism, evidence identity/privacy, Git invalidation, fail-closed ambiguity, session non-claim, read-only consumption, and repeatability.

## Explicit exclusions

- No automatic approval, implicit approval, or review declaration from session existence, phase completion, artifact existence, or successful automation.
- No replacement for human review, SDD, OpenSpec, verification, close readiness, or existing evidence ownership.
- No parallel writers, conflict-resolution redesign, or competing ledger store.
- No cleaner or architect mutations, autonomous mutation, worktree edits, commits, staging, or repair.
- No runtime transcript/history export, migration, or private-session inspection.
- No changes to roadmap blocks H–L, no G-to-L scope leakage, and no launcher, updater, adapter, or installer behavior.
- No source, test, build, or typecheck execution in scope; implementation belongs to apply.

## Acceptance criteria for later phases

1. Every ledger record has a bounded area identity/granularity and deterministic serialization; ambiguous or unknown boundaries fail closed.
2. Review state is never current without attributable evidence identity and an exact relevant Git binding.
3. Relevant Git changes invalidate only affected area evidence, with deterministic stale/invalid reasons; unverifiable state is never current.
4. References are privacy-safe and do not expose prompts, transcripts, secrets, or private paths.
5. Session existence and automated completion cannot declare review or approval.
6. Future audits receive records read-only and cannot mutate ledger, source, or Git state.
7. Focused tests cover reviewed/unreviewed/stale/unknown paths, repeated deterministic output, and all stated exclusions.
8. The implementation remains review-sized and limited to G plus its focused tests/minimal integration.

## Project and SDD configuration

- Stack: Node.js/TypeScript ESM; Bun package manager; GitHub Actions markers.
- `strict_tdd: true` is preserved from `openspec/config.yaml`.
- Configured typecheck: `cd installer && bun run typecheck`; test runner and test commands remain blank/unreliably detected.
- Scope phase performs no test, build, typecheck, or source implementation.
- Artifact store: canonical OpenSpec under `openspec/changes/`; no optional notebook available.

## Canonical OpenSpec context

The behavior delta is declared by the validated structured delta at `openspec/changes/reviewed-area-ledger/specs/sdd-lifecycle/spec.md`; this scope contains no `spec_delta: none` block. The canonical lifecycle file was inspected locally but is 36,655 bytes, exceeding the shared 32 KiB canonical-context limit; no canonical context file is claimed in this packet. If later phase work requires canonical context, provide narrower explicit domain/file hints or reduce the selection before reading.

## Phase boundary and risks

This artifact scopes G only; it does not map/design/edit source. Main risks are accidental review claims from artifact/session presence, over-broad area boundaries causing unsound invalidation, and leaking sensitive evidence references. Map/design must choose the smallest existing evidence/Git seams and preserve fail-closed semantics.
