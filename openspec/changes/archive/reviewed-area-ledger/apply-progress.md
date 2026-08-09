status: complete

## Apply — reviewed-area-ledger

- Completed the original tasks 1.1–6.1: bounded area/schema contract, canonical parser/serializer, fail-closed transition/evaluator, workspace-local reader, explicit CAS writer, B projection, and focused invariants.
- Remediated verify findings F-1, F-2, F-3, F-4, F-5, and F-7 without changing verify-report.
- F-6 remains explicitly out of scope: evidence-manifest ownership and evidence-ID generation stay with the existing F owner; no new F seam was invented.
- Changed surfaces: `ein-pi/agent/lib/reviewed-area-ledger.ts`, `ein-pi/agent/lib/reviewed-area-ledger-store.ts`, `ein-pi/agent/lib/project-state.ts`, `openspec/.gitignore`, and `tests/reviewed-area-ledger.test.ts`.

### Remediation TDD evidence

| Group | RED | GREEN / triangulation | Refactor |
| --- | --- | --- | --- |
| F-1 / F-3 | New strict-ID and private-label tests failed in the focused suite; missing IDs parsed valid and labels persisted. | `bun test tests/reviewed-area-ledger.test.ts` — 16 pass, 104 assertions. | Persisted normalization now requires `area.id` and removes free-form labels; ergonomic ID derivation remains only in `normalizeArea`/`canonicalArea`. |
| F-2 | Collision, target-race, and temp-race tests failed: competitor temp was removed and target replacement was not revalidated. | Focused race test — 3 pass, 19 assertions; full focused suite green. | UUID/temp exclusivity, owned-inode cleanup, temp-content validation, and final target/parent CAS revalidation preserve competitor bytes. |
| F-4 / F-5 / F-7 | Contradictory `previousPath` was classified unaffected; symlinked `openspec` was read externally; ignore rule overmatched descendants. | Focused transition, symlink, privacy, and race probes pass; canonical-only ignore check passes. | Disallowed contradictory fields, validated real workspace parents for reads/writes, and anchored `/reviewed-area-ledger.json`. |

### Verification

- Focused G: `bun test tests/reviewed-area-ledger.test.ts` — green (16 tests, 104 assertions).
- B/F regressions: `bun test tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts` — green (57 tests, 220 assertions).
- Race/symlink/privacy probes: filtered focused run — green (3 tests, 19 assertions).
- Installer typecheck: `cd installer && bun run typecheck` — green.
- Full suite: `bun test` — green (1306 tests, 4734 assertions).
- Canonical-only ignore, residue, forbidden-writer-caller, and `git diff --check` scans — green.

### Residual risks / deviations

- No writer is wired to session, launcher, audit, scheduler, cleaner, architect, or background behavior.
- F-6 remains an external evidence-manifest ownership gap by design; G validates injected opaque references only.
- No production build, verify-report edit, commit, push, close, or delivery-topology decision was performed.

### F-8 final remediation — workspace ancestor confinement

- Status: complete. Added strict lexical-workspace/realpath equality while preserving direct `openspec` and ledger-file symlink rejection.
- RED: new ancestor-symlink regression initially read the external ledger as valid; missing workspace under the same linked ancestor also lacked fail-closed handling.
- GREEN: `bun test tests/reviewed-area-ledger.test.ts` — 17 pass, 114 assertions; external bytes and temp residue remain unchanged, canonical realpath workspace reads/writes successfully.
- Safety: missing paths walk existing lexical components with `lstatSync` only; external symlink ancestors are rejected before ledger read, proof validation, temp creation, or write.
- Triangulation: symlink/direct-link, race/temp ownership, privacy/evidence, and canonical probes — 6 pass, 36 assertions.
- Regression: B/F tests — 57 pass, 220 assertions; installer typecheck green; final full `bun test` — 1307 pass, 4744 assertions.
- Scans: anchored ignore rule, openspec residue, forbidden writer callers, and `git diff --check` all green.
- Refactor: canonical temp fixture paths use `realpathSync`; confinement helper keeps missing-path behavior fail-closed without changing writer ownership or CAS semantics.
- Remaining: F-6 evidence-manifest ownership remains intentionally external; no integrations or delivery actions added.
