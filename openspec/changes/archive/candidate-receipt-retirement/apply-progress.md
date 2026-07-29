status: complete

## // 001. Retirement evidence and state contract

Completed:
- Added raw active-receipt evidence reads and SHA-256 byte fingerprints.
- Added safe fingerprint-addressed retired archive path derivation.
- Added a pure, fail-closed retirement decision binding the active fingerprint, attempt, local receipt identities, explicit delivery identity, and normalized same-repository merged PR observation.
- Added focused coverage for byte identity/archive naming, merged/unmerged/forked/head-mismatch PR evidence, and stale or missing attempts.

Files changed:
- `ein-pi/agent/lib/candidate-receipt.ts`
- `ein-pi/agent/lib/delivery-receipt.ts`
- `tests/candidate-receipt.test.ts`
- `tests/delivery-gate.test.ts`
- `openspec/changes/candidate-receipt-retirement/tasks.md`
- `openspec/changes/candidate-receipt-retirement/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` — 99 passed, 0 failed.

TDD Cycle Evidence: not applicable; Strict TDD is OFF.

Deviations: none.
Remaining: groups 002–004.

## // 002. Atomic archival and active-slot deactivation

Completed:
- Serialized emission and retirement with a worktree-local lifecycle lock.
- Added exact-byte, fingerprint-addressed archive publication with readback; archive conflicts preserve the active slot.
- Added immutable retirement metadata, active/attempt revalidation before unlink, and archive-backed `already-retired` retries.

Files changed:
- `ein-pi/agent/lib/candidate-receipt.ts`
- `tests/candidate-receipt.test.ts`
- `openspec/changes/candidate-receipt-retirement/tasks.md`
- `openspec/changes/candidate-receipt-retirement/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts` — 57 passed, 0 failed.
- `git diff --check -- ein-pi/agent/lib/candidate-receipt.ts tests/candidate-receipt.test.ts openspec/changes/candidate-receipt-retirement/tasks.md openspec/changes/candidate-receipt-retirement/apply-progress.md` — passed.

TDD Cycle Evidence: not applicable; Strict TDD is OFF.

Deviations: none.
Remaining: groups 003–004.

## // 003. Fresh GitHub merge observation and explicit retirement tool

Completed:
- Registered `ein_candidate_receipt_retire` with all six required explicit delivery identities.
- Normalized only `gh pr view --repo <remote-repository> <prNumber>` evidence and requires two in-operation observations of the same merged, same-repository PR bound to `validatedDeliveryHead`.
- Routed both observations through the pure retirement decision and the existing archive-before-unlink transition; changed revalidation, malformed/auth/network/fork/mismatch evidence preserves the active slot.
- Clears only the matching session attempt after `retired`; `already-retired` does not recreate or clear it.
- Added focused regression coverage that differing second remote evidence keeps the active receipt effective.

Files changed:
- `ein-pi/agent/extensions/ein-ai.ts`
- `tests/candidate-receipt.test.ts`
- `openspec/changes/candidate-receipt-retirement/tasks.md`
- `openspec/changes/candidate-receipt-retirement/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` — 103 passed, 0 failed.
- `git diff --check` — passed.

TDD Cycle Evidence: not applicable; Strict TDD is OFF.
Deviations: none.
Remaining: group 004 only.

## // 004. Delivery overlap lifecycle evidence and final audit

Completed:
- Added a focused lifecycle test proving active and failed-retirement states keep divergent overlapping publication blocked.
- Verified safe retirement removes only the old active content gate; the later push remains a `pre-push` mechanical boundary and user delivery intent remains independently required.
- Confirmed retirement returns only its retirement result, and a stale attempt cannot retire a newly emitted candidate with a different raw-byte fingerprint.

Files changed:
- `tests/delivery-gate.test.ts`
- `openspec/changes/candidate-receipt-retirement/tasks.md`
- `openspec/changes/candidate-receipt-retirement/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` — 104 passed, 0 failed.
- `bun test` — 927 passed, 0 failed.
- `git diff --check` — passed.

TDD Cycle Evidence: not applicable; Strict TDD is OFF.
Deviations: none. Production code, delivery declarations, grants, and refs were unchanged.
Remaining: none.

## // 005. Post-review hardening

Completed:
- Persisted the validated delivery attempt below the worktree git directory and recover it only when repository ID, worktree ID, active raw-byte fingerprint, and validated delivery HEAD all match.
- Cleared session and durable attempt state before receipt replacement and after matching `retired` or `already-retired` results.
- Replaced fetch-remote identity with one explicit `git remote get-url --push --all` destination; multiple, malformed, and non-GitHub URLs block retirement.
- Moved `gh pr view` behind an injected timeout- and AbortSignal-aware adapter; first-time retirement now awaits a mandatory second fresh observation while holding the lifecycle lock.
- Added PID/token owner-matched lifecycle locks with conservative dead-owner recovery, immutable publication without overwrite races, and directory fsync after rename/unlink on Linux/macOS.
- Added focused coverage for restart/corrupt/stale attempt state, replacement rotation, push URL ambiguity, timeout/abort, mandatory revalidation, orphan/live-owner locks, and public tool wiring.

Files changed:
- `ein-pi/agent/lib/candidate-receipt.ts`
- `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- `tests/candidate-receipt.test.ts`
- `tests/delivery-gate.test.ts`
- `tests/candidate-receipt-retirement-remote.test.ts`
- `tests/candidate-receipt-retirement-tool.test.ts`
- `openspec/specs/sdd-lifecycle/spec.md`
- `openspec/changes/archive/candidate-receipt-retirement/design.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts` — 112 passed, 0 failed.
- Ad-hoc `bunx tsc` invocation was not a valid repository typecheck: this repository has no root TypeScript project/dependencies for `ein-pi`, so resolution failed in pre-existing files and package types. No typecheck pass is claimed.

Deviations:
- The existing synchronous retirement transition became asynchronous so the second remote observation can be genuinely fresh immediately before unlink rather than a pre-fetched fallback.

## // 006. Correcciones de verificación independiente

Completed:
- Reemplacé la creación recursiva de directorios de archivo por creación explícita y fsync del directorio nuevo y su padre antes del unlink activo.
- Publiqué `retirement.json` con el protocolo inmutable no-replace; `EEXIST` compara bytes y el conflicto bloquea.
- Convertí el fallo de limpieza durable posterior al unlink en `cleanupPending`, con retry mediante `already-retired`; la emisión rechaza reemplazar un receipt si no logra eliminar el intento anterior.
- Añadí costuras observables para el orden de fsync y para la carrera de metadatos, sin simular una pérdida de energía.

Verification:
- `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts` — 115 passed, 0 failed.
- `bun test` — 938 passed, 0 failed.
- `bun run --cwd installer typecheck` — passed.
- `git diff --check` — passed.

Documentación histórica:
- El delta archivado se completó con los tres escenarios post-review ya canónicos: intento durable entre sesiones, URL de push única con `gh` limitado por timeout/AbortSignal, y lock PID/token con durabilidad de directorios.
- El `sync-report.md` se recalcula contra los bytes canónicos actuales. Como las operaciones `ADDED` ya están presentes, registra `state: conflict` y `added-existing`; es evidencia histórica de consistencia, no un gate de sincronización activo ni una afirmación de éxito sin conflictos.
