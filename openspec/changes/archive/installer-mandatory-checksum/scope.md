# Scope — installer-mandatory-checksum

## SCOPE PACKET

```yaml
scope: Make `installer/install.sh` fail closed unless the selected release binary has a downloaded, strictly valid `checksums.txt` entry whose SHA-256 matches the binary, and add focused regression coverage for unavailable, missing, malformed, mismatched, and successful verification paths. Preserve an explicit development bypass only if an existing repository convention requires one; none is present in the current baseline.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Objective

Close the unsigned-install path in `installer/install.sh`. The bootstrap currently treats `checksums.txt` as optional: a failed checksum download is ignored and a manifest without the selected asset is allowed to continue. The bounded change must require successful checksum metadata retrieval and a verified selected asset before any install-directory mutation or executable handoff.

The release workflow emits GNU `sha256sum` lines (`64 lowercase hexadecimal characters`, two spaces, asset name). The installer must accept the selected platform asset only when the manifest is well formed, contains the selected asset exactly once, and the computed digest matches. A missing checksum utility must also fail closed. No checksum bypass is justified by the current repository: `EIN_INSTALLER_REPO` is an existing repository-selection override, not a verification escape, and no `SKIP_CHECKSUM`, development mode, or equivalent convention was found.

## Current project context

- **Baseline:** branch `main`, aligned with `origin/main` at scope time. The pre-existing untracked `EIN.md` is preserved and is not part of this change.
- **Stack:** `installer/` is a private Bun + TypeScript ESM package (`installer/package.json`, `installer/tsconfig.json`); the bootstrap itself is POSIX-style Bash.
- **Package manager and typecheck:** Bun (`installer/bun.lock`); the configured typecheck command is `cd installer && bun run typecheck`.
- **Testing convention:** root `bunfig.toml` configures Bun's built-in test runner and `tests/preload-env.ts`; existing tests import from `bun:test`. `installer/package.json` has no test script. `openspec/config.yaml` currently has `strict_tdd: true`, but its runner, apply, verify, and coverage command fields are blank; this scope does not rewrite that user-maintained configuration.
- **Bootstrap seam:** `installer/install.sh` derives `ASSET` from `uname`, downloads `${base}/${ASSET}` and `${base}/checksums.txt` with `curl`, then currently performs optional grep-based verification before `chmod`/`mv` into `/usr/local/bin` or `${HOME}/.local/bin`.
- **Release contract:** `.github/workflows/installer-release.yml` publishes four platform binaries, `checksums.txt`, and `install.sh`; `tests/release-asset-contract.test.ts` already pins asset names and the emitted checksum-line shape. `installer/src/core/checksum.ts` is a strict TypeScript checksum parser for the compiled updater, but the bootstrap path is separate and is not to be silently coupled to it.
- **Existing shell coverage:** `tests/install-sh-wsl.test.ts` checks the bootstrap text for WSL and `/dev/tty` behavior. The new regression coverage must preserve those assertions and add behavioral coverage for checksum gating without network access or real home-directory mutation.

## In scope

1. Change only the checksum gate in `installer/install.sh` so checksum retrieval is mandatory and every failure exits nonzero before the downloaded binary is installed or executed.
2. Validate the manifest against the release format: reject a failed/empty checksum download, malformed nonempty entries, a manifest without the selected `ASSET`, and duplicate selected entries. Do not accept a partial grep match or an invalid digest as proof.
3. Compute SHA-256 with the existing cross-platform preference (`sha256sum`, otherwise `shasum -a 256`); if neither usable command can verify the file, fail closed. Compare the computed digest to the selected manifest digest before `chmod`, `mv`, or `exec` of the installed binary.
4. Preserve repository override, platform and WSL detection, release URL shape, temporary-directory cleanup, install-directory selection, permissions, PATH notice, and post-install TUI/non-TTY behavior when verification succeeds.
5. Add focused Bun regression coverage using a deterministic shell/test seam or controlled command fixtures. Cover each requested failure independently—checksum download failure, missing selected asset, malformed manifest, and digest mismatch—and the successful verified path. Failure cases must assert a nonzero outcome and no installed destination; success must assert verification precedes installation and preserves the existing handoff behavior. Tests must not contact GitHub or mutate a developer's home/system bin directory.
6. Keep the implementation and tests within one reviewable security slice; do not add a general checksum abstraction or change the compiled updater's existing checksum behavior unless mapping proves a minimal shared seam is unavoidable.

## Acceptance criteria

- [ ] The installer never installs or launches a downloaded binary when `checksums.txt` cannot be downloaded.
- [ ] The installer fails closed when the manifest lacks the selected platform asset, has malformed checksum content, contains a duplicate selected entry, or has a digest that does not match the downloaded binary.
- [ ] A valid manifest containing exactly one selected asset line in the workflow's GNU format and a matching SHA-256 permits installation and retains the existing success output/handoff.
- [ ] Verification completes before `chmod`, `mv`, install-directory publication, or execution of the downloaded binary; failed verification leaves no published installer at the test destination.
- [ ] The checksum path works through the existing `sha256sum`/`shasum` portability choice and fails closed when no usable checksum command is available.
- [ ] No checksum bypass or development escape is added because the baseline contains no explicit convention requiring one.
- [ ] Focused regression coverage exercises unavailable, missing-asset, malformed, mismatch, and successful verified paths deterministically, with no network and no real user/system installation mutation.
- [ ] WSL detection, platform asset naming, temporary cleanup, install-directory behavior, and non-TTY/TUI handoff remain outside the checksum decision and continue to be covered by existing or focused checks.
- [ ] Banner/version, symlink, tar, CI/E2E, release publication, and unrelated audit behavior are unchanged.

## Non-goals and hard boundaries

- The banner/version fix, which is already committed separately.
- Symlink hardening, tar validation, archive/content validation, or any other installer audit finding.
- CI/E2E restructuring, release-workflow redesign, asset publication changes, or changing the release/latest URL strategy.
- Changes to the compiled Bun installer, `installer/src/core/checksum.ts`, updater acquisition/transaction semantics, or runtime deployment behavior.
- A user-facing checksum opt-out, `--no-checksum` flag, environment bypass, or undocumented development mode.
- README, CHANGELOG, version, package metadata, or broad installer documentation changes.
- Running tests, builds, typechecks, or network calls during this scope phase.

## Mapping handoff

`sdd-map` should stay bounded to `installer/install.sh`, the existing `tests/install-sh-wsl.test.ts`/release-asset contract conventions, and the smallest deterministic test seam. Identify whether the shell can be exercised with a temporary `PATH` containing fake `curl`/checksum commands and a safe install destination, or whether a narrowly sourceable verification helper is required; do not turn this security fix into a shell-runner refactor. Map assertions for failure before publication, exact manifest parsing, command portability, temporary cleanup, and the successful post-verification handoff. Confirm that no existing explicit development convention warrants a bypass before design treats the gate as unconditional.

## Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `8f59fa10c5eb18b4461f9425108e6a8a8f407c2a8b40f5508be48195728d6a87` | 1604 |

Selection uses 1 of 3 allowed files and 1,604 of 32,768 allowed UTF-8 bytes. The canonical runtime-installation scenarios constrain this change to the bootstrap's selected release asset and successful/failed installation reporting; the new checksum-gated bootstrap behavior is declared in the change delta under the same domain.

## Skill application

- `ein-discipline`: applied for the bounded SDD scope, strict-TDD recording, phase boundary, and reviewable security slice.
- `release`: not applicable; this change does not publish, tag, version, or modify release workflow assets.
- `nuxt-ui` and `seo`: not applicable; the slice is a Bash installer integrity gate with no Nuxt UI or web-search surface.
- `vitest`: not applicable as a test framework because this repository uses Bun's built-in `bun:test`; its focused-test discipline is reflected in the later regression-coverage handoff, with no tests run in scope.

## SDD configuration summary

- Execution mode: `auto` for the chain; this scope phase remains planning-only.
- Strict TDD: enabled (`strict_tdd: true` in `openspec/config.yaml`); RED/GREEN/REFACTOR execution belongs to apply/verify.
- Stack: Node.js/TypeScript ESM plus a Bash bootstrap; Bun package manager.
- Test runner: repository convention is Bun's built-in `bun:test` with the root preload, while configured runner/test commands are currently blank.
- Typecheck: `cd installer && bun run typecheck`.
- Artifact store: canonical OpenSpec artifacts under `openspec/changes/`; Engram is unavailable for this session.

## Scope phase boundary

This artifact defines scope only. No application code, tests, build output, typecheck, test suite, network request, or `apply-progress*`/`verify-report*` artifact is created here. The behavior delta is declared by `openspec/changes/installer-mandatory-checksum/specs/installer-runtime/spec.md`; no no-delta declaration is used.

## Risks

- A static string test could falsely claim behavioral coverage; mapping must prefer a real shell harness or an explicitly bounded, sourceable verification seam.
- Shell command availability and GNU/BSD checksum output differ across Linux and macOS; portability must remain fail-closed rather than silently skipping verification.
- The two `releases/latest/download` requests can observe different release state; a mismatch must fail closed, while release pinning remains outside this slice.
