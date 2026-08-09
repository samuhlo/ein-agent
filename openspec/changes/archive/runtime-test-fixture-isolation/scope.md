# Scope: runtime-test-fixture-isolation

## Problem statement

The full Bun suite has a pre-existing contention in shared runtime/session test fixtures, centered on `EIN_PI_AGENT_HOME` and related process-global state. The evidence in `openspec/changes/beta-launcher-e2e-hardening/apply-progress.md` shows the E-focused, regression, and typecheck checks pass, while the full suite has 9 failures that reproduce even when the E2E file is excluded. This prerequisite change isolates and cleans up test state so `bun test` is reproducibly green under repository concurrency.

## Scope packet

scope: Make runtime/session test fixtures deterministic by isolating `EIN_PI_AGENT_HOME` and related process-global state per test or serialized fixture owner, with complete restoration and cleanup; preserve production behavior and the beta-launcher E2E change unchanged.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## In scope

- Identify shared runtime/session fixture ownership and all process-global mutations relevant to `EIN_PI_AGENT_HOME` (including cached path/config state, environment variables, current working directory, and spawned-process handles where applicable).
- Give each fixture run a unique disposable runtime/session home, or serialize the smallest unavoidable shared-state critical section with no parallel writers.
- Establish cleanup that runs on success, assertion failure, timeout, cancellation, spawn failure, and interrupted test paths.
- Restore the exact prior process-global values and invalidate/reset only test-owned caches that could retain fixture paths.
- Add or adjust regression tests proving isolation under Bun’s repository test concurrency and proving no fixture residue leaks into a subsequent test.
- Keep the implementation test-only or test-harness-only; no runtime production behavior changes.

## Out of scope / non-goals

- No changes to the beta-launcher E2E assertions or its production launcher/projector/adapter behavior.
- No package dependency, lockfile, installer behavior, or production runtime changes.
- No broad treatment of unrelated flaky tests or unrelated test ordering problems.
- No weakening, skipping, retrying, or serializing the entire suite when a narrower fixture boundary is possible.

## Acceptance criteria

1. `bun test` passes with zero failures when run from a clean checkout/install state, and passes reproducibly across at least 3 consecutive runs with repository-default concurrency.
2. The targeted runtime/session regression tests pass both alone and concurrently with the beta-launcher E2E and existing shared-project-state/minimal-workbench tests.
3. Two concurrently eligible fixture users never write to the same `EIN_PI_AGENT_HOME` (or the critical section is demonstrably single-writer); each observes only its own runtime/session files and deterministic listing results.
4. After every fixture lifecycle outcome—pass, fail, timeout, cancellation, spawn failure, and signal/interruption—the prior environment, cwd, cache state, child processes, temporary directories, and file descriptors are restored or removed according to the fixture contract.
5. A follow-on test confirms a clean process-global state and cannot observe a prior test’s home, session files, config, or runtime artifacts.
6. `cd installer && bun run typecheck` passes, and the change introduces no production-file, package-manifest, lockfile, installer, or E assertion diff.

## Strict TDD and execution constraints

- Strict TDD is required: record RED for a deterministic contention/leak regression, GREEN for the isolation/cleanup fix, then triangulate concurrent, repeated, and failure-path runs before refactoring.
- Test fixture writers MUST NOT run in parallel against shared process-global state. Prefer unique homes; where process-global mutation cannot be eliminated, use one narrowly scoped serialized writer and await restoration before releasing it.
- No implementation phase may modify production runtime behavior or alter the beta-launcher E2E contract.
- Full-suite verification must use `bun test`; do not treat focused green runs as sufficient acceptance.

## Dependency and resumption path

This change is a prerequisite for `beta-launcher-e2e-hardening`. It is independent of E’s launcher assertions and must land first (or be available in the same integration branch). Once acceptance is met, resume E by rerunning its focused/regression/typecheck checks and then the full `bun test`; E should no longer be blocked by the pre-existing 9 shared runtime/session fixture failures. If the full suite still fails, classify only failures attributable to this fixture boundary before reopening E; do not expand this change to unrelated flakes.

## Spec delta declaration
spec_delta: none
spec_delta_reason: This change alters only test fixture isolation and cleanup; it does not change observable production, installer, or launcher behavior.
