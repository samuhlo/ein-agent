# Design — rename-ein-runtime-surfaces

**Change:** `rename-ein-runtime-surfaces`  
**Phase:** design  
**Lane:** standard  
**TDD:** strict

## A. Proposal

### Intent

Complete the Ein-first product vocabulary as one atomic rename: the advanced
runtime surfaces become `ein-pi`, `ein-cc`, and `ein-cc-sdd`, while `ein`
remains the normal public door and `ein-install` remains the independent
bootstrap and repair hatch. The release must upgrade installer-owned alpha
artifacts safely without moving either runtime's data.

### Problem statement

The current runtime-first names (`pi-ein`, `cc-ein`, and `cc-ein-sdd`) invert
the hierarchy already established by `ein`, `ein-install`, and the existing
`ein-pi/` core tree. Those retired names are coupled to source roots, generated
Claude output, installer inventory, payload members, tests, CI, help and public
documentation, so a partial rename would publish two incompatible product
languages. Upgrade cleanup is also safety-sensitive: an exact old Fish function
name does not by itself prove that Ein still owns the user's file.

### Scope

**In scope:**

- Integrate the Pi adapter at exactly `ein-pi/ein-pi.fish`,
  `ein-pi/migrate.ts`, and `ein-pi/README.md`; remove the obsolete top-level
  `pi-ein/` source root after its owned files move.
- Rename the Claude adapter root to `ein-cc/`, its launcher to
  `ein-cc/ein-cc.fish`, and its deterministic command to `ein-cc-sdd`.
- Rename current product-coded identifiers, payload/build/archive paths,
  subprocess arguments, generated-surface stamps, installer inventory, CI,
  E2E and release contracts to Ein-first order.
- Install only the new entry points on fresh installs. Upgrade, update,
  uninstall and recovery may recognize exact retired artifacts only through a
  bounded legacy classifier; no compatibility alias is installed.
- Regenerate the checked-in Claude surface from renamed authoritative inputs.
- Synchronize structured deltas for `installer-runtime`, `public-entry`,
  `surface-wiring`, `sdd-lifecycle`, and `style-delivery`; update every live
  documentation and contract surface; add a typed retired-reference audit.
- Deliver the complete verified result as `0.91.0-alpha.3` through the existing
  installer release workflow.

**Out of scope / preserved:**

- No rename, copy, migration or reinitialization of `~/.pi-ein/agent` or
  `~/.claude-ein`; no change to `PI_CODING_AGENT_DIR`,
  `EIN_PI_AGENT_HOME`, or `CLAUDE_CONFIG_DIR` and their current meanings.
- No change to the roles of `ein` and `ein-install`, runtime behavior, SDD
  lifecycle semantics, session data, auth, secrets or user-managed assets.
- No legacy command forwarding, deprecation wrapper or shell alias.
- No mechanical rename of generic Claude abbreviations whose meaning is not the
  retired product identity. Internal product-coded forms such as `CC_EIN_HOME`
  do become `EIN_CC_HOME`; the three stable isolation variables above do not.
- No edits to immutable `openspec/changes/archive/` history or to
  `openspec/changes/fix-overlay-repaint-recovery/`. The protected active-change
  tree receives no mutations from this change and no blanket naming-audit
  exemption.

### Affected areas

- Runtime owners: obsolete `pi-ein/`, existing `ein-pi/`, renamed `ein-cc/`,
  SDD CLI, continuity runner, adapter sources, commands and generated
  `CLAUDE.md`.
- Installer: launcher writer/callers, install plan and journal boundaries,
  update/uninstall/recovery inventory, payload inventory and staging, asset
  declarations, bundle/smoke scripts, package scripts and completion output.
- Delivery: root and installer type surfaces, `.github/workflows/ci.yml`,
  `.github/workflows/installer-release.yml`, Docker/E2E fixtures and release
  asset contracts.
- Current contracts and narrative: selected OpenSpec domains, `README.md`,
  `EIN.md`, `CHANGELOG.md`, live `docs/`, the public docs site, adapter READMEs,
  help/errors, active evaluation fixtures, navigation and search labels.

### Risks

- A broad substitution could corrupt the intentionally stable Pi data-home path,
  environment APIs, generic `cc` abstractions or historical evidence.
- Deleting an old homonymous Fish function based only on its path could destroy
  user code; following symlinks during classification could escape the intended
  cleanup boundary.
- Renaming Claude source without its generator, BunFS declarations, manifest,
  staging archive, build callers and CI can leave source tests green while the
  published installer is unusable.
- Intermediate groups necessarily expose mixed vocabulary. Publishing or
  generating release assets from such a state would ship a split contract.
- Current specs outside the five explicitly selected domains may contain search hits. They
  cannot be hand-edited or silently added beyond the canonical-context cap.

### Rollback and failure handling

Before publication, reverting the integrated change and retaining
`0.91.0-alpha.2` restores the previous product surface. During a local upgrade,
new entry points are materialized and read back before any legacy cleanup.
Proven legacy files are moved through a private transaction recovery area before
final removal; a later failure restores those exact bytes, and rollback never
touches either data home or an unproved collision. A failed ownership check is a
preserve-and-diagnose result, not an override prompt.

After publication, the tag is immutable: `installer-v0.91.0-alpha.3` is never
moved or force-republished. A release or post-publication smoke failure is fixed
with the repository's next alpha/version recovery convention, not by changing
the tag in place.

### Success summary

A fresh or upgraded managed installation starts normally with `ein`, offers
advanced direct access only through `ein-pi` and `ein-cc`, exposes
`ein-cc-sdd`, preserves both isolated homes, and contains no installer-published
old alias. All generated, payload, CI, current-spec and documentation surfaces
agree, the typed audit accounts for every live retired spelling, and the alpha
is published only from the fully verified integrated commit.

### Canonical spec context

The design reuses the three-domain selection recorded in `scope.md` and
classifies the mapped `sdd-lifecycle` and `style-delivery` hits as current
observable behavior, not `data-home` or `legacy-migration` evidence. The user's
explicit request for an integral product-wide rename authorizes a one-change
exception from the normal three-domain/32 KiB context limit: exactly these five
domains and 72,456 UTF-8 bytes are admitted. This does not authorize a sixth
domain, broad canonical scanning, truncation, archive edits, or a reusable cap
exception for later changes. Structured deltas under this change are the only
authorized canonical mutations in this design.

| Domain | Canonical path | SHA-256 | UTF-8 bytes | Delta |
| --- | --- | --- | ---: | --- |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `9578bba7dc458618dacbd7e214662fc1ee9a412c1b9b9b7974bd8bb1ed7f9862` | 8,741 | Add owned-legacy cleanup; rename Pi and Claude installation scenarios |
| `public-entry` | `openspec/specs/public-entry/spec.md` | `ececde326c31c4b640182b0d1bbdf606566640ad5df539440c40ff509a5745a9` | 2,350 | Keep runtime shims secondary and use Ein-first names |
| `surface-wiring` | `openspec/specs/surface-wiring/spec.md` | `2229a2dc97b905b083d5e77a3ee4a3555dce581205447b047510fa5d1a054b0c` | 6,036 | Rename the deterministic persistence command |
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `e640054ec7719da9a4198c4d27575a7c738b04e13e55abcf52d06190a0061c82` | 51,683 | Rename current `cc-ein-sdd sync` behavior and generated `cc-ein/CLAUDE.md` paths |
| `style-delivery` | `openspec/specs/style-delivery/spec.md` | `69107860f9be226ccf6ff4dc9fbe8c0bbb28af6d558e43cd32eec9e8f6a94ab3` | 3,646 | Rename the current payload-closure import from `cc-ein/sync.ts` to `ein-cc/sync.ts` |

## B. Spec

### Requirement 1 — Public hierarchy and hard cut

The system MUST keep `ein` as the single command in normal first-run,
post-install and top-level start guidance, MUST keep `ein-install` independently
runnable for bootstrap and repair, and MUST expose `ein-pi`, `ein-cc`, and
`ein-cc-sdd` as the only current runtime-specific command names. It MUST NOT
install or advertise an alias for `pi-ein`, `cc-ein`, or `cc-ein-sdd`.

**Scenario**

- **Given** Ein is freshly installed for Pi, Claude Code or both,
- **When** a user reads completion/help/start guidance or directly enters a
  runtime,
- **Then** normal guidance says `ein`, advanced guidance uses only the applicable
  Ein-first shim, `ein-install` remains available, and no retired alias was
  published.

### Requirement 2 — Single Pi ownership tree

The repository MUST own the Pi launcher, migration helper and adapter README at
exactly `ein-pi/ein-pi.fish`, `ein-pi/migrate.ts`, and `ein-pi/README.md`, and
MUST NOT retain a current top-level `pi-ein/` source tree or create a nested
second `ein-pi` concept.

**Scenario**

- **Given** the existing `ein-pi/` portable core and the three obsolete Pi
  adapter files,
- **When** the rename is integrated and packaged,
- **Then** imports and bundle inventory resolve the three exact final paths,
  direct launch is `ein-pi`, and the obsolete source root is absent.

### Requirement 3 — Claude root, deterministic CLI and generated parity

The repository and installed runtime MUST use `ein-cc/` as the Claude adapter
root, `ein-cc/ein-cc.fish` as its launcher source, and `ein-cc-sdd` as the
deterministic executable and every associated usage/argv value. The checked-in
Claude surface MUST be regenerated from the renamed core and adapter inputs and
MUST match generator output.

**Scenario**

- **Given** the authoritative shared coordinator and renamed Claude adapter
  input,
- **When** the Claude sync/generation boundary runs,
- **Then** it emits the renamed generated stamp, command policy and SDD argv,
  installs `ein-cc-sdd`, and the parity check reports no direct-output drift.

### Requirement 4 — Isolation compatibility

The system MUST preserve the Pi home `~/.pi-ein/agent`, the Claude home
`~/.claude-ein`, and the environment contracts `PI_CODING_AGENT_DIR`,
`EIN_PI_AGENT_HOME`, and `CLAUDE_CONFIG_DIR` byte-for-byte in meaning. A command
rename MUST NOT move, copy, reset or relabel runtime state.

**Scenario**

- **Given** existing auth, sessions and settings in both isolated homes,
- **When** either renamed launcher runs or a managed old alpha upgrades,
- **Then** each runtime resolves the same home through the same environment
  contract and all pre-existing state remains in place.

### Requirement 5 — Fresh installer, payload and build identity

A fresh installer MUST source and publish `ein-pi.fish`, `ein-cc.fish`, and
`ein-cc-sdd`; its Claude payload roots, manifest members, staging archive,
asset declarations, bundle inputs, subprocess paths, CI and release assertions
MUST use the Ein-first identity. Product identifiers MUST follow
`PiEin`→`EinPi`, `CcEin`→`EinCc`, `piEin`→`einPi`, `ccEin`→`einCc`,
`PI_EIN`→`EIN_PI`, and `CC_EIN`→`EIN_CC` when they denote these surfaces.

**Scenario**

- **Given** a clean checkout with no previously built payload,
- **When** installer bundles and platform assets are built and smoke-tested,
- **Then** the archive manifest contains only current source/member identities,
  staged sync resolves `ein-cc/sync.ts`, the generated binary is
  `ein-cc-sdd`, and no fresh artifact depends on a retired current path.

### Requirement 6 — Deterministic legacy classification

The system MUST classify each exact retired artifact before cleanup and MUST
remove it only with deterministic Ein ownership or known-content proof. It MUST
reject symlinks, non-regular files, path broadening and substring matches as
cleanup proof. An unproved homonymous user artifact MUST remain byte-identical
and SHOULD produce one bounded diagnostic.

**Scenario**

- **Given** one managed old launcher, one modified or unrelated function at an
  old launcher path, and a managed old SDD binary,
- **When** upgrade, uninstall or recovery classifies the retired inventory,
- **Then** only the artifact with valid exact proof enters cleanup, the user
  collision is preserved byte-for-byte with a diagnostic, and no neighboring
  path is considered.

### Requirement 7 — New-first recoverable upgrade

The supported upgrade path MUST materialize and validate all selected new
surfaces before retiring any proven old surface. Legacy cleanup MUST be
transactionally recoverable until the install journal commits success; a failed
new deployment or later selected step MUST leave either the coherent old
installation or the coherent new installation, never a state produced by
blindly deleting both entry points.

**Scenario**

- **Given** a managed `0.91.0-alpha.2` installation selected as Pi-only,
  Claude-only or both,
- **When** upgrade to `0.91.0-alpha.3` succeeds or fails at an injected boundary,
- **Then** success leaves usable new entry points and removes only proven old
  artifacts, while failure restores quarantined legacy bytes and preserves all
  user-owned collisions and runtime state.

### Requirement 8 — Current specs, documentation and typed reference audit

All current specifications, generated surfaces, help/errors, tests, internal
documentation and public documentation MUST use the Ein-first vocabulary for
current behavior. Every non-archived occurrence of a retired spelling MUST be
reported by a deterministic audit and accepted only as typed `data-home` or
typed `legacy-migration` evidence with an exact bounded reason; unclassified
occurrences MUST fail the gate. Archived change provenance MUST remain
byte-identical.

**Scenario**

- **Given** the integrated repository including code, tests, docs, generated
  files and active change artifacts,
- **When** the naming audit enumerates retired spellings,
- **Then** it reports path and context for every match, accepts only registered
  stable-home or bounded-cleanup evidence, excludes immutable archive history
  rather than rewriting it, and fails on any stale current usage or broad
  exclusion.

### Requirement 9 — Structured specification synchronization

The system MUST apply structured deltas for `installer-runtime`, `public-entry`,
`surface-wiring`, `sdd-lifecycle`, and `style-delivery` through the structured
OpenSpec sync path. The `sdd-lifecycle` delta MUST rename current
`cc-ein-sdd sync` behavior to `ein-cc-sdd sync` and current generated
`cc-ein/CLAUDE.md` paths to `ein-cc/CLAUDE.md`; the `style-delivery` delta MUST
rename the current payload-closure import from `cc-ein/sync.ts` to
`ein-cc/sync.ts`. The system MUST NOT hand-edit archive provenance or an
unselected canonical domain.

**Scenario**

- **Given** the five exact validated deltas authorized for this change,
- **When** canonical synchronization runs,
- **Then** the selected scenarios express the renamed installer, secondary shim
  and `ein-cc-sdd summary` behavior, the SDD lifecycle invokes
  `ein-cc-sdd sync` and generates `ein-cc/CLAUDE.md`, style delivery closes over
  imports from `ein-cc/sync.ts`, and archived changes plus unselected domains
  remain untouched.

### Requirement 10 — Strict TDD and atomic alpha delivery

Implementation MUST preserve RED → GREEN → TRIANGULATE → REFACTOR evidence for
each small behavior seam and MUST pass focused, full-suite, type, payload,
documentation, fresh-install, upgrade and release-asset gates on the integrated
commit before version `0.91.0-alpha.3` is tagged or published. The tag MUST use
`installer-v0.91.0-alpha.3`, point at the verified tip of `main`, and publish as
a GitHub prerelease through the existing workflow.

**Scenario**

- **Given** the three internal groups are integrated but the alpha is not yet
  tagged,
- **When** any required gate fails or the three authoritative version pointers
  disagree,
- **Then** publication does not begin; only an all-green integrated commit may
  receive the immutable alpha tag and proceed to published-artifact smoke.

## C. Decisions

### D1 — Hard cut: no old aliases

`ein-pi`, `ein-cc`, and `ein-cc-sdd` are the complete current direct-runtime
surface. Old names are recognized only as installer migration inputs and test or
release-note evidence. A warning wrapper was rejected because it would keep two
callable vocabularies, weaken the audit and turn a product rename into an
unbounded compatibility promise. This alpha is the deliberate cut point.

An unowned user function left at an old path is not an Ein compatibility alias:
the installer neither advertises nor changes it.

### D2 — Pi adapter files join the existing owner directly

The final Pi paths are fixed as `ein-pi/ein-pi.fish`, `ein-pi/migrate.ts`, and
`ein-pi/README.md`. `ein-pi/` already owns the core and runtime, so direct
integration produces one coherent owner and keeps current installer imports
short. A nested `ein-pi/ein-pi/`, a new `adapters/pi/` abstraction, and leaving
the migration helper under `pi-ein/` were rejected as duplicate concepts or a
partial rename.

### D3 — Claude moves as one generator/payload unit

The entire current Claude adapter tree moves to `ein-cc/`; the internal shape is
preserved. `ein-cc/CLAUDE.adapter.md` and shared core sources remain
authoritative, `ein-cc/sync.ts` remains the compiler/sync boundary, and
`ein-cc/CLAUDE.md` is regenerated output. Direct edits to the generated file
alone are invalid.

The source move, generated stamp, `ein-cc-sdd` compilation, continuity argv,
command allow-tools, payload inventory and release BunFS asset form one
coherence boundary. They may be implemented in small seams, but no old-root
fallback is allowed in the released artifact.

### D4 — Product identifiers rename; stable integration APIs do not

Code symbols follow the map whenever they encode the retired surface identity,
including payload constants/functions, plans, fixtures, error codes and build
tokens. Thus `CC_EIN_PAYLOAD_*` becomes `EIN_CC_PAYLOAD_*` and internal
`CC_EIN_HOME` becomes `EIN_CC_HOME`. Generic filenames and concepts such as
`cc-payload.ts` may remain because `cc` there means Claude Code, not the retired
`cc-ein` product name.

`PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, and `CLAUDE_CONFIG_DIR` are explicit
compatibility APIs and are exempt from the mechanical identifier map.

### D5 — One fail-closed legacy artifact classifier owns cleanup policy

Install, update, uninstall and recovery MUST reuse one pure classification
contract over an exact legacy inventory. Its result is discriminated as
`absent`, `owned`, or `collision`, with the proof carried in the `owned` case.
The classifier canonicalizes the expected path without following it and admits
only an exact regular file.

Proof is artifact-specific:

- Old Fish launchers outside a runtime home require exact bytes or SHA-256 from
  a versioned allowlist of shipped artifacts, initially the exact
  `0.91.0-alpha.2` launchers exercised by the upgrade fixture. A
  completed install-journal step alone is insufficient because a user may have
  modified the file later.
- The old `~/.claude-ein/bin/cc-ein-sdd` may use deterministic managed ownership:
  an exact real path under the marked Claude home, a valid Ein install marker
  whose version is in the explicit legacy-release allowlist (initially only
  `0.91.0-alpha.2`), exact managed-inventory membership,
  regular-file/no-symlink checks, and no path escape. Known binary content proof
  MAY additionally strengthen this classification but is not required because
  local Bun compilation is platform/toolchain dependent.
- Retired payload/staging members are cleanable only inside the installer's own
  newly created staging/recovery root and by exact inventory entry.

Path equality, filename shape, executable mode, marker presence outside the
managed root, substring search, or user confirmation are not proof. A collision
never becomes an error that invites a destructive override; it is preserved and
reported.

### D6 — Cleanup is new-first and recoverable

The managed plan/journal boundary owns ordering. For each selected runtime, the
new launcher/runtime/SDD executable is written and read back (and the SDD help
probe succeeds where applicable) before cleanup becomes eligible. Each `owned`
legacy artifact is moved to an exact private recovery path tied to the current
transaction rather than immediately unlinked. Completion removes the recovery
copy; a later failure restores its original bytes and metadata. A `collision`
adds no move entry.

Fresh install never materializes legacy inventory. Uninstall lists new managed
assets normally and adds retired assets only after the same classifier returns
`owned`; recovery replays the recorded exact move set rather than rescanning a
directory. This extends the existing journal/recovery responsibility instead of
creating cleanup logic in launcher code.

Immediate unlink was rejected because a later combined-runtime failure could
not restore the previously usable command. Treating every old path as part of
the uninstall allowlist was rejected because existence is not ownership.

### D7 — Payload identity changes end to end

The product-coded bundle script becomes
`installer/scripts/bundle-ein-cc.ts`; archive/member/source identifiers become
Ein-first, including `ein-cc-runtime.tar.gz`, while the already Ein-first
manifest format may retain its compatible version unless its schema changes.
Every caller in package scripts, `build-all`, assets declarations, staging,
smoke, CI, E2E and release assertions changes together. No compatibility read of
the old archive name is part of a fresh build; the legacy classifier may name an
old installed artifact only for bounded upgrade cleanup.

### D8 — The naming audit is typed evidence, not a zero-match grep

The audit enumerates the union of repository live files needed to catch both
tracked and not-yet-tracked source, while excluding `.git`, dependency/build
caches and immutable `openspec/changes/archive/` by exact root. It does not
exclude source, tests, docs, generated files, the current change, or the
protected active-change tree broadly.

Every accepted match is registered with an exact path/context predicate, a
class and a reason:

- `data-home`: only the stable `.pi-ein/agent` path/segments or prose explicitly
  describing that stable home;
- `legacy-migration`: only exact legacy constants, classifiers, collision/
  upgrade fixtures, or clearly labelled migration/release-note prose.

Legacy code constants must include `LEGACY` in their symbol names. The registry
cannot allow a directory wildcard or accept a current command example. The
audit prints file, line/context and classification so a passing gate remains
reviewable. Immutable archives are outside the live result, not rewritten into
compliance.

### D9 — Current narrative changes as one product contract

Root README/EIN/changelog, live internal docs, docs-site pages, runtime READMEs,
help/usage/errors, active evaluations, file trees, links, headings, navigation
and search labels all move to current vocabulary. Top-level and completion copy
lead with `ein`; only an advanced runtime section introduces `ein-pi` or
`ein-cc`. `0.91.0-alpha.3` release notes may name old commands solely in a
clearly labelled upgrade statement explaining the hard cut, safe owned cleanup
and unchanged data homes.

The protected `fix-overlay-repaint-recovery` tree remains byte-identical. If it
still produces an unclassified audit hit, delivery waits for its owner to
archive or reconcile it; this change does not mutate it or hide it.

### D10 — Structured deltas remain the canonical spec authority

The five exact deltas are synchronized through `ein-cc-sdd sync` after its
rename is live. The two added domains are justified because their old spellings
are executable/current contracts: `sdd-lifecycle` names the callable sync
command and generated coordinator path, while `style-delivery` names the source
whose import closure must ship. They are not historical mentions. The user's
integral-rename request is the explicit authority for this one five-domain
exception; no additional domain is implied. Archived changes remain historical
evidence, not documentation to modernize.

### D11 — Strict TDD proceeds in small seams inside three non-releasable groups

Every seam records RED before production edits, reaches the narrow GREEN,
triangulates with at least the named negative/collision case, then refactors
while focused tests remain green. The groups define review boundaries, not
independent versions:

| Group | Small behavior seams | Required focused proof before hand-off |
| --- | --- | --- |
| Runtime | current-name/help and stable-home contracts; Pi file integration; Claude root/CLI argv; generated parity | direct Fish launch behavior, missing-runner errors, SDD dispatch/help, continuity handoff, exact home/env assertions, generator parity |
| Installer/delivery | legacy classifier; fresh launcher inventory; Pi/Claude/both upgrade transaction; uninstall/recovery; payload/build/CI identity | known old bytes removed, modified/unowned collision preserved, injected rollback, fresh install has no old alias, manifest/archive members and compiled payload smoke agree |
| Specs/narrative | structured spec sync; internal/public documentation; typed audit; version/release gate | selected canonical scenarios updated, docs build/link checks green, every old match typed, all version pointers and release assets coherent |

No group may tag, publish or claim the product rename independently. The final
candidate is the union of all three and must be verified again as one worktree.

### D12 — `0.91.0-alpha.3` is the only delivery identity

Only after integrated verification, the three authoritative pointers
`installer/package.json`, `installer/src/core/version.ts`, and the leading
`CHANGELOG.md` entry become `0.91.0-alpha.3`. The tag is
`installer-v0.91.0-alpha.3`, must point to the verified tip of `main`, and uses
the existing workflow's prerelease classification, checksums, BunFS smoke and
asset publication. Building locally, changing version pointers, or creating a
tag without published-asset smoke is not delivery.

## D. Success Criteria

Acceptance is observable when all of the following hold:

- The final repository paths are exactly the Pi and Claude paths fixed above;
  direct launcher and SDD help/error/argv tests contain only current names, while
  isolation assertions still resolve `~/.pi-ein/agent`, `~/.claude-ein` and the
  three stable environment variables.
- Focused strict-TDD evidence exists for each seam in D11, including negative
  tests for symlink/non-regular/path-escape cleanup, a modified old Fish
  function, an unrelated homonymous function, a failed new deployment and a
  failure after legacy quarantine.
- Fresh Pi-only, Claude-only and combined install fixtures create
  `ein-pi.fish`, `ein-cc.fish`, and `ein-cc-sdd` as applicable, center completion
  on `ein`, and never create an old alias.
- Upgrade fixtures from a genuinely managed `0.91.0-alpha.2` layout cover
  Pi-only, Claude-only and combined selection. Success removes only proven old
  artifacts; every injected failure restores a coherent launchable state; user
  collisions and both data homes compare byte-for-byte.
- The renamed Claude generator output is reproduced from authoritative inputs;
  payload bundle/stage/manifest/archive, assets declarations, CI, E2E and release
  smoke resolve only Ein-first current identities.
- Structured sync makes the five selected canonical specs match their deltas,
  including `ein-cc-sdd sync`, `ein-cc/CLAUDE.md`, and `ein-cc/sync.ts` in the
  two explicitly added current-behavior domains.
  `openspec/changes/archive/` and the protected active-change tree have no bytes
  changed by this change.
- README, EIN, changelog, live docs, docs site, runtime READMEs, help, current
  evaluations, navigation/search and troubleshooting agree on `ein` as the
  door and Ein-first advanced shims. The docs site builds without broken links
  or stale generated labels.
- The typed naming audit fails on an injected stale current example and, on the
  real tree, reports only exact `data-home` and `legacy-migration` cases. No
  broad source/test/docs exclusion is accepted.
- Integrated verification is green with the repository's focused runtime,
  installer, upgrade, uninstall, payload, documentation and release-contract
  tests, followed by `bun test`, `bun run typecheck`,
  `cd installer && bun run typecheck`, `cd installer && bun run build:all`, the
  compiled Claude payload smoke, the public docs-site build, and the existing
  release-asset/E2E checks.
- Manual integrated inspection confirms `ein --help`, `ein-install --help`,
  install completion, `ein-pi`, `ein-cc`, and `ein-cc-sdd --help`; no inspected
  output presents a retired name as current.
- Only after those gates, the three version pointers agree on
  `0.91.0-alpha.3`; `installer-v0.91.0-alpha.3` points at the verified tip of
  `main`; the GitHub release is a prerelease with four installer binaries,
  `checksums.txt`, and `install.sh`; checksums verify and a published-artifact
  fresh/managed-upgrade smoke confirms the same naming and state-preservation
  contract.

## Phase boundary

This design writes no source, test, canonical spec, documentation, generated
surface, version, build, Git tag or release state. Executable task slicing
belongs to `sdd-tasks`; implementation and RED/GREEN evidence belong to
`sdd-apply`.
