# OpenSpec Specification
format: openspec-spec/v1
domain: installer-runtime-coherence

## Scenario: clean-staged-install-completes-with-doctor
title: Clean staged installation completes with doctor
requirement: The system MUST complete a clean staged installation only when the deployed current-source bundle passes the installer doctor under the selected Linear integration state.
Given: The installer stages a clean Pi Ein home from the current source bundle with Linear integration either off or on.
When: Deployment, state persistence, and the post-install doctor run in their normal order.
Then: The doctor reports no false coherence failures for removed work-mode artifacts, and the installation reaches its completed state.

## Scenario: doctors-verify-current-linear-runtime-contract
title: Doctors verify the current Linear runtime contract
requirement: The system MUST make both installer and runtime doctors validate the deployed linear-integration module and dynamic prompt-injection contract instead of requiring the removed mode module or static orchestrator wording.
Given: A staged Pi Ein runtime was bundled from the current source tree.
When: The installer doctor or runtime doctor checks runtime coherence.
Then: A complete current runtime passes these checks, while a missing canonical module or missing dynamic injection seam is reported as a coherence failure.

## Scenario: installer-persists-canonical-linear-selection
title: Installer persists the canonical Linear selection
requirement: The system MUST present Linear integration as an optional off/on installer choice, persist the selected value using the canonical linear state, and report that same selection without exposing the removed solo/team work-mode vocabulary.
Given: A user performs an interactive or defaulted Pi Ein installation and chooses whether Linear integration is enabled.
When: The installer configures and summarizes the deployed runtime.
Then: The persisted global state contains the selected canonical linear value of off or on, and the installer summary describes the matching Linear integration state.

## Scenario: linear-state-compatibility-remains-fail-closed
title: Linear state compatibility remains fail-closed
requirement: The system MUST accept valid legacy solo/team state through the existing compatibility mapping while treating malformed or unreadable Linear integration evidence as invalid for coherence verification.
Given: The deployed runtime encounters canonical Linear state, legacy work-mode state, or malformed persisted state.
When: It resolves the integration for compatibility and a doctor verifies the evidence.
Then: Canonical off/on and legacy solo/team values map to the intended integration state, but malformed or unreadable evidence cannot produce a successful doctor result.

## Scenario: pi-runtime-dependencies-remain-reproducible
title: Pi runtime dependencies remain reproducible across install and update
requirement: The system MUST install the compatible Pi host and every Ein-owned Pi package using exact versions inside the selected isolated agent home, replace stale or unversioned Ein package declarations during update, preserve unrelated user package declarations, fail a fresh installation when package reconciliation fails, and make both doctors fail when the deployed or installed package drifts from the compatible set.
Given: A clean installation or an existing settings file with unversioned, stale, extra, or malformed package declarations.
When: The installer deploys or updates the Pi runtime and reconciles user settings.
Then: The Pi host command and all Ein-owned package declarations use the exact compatible versions, package installation receives the selected isolated Pi home, unrelated valid user declarations survive in order, malformed saved package state cannot erase the template contract, a failed reconciliation cannot be reported as a successful fresh install, and both doctors report declaration or installed-version drift as a failure.
