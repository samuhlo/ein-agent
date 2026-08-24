status: mapped
scope_status: bounded
change: publish-installer-alpha
phase: map

# Map notes

## Scope and constraints

The implementation slice prepares `installer-v0.82.0-alpha.1`; it does not push tags, invoke GitHub Actions, read remote assets, or perform the real dogfooding installation. Delivery starts only after merge to `main`. Stable bootstrap behavior remains unchanged. The targeted installation is the managed Pi Ein tree (`~/.pi-ein/agent`, with the existing legacy migration path preserved); Claude Ein, vanilla homes, and client project settings are non-targets.

Canonical requirements are the `installer-release-channels` scenarios for prerelease eligibility/publication, installation-scoped channel vocabulary, and exact release selection. The change delta adds three seams: publication metadata coherence, exact-tag bootstrap selection, and Pi-target preference isolation.

## Exact implementation seams

### `.github/workflows/installer-release.yml`

- **Resolve release tag** (current resolver near lines 25–45): both `push` (`github.ref_name`) and `workflow_dispatch` (`inputs.release_tag`) converge here. Replace the final-only shape with one full SemVer installer-tag validation that accepts `installer-v0.82.0-alpha.1` and rejects malformed/unsupported forms before checkout/build.
- **Post-checkout metadata gate**: immediately after checkout and before the existing `Verify tagged commit is the tip of main`/build sequence, compare normalized tag against `installer/package.json`, `installer/src/core/version.ts`, and the leading `CHANGELOG.md` entry. Keep the current tagged-commit == `origin/main` guard and `allow_non_main_tag=true` hotfix escape hatch unchanged in meaning and ordering.
- **Publish release**: the sole `gh release create` command is the classification seam. Derive prerelease status from the validated SemVer prerelease portion and pass `--prerelease` only for prerelease tags; final tags must not receive it. Keep the six existing assets, title, notes, and resolved tag wiring.
- Workflow publication is code preparation only in this phase; tag push, workflow wait, and remote release/asset read-back are later delivery operations.

### Version pointers/changelog

- `installer/package.json` `version` currently `0.81.0`.
- `installer/src/core/version.ts` `INSTALLER_VERSION` currently `0.81.0`; this is also the runtime identity used by markers/version probes.
- Leading `CHANGELOG.md` release heading currently `[0.81.0]`; add the matching `0.82.0-alpha.1` entry at the top.
- These are the three authorized pointers. `tests/release-asset-contract.test.ts` already enforces agreement and publishable shape and should become prerelease-aware rather than pinning a literal. Per release skill, do not weaken or edit the contract merely to accept drift.

### `installer/install.sh`

- **URL construction in `main`** (current `base/url/checksum_url` block near lines 90–105) always uses `/releases/latest/download`. Add one explicit, validated tag/alpha selection input at this boundary. The selected tag must be normalized/eligible and must produce `/releases/download/<exact-tag>/<asset>` for both binary and `checksums.txt`; malformed or unsupported prerelease input must fail before any download.
- Preserve no-input behavior as `/releases/latest/download` for both files. Do not let binary and checksum resolve from different selectors.
- Keep platform detection, checksum manifest validation, WSL Linux branch, install destination, and non-TTY handoff intact. `tests/install-sh-checksum.test.ts` is the process/command-fixture seam: extend expected URL/base fixtures for exact-tag success, stable default, malformed input, and checksum binding. `tests/install-sh-wsl.test.ts` needs changes only if the preserved branch gains a direct assertion.
- Exact-tag bootstrap and checksum verification remain preparation/verification code; actual alpha installation into the Pi home is post-merge delivery.

### Targeted Pi Ein preference persistence/read-back

- `installer/src/core/release-channel-preference.ts` is the existing deterministic primitive and should be reused, not replaced: per-installation `release-channel-preference.json`, atomic temp write + fsync + rename + directory sync, exact-byte read-back, closed vocabulary (`stable|alpha`), and unavailable on malformed/unreadable/mismatched persistence.
- The narrow runtime read path is `installer/src/cli/update.ts`: it computes `installationPath` from explicit dependency, `agentDir`, or marker dirname; reads the preference before recovery/acquisition; and fails in `resolving` when unavailable. Preserve this fail-closed ordering and channel handoff to `runUpdateTransaction`.
- Read-back/reporting path is `installer/src/core/update-advisor-read.ts`, which resolves the same installation path and separates persisted preference from effective channel/evidence. `tests/release-update-contract.test.ts` and `tests/release-update-cli.test.ts` already cover child-process persistence, malformed/unreadable bytes, atomic mismatch, alpha resolution, and client bytes unchanged.
- The installation target seam is `installer/src/core/paths.ts` (`derivePiInstallPaths`, `resolvePiInstallContext`, `PiInstallContext.agentDir`) plus `installer/src/cli/install.ts` (`createPiInstallHandlers`, context guard, `pi.write-install-marker`). If alpha selection must be wired into installation, pass the resolved `context().agentDir` to the existing preference primitive and prove read-back there; do not use `~/.pi/agent`, `~/.claude-ein`, client paths, or a process-global store. The current install handler hard-codes `effects.marker("stable", context())`, so design must explicitly decide whether this slice only persists preference for update/read-back or adds a narrowly injected Pi-only preference step. Any such step must be before success is reported and must fail closed.
- `installer/src/core/version.ts` marker writing remains a separate marker contract; do not conflate marker `channel` with preference-file ownership without design evidence.
- Isolation fixtures must snapshot client settings and assert Claude/vanilla homes remain byte-for-byte unchanged. Existing `ein-pi`/`cc-ein` runtime-home adapters are boundaries to preserve, not implementation targets.

## Tests and verification seams (later phases)

- `tests/release-asset-contract.test.ts`: workflow tag regex/normalization, pointer agreement allowing full SemVer prerelease, prerelease flag classification, main-tip ordering/hotfix escape, and unchanged asset list.
- `tests/install-sh-checksum.test.ts`: latest stable default; exact prerelease tag URLs for binary and checksum; alpha/tag malformed and unsupported rejection before download; checksum still selects the requested asset. Keep command guards and temporary cleanup assertions.
- `tests/install-sh-wsl.test.ts`: only preserve/assert WSL Linux and `/dev/tty` behavior if the shell refactor touches those branches.
- `tests/release-update-contract.test.ts`: closed vocabulary, preference persistence/read-back, client isolation, and release eligibility; extend only for targeted Pi path if current fixtures do not identify it.
- `tests/release-update-cli.test.ts`: explicit installation path vs agent-dir fallback, alpha effective channel, fail-closed preference before recovery/network, marker/evidence isolation, and unchanged client bytes. This is the narrowest existing call-path coverage for Pi-target update behavior.
- Later apply/verify must run focused tests, root typecheck, installer typecheck, and full suite. No local production build is publication evidence.

## Code preparation vs post-merge delivery

**Code preparation:** workflow validation/coherence/prerelease classification; synchronized version/changelog; install.sh exact-tag URL/checksum binding with stable default; deterministic Pi-only preference persistence/read-back and isolation tests.

**Post-merge delivery only:** merge to `main`; create/push immutable `installer-v0.82.0-alpha.1` (never force-push/move it); wait for `installer-release.yml`; verify the GitHub Release is marked prerelease and all four binaries, `checksums.txt`, and `install.sh` are present; execute the explicit alpha/tag bootstrap and verify checksum; perform the targeted managed Pi Ein dogfooding installation and read back its preference/marker. Do not touch Claude Ein, vanilla Pi/Claude, or client homes.

## Risks / design questions for `sdd-design`

- One SemVer normalization/eligibility contract must not drift between workflow shell, install.sh, and TypeScript tests; decide the accepted explicit input vocabulary and tag normalization once.
- Existing release-channel source/tests are dirty and overlapping per scope evidence; layer edits on current bytes and never reset, clean, or overwrite unrelated work.
- The existing preference primitive is installation-path based while the install CLI has dynamic context/migration behavior; design must bind it to the resolved managed Pi `agentDir` and prove failure cannot report success.

ledger:
  reads:
    - { path: /Users/samu/.pi-ein/agent/skills/local/release/SKILL.md, lines: 55, estimated_tokens: 650 }
    - { path: /Users/samu/.pi-ein/agent/skills/local/github-workflow/SKILL.md, lines: 180, estimated_tokens: 2200 }
    - { path: /Users/samu/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 1200 }
    - { path: /Users/samu/.pi-ein/agent/skills/downloaded/document-writer/SKILL.md, lines: 95, estimated_tokens: 900 }
    - { path: /Users/samu/.pi-ein/agent/skills/downloaded/hono/SKILL.md, lines: 260, estimated_tokens: 2600 }
    - { path: openspec/changes/publish-installer-alpha/scope.md, lines: 105, estimated_tokens: 2100 }
    - { path: openspec/changes/publish-installer-alpha/preflight.json, lines: 5, estimated_tokens: 80 }
    - { path: openspec/changes/publish-installer-alpha/specs/installer-release-channels/spec.md, lines: 36, estimated_tokens: 500 }
    - { path: openspec/specs/installer-release-channels/spec.md, lines: 51, estimated_tokens: 900 }
    - { path: .github/workflows/installer-release.yml, lines: 126, estimated_tokens: 1500 }
    - { path: installer/install.sh, lines: 169, estimated_tokens: 1800 }
    - { path: installer/src/core/release-channel-preference.ts, lines: 112, estimated_tokens: 1200 }
    - { path: installer/package.json, lines: 25, estimated_tokens: 250 }
    - { path: installer/src/core/version.ts, lines: 79, estimated_tokens: 700 }
    - { path: CHANGELOG.md, lines: 35, estimated_tokens: 500 }
    - { path: tests/release-asset-contract.test.ts, lines: 300, estimated_tokens: 3300 }
    - { path: tests/install-sh-checksum.test.ts, lines: 400, estimated_tokens: 4200 }
    - { path: tests/install-sh-wsl.test.ts, lines: 23, estimated_tokens: 180 }
    - { path: tests/release-update-contract.test.ts, lines: 740, estimated_tokens: 7600 }
    - { path: installer/src/cli/install.ts, lines: 520, estimated_tokens: 5200 }
    - { path: installer/src/cli/update.ts, lines: 245, estimated_tokens: 2400 }
    - { path: installer/src/core/paths.ts, lines: 160, estimated_tokens: 1500 }
    - { path: installer/src/main.ts, lines: 145, estimated_tokens: 1400 }
    - { path: tests/release-update-cli.test.ts, lines: 310, estimated_tokens: 3200 }
  webfetch_used: false
  budget_consumed: { tokens: 41420, reads: 24 }
  budget_exceeded: true

skill_resolution: paths-injected
