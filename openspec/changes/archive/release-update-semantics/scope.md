# Release update semantics

This change defines the bounded behavioral contract for `ein update`. The command must no longer report success after merely redeploying the template embedded in the currently running binary; the requested selector, resolved release, verified payload, deployed template/binary state, install marker, and displayed installed version must describe one release.

## Scope packet

```yaml
scope: Define a bounded behavioral change so `ein update` makes the requested release identity, downloaded payload, deployed template/binary state, install marker, and displayed version agree. Cover latest and explicit-version semantics, already-current behavior, checksum/provenance, atomic replacement or rollback, network/download failure, package-manager ownership boundaries needed later by Homebrew, and observable reporting. Exclude Homebrew implementation, README rewrite, banner Git redesign, Engram work, release publication, and unrelated installer refactors.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Known baseline

Treat these facts as established input to later phases rather than grounds for broad rediscovery:

- `installer/src/main.ts` dispatches update.
- `installer/src/cli/update.ts` redeploys the template embedded in the currently running binary.
- `installer/src/core/version.ts` writes the static `INSTALLER_VERSION` into the install marker.
- `installer/install.sh` is currently the path that downloads the latest released binary.
- `.github/workflows/installer-release.yml` publishes installer assets.
- The banner reads the install marker.
- Consequently, the current update command can complete successfully while retaining the old release identity.

## Goals

1. Define one release identity that can be traced from user intent through resolution, provenance verification, deployment, marker persistence, and displayed version.
2. Make unqualified `latest` selection and explicit-version selection deterministic and observably different where appropriate.
3. Define a truthful, non-destructive already-current outcome.
4. Require downloaded release material to be tied to the resolved release and verified before it can replace installed state.
5. Preserve a coherent, usable previous installation when resolution, network, download, verification, staging, or replacement fails.
6. Establish an installation-ownership seam so a future Homebrew channel can control package-manager-owned artifacts without two updaters silently overwriting each other.
7. Produce an observable contract that focused tests and downstream documentation can consume.
8. Keep implementation work divisible into small behavioral units and within the configured review workload guard.

## Non-goals and hard boundaries

- No Homebrew tap, formula, cask, package, release channel, or `brew install` command.
- No decision about Homebrew repository ownership, formula maintenance, or publication automation.
- No README rewrite or general documentation information-architecture work.
- No banner Git-state redesign.
- No Engram behavior or persistence work.
- No release publication and no unrelated rewrite of `.github/workflows/installer-release.yml`.
- No unrelated installer refactor, package-manager migration, dependency churn, or generalized deployment framework.
- No promise that an arbitrary unpublished version can be installed.
- No fallback from a missing/invalid explicit version to `latest`, and no use of the old binary's embedded template as if it were the requested remote release.
- This scope phase changes no code, tests, public docs, workflows, or release assets.

## Behavioral boundary

### Release selection

- With no explicit target (the `latest` path), the command resolves the latest eligible published installer release from the authoritative release source defined in design.
- With an explicit version, the command resolves exactly that version. Normalization between an accepted version spelling and its canonical release tag may be defined later, but it must not change the requested version or silently select another release.
- A missing, malformed, unsupported, or unpublished explicit version fails before installed state changes.
- The resolved release identity becomes the single identity used for asset selection, checksum/provenance verification, deployment, marker persistence, and final reporting.

### Agreement invariant

A successful `updated` result is valid only when all of the following identify the same release:

1. the user's requested selector;
2. the canonical resolved release;
3. the downloaded asset and its trusted checksum/provenance metadata;
4. the deployed installer binary and managed template state;
5. the persisted install marker; and
6. the version shown by the installed command and any marker-backed display.

The command must return a failure, not success, if it cannot establish this agreement. It must never write the target version into the marker merely because that version was requested.

### Already-current behavior

- If the resolved target is already installed and the updater can establish that the updater-managed state is coherent for that release, the command performs no replacement and reports `already current` with the resolved/installed version.
- An equal marker alone is not sufficient evidence when managed binary/template state is absent, inconsistent, or cannot be validated. Such a case must be reported as inconsistent and either repaired through the normal verified update transaction or fail without claiming `already current`.
- The `latest` path may need release resolution to determine that it is current; explicit-version handling must still validate that the requested release is a valid supported target according to the accepted design.

### Provenance and integrity

- Every deployable asset must be selected from the resolved release, not from the currently running binary or from an unrelated latest URL.
- Expected checksum/provenance metadata must come from the authoritative publication contract for that same resolved release.
- Downloaded bytes are staged and verified before any visible installed state is replaced.
- Missing integrity metadata, checksum mismatch, release/asset identity mismatch, or unsupported platform/architecture fails closed and leaves the prior installation active.
- Redirect, authentication, trust-root, and exact checksum-file rules belong in design after focused mapping; weakening or skipping verification on error is outside scope.

## Failure and rollback boundaries

The update operation has three externally meaningful stages:

1. **Resolve and acquire:** determine the target, download release material and provenance metadata, and verify staged bytes. Failures here must not alter installed binary, template, or marker.
2. **Replace managed state:** install the verified binary/template set as one bounded transaction. Until commit, the prior coherent installation must remain recoverable.
3. **Commit identity:** persist the install marker only after the deployed state for the target release is in place and validated. A marker must never lead the deployed payload.

Required failure semantics:

- Network, timeout, HTTP, download truncation, missing asset, and checksum/provenance failures return non-zero, identify the failed stage, and preserve the previous working installation and version report.
- Replacement failure must restore the complete previous updater-managed state; it must not leave a mixed old/new binary, template, and marker while reporting success.
- If rollback itself cannot restore coherence, the command returns non-zero, reports the affected managed paths and remediation, and must not claim either the old or requested release was successfully installed.
- Temporary/staged material must not become an authoritative installed version and should be cleaned safely without deleting the last recoverable state.
- Signal/interruption behavior during replacement must be included in the later atomicity design and test matrix.

## Package-manager ownership seam

This change defines the seam but does not implement Homebrew:

- The updater contract must distinguish a self-managed installation from an externally/package-manager-managed installation using explicit, testable ownership metadata or an equivalently reliable boundary; install-path guessing alone is insufficient.
- The design must enumerate each updater-managed artifact (at minimum executable, deployed template state, install marker, and rollback/staging state) and identify which operation reads or writes it.
- For an externally managed installation, `ein update` must not silently overwrite package-manager-owned artifacts. It must return a distinct observable outcome that allows the owning manager to perform the upgrade, while avoiding false success.
- The contract must expose enough stable facts for a later owner to decide whether `brew upgrade`, `ein update`, or a delegated flow is authoritative for each artifact. This change deliberately does not choose Homebrew's final policy.
- Ownership detection failure or conflicting ownership metadata must fail safely before mutation and provide actionable reporting.

This seam is the `CONTRACT_ACCEPTED` input for `homebrew-install-channel`; channel implementation still waits for this change to be `VERIFIED`.

## User-observable acceptance criteria

- [ ] Running the latest form resolves a canonical latest eligible release and traces that identity through verified asset selection, deployment, marker, and displayed version.
- [ ] Running the explicit-version form installs exactly the requested published/supported release and never silently substitutes latest or another version.
- [ ] After a successful update, the installed executable's version report and the banner/install marker report the resolved release; the deployed template/binary state comes from that same release.
- [ ] A coherent installation already at the resolved release produces a truthful `already current` result without unnecessary replacement.
- [ ] A matching marker with inconsistent managed state is not accepted as already current; the command either performs a verified repair transaction or fails explicitly.
- [ ] A nonexistent, malformed, unsupported, or unavailable explicit version exits non-zero before changing installed state.
- [ ] A network, timeout, HTTP, truncated-download, missing-asset, missing-checksum, checksum-mismatch, or provenance mismatch failure exits non-zero and retains the prior usable release and its truthful version report.
- [ ] No marker is advanced before the corresponding verified binary/template state is committed.
- [ ] A replacement failure yields either a fully restored prior state or an explicit rollback-failed result with remediation; it never reports update success for mixed state.
- [ ] A package-manager-owned installation is recognized at the ownership seam and is not silently overwritten by the self-updater.
- [ ] Output distinguishes at least `updated`, `already current`, `blocked by external owner`, and `failed` outcomes.
- [ ] Human-readable output identifies the requested selector, canonical resolved release when available, final installed version, outcome, and actionable failure stage without exposing secrets or misleadingly claiming success.
- [ ] Machine-observable exit status is zero only for successful `updated` and verified `already current` outcomes; blocked and failed outcomes are non-zero unless design establishes a separately documented, testable compatibility reason.

## Test surfaces for later phases

No tests or builds run in scope. Map/design/tasks must bound verification across these surfaces:

- **Pure contract/unit surfaces:** selector parsing and normalization, latest versus explicit resolution, release-to-asset selection, platform/architecture selection, checksum parsing/verification, ownership classification, result/status formatting, and state-transition rules.
- **Integration surfaces:** mocked release API and asset server; redirects and HTTP failures; timeout/truncation; missing and mismatched checksums; staging; executable/template/marker transaction ordering; rollback after failures injected at each replacement step; interruption handling; and externally managed ownership.
- **Installed-command surfaces:** latest update, explicit update (including a non-latest supported release), already-current no-op, inconsistent-marker repair/failure, unavailable version, network failure, checksum failure, and post-update version/banner agreement.
- **Release-contract surface:** fixture or published-asset-shape checks tying workflow-produced asset names and checksum metadata to updater resolution, without publishing a release in this change.
- Tests must prove both the successful target identity and preservation of the previous identity after failure; checking only exit text is insufficient.

## Review budget and work-unit boundary

- Production review budget: **400 changed lines** (insertions plus deletions), measured by the delivery Review Workload Guard.
- Test lines are forecast and reported separately and do not consume the 400-line production budget.
- Documentation, lockfile, generated-output, and workflow lines are also forecast separately; exclusions must not hide an oversized production change.
- Later tasks should preserve three coherent work units: **contract/resolution and ownership seam**, **verified acquisition plus atomic deployment/rollback**, and **observable verification matrix**. Tests stay with the behavior they verify.
- Work units do not preselect PR count or topology. If actual production change exceeds 400 lines, delivery policy decides whether to split; scope must not inflate its budget or solve the issue with an unrelated refactor.

## Explicit consumers and handoff gates

### `homebrew-install-channel`

- May begin ownership design only after this update contract is `CONTRACT_ACCEPTED`.
- Consumes the managed-artifact inventory, ownership classification seam, self-updater behavior for external ownership, release/provenance source, version-report contract, and rollback boundaries.
- Must not treat this change as a Homebrew policy decision or as evidence of a working channel.
- Channel implementation planning requires this change to be `VERIFIED`.

### `readme-release-ia`

- May describe corrected update behavior only after this change is `VERIFIED`.
- Consumes the exact accepted command semantics, supported outcomes, version/provenance guarantees, ownership limitation, and verified failure behavior.
- Must reference the final contract and verification identity rather than copy provisional implementation details.

The eventual handoff must reference the accepted design, verification artifact and verified revision/release identity, approved observable facts, remaining limitations, rollback state, and explicit non-claims.

## Scope exit criteria

- [ ] Reviewers agree that success requires one traceable release identity across request, resolution, verified payload, deployed state, marker, and displayed version.
- [ ] Latest, explicit-version, already-current, inconsistent-state, failure, atomicity, and rollback boundaries are explicit enough for focused mapping and design.
- [ ] The package-manager ownership seam prevents silent competing ownership without designing Homebrew itself.
- [ ] Test surfaces cover successful identity agreement and preservation/rollback failure paths.
- [ ] The 400-line production review budget and separate excluded-category reporting are recorded without choosing PR topology.
- [ ] `homebrew-install-channel` and `readme-release-ia` have explicit inputs and gates.
- [ ] All named non-goals remain outside this change.

## Risks

- The published asset/checksum format may not currently support the required provenance trace. Later mapping may identify a narrowly scoped release-contract adjustment, but release publication itself remains excluded.
- Multi-artifact replacement can expose crash windows. Design must prefer the smallest transaction that guarantees a coherent old or new state rather than a broad deployment rewrite.
- Marker-based ownership or version detection may be insufficient for legacy installs. Compatibility/migration behavior must be explicit and must not infer package-manager ownership from path alone.
- Supporting explicit downgrade targets may have compatibility or security implications. Mapping/design must define eligible supported releases without silently converting an explicit request to latest.
- Two future upgrade authorities can conflict. This scope supplies ownership facts and safe behavior, while `homebrew-install-channel` remains responsible for choosing the final Homebrew policy.
