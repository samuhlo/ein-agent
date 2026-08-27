# Scope — rename-ein-runtime-surfaces

## SCOPE PACKET

```yaml
scope: >-
  Coordinate the product-wide rename of the advanced runtime surfaces from
  pi-ein to ein-pi and cc-ein to ein-cc, including cc-ein-sdd to ein-cc-sdd,
  while preserving ein as the public entry, ein-install as the bootstrap and
  repair hatch, and the existing isolated data homes.
change_name: rename-ein-runtime-surfaces
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
webfetch: false
```

## Scope status

This scope is **ready as one coordinated, atomic change**. A structure-first
search found 113 non-archived files containing `pi-ein` or `cc-ein`; four belong
to the independent active change `fix-overlay-repaint-recovery` and must not be
touched. The remaining candidate surface exceeds the default 50-file review
forecast, but the user explicitly authorized the integral rename "in
documentation and everywhere", its delivery, and the new alpha. That explicit
authority is the recorded review-workload override for one SDD change and one
atomic delivery.

The override does not authorize a monolithic patch. Apply must proceed through
the three ordered internal groups below, keeping each edit/test cycle small and
reviewable, then run one integrated verification before delivery. No group is an
independent child change, PR, tag, or releasable state.

The count is an upper bound, not a claim that every match is stale: references
to the preserved data home `~/.pi-ein/agent` are intentionally valid, and every
match must be classified before mutation. Archived OpenSpec changes are excluded
from the count and remain immutable historical evidence.

## Preflight and project context

- Per-change preflight is present and authoritative:
  `preflight.json` records `tdd: strict`; `lane.json` records `standard`.
- The project is a Bun-managed TypeScript/ESM repository. Root verification uses
  `bun test` and `bun run typecheck`; the installer also requires
  `cd installer && bun run typecheck`.
- `openspec/config.yaml` exists and records `strict_tdd: true`. This scope phase
  records that posture only; it does not run tests, builds, typechecks, bundling,
  installation, or release commands.
- Linear is not part of this change. The local board is `openspec/changes/`, Git,
  and `EIN.md`.
- Repository documentation is Spanish by convention; code and identifiers are
  English. This scope artifact uses English for continuity with current SDD
  artifacts.

## Problem statement

Ein's product hierarchy already says that `ein` is the single public door and
`ein-install` is the independently runnable bootstrap/repair hatch, but the
runtime-specific surfaces still use the inverse noun order:

- Pi's advanced launcher and adapter directory use `pi-ein`.
- Claude's advanced launcher and adapter directory use `cc-ein`.
- Claude's deterministic SDD CLI is exposed as `cc-ein-sdd`.
- Installer paths, payload inventory, generated/runtime assets, tests, canonical
  specifications, internal documentation, and public documentation repeat those
  names as if they were current product vocabulary.

This creates a product language in which the umbrella product is sometimes the
prefix (`ein`, `ein-install`, `ein-pi/`) and sometimes the suffix (`pi-ein`,
`cc-ein`). It also makes the installer advertise secondary runtime launchers
instead of the main `ein` entry.

The rename has one structural complication: top-level `ein-pi/` already owns the
portable core and Pi runtime implementation. The existing three-file `pi-ein/`
adapter cannot be renamed with a filesystem move onto that directory; its
launcher, migration helper, and README must be deliberately integrated into the
existing `ein-pi/` ownership tree. Map/design must choose their exact final
locations without creating a second `ein-pi` concept.

## Target naming and ownership contract

| Concern | Current name | Target name / rule |
|---|---|---|
| Public product entry | `ein` | Remains `ein`; this is the command normal users are told to run. |
| Bootstrap and repair | `ein-install` | Remains `ein-install`; it must work independently when `ein` is broken. |
| Advanced Pi launcher | `pi-ein` | `ein-pi` |
| Advanced Claude launcher | `cc-ein` | `ein-cc` |
| Claude deterministic SDD CLI | `cc-ein-sdd` | `ein-cc-sdd` |
| Pi adapter source directory | `pi-ein/` | Integrate into the existing `ein-pi/` tree; exact subpaths are a map/design decision. |
| Claude adapter source directory | `cc-ein/` | `ein-cc/` |
| Pi isolated data home | `~/.pi-ein/agent` | Preserve byte-for-byte as a data/state compatibility boundary. |
| Claude isolated data home | `~/.claude-ein` | Preserve byte-for-byte as a data/state compatibility boundary. |
| Pi isolation environment | `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME` | Preserve names and current values. |
| Claude isolation environment | `CLAUDE_CONFIG_DIR` | Preserve name and current value. |

`ein-pi` and `ein-cc` are advanced direct-runtime escape hatches, not competing
public doors. Normal installation completion and introductory documentation must
say `ein`; advanced runtime pages may document the direct launchers explicitly.

## Legacy-reference policy

After all internal groups land, the old command/path vocabulary may remain in live source
or documentation only when all of the following are true:

1. it is required to detect, clean up, migrate, or temporarily invoke an
   installer-owned legacy surface;
2. the code, test fixture, or documentation labels it explicitly as `legacy` or
   deprecated rather than presenting it as current usage; and
3. it has a bounded compatibility purpose, with no old name used as the
   canonical constant, default output, installed primary launcher, payload
   identity, example command, heading, or navigation label.

The preserved `~/.pi-ein/agent` home is a named exception because it is user data,
not a launcher or product command. It must be described as the stable isolated Pi
data location and must not trigger state migration. `~/.claude-ein` likewise
remains unchanged.

Archived changes under `openspec/changes/archive/` are immutable provenance and
are not rewritten. Current specifications, generated indexes, docs, tests, and
product output must not use an archived spelling as the current name.

## Ordered internal apply groups

### Group 1 — runtime source and direct entry points

In scope:

- Integrate `pi-ein/pi-ein.fish`, `pi-ein/migrate.ts`, and its live README into
  the existing `ein-pi/` ownership tree using the final locations chosen by
  design.
- Rename `cc-ein/` to `ein-cc/` and update its source-local imports, generated
  surface inputs, sync boundaries, launcher, continuity runner, README, and
  adapter instructions.
- Rename executable/function surfaces to `ein-pi`, `ein-cc`, and `ein-cc-sdd`.
- Rename code identifiers, safe error messages, usage text, subprocess argv,
  runtime-adapter plans, config includes, and TypeScript paths that denote a
  current launcher/adapter.
- Preserve the current Pi and Claude isolation homes and environment semantics.
- Add focused strict-TDD coverage for direct launch, SDD CLI dispatch, isolation,
  stale command rejection/compatibility, and the absence of current-name output
  using the old spellings.

Group boundary: do not mix installer/payload ownership changes, docs-site
rewrite, canonical spec sync, or release publication into this apply group.

### Group 2 — installer, payload, upgrade, and delivery contracts

In scope:

- Install `ein-pi.fish` and `ein-cc.fish` as the current Fish functions and use
  the renamed runtime source locations.
- Rename Claude payload inventory roots, staging paths, archive names, asset
  declarations, bundle inputs, sync invocation paths, and related build output
  that currently encode `cc-ein` as a current identifier.
- Update install/update/uninstall/recovery plans so installer-owned obsolete
  launchers or payload artifacts are handled only through explicit legacy
  cleanup/migration semantics. Never delete an unrelated user-owned function.
- Keep install completion centered on `ein`; mention the advanced launchers only
  in an explicitly secondary context.
- Update CI, E2E, release-asset contracts, and installer-focused tests together
  with the production seam they protect.
- Verify upgrade behavior from an alpha installation that owns the old launcher
  names. Compatibility aliases, if retained, must be thin, warn as deprecated,
  route to the new surface, and never be advertised as current.

Group boundary: no data-home migration, no `ein`/`ein-install` role reversal,
and no release publication before all three groups verify together.

### Group 3 — canonical specifications and all current documentation

In scope:

- Update canonical OpenSpec scenarios using the structured delta/sync path; do
  not hand-edit or rewrite archived change evidence.
- Update `README.md`, `EIN.md`, live `docs/`, all docs-site runtime/start/reference/
  troubleshooting pages, adapter READMEs, help/usage fixtures, frozen evaluation
  text that is still an active contract, and current changelog/release notes.
- Replace examples, headings, links, file-tree diagrams, commands, navigation,
  troubleshooting instructions, and search metadata that present old names as
  current.
- Keep old spellings only in a clearly labelled migration/deprecation section or
  fixture testing legacy compatibility, plus the stable `~/.pi-ein/agent` home.
- Add a repository-wide focused naming audit that distinguishes allowed legacy
  references from stale current references instead of asserting a naive zero
  match for `pi-ein`.

Hard boundary: do not edit `openspec/changes/fix-overlay-repaint-recovery/` while
it is independent, and do not rewrite `openspec/changes/archive/` history.

## Cross-group sequencing and atomic product behavior

1. Group 1 establishes the new runtime entry points and internal source paths.
2. Group 2 switches installation, payload, update, and cleanup ownership to those
   new surfaces while retaining only the explicit compatibility behavior chosen
   in design.
3. Group 3 makes canonical specs and every current narrative surface tell the
   delivered naming story.
4. A final integration verification runs over the complete worktree after all
   groups and before the new alpha is tagged or published.

Intermediate branches may contain both spellings only for the bounded hand-off
between groups. No alpha release may be cut until the integrated tree meets the
acceptance criteria below.

## Canonical OpenSpec context

The initial scope selected three canonical domains. During apply, the bounded
naming audit proved that two additional exact canonical domains contain current
behavior written with the retired names: `sdd-lifecycle` and `style-delivery`.
Leaving them unchanged would violate the user's explicit request to rename every
surface and would leave canonical behavior contradicting the implementation.

The user's recorded authorization for the integral, single-delivery rename is
therefore also the explicit measured exception to the normal three-domain
canonical-context forecast for this change. The exception adds only those two
proven domains: five files and 72,456 UTF-8 bytes in total. It does not authorize
a sixth domain, a glob, a `.sdd` specification, truncation, or any behavior beyond
the already scoped nomenclature replacement. The two added files are included to
rename existing current contracts, not to introduce new lifecycle or delivery
semantics. No `.sdd` specification was selected.

| Path | Domain | SHA-256 | Bytes | Applicable delta |
|---|---|---|---:|---|
| `openspec/specs/installer-runtime/spec.md` | `installer-runtime` | `e7f9a11670d09ede3543f4dad80ed0746fe55ea786ca5fb6ed9781eb24a05697` | 8,741 | Modify Pi and Claude installation scenarios to install the new launcher/source names; add or modify bounded legacy-upgrade cleanup semantics. |
| `openspec/specs/public-entry/spec.md` | `public-entry` | `ececde326c31c4b640182b0d1bbdf606566640ad5df539440c40ff509a5745a9` | 2,350 | Preserve `ein` as the single public door and `ein-install` as repair/bootstrap while making direct runtime names explicitly secondary and current. |
| `openspec/specs/surface-wiring/spec.md` | `surface-wiring` | `98d5364652f6b450a069c5745dd9a8bab3c758de03cd49d46af8f03170cd313b` | 6,036 | Modify the deterministic persistence-channel scenario and relevant runtime-surface wording from `cc-ein-sdd` to `ein-cc-sdd`. |
| `openspec/specs/sdd-lifecycle/spec.md` | `sdd-lifecycle` | `e640054ec7719da9a4198c4d27575a7c738b04e13e55abcf52d06190a0061c82` | 51,683 | Rename the current Claude SDD invocation and generated coordinator ownership references to `ein-cc-sdd` and `ein-cc/CLAUDE.md` without changing lifecycle semantics. |
| `openspec/specs/style-delivery/spec.md` | `style-delivery` | `69107860f9be226ccf6ff4dc9fbe8c0bbb28af6d558e43cd32eec9e8f6a94ab3` | 3,646 | Rename the current Claude sync/payload inventory reference from `cc-ein/sync.ts` to `ein-cc/sync.ts` without changing payload completeness behavior. |

Total canonical context: 72,456 bytes across five exact domains.

The structured behavior deltas are mandatory and will be created immediately
after this scope through the deterministic OpenSpec delta writer, before this
change moves to map. This scope does not declare `spec_delta: none`: launcher
names, installer output, upgrade behavior, and the callable Claude SDD command
are observable behavior changes. No persisted delta exists yet under this change,
and the explicit phase assignment permits writing only this `scope.md` artifact.

No additional canonical domain is admitted by this exception. Later phases must
not expand it into an unbounded repository-wide spec scan.

## Acceptance criteria for the integrated release

1. `ein` remains the only primary command in first-run, install-completion, help,
   and top-level documentation; `ein-install` remains the independently runnable
   bootstrap/repair hatch.
2. Direct Pi launch uses `ein-pi`; direct Claude launch uses `ein-cc`; Claude's
   deterministic SDD command uses `ein-cc-sdd`. Their help, usage errors, spawned
   argv, tests, and docs agree.
3. A fresh install publishes the new Fish functions and no surface presents
   `pi-ein`, `cc-ein`, or `cc-ein-sdd` as a current command.
4. An update from an installer-owned legacy alpha reaches a coherent new
   installation without deleting unrelated user files. Any retained aliases are
   explicitly deprecated compatibility shims with bounded forwarding behavior.
5. Pi and Claude launches retain their existing isolation: Pi uses
   `~/.pi-ein/agent` through `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME`; Claude
   uses `~/.claude-ein` through `CLAUDE_CONFIG_DIR`. No user state is moved,
   copied, or reinitialized merely because commands were renamed.
6. The Pi adapter assets have one unambiguous owner within the existing
   `ein-pi/` tree; the obsolete top-level `pi-ein/` source directory no longer
   exists after integration. The Claude adapter is owned by `ein-cc/`; current
   imports, payload paths, build inputs, and generated surfaces do not depend on
   `cc-ein/`.
7. Current canonical specs, README, `EIN.md`, internal docs, public docs-site,
   runtime READMEs, help text, tests, E2E, CI, and release contracts use the new
   vocabulary. Old spellings occur only in explicitly labelled legacy migration/
   compatibility evidence, immutable archived change provenance, or the stable
   Pi data-home path.
8. A deterministic naming audit fails on any unclassified old spelling and
   reports its path/context, while accepting the enumerated legacy and data-home
   cases. It must not hide stale references through broad directory exclusions.
9. Strict TDD evidence exists per internal-group behavior seam in RED → GREEN →
   TRIANGULATE → REFACTOR order, followed by green focused tests, `bun test`,
   root `bun run typecheck`, and installer `bun run typecheck` on the integrated
   release candidate.
10. The new alpha is published only from the verified integrated commit using
    the repository's existing release channel and delivery gates; the published
    installer and documentation expose the new names consistently.

## Explicit non-goals and preservation constraints

- No rename or migration of `~/.pi-ein/agent`, `~/.claude-ein`, their contents,
  auth, sessions, secrets, backups, or environment-variable names.
- No merge of the `ein` and `ein-install` binaries and no removal of the repair
  hatch from `PATH`.
- No redesign of launcher/workbench behavior, SDD lifecycle semantics, runtime
  session capabilities, payload contents, or installer visual grammar beyond
  what the nomenclature and safe upgrade require.
- No inferred deletion of user-owned legacy functions. Cleanup targets must be
  derived from installer ownership and tested fail-closed.
- No rewriting of archived OpenSpec changes or release provenance.
- No edits to `openspec/changes/fix-overlay-repaint-recovery/`; it is complete in
  product terms but remains an independent active artifact until its owner
  archives it.
- No implementation, tests, builds, typechecks, generated archives, Git delivery,
  tag, or alpha publication in this scope phase.

## Risks and required design decisions

- **Pi directory collision:** moving `pi-ein/` directly onto existing `ein-pi/`
  is unsafe. Design must fix exact ownership and import/bundle paths before moves.
- **Upgrade ownership:** deleting old Fish functions without proving installer
  ownership could remove user code. Compatibility and cleanup need explicit
  journal/rollback behavior.
- **Generated Claude surfaces:** `ein-cc/CLAUDE.md` remains generated from the
  core and adapter inputs; edits must land in authoritative sources and then be
  regenerated, not patched only in output.
- **Wire/cache identity:** payload archive names, manifests, BunFS declarations,
  and compiled asset paths may be coupled. Rename them as one contract and test
  fresh-build plus update paths.
- **Legacy search noise:** `~/.pi-ein/agent` is valid current state while
  `pi-ein` is an invalid current command. The audit needs classified allow-list
  entries with exact reasons, not a blanket substring ban.
- **Release consistency:** publishing before docs/spec/payload integration would
  ship a split vocabulary. Release is the final gated step, never a per-group
  shortcut.

## Phase boundary and next condition

Only this scope artifact was written. Existing source, tests, documentation,
canonical specs, prior changes, generated payloads, Git state, and release state
were preserved; no verification command was run.

The scope is ready under the user's explicit single-delivery review-workload
override. The next action is to write the validated structured spec deltas for
this same change through the deterministic writer; map may then proceed. Apply
must preserve the ordered internal groups and integrated verification recorded
above, and delivery remains one gated commit/release outcome culminating in the
new alpha.
