# Design — installer-mandatory-checksum

## A. Proposal

### Intent

Make the release bootstrap fail closed unless it downloads a valid checksum manifest and verifies the selected binary's SHA-256 before any installation or executable handoff. Add focused behavioral coverage of the real shell flow without network access or writes to real installation paths.

### Scope

**In scope:** replace the optional checksum block in `installer/install.sh` with a mandatory gate; strictly validate the manifest; support `sha256sum` with `shasum -a 256` as the portability fallback; and add focused Bun tests using isolated command fixtures.

**Out of scope:** the banner/version fix; checksum bypasses; the compiled updater and `installer/src/core/checksum.ts`; release workflow or URL redesign; symlink, tar, archive, CI/E2E, documentation, versioning, and all other audit findings.

### Affected areas

- `installer/install.sh` — mandatory manifest retrieval, parsing, digest calculation, and pre-install verification.
- `tests/install-sh-checksum.test.ts` — focused real-shell regression harness and checksum scenarios.
- Existing WSL and release-asset contract tests remain behavior contracts and are not redesigned.

### Risks

- Shell parsing can accidentally accept partial names, invalid spacing, duplicate entries, or malformed digests.
- Host command availability can make portability tests nondeterministic unless the fixture controls `PATH` completely.
- An incomplete test sandbox could invoke real network or installation commands.
- The two `latest/download` requests can resolve across a release change; the safe result is a checksum failure, not installation.

### Rollback

Revert the checksum-gate and focused-test change together. Because that restores the unsafe optional-verification behavior, bootstrap distribution SHOULD be paused until a corrected mandatory gate is available rather than treating the rollback as a secure steady state.

### Success criteria

- Every checksum retrieval, manifest, utility, and digest failure exits nonzero before install-directory mutation, `chmod`, `mv`, or execution.
- A valid GNU-format entry for the selected asset, occurring exactly once and matching the binary, permits the unchanged installation and handoff flow.
- Focused tests execute the actual script with controlled commands and confine all artifacts to a temporary fixture root.
- Strict TDD evidence records a failing checksum-behavior test before the production change and passing focused coverage afterward.

### Canonical spec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `8f59fa10c5eb18b4461f9425108e6a8a8f407c2a8b40f5508be48195728d6a87` | 1604 |

No additional canonical domain file is needed; this uses 1 of 3 files and 1,604 of 32,768 UTF-8 bytes.

## B. Spec

### Requirement 1 — Mandatory checksum metadata

The system **MUST** download `checksums.txt` successfully and **MUST** fail with a nonzero status if the download fails or does not yield a usable selected-asset entry.

**Scenario:** Given the release binary download succeeds, when the checksum manifest download fails or is empty, then the bootstrap exits nonzero and does not install or execute the binary.

### Requirement 2 — Strict manifest validation

The system **MUST** require every non-empty manifest line to match the complete release format of 64 lowercase hexadecimal characters, exactly two ASCII spaces, and one non-whitespace asset name. It **MUST** require the selected `ASSET` to occur exactly once; malformed lines, a missing selected entry, or duplicate selected entries **MUST** be fatal. Empty lines **MAY** be ignored so the workflow's terminal newline is accepted.

**Scenario:** Given a downloaded manifest containing a malformed non-empty line, no exact selected entry, or more than one selected entry, when the bootstrap parses it, then parsing fails and no installation or execution occurs.

### Requirement 3 — Portable digest calculation

The system **MUST** use `sha256sum` when that command is available; otherwise it **MUST** use `shasum -a 256`. The selected command **MUST** complete successfully and return a valid SHA-256 digest; an absent or failed usable checksum path **MUST** be fatal.

**Scenario:** Given a valid manifest and downloaded binary, when `sha256sum` is unavailable, then a successful `shasum -a 256` result is used, while absence or failure of the selected checksum command causes a nonzero exit before installation.

### Requirement 4 — Matching and ordering gate

The system **MUST** compare the computed digest with the selected manifest digest exactly and **MUST NOT** select or create an install directory, change permissions, publish the binary, or execute it until verification succeeds. A mismatch **MUST** be fatal.

**Scenario:** Given a valid selected entry whose digest differs from the downloaded binary, when verification runs, then the bootstrap exits nonzero before install-directory mutation, `chmod`, `mv`, or executable handoff.

### Requirement 5 — Verified success preserves bootstrap behavior

After successful verification, the system **MUST** retain the existing platform and WSL selection, install-directory choice, permissions, PATH notice, temporary cleanup, success output, and TTY/non-TTY handoff behavior.

**Scenario:** Given exactly one valid selected entry and a matching computed digest, when the bootstrap runs, then checksum success is reported before publication and the existing installation and post-install handoff complete normally.

### Requirement 6 — Isolated behavioral regression coverage

Focused tests **MUST** execute the real `installer/install.sh` flow with fake network, checksum, and installation commands, a controlled `PATH`, and a temporary fixture destination. They **MUST NOT** contact GitHub or mutate real home, system-bin, or other installation paths.

**Scenario:** Given the focused shell harness, when download failure, missing entry, malformed manifest, duplicate entry, mismatch, utility failure/fallback, and verified success fixtures run, then each result and command order are observable only inside the temporary fixture root.

## C. Decisions

### 1. Keep the security gate in the bootstrap

The bootstrap will validate its own downloaded manifest before the existing installation section. It will not call or generalize the TypeScript updater parser: that code is not available to a bootstrap that has not yet installed the binary, and coupling the paths would enlarge this security slice.

### 2. Parse complete lines, not grep fragments

Manifest processing will validate each non-empty line against the full GNU release shape and count exact asset-name matches. This makes malformed content and duplicate selected entries explicit failures instead of relying on accidental multiline comparisons. Blank lines are ignored; a blank-only manifest still fails because it has no selected entry.

### 3. Make checksum tool selection explicit

Command presence and invocation success will be checked deliberately rather than left to `set -e`. `sha256sum` is preferred; `shasum -a 256` is selected only when `sha256sum` is unavailable. A present but failing selected command is a verification failure, not a reason to continue installation.

### 4. Preserve the existing install boundary

Manifest retrieval, parsing, hashing, and comparison remain before `pick_install_dir`. Installation-directory selection and creation, `chmod`, `mv`, PATH messaging, and executable handoff stay outside the checksum implementation and run only after success.

### 5. Test through a controlled command boundary

The focused Bun test will spawn the real script with a fixture `PATH`. Fake `curl` supplies bytes or fails and rejects unexpected URLs; controlled checksum commands produce success, fallback, mismatch, and failure outcomes; fake install commands log order and remap publication into a temporary destination. Deterministic `uname`, temporary `HOME`/`TMPDIR`, non-TTY input, cleanup assertions, and an isolated environment prevent network and real-path side effects.

### 6. Apply strict TDD to the new behavior

The new behavioral assertions must first fail against the optional checksum baseline (RED), then pass after the smallest checksum-gate change (GREEN), followed by focused cleanup without broad shell refactoring (REFACTOR). Existing static WSL and release-format contracts remain complementary; they do not substitute for executing the shell flow.

### Boundaries

- `installer/install.sh` owns bootstrap checksum retrieval, validation, digest comparison, and ordering.
- The focused Bun test owns deterministic command fixtures, sandbox enforcement, event-order assertions, and failure/success coverage.
- The release workflow remains the unchanged producer of GNU-format checksum lines.
- The compiled updater retains its separate checksum implementation and behavior.

### Alternatives rejected

- **Keep checksums optional:** rejected because it preserves unsigned installation paths.
- **Use `grep`/`awk` extraction alone:** rejected because suffix matches and implicit duplicate handling do not establish strict manifest validity.
- **Add a checksum bypass:** rejected because no repository convention requires one and it would defeat fail-closed behavior.
- **Share the TypeScript parser:** rejected because the bootstrap cannot depend on the not-yet-installed runtime and the abstraction would exceed the bounded change.
- **Use static script-text tests only:** rejected because they cannot prove failure ordering, command fallback, cleanup, or absence of installation side effects.
- **Redesign release pinning or publication:** rejected as unrelated to enforcing verification of the currently selected asset.

## D. Success Criteria

Acceptance requires all of the following observable checks:

- Checksum download failure, empty/missing selected entry, malformed non-empty line, duplicate selected entry, digest mismatch, and unavailable/failing checksum utility each return nonzero.
- Every failure fixture records no install-directory mutation, permission change, publication, or executable handoff.
- The fallback fixture proves `shasum` is invoked with `-a 256` only when `sha256sum` is unavailable.
- The success fixture proves a valid exact entry and matching digest produce checksum success before `chmod` and `mv`, then preserve existing success and non-TTY handoff output.
- The harness rejects unexpected network URLs, remaps installation into its temporary destination, uses temporary `HOME` and `TMPDIR`, and confirms temporary download cleanup; no real installation path changes.
- Existing WSL `/dev/tty` and release checksum-format contracts continue to pass.
- Apply/verify should run the focused command `bun test tests/install-sh-checksum.test.ts tests/install-sh-wsl.test.ts tests/release-asset-contract.test.ts` and the configured typecheck `cd installer && bun run typecheck`. These commands are specified for later phases and are not run during design.
- Strict-TDD evidence shows RED before production edits and GREEN after the mandatory gate is implemented.
