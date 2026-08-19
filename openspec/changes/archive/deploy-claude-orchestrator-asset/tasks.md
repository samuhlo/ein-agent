# Tasks — deploy-claude-orchestrator-asset

status: ready
blocked_by: none

tdd: strict

## // 001. RED — isolated checkout/runtime sync contract

Production files: none  
Test files: `tests/surface-wiring.test.ts`

- [x] 1.1 Add focused child-process regression cases in `tests/surface-wiring.test.ts` for the real `cc-ein/sync.ts` entrypoint: use fresh Bun processes with temporary `HOME` and `CC_EIN_HOME`, assert non-dry success plus regular-file status and byte-for-byte source parity, assert `--dry` creates neither `assets` nor the destination, and make the isolated asset destination uncreatable to assert a required sync failure.
  - skills: `bun`, `ein-discipline`
  - why: The import-time `DEST` constant makes an in-process environment override misleading; these cases prove the actual isolated Claude checkout/runtime boundary and cover R1–R3 before production code changes.
  - learn: A filesystem deployment contract needs direct byte comparison and file-type checks, not only existence, text, or size assertions.
  - architecture: Keep the real-process seam in the existing surface-wiring test module; `cc-ein/sync.ts` remains the sole runtime owner and the canonical asset remains read-only.
  - avoid: Do not import sync once and mutate `CC_EIN_HOME`, test installer staging, or modify `ein-pi/agent/assets/orchestrator.md`.
  - verify: `bun test tests/surface-wiring.test.ts` (capture RED: the non-dry asset assertion and required-failure assertion fail before implementation; the dry-run no-mutation assertion must remain valid).
  - tdd: RED is recorded before any production edit; GREEN is the expected pass after 2.1; TRIANGULATE must retain regular-file, byte-parity, dry-run, and required-failure evidence; REFACTOR may only deduplicate local test setup without changing the seam.

## // 002. GREEN — required byte-preserving asset deployment

Production files: `cc-ein/sync.ts`  
Test files: `tests/surface-wiring.test.ts` (the RED cases from 1.1)

- [x] 2.1 Update `cc-ein/sync.ts` only: use `copyFileSync` for `ein-pi/agent/assets/orchestrator.md` to `join(DEST, "assets", "orchestrator.md")`, create the `assets` parent through the existing dry-safe `ensureDir`, and place the operation inside `runSync()`’s required deployment path before optional MCP handling so failures reach `requiredFailures` and cannot report success. Guard the copy with the existing dry-run contract and leave all other generated surfaces unchanged.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: This is the smallest implementation that preserves canonical bytes while making the promised Claude asset a required checkout/runtime output.
  - learn: `copyFileSync` expresses a binary-preserving file contract more accurately than converting Markdown through a UTF-8 string writer.
  - architecture: `runSync()` owns the side effect; the canonical asset is an independent required file, not generated coordinator content and not a new exported abstraction.
  - avoid: Do not add a copy helper, alter Pi deployment or Claude generation, move the copy into optional MCP handling, or touch installer/package/archive/staging/smoke paths.
  - verify: `bun test tests/surface-wiring.test.ts` (GREEN: all focused isolated sync cases pass, including exact bytes, dry-run absence, and non-zero required failure).
  - tdd: RED comes from 1.1; GREEN is this minimal `copyFileSync` change; TRIANGULATE reruns every isolated scenario and checks required-failure placement; REFACTOR removes only proven local duplication and preserves the direct operation.

## // 003. TRIANGULATE → REFACTOR — focused regression and boundary gate

Production files: `cc-ein/sync.ts` (inspection only; no behavior expansion)  
Test files: `tests/surface-wiring.test.ts` (local fixture cleanup only if needed)

- [x] 3.1 Triangulate the complete focused contract, refactor only duplicated temporary-process test setup if it genuinely improves the existing module, and perform the final boundary audit: the canonical asset remains unchanged, only the declared sync/test files plus this SDD artifact are changed, and all A1–A3 dirty paths and the untracked dogfooding document remain untouched.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The change must prove runtime behavior without widening into packaging work or absorbing unrelated working-tree changes.
  - learn: A refactor is complete when it reduces local repetition without introducing a reusable production API for a one-file deployment.
  - architecture: Keep ownership constrained to `cc-ein/sync.ts` and its focused surface-wiring proof; packaging and installer concerns remain in `package-claude-orchestrator-asset`.
  - avoid: Do not “prepare” inventory, bundling, archive, packaged staging, payload, or smoke files, and do not reset, stage, rewrite, or rename protected dirty work.
  - verify: `bun test tests/surface-wiring.test.ts`; after the focused gate, run the required broader checks `bun test`, `bun run typecheck`, `cd installer && bun run typecheck`, and canonical-integrity checks `wc -c < ein-pi/agent/assets/orchestrator.md` and `shasum -a 256 ein-pi/agent/assets/orchestrator.md`.
  - tdd: RED is the pre-implementation failure from 1.1; GREEN is the passing focused suite from 2.1; TRIANGULATE confirms all R1–R3 branches and canonical size/hash; REFACTOR is limited to local test setup and must be followed by the focused suite again.

## Boundary lock

- Production allowlist: `cc-ein/sync.ts` only.
- Test allowlist: `tests/surface-wiring.test.ts` only.
- Read-only input: `ein-pi/agent/assets/orchestrator.md`.
- Never touch installer source/tests or any installer payload inventory, bundling, staging, archive, packaged-artifact, or smoke files; those belong to `package-claude-orchestrator-asset`.
- Preserve all A1–A3 dirty paths and the untracked dogfooding document currently present under `docs/plan-hallazgos-dogfooding-*.md` exactly as-is.
