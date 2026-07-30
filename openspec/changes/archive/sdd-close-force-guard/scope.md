# Scope: forced close must fail closed

Forced SDD close will become a narrow, auditable legacy escape rather than a shortcut around lifecycle completion. The emergency path must never archive unfinished, unverified, stale, or conflicted work.

## Scope packet

```yaml
scope: Make forced SDD close a narrow legacy escape rather than a way to archive incomplete work. Force must preserve every completion, freshness, verification, and conflict gate while allowing only an explicit recoverable legacy pending/unresolved-spec path whose use and reason are recorded. Align runtime, lifecycle contract, help, and focused tests without broader archive or OpenSpec redesign.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Outcome

Pressing the emergency close button must not label unfinished or unverified work as complete. A successful normal close and a successful legacy escape must be distinguishable from their persisted/result evidence.

## In scope

- Preserve close blockers under `--force` for pending tasks, incomplete apply, absent/failing/stale verify, missing/stale summary, and OpenSpec conflict.
- Define one explicit treatment for recoverable legacy pending/unresolved spec state without weakening normal close.
- Require the legacy escape to record that it was used and why.
- Align close runtime and routing behavior, close tool/help surfaces, the canonical lifecycle contract, and focused close/router tests.
- Keep normal close as the default and legacy recovery as a narrow, intentional exception.

## Acceptance outcomes

- [ ] `--force` cannot archive changes with pending tasks.
- [ ] `--force` cannot archive partial or incomplete apply work.
- [ ] `--force` cannot archive with absent, failing, or stale verify evidence.
- [ ] `--force` cannot archive with a missing or stale close summary.
- [ ] `--force` cannot bypass an OpenSpec conflict.
- [ ] Normal close and legacy-escape close results are distinguishable.
- [ ] Any recoverable legacy path is explicit, reason-bearing, and covered by focused tests.
- [ ] Runtime behavior, canonical lifecycle specification, and user-facing help agree.

## Non-goals

- Redesigning archive integrity or the archive layout.
- Updater or installer work.
- Broad OpenSpec refactoring.
- Relaxing normal close readiness.
- General recovery for malformed or incomplete modern changes.

## Constraints and phase boundary

- This phase defines scope only; it does not implement or run tests.
- Known candidate areas are mapping hints, not a final file list: `ein-pi/agent/lib/sdd-close.ts`, `ein-pi/agent/lib/sdd-router.ts`, close tool/help surfaces, `tests/sdd-close.test.ts`, and `tests/sdd-router.test.ts`.
- Existing project configuration has `strict_tdd: false`; no test runner command is configured. Later mapping must identify the focused test command before apply/verify.
- The behavior delta is declared in `specs/sdd-lifecycle/spec.md`; therefore this document intentionally has no `spec_delta: none` declaration.

## Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `65aa3ddb7f2a6a1ee9096c6bbcea785b9f1191a8b430845182cd442f23af824f` | 25739 |

Selection uses 1 of 3 allowed files and 25,739 of 32,768 allowed UTF-8 bytes. The canonical `canonical-close-readiness` and `legacy-sdd-fallback` scenarios are the primary constraints for later design.

## Risks and open design questions

- “Recoverable legacy” must be defined narrowly enough that malformed modern state cannot be relabeled as legacy.
- The persisted/result marker and reason format must remain explicit without triggering an unrelated archive-format redesign.
- Existing `--force` callers or help text may imply broader bypass semantics; mapping must identify and reconcile those surfaces.
- Freshness rules for verify and summary must reuse canonical lifecycle evidence rather than introducing parallel readiness logic.

## SDD configuration summary

- Stack: Node.js/TypeScript ESM; Bun markers are present under `installer/`.
- Strict TDD: disabled in current `openspec/config.yaml`.
- Testing runner: not currently identified or configured.
- Artifact store: canonical OpenSpec artifacts under `openspec/changes/`.
- Skill registry: present at `.pi/ein/atl/skill-registry.md`.
