# Design — release update semantics

## A. Proposal

### Problem statement

`ein update` currently redeploys the template embedded in the running binary, writes that binary's static `INSTALLER_VERSION`, and only then performs a best-effort latest-release lookup. It can therefore report success while the requested release, executable, embedded/deployed template, marker, and banner disagree. The current backup also protects only part of `AGENT_DIR`; it does not make binary replacement, template deployment, and marker commit one recoverable operation.

### Intent

Make `ein update [latest|<version>]` a fail-closed release transaction with one canonical release identity from resolution through verified acquisition, executable replacement, re-execution, template deployment, marker commit, and display. Establish an explicit ownership boundary so standalone installations can self-update while externally managed installations never overwrite their package manager's executable.

### Scope

**In scope**

- Latest and explicit stable installer release resolution from `samuhlo/ein-agent` (or the existing `EIN_INSTALLER_REPO` override).
- Exact platform asset selection for Darwin/Linux and arm64/x64, strict same-release checksum binding, staged download, executable permissions, atomic executable replacement, child re-execution, template deployment, marker migration/commit, rollback, recovery, cleanup, and observable results.
- Version/ownership marker v2, legacy marker handling, and the banner's version source.
- Deterministic seams and focused Bun tests using fake HTTP, process, clock, filesystem roots, and executable replacement.

**Out of scope**

- A Homebrew formula/tap or final Homebrew upgrade policy.
- README restructuring, banner Git-state redesign, release publication, Engram behavior, a generalized deployment framework, package-manager migration, or unrelated installer refactoring.
- Independent cryptographic signing/attestation. This change verifies GitHub release provenance plus SHA-256 integrity; it must not describe that as publisher-independent signature verification.
- Updating Pi itself or declared packages as part of the installer release transaction. Those operations are not rollback-safe and remain owned by their existing install/maintenance flows.

### Affected areas

Expected production surfaces are `installer/src/cli/update.ts`, release/version/ownership logic under `installer/src/core/`, `installer/src/core/deploy.ts`, the existing backup boundary in `installer/src/core/backup.ts`, CLI dispatch/version probing in `installer/src/main.ts`, paths/exec seams, and `installer/src/tui/banner.ts`. Focused tests belong under `tests/`; the release workflow or `install.sh` may change only if a minimal asset-contract alignment is proven necessary.

The existing `deployTemplate` is path- and embedded-asset-bound, `restoreBackup` overlays without deleting newly introduced managed files, and the banner currently renders compile-time `INSTALLER_VERSION` rather than reading the marker. The transaction design must account for these confirmed constraints rather than treating the existing backup as whole-install atomicity.

### Risks

- GitHub-hosted SHA-256 metadata detects corruption/substitution between selected assets but does not protect against compromise of the release publisher account.
- POSIX rename is atomic only within one filesystem; a staged executable in the system temp directory cannot safely be renamed over a destination on another filesystem.
- A process can be killed after executable replacement. Without a durable journal, normal `finally` cleanup cannot guarantee recovery.
- Template deployment spans multiple managed directories and cannot be one filesystem rename without a broader layout migration; reverse-order rollback must be tested at every mutation boundary.
- Legacy markers have no ownership or provenance fields. Treating every unknown marker as standalone would create the package-manager conflict this design is intended to prevent.
- The implementation is likely to exceed 400 production changed lines in aggregate even when each behavioral work unit remains reviewable.

### Rollback

Before the first visible mutation, persist a transaction journal, a recoverable copy of the current executable, an exact snapshot of template-managed state, and the previous marker presence/content. On any failure after mutation, restore in reverse commit order: marker, template-managed state (clean then restore, preserving excluded user state), then executable by same-directory atomic rename; validate the restored release before deleting recovery material. If rollback cannot prove coherence, retain the journal and recovery artifacts, return `failed/rollback-failed`, list affected managed paths and remediation, and suppress any claim that either release is installed. A later invocation must recover or explicitly stop before beginning another update.

Reverting the eventual implementation returns the old updater behavior but does not invalidate a committed v2 marker: marker readers must ignore unknown additive fields. If a code rollback cannot safely interpret v2 ownership, it must fail closed rather than overwrite an externally owned binary.

### Success criteria

A successful result proves that selector, canonical release, same-release asset/checksum, installed executable version, embedded/deployed template version, marker release identity, and banner version agree. Every injected failure either leaves the previous coherent installation intact or returns an explicit recovery-required failure; no partial state is reported as success.

## B. Spec

### Identity model

The following values are distinct even when a healthy installation makes them equal:

- **Installer binary version:** immutable version reported by the executable (`INSTALLER_VERSION` / probe metadata).
- **Embedded template version:** immutable canonical release version recorded in the template manifest bundled into that executable.
- **Selected release version:** canonical version obtained by resolving the user's selector; its canonical tag is `installer-v<version>`.
- **Installed marker:** committed metadata about installed state, not a requested target. Marker v2 contains at least `schemaVersion: 2`, `version` (canonical installed release version), `releaseTag`, `binaryVersion`, `templateVersion`, `installedAt`, `channel`, `owner`, and selected asset name/SHA-256. `owner` distinguishes `standalone` from `package-manager` and names the manager when external.

The banner's `v…` value is `marker.version` from a valid committed marker. It MUST NOT use compile-time `INSTALLER_VERSION` as the installed-release label. With no valid marker it shows an explicit unverified state and may separately show the binary version; with a pending/failed transaction journal it shows `recovery required` rather than a release claim. A legacy marker may show its version marked as legacy until coherence is established and marker v2 is committed.

### Observable requirements and scenarios

#### R1 — Selector and release resolution

The system **MUST** treat no selector and literal `latest` as latest selection. It **MUST** accept explicit stable versions only in documented equivalent spellings (`X.Y.Z`, `vX.Y.Z`, or `installer-vX.Y.Z`), normalize them to exactly `installer-vX.Y.Z`, and **MUST NOT** substitute another release. The authoritative source is the GitHub Releases API for `INSTALLER_REPO`: latest uses the latest non-draft, non-prerelease eligible installer release; explicit uses the exact tag endpoint. A published release is eligible only when its canonical tag, platform asset, and `checksums.txt` satisfy this contract. Explicit downgrade is allowed only through an explicit selector and normal confirmation; it is never chosen by `latest`.

**Scenario:** Given installed `0.18.0`, latest eligible `0.20.0`, and published eligible `0.19.0`, when the user runs `ein update 0.19.0`, then only `installer-v0.19.0` is resolved and neither latest nor another fallback is installed; a malformed, draft, prerelease, missing, or ineligible exact tag fails before mutation.

#### R2 — Platform asset and publication provenance

The system **MUST** select exactly one same-release asset named `ein-installer-{darwin|linux}-{arm64|x64}` using the existing Darwin/Linux and arm64/aarch64/x64/amd64 mapping; WSL uses Linux. Unsupported platforms, missing/duplicate assets, or identity mismatches **MUST** fail closed. Both the executable asset and `checksums.txt` **MUST** come from the resolved release record. Requests **MUST** use HTTPS, bounded timeouts/response sizes and bounded redirects; redirects may remain only on GitHub API/release asset hosts and credentials **MUST NOT** be forwarded to a different host.

**Scenario:** Given a Linux aarch64 host and a release whose checksum exists only for the x64 asset, when acquisition runs, then it selects `linux-arm64`, rejects the release as missing required integrity metadata, and leaves installed state untouched.

#### R3 — Strict checksum and release identity

The system **MUST** parse `checksums.txt` strictly, require exactly one valid SHA-256 entry for the selected asset, hash all downloaded bytes before execution or replacement, and reject malformed, missing, duplicate, or mismatched entries. After checksum verification, a staged binary probe **MUST** report binary and embedded-template versions exactly equal to the selected canonical version. GitHub release identity plus same-release SHA-256 is the provenance guarantee for this change; output/docs **MUST NOT** call it a signature or independent attestation.

**Scenario:** Given a correctly named asset whose bytes report a different binary or embedded-template version, when its download hash is checked and probed, then the transaction fails at verification even if the checksum line matches those bytes.

#### R4 — Temporary download and executable permissions

The system **MUST** download into transaction-owned temporary files and keep the executable candidate in the destination directory before replacement so final rename is same-filesystem. It **MUST** reject symlinks, non-regular ambiguous destinations, and unsafe ownership conflicts. The candidate **MUST** receive executable permissions compatible with the existing standalone executable while clearing setuid/setgid bits; bytes and containing directory metadata **MUST** be flushed before the replacement is considered committed. Temporary bytes **MUST NOT** establish installed identity.

**Scenario:** Given a verified asset but a destination that cannot accept a safe sibling temp file or executable mode, when preparation runs, then binary replacement does not begin and the existing executable, template, and marker remain unchanged.

#### R5 — Already-current coherence

The system **MUST** report `already current` only after resolving the requested release and proving that the installed executable hash/version, its embedded template version, deployed template manifest, marker identity/ownership, and selected release all agree. Equal marker text alone is insufficient. No binary/template replacement occurs in this outcome; a legacy-to-v2 metadata-only migration **MAY** be committed after all coherence checks succeed.

**Scenario:** Given marker version `0.20.0` but a `0.19.0` executable or deployed template, when `ein update latest` resolves `0.20.0`, then it does not report already current; it performs the normal verified repair transaction or fails without advancing the marker.

#### R6 — Transaction and re-execution boundary

For a standalone installation, the old process **MUST** prepare durable rollback state, atomically replace the executable, and then spawn the installed new executable in a private continuation mode carrying a transaction identifier and selected release identity. The new child **MUST** verify its own binary/embedded-template identity before deploying that embedded template. The old parent **MUST** wait for the child and remains responsible for final validation, rollback, cleanup, and user-facing outcome. Tests **MUST NOT** replace or re-execute the running test process.

**Scenario:** Given a verified `0.20.0` asset and coherent `0.19.0` installation, when replacement succeeds but the `0.20.0` continuation cannot start or reports `0.19.0`, then the parent restores the old managed state and exits non-zero without an update-success message.

#### R7 — Template deployment and user state

The continuation **MUST** deploy only the selected binary's embedded template and **MUST** validate its canonical template version before marker commit. Template-managed directories are updater-owned; preserved settings, local/downloaded skills, credentials, sessions, backups, and other existing exclusions remain user/runtime-owned. Rollback **MUST** clean template-managed directories before restoring their prior snapshot so files introduced by the failed release cannot remain. Pi and declared-package installation **MUST NOT** be part of this release transaction.

**Scenario:** Given a new release that removes a managed file and preserves a user's model/theme, when template deployment succeeds, then the stale managed file is absent, user settings remain, and the deployed manifest identifies the selected release.

#### R8 — Marker commit and banner truthfulness

The marker **MUST** be written atomically only after executable replacement, child re-execution, template deployment, and deployed-state validation all succeed. Marker `version`, `releaseTag`, `binaryVersion`, and `templateVersion` **MUST** identify the selected release, and its asset digest **MUST** be the verified digest. The marker **MUST NOT** be advanced from user intent alone. Final success **MUST** require reading back the marker and revalidating installed identity; the banner **MUST** display that committed `marker.version`.

**Scenario:** Given a successful binary and template deployment but a marker write/read-back failure, when commit is attempted, then the transaction rolls back and neither CLI output nor banner claims the selected release was installed.

#### R9 — Ownership boundary

The system **MUST** classify ownership from explicit marker/distribution metadata, never install-path guessing. `standalone` permits the self-updater to replace all updater-managed artifacts. `package-manager` prohibits executable replacement by `ein update` and returns `blocked by external owner` with the manager name and an actionable manager-owned upgrade instruction. Conflicting, missing non-legacy, or malformed ownership metadata **MUST** fail before mutation.

For an external owner, if the resolved target differs from the running binary, the command **MUST NOT** deploy a newer template or advance the marker. If target and binary already match, it **MAY** transactionally repair updater-owned template state from that binary's matching embedded template; otherwise it reports verified already-current. This preserves safe template semantics without competing for the executable.

**Scenario:** Given `owner={type:"package-manager", manager:"homebrew"}`, binary `0.20.0`, and latest `0.21.0`, when `ein update latest` runs, then no binary/template/marker mutation occurs, the result is blocked and non-zero, and the user is directed to the owning manager.

#### R10 — Failure, rollback, interruption, and cleanup

Resolution, network, timeout, HTTP, truncation, missing asset, and verification failures **MUST** occur before installed mutation and identify their stage. Binary replacement, child, template, and marker failures **MUST** trigger reverse-order rollback. Signals handled before mutation clean disposable staging; signals after mutation initiate rollback. A durable journal **MUST** make an interrupted post-replacement transaction recoverable on the next invocation before any new update. Recovery files **MUST** be retained until old or new coherence is proven. Cleanup runs only after final validation; cleanup failure after a coherent commit may report success with a cleanup warning and a recoverable committed journal, but it **MUST NOT** change installed identity.

**Scenario:** Given interruption after template deployment but before marker commit, when the command next starts, then it detects the pending journal, restores or completes only according to recorded committed state, proves coherence, and does not begin a second update while state is ambiguous.

#### R11 — Outcomes and reporting

The system **MUST** expose at least `updated`, `already-current`, `blocked-external-owner`, and `failed` results. Exit status is zero only for validated `updated` and `already-current`; blocked and failed are non-zero. Human output **MUST** identify the requested selector, resolved tag when known, ownership, failed stage when applicable, final verified installed version when known, and remediation. It **MUST NOT** expose credentials, report success before parent validation, or call rollback-failed state either old or new success.

**Scenario:** Given a checksum mismatch, when update ends, then output names verification as the failed stage, names the requested/resolved release without secrets, reports the prior version only if revalidated, and exits non-zero without “updated”.

#### R12 — Deterministic testability

The orchestration **MUST** receive narrow injectable capabilities for release HTTP, hashing/probing, filesystem paths/atomic operations, deploy/backup, child execution, clock, signals, and output. Pure selector, asset, checksum, ownership, marker, transition, and result formatting logic **SHOULD** remain side-effect free. Production defaults may call Bun/Node/system tools, but tests **MUST** use temporary roots, fixture bytes, fake responses, and a fake child/replacer; no focused test may use real GitHub, replace the running test executable, or publish a release.

**Scenario:** Given a table of injected failures at every transition, when focused transaction tests run, then each case deterministically asserts operation order, final binary/template/marker identity, retained/cleaned recovery artifacts, result, and exit status without network or self-replacement.

### Migration and backward compatibility

- Marker v2 keeps legacy `version`, `installedAt`, and `channel` fields so old readers continue to parse the basic object; new fields are additive.
- A well-formed v1 marker with the historical self-managed `stable` channel is classified as `legacy-standalone`, not by its path. It can migrate to v2 only after exact release resolution plus local executable hash/version and embedded/deployed-template coherence are proven, or after a normal verified standalone update transaction.
- An unknown legacy channel, malformed marker, absent marker on an existing installation, or contradictory owner data is `ownership-ambiguous` and fails before replacement with reinstall/adoption guidance. It is never silently classified from `/usr/local/bin`, `~/.local/bin`, or `PATH`.
- Future package-manager channels must write explicit v2 external ownership metadata on first install/upgrade; they cannot rely on legacy inference.
- Existing `ein update --dry-run` remains non-mutating. Its eventual output should use the same selector/resolver/ownership logic and state what would be replaced or blocked, without claiming downloaded bytes were verified when they were not.

## C. Decisions

### Architecture and state machine

Use a small functional orchestrator with an explicit transition/result model and injected capability object; do not introduce class hierarchies or a generalized deployment framework.

```text
idle
  -> ownership-classified
  -> resolving
  -> resolved
  -> acquiring-metadata
  -> acquired-and-verified
  -> coherence-check
      -> already-current -> validated -> complete
      -> prepare-transaction
  -> prepared (durable journal + binary/template/marker rollback state)
  -> binary-replaced
  -> child-reexecuted
  -> template-deployed
  -> marker-committed
  -> validated
  -> complete

Any pre-mutation failure -> failed (cleanup disposable staging)
Any post-mutation failure/interruption -> rolling-back
  -> restored-and-validated -> failed
  -> rollback-failed/recovery-required -> failed (retain artifacts)
External owner + different target -> blocked-external-owner (no mutation)
```

The durable journal records target identity, ownership, managed paths, previous identities, completed transition, and recovery artifact paths; it contains no credentials. Each transition is persisted before the next irreversible action. A committed-but-not-cleaned journal is distinguishable from an incomplete transaction.

### Responsibility boundaries

- **CLI/update orchestrator:** selector, confirmation, state transitions, outcomes, reporting, and top-level recovery.
- **Release resolver/acquirer:** GitHub release eligibility, exact asset binding, HTTP policy, checksum parsing/hash, and staged probe.
- **Executable transaction boundary:** destination validation, sibling staging, permissions, atomic rename, executable backup/restore, and child continuation.
- **Deploy/backup boundary:** template-owned inventory, preservation of user state, exact clean-before-restore rollback, and deployed manifest validation. Existing generic backups remain user-visible history; transaction recovery must not depend on overlay-only restore semantics.
- **Version/marker boundary:** immutable binary/template metadata, v1/v2 parsing, ownership classification, atomic marker commit/read-back, and coherence comparison.
- **Banner:** presentation only; reads committed marker/recovery status and never decides ownership or repairs state.
- **Release workflow contract:** asset names and `checksums.txt` fixture shape. Publication remains out of scope unless implementation proves a minimal contract correction is required.

Updater-managed artifacts are the standalone executable; template-managed directories and root template files; `.ein-install.json`; destination-sibling executable candidate/backup; template transaction snapshot; and durable transaction journal. The resolver reads remote metadata; executable logic owns only executable candidate/backup; deploy owns template state; marker logic owns only marker; orchestrator controls ordering and cleanup.

### Trade-offs

- **Replace executable before template, then re-execute.** This ensures the template can only come from the selected verified binary. The cost is a cross-process transaction, addressed by a journal and parent-owned rollback.
- **Atomic per-artifact commit plus bounded rollback, not pretend whole-tree atomicity.** POSIX cannot atomically rename unrelated executable and agent-tree paths as one unit. Explicit transitions and reverse rollback are truthful and testable.
- **Same-release SHA-256 provenance now.** It matches the current publication assets and fails closed. Independent signatures/attestations would be stronger but require a trust-root/publication change outside this scope.
- **Decouple Pi/package updates.** Their external side effects cannot be rolled back with installer state; including them would make the “no partial success” contract unprovable.
- **Explicit ownership metadata.** This avoids brittle path heuristics and gives Homebrew a stable handoff, at the cost of requiring future channels to provision metadata.

### Rejected alternatives

- **Redeploy the running binary's template and only update the marker:** rejected because it preserves the current identity bug.
- **Download from `/releases/latest/download` for every selector:** rejected because explicit versions could silently resolve to another release and asset provenance would be ambiguous.
- **Optional checksum verification:** rejected because network or metadata failure must fail closed.
- **Write the target marker before deployment:** rejected because the banner/marker would lead installed state.
- **Run the new template from the old process without re-execution:** rejected because it cannot prove runtime binary and embedded template are the selected release.
- **Infer Homebrew from `/opt/homebrew`, `/usr/local`, symlinks, or permissions:** rejected because paths are shared by standalone and managed installations.
- **Use only `restoreBackup` as currently implemented:** rejected because overlay restore can retain new managed files and does not protect the executable.
- **Make update one large class/framework:** rejected as unnecessary; narrow functions and injected capabilities provide the required test seams with less complexity.

### Bounded work units and review forecast

Implementation should remain separable into three behavioral work units, each keeping its focused tests with behavior:

1. **Identity contract, resolution, marker migration, ownership, outcomes/banner:** approximately 180–280 production lines and 250–400 test lines.
2. **Verified acquisition, platform/checksum/probe, executable sibling staging and re-exec seam:** approximately 220–340 production lines and 300–500 test lines.
3. **Template/marker transaction, durable recovery, rollback ordering, failure matrix:** approximately 220–360 production lines and 350–600 test lines.

Aggregate forecast is roughly 620–980 production lines plus 900–1,500 test lines, with docs/workflow/fixtures reported separately. These are planning ranges, not permission to exceed the 400-line production review budget. Actual changed lines must be measured by the Review Workload Guard; it, not this design, decides single versus chained/stacked delivery.

### Downstream handoff contracts

**`homebrew-install-channel`**

- `CONTRACT_ACCEPTED` input: marker v2 owner schema, managed-artifact inventory, external-owner blocked behavior, safe same-binary template repair rule, release/asset/checksum source, banner/version identity, result/exit contract, and recovery boundaries.
- The channel must explicitly provision `owner={type:"package-manager", manager:"homebrew"}` (or accepted equivalent), define its binary upgrade command, and arrange template synchronization only from the package-installed matching binary.
- This design does not choose formula/tap ownership or claim Homebrew works. Implementation planning remains gated on this change being `VERIFIED`.

**`readme-release-ia`**

- May document only the verified selector syntax, eligible-release behavior, outcomes/exit semantics, version shown by banner, SHA-256/GitHub provenance guarantee and limitation, ownership refusal, and recovery behavior.
- Its handoff must cite the accepted design, verification artifact, verified revision/release identity, observed commands, remaining limitations, and rollback state. It must not copy provisional module names or claim signatures/Homebrew support. Documentation remains gated on `VERIFIED`.

## D. Success Criteria

### Observable acceptance checks

- Latest and exact non-latest fixtures resolve distinct canonical tags and install only their matching asset/template identity.
- A coherent target returns zero and `already current` without executable/template replacement; a marker-only match does not.
- Successful update read-back proves executable probe, embedded/deployed template manifest, marker fields/digest, and banner version equal the selected release.
- Malformed/unpublished explicit selector, unsupported platform, API/HTTP/redirect/timeout/truncation errors, missing/duplicate asset/checksum, checksum mismatch, and probe mismatch cause no installed mutation.
- Failures injected at executable replacement, child spawn/exit, every template mutation boundary, marker write/read-back, signal, and cleanup prove required ordering and old-state preservation or explicit recovery-required state.
- External ownership never replaces the executable; a newer target blocks without template/marker drift, while same-binary template repair is bounded and rollback-safe.
- Legacy stable markers migrate only after coherence or verified update; ambiguous ownership never uses path inference.
- Output and exit status distinguish updated, already current, external-owner block, ordinary failure, and rollback failure without false success.

### Verification commands / smallest harness

No tests or builds were run in design. `openspec/config.yaml` has `strict_tdd: false` and no configured runner, but the focused tests already use `bun:test`. The smallest harness is therefore new `bun:test` files with injected fakes; no new test dependency or global runner configuration is required.

Expected focused commands once those files exist:

```bash
bun test tests/release-update-contract.test.ts
bun test tests/release-update-acquisition.test.ts
bun test tests/release-update-transaction.test.ts
bun test tests/release-update-cli.test.ts
bun test tests/release-asset-contract.test.ts
bun test tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts
cd installer && bun run typecheck
```

A later installed-command check may use a temporary copied executable and local fixture HTTP server, never the running test process or real GitHub. `e2e/docker-test.sh` currently builds and uses network and only covers update dry-run; it is not an acceptable focused deterministic gate until adapted to local fixtures, and this design does not claim it passes.
