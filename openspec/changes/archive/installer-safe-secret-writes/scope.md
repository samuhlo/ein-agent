# Scope — installer-safe-secret-writes

## SCOPE PACKET

```yaml
scope: Harden installer secret and shell-RC writes against symlink/path substitution and partial writes. Cover `writeSecret` and `ensureContext7Export`: reject unsafe non-regular targets and symbolic links, create sensitive files with restrictive permissions from creation time, use same-directory temporary files plus atomic rename where appropriate, preserve idempotency and existing contents, and add focused regression tests for missing targets, regular targets, symlinks, directories/special files, write failures, and cleanup.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Objective

Make the installer’s plaintext secret and Context7 shell-RC writes fail closed under unsafe filesystem targets or interrupted writes. The bounded implementation covers `installer/src/core/secrets.ts` and focused Bun tests; it must retain the current trimmed-secret format, shell-specific export block, sentinel idempotency, and unrelated user-authored RC content.

## Current project context

- **Stack:** `installer/` is a private Bun + TypeScript ESM package (`installer/package.json`, `installer/tsconfig.json`) with strict TypeScript and bundler module resolution. Secrets are under `~/.config/opencode-secrets/`; the shell RC comes from `Platform.shellRc`.
- **Package manager/typecheck:** Bun (`installer/bun.lock`); `cd installer && bun run typecheck`.
- **Testing convention:** the repository root uses Bun’s built-in `bun:test` through `bunfig.toml` and its preload. `installer/package.json` has no test script; focused tests should run from the repository root with a temporary `HOME` established before importing the import-time path constants.
- **Current seams:** `writeSecret` trims a non-empty value, ensures the secrets directory, writes directly to the configured path, then best-effort `chmod`s it. `ensureContext7Export` reads a missing path as empty, skips when the sentinel is present, otherwise appends the Fish or POSIX block with a direct write. Neither function currently rejects symlinks, directories, special files, or partial-write failures.
- **Callers/blast radius:** both functions are called by `installer/src/cli/install.ts`; codegraph found no covering tests. `SECRET_PATHS` maps the three secret names to fixed paths, and `CONTEXT7_KEY_PATH` is referenced in the generated shell block rather than inlined.
- **SDD configuration:** `openspec/config.yaml` already exists and is user-maintained. It records `strict_tdd: true`, Bun/TypeScript project context, blank apply/verify test commands, and `cd installer && bun run typecheck` as the typecheck command. This scope does not rewrite it. Canonical artifacts are stored under `openspec/changes/`; Engram is unavailable.
- **Baseline hygiene:** the only pre-existing untracked file observed is `EIN.md`; it is preserved and is not part of this change.

## In scope

1. Harden `writeSecret` for non-empty values without changing its public return contract or the existing trimmed-value-plus-one-newline format.
2. Treat a missing secret target as creatable only through a same-directory temporary file created with restrictive `0600` permissions, followed by an atomic commit. Existing regular secret files may be replaced atomically; the destination must never be followed when it is a symlink.
3. Validate the secret target and the secrets directory as safe filesystem objects before use. Reject symbolic links, directories, FIFOs, sockets, devices, and other non-regular targets with an error; do not redirect the secret to a substituted path. Preserve the empty-value no-op, including no unnecessary file creation.
4. Harden `ensureContext7Export` for missing and existing RC paths. A missing target is created through a same-directory temporary file and atomic rename; an existing target must be a regular non-symlink file. Preserve all existing bytes, append exactly the existing shell-specific sentinel block once, and return `{ changed: false, rc }` when a valid regular file already contains the start sentinel.
5. Make filesystem failures (validation, temp creation, write, flush/close as applicable, rename, or cleanup) observable to the caller rather than reporting success. On failure, retain an existing destination byte-for-byte, avoid exposing partial content, and remove the temporary file when it can be removed without masking the original failure.
6. Add focused Bun regression coverage in the smallest installer test seam (expected boundary: `installer/src/core/secrets.ts` plus a new focused test file under `tests/`). Cover missing targets, existing regular files and modes, symlinks, directories and available special files, simulated write/rename failures, idempotent RC calls, preservation of unrelated RC content, and temporary-file cleanup. Use temporary homes/directories only; never touch a real user or system path.

## Required behavior matrix

| Operation/target | Required behavior | Failure side effect |
| --- | --- | --- |
| `writeSecret` with empty/whitespace value | Return `false`; do not create or modify a target. | None. |
| `writeSecret` with missing target and safe parent directory | Write trimmed value plus one newline; resulting secret is mode `0600`, with restrictive mode applied at creation rather than relying on a later chmod. | No published partial secret; no orphan temp. |
| `writeSecret` with existing regular target | Atomically replace/update the requested secret and enforce `0600`; do not merge unrelated bytes because the secret-file contract is one token per file. | Original content and metadata remain if temp write/rename fails. |
| `writeSecret` with symlink, directory, FIFO, socket, device, or other non-regular target | Reject before reading or writing; never follow or replace a path that would write through the unsafe target. | Target and any symlink destination remain unchanged; temporary artifacts are cleaned. |
| `ensureContext7Export` with missing target and safe parent directory | Create a regular RC containing the correct Fish/POSIX block and return `changed: true`; do not inline the secret. | No partial RC or temp remains on failure. |
| `ensureContext7Export` with existing regular target and no sentinel | Preserve existing bytes (adding only the required separator when needed), append one block, and return `changed: true`. | Existing RC remains unchanged if writing or rename fails. |
| `ensureContext7Export` with existing regular target and sentinel | Return `changed: false` without rewriting; repeated calls remain idempotent. | Invalid target types are still rejected before sentinel inspection. |
| `ensureContext7Export` with symlink, directory, FIFO, socket, device, or other non-regular target | Reject without reading through or mutating the target. | Existing target/symlink destination remains unchanged; temp files are removed. |

## Acceptance criteria

- [ ] `writeSecret` and `ensureContext7Export` never follow a symbolic link or write to a directory/special file; all validation failures are surfaced and do not claim success.
- [ ] Secret creation and replacement use restrictive `0600` permissions from temporary-file creation/commit time; a failed operation cannot leave a partially written secret or RC.
- [ ] Temporary files are created in the destination’s directory so the final rename is atomic on the supported filesystems, and failed writes/renames clean them up without deleting the original destination.
- [ ] Missing safe targets, existing regular targets, symlink targets, directories, and available special-file targets have explicit regression coverage. The tests assert the external symlink destination and original regular file remain unchanged on rejection/failure.
- [ ] Existing RC content is preserved, the Fish and non-Fish blocks remain semantically and textually compatible with the current sentinel contract, and a valid sentinel makes subsequent calls return `changed: false` without another write.
- [ ] Secret values remain trimmed and newline-terminated; empty values remain a no-op; shell RCs continue to read `CONTEXT7_KEY_PATH` at shell startup rather than embedding the key.
- [ ] Write/temp/rename failure coverage proves no partial destination and no leftover temporary file, using deterministic seams or safe fixtures rather than permission assumptions that vary by runner.
- [ ] `installer/src/cli/install.ts` callers continue to observe failures through the existing error path; no unrelated install, deploy, checksum, tar, runtime, or secret-storage behavior changes.
- [ ] Later apply/verify phases run strict-TDD RED/GREEN/REFACTOR evidence, `cd installer && bun run typecheck`, and the focused Bun tests. This scope phase runs none of those commands.

## Non-goals and hard boundaries

- Checksum verification flow, tar extraction/validation, release assets, CI/E2E changes, Claude adapter work, banner/version work, or unrelated installer audit findings.
- Encryption, keyring integration, a broader secret-storage redesign, migration of existing secret formats, or changing `hasSecret` semantics beyond preventing unsafe target traversal if required by the shared validation helper.
- Replacing the shell-RC sentinel format, changing Fish/POSIX shell detection, inlining `CONTEXT7_API_KEY`, removing user RC content, or rewriting unrelated shell configuration.
- General atomic-file or filesystem abstraction work outside the smallest helper needed by these two functions.
- Relaxing strict TDD, changing `openspec/config.yaml`, running tests/builds/typechecks, network calls, or editing application code/tests during scope.

## Mapping handoff

Keep `sdd-map` bounded to `installer/src/core/secrets.ts`, its `installer/src/core/paths.ts`/`platform.ts` contracts, the two call sites in `installer/src/cli/install.ts`, and one focused Bun test file. Confirm the narrowest Node filesystem API strategy for `lstat`/no-follow validation, restrictive creation mode, same-directory temp naming, atomic rename, and cleanup. Map how to distinguish a missing final target from a symlink or special file, how to handle a substituted target between validation and commit, and whether the secrets directory itself needs the same no-symlink validation to prevent redirection. Preserve import-time `$HOME` behavior by configuring a temp home before module loading or using an isolated subprocess.

The map must identify deterministic failure seams for temp creation, write, and rename without relying on root-insensitive chmod tests. It must also verify that caller error propagation remains truthful and that idempotent sentinel detection does not bypass unsafe-target validation. Do not expand into a general secure-path library or unrelated installer files.

## Verification plan

- Apply: first add focused RED tests for the behavior matrix, then implement the smallest safe write helper and preserve the current shell blocks; record strict-TDD evidence in later phases.
- Verify: run the focused Bun test file(s) from the repository root with temporary-home isolation, then `cd installer && bun run typecheck`; inspect modes, bytes, symlink destinations, and temp-directory residue.
- Do not run tests, builds, typechecks, or network calls during this scope phase.

## Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `1db8195e4271410b32d7028e498c4e42a83db50817a6e7ab6819daa61ac50407` | 2365 |

Selection uses 1 explicit canonical file and 2,365 of the shared 32,768 UTF-8-byte limit. The existing installer-runtime scenarios constrain this change to installer runtime filesystem behavior; the new safe secret and shell-RC behavior is declared by the structured delta under the same domain.

## Skill application

- `ein-discipline`: applied for bounded SDD scope, strict-TDD recording, phase boundary, and reviewable security slicing.
- `nuxt-modules`, `next-best-practices`, `vueuse-functions`, and `web-design-guidelines`: loaded as injected project skills but not applicable; this is a Bun/TypeScript filesystem hardening change with no Nuxt module, Next route, Vue composable, or web UI surface.

## Scope phase boundary

This artifact defines scope only. It creates no application code, tests, build output, typecheck output, network request, `apply-progress*`, or `verify-report*` artifact. The only intended change artifacts are this scope and the structured `installer-runtime` behavior delta.

## Risks

- A direct `rename` can be safe against symlink traversal while still needing a final target/path-substitution decision; design must make that race behavior explicit rather than relying on a pre-check alone.
- Mode and permission assertions can vary under platform umasks and privileged runners; tests must inspect mode bits and use deterministic creation/failure seams.
- Import-time path constants can accidentally point tests at the real home; temporary-home setup must occur before importing installer modules.
