status: mapped
scope_status: bounded-with-authorized-forecast
change: rename-ein-runtime-surfaces
phase: map

# Map — Ein-first runtime surfaces

## Scope interpretation and delivery shape

This is one atomic product rename, not three independently releasable changes:

- `pi-ein` becomes `ein-pi`.
- `cc-ein` becomes `ein-cc`.
- `cc-ein-sdd` becomes `ein-cc-sdd`.

The broad forecast is explicitly authorized by the user. Apply must still use the
ordered groups and small strict-TDD slices below. Intermediate commits may carry
both vocabularies only while handing off between groups; no tag, alpha asset, or
published installer may represent that intermediate state.

`ein` remains the normal public entry and `ein-install` remains the independent
bootstrap/repair hatch. `ein-pi` and `ein-cc` are advanced direct-runtime shims,
not additional product doors.

## Final ownership and path map

### Pi

The existing `ein-pi/` tree remains the single Pi owner. Integrate the three
files from the obsolete top-level `pi-ein/` directory directly into that tree:

| Current | Final | Role |
|---|---|---|
| `pi-ein/pi-ein.fish` | `ein-pi/ein-pi.fish` | advanced Fish launcher |
| `pi-ein/migrate.ts` | `ein-pi/migrate.ts` | Pi legacy-state migration helper |
| `pi-ein/README.md` | `ein-pi/README.md` | Pi runtime/adapter documentation |

Do not introduce another nested `ein-pi/ein-pi/` concept. Rewrite source-local
imports and installer references to these final paths, then remove the empty
top-level `pi-ein/` directory. The launcher and migration helper must retain the
existing `~/.pi-ein/agent` resolution and both Pi isolation variables.

### Claude

Rename the whole adapter root `cc-ein/` to `ein-cc/`, preserving its internal
shape. Within it:

- `cc-ein/cc-ein.fish` becomes `ein-cc/ein-cc.fish`;
- `sdd-cli/cli.ts`, `continuity-runner.ts`, `sync.ts`, commands, adapter input,
  README, and checked-in generated surface move under `ein-cc/`;
- the installed deterministic executable and all usage/argv references become
  `ein-cc-sdd`;
- generated Claude output is regenerated from renamed inputs through the renamed
  sync boundary; do not treat direct edits to generated output as the source of
  truth.

The move must preserve `~/.claude-ein` and `CLAUDE_CONFIG_DIR` byte-for-byte in
meaning. The data home does not become `~/.ein-cc`.

### Installer, payload, build, and CI

Current source and delivery paths must point at `ein-pi/ein-pi.fish`,
`ein-cc/ein-cc.fish`, and `ein-cc/sync.ts`. Rename only identifiers or files that
encode the retired product phrase; generic internal concepts such as a Claude
payload need not be renamed merely because they use the abbreviation `cc`.

Concrete product-coded seams include:

- `installer/scripts/bundle-cc-ein.ts` -> `installer/scripts/bundle-ein-cc.ts`;
- Claude payload inventory roots, staging directories, archive/member names,
  generated executable name, asset declarations, build inputs, and release asset
  assertions containing `cc-ein` -> their `ein-cc` equivalent;
- root/installer package scripts and `.github/workflows/ci.yml` callers of those
  paths;
- installer launch, update, uninstall, recovery, progress, and completion plans;
- E2E Docker/runtime fixture paths and release smoke contracts.

`installer/src/core/cc-payload*.ts` and `installer/scripts/cc-payload-smoke.ts`
are not rename targets by filename unless design finds that the identifier is a
public/product identity rather than a generic Claude payload abstraction. Their
contents and contracts still have to use the new paths and executable names.

## Identifier map

Apply the same noun order to code identifiers when they denote the product
surface. Do not mechanically alter stable data-home or environment contracts.

| Retired current identifier | Current identifier |
|---|---|
| `PiEin` | `EinPi` |
| `CcEin` | `EinCc` |
| `piEin` | `einPi` |
| `ccEin` | `einCc` |
| `PI_EIN` | `EIN_PI` |
| `CC_EIN` | `EIN_CC` |

Compound forms follow the same mapping, including plans, paths, payload assets,
fixtures, error codes, subprocess argv, and generated-surface tokens. Preserve
the exact environment names `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, and
`CLAUDE_CONFIG_DIR`; `EIN_PI_AGENT_HOME` is already the stable isolation API and
must not be rewritten as part of the generic identifier pass.

## Old-reference classification contract

Every non-archived old spelling remaining after apply must be accepted by the
focused naming audit under exactly one of these classifications. There is no
unclassified allowlist.

### `data-home`

Allowed only when the reference denotes the stable Pi state location:

- literal/documented `~/.pi-ein/agent`;
- its exact programmatic path segments or test expectation (for example
  `.pi-ein` + `agent`);
- explanatory text that explicitly calls it the preserved Pi data home.

Likely owners include the final Pi launcher and migration helper,
`ein-pi/agent/lib/agent-home.ts`, installer Pi path/migration logic, and focused
isolation tests/docs. This classification never permits `pi-ein` as a command,
source directory, heading, navigation label, default output, or payload name.
`~/.claude-ein` is also preserved as a data-home contract although it does not
contain one of the retired command spellings.

### `legacy-migration`

Allowed only for bounded recognition, ownership verification, cleanup, or tests
of retired managed artifacts:

- exact old Fish launchers `pi-ein.fish` and `cc-ein.fish`;
- exact old command names `pi-ein`, `cc-ein`, and `cc-ein-sdd`;
- exact old Claude payload/build members or source-root strings needed to detect
  an installed legacy alpha;
- migration/deprecation release notes and test fixtures that label the spelling
  as legacy.

Legacy constants must say so in their names (for example `LEGACY_*`) and may not
feed fresh-install output, current defaults, generated primary assets, examples,
or navigation. No compatibility alias is published in the target design: this
alpha installs the new entry points and safely removes proven managed legacy
ones. If apply discovers a hard compatibility dependency, changing that policy
requires an explicit design decision and the alias must be thin, warning, and
bounded as required by scope.

Archived paths under `openspec/changes/archive/` are immutable provenance and
are outside the live-reference audit, not members of either live classification.
Git internals are likewise not product sources. The independent
`openspec/changes/fix-overlay-repaint-recovery/` tree is a protected non-target.

## Safe upgrade and cleanup seam

Install/update order is transactional at the plan level:

1. Materialize the new Pi/Claude source or payload.
2. Install `ein-pi.fish`, `ein-cc.fish`, and `ein-cc-sdd` to their resolved
   managed destinations.
3. Validate the new entry points and record their ownership in the existing
   installer journal/plan boundary.
4. Consider each exact retired path independently. Delete it only when the
   installer journal records it as managed or its content matches a known legacy
   artifact fingerprint/marker owned by Ein.
5. Leave an unproved homonymous user file byte-identical and emit a bounded
   diagnostic; never widen cleanup to a directory or substring match.
6. Commit/update installation state only after the new surfaces work. Rollback
   must not remove pre-existing user files or move either runtime data home.

Fresh install must never create legacy names. Uninstall/recovery must know both
the current managed inventory and narrowly recognized legacy inventory, using
the same ownership predicate. Installer completion says to run `ein`; advanced
shims may appear only in secondary detail/help.

## Apply groups and strict-TDD slices

### Group 1 — runtime source and direct entry points

1. **G1.1 RED — naming and isolation contracts.** Update/add focused tests for
   `ein-pi`, `ein-cc`, `ein-cc-sdd`, direct argv/usage errors, unchanged Pi and
   Claude homes, and rejection of retired names as current output.
2. **G1.2 GREEN — Pi integration.** Move the three Pi adapter files to the final
   locations, rename launcher/function/identifiers, repair imports, preserve
   `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME`, and remove `pi-ein/` only when
   empty.
3. **G1.3 GREEN — Claude root and CLI.** Move `cc-ein/` to `ein-cc/`, rename the
   Fish function and SDD executable/identifiers, update sync and continuity argv,
   and preserve `CLAUDE_CONFIG_DIR` plus `~/.claude-ein`.
4. **G1.4 generated parity.** Regenerate/check the Claude checked-in surface from
   renamed canonical inputs and run only the focused runtime, SDD CLI, continuity,
   and parity tests. Fix production seams before relaxing assertions.

Do not touch installer payload ownership, canonical specs, site-wide docs, or
release publication in Group 1.

### Group 2 — installer, payload, upgrade, and delivery contracts

1. **G2.1 RED — fresh/upgrade/uninstall plans.** Add fixtures for a fresh install,
   managed legacy alpha, and colliding user-owned old function. Assert new-first
   ordering, exact cleanup, preserved user file, stable homes, and `ein`-centered
   completion.
2. **G2.2 GREEN — current inventory.** Switch installer source paths, Fish names,
   Claude sync call, SDD binary, asset declarations, payload inventory, and
   runtime options to the current names.
3. **G2.3 GREEN — bounded legacy cleanup.** Add explicitly named legacy
   inventory and ownership checks to install/update/uninstall/recovery plans;
   do not retain launch aliases.
4. **G2.4 build/CI/E2E.** Rename the product-coded bundle script and all callers,
   update staging/archive/release asset contracts and Docker/smoke fixtures, then
   run the focused installer, payload, launcher, updater, uninstall, E2E, and
   release-asset tests.

### Group 3 — specifications, current narrative, and naming gate

1. **G3.1 canonical sync.** Apply the three persisted deltas through the
   structured OpenSpec sync path for `installer-runtime`, `public-entry`, and
   `surface-wiring`; do not hand-edit archived changes. The structure-only search
   also surfaced `sdd-lifecycle` and `style-delivery`: classify their matches
   before editing. If either states observable current behavior rather than a
   `data-home`/`legacy-migration` fact, persist an exact additional delta through
   the authorized OpenSpec path before canonical sync.
2. **G3.2 product/internal docs.** Update `README.md`, `EIN.md`, current
   `CHANGELOG.md`, live `docs/`, adapter READMEs, active evaluation text, file
   trees, commands, help fixtures, and troubleshooting/recovery guidance. Normal
   guidance says `ein`; runtime-specific pages may explain the advanced shims.
3. **G3.3 public site.** Update the docs-site start, concepts, workflow, runtimes,
   CLI/filesystem reference, doctor, troubleshooting, recovery, landing copy,
   links, headings, navigation/search labels, and code examples together.
4. **G3.4 deterministic naming audit.** Add a repository test that reports every
   non-archived retired spelling with path/context and requires the explicit
   `data-home` or `legacy-migration` classification above. Exclude only immutable
   archive and Git metadata; do not broadly exclude source, tests, docs,
   generated files, or the active change tree from the final audit.

The existing independent active-change directory remains physically untouched;
the final audit may report a collision there, but apply must coordinate with its
owner rather than mutate it as part of this change.

## Blast-radius clusters

Structure-first search identified these live clusters for design/apply review:

- runtime roots: `pi-ein/`, `cc-ein/`, and current-name-sensitive files under
  `ein-pi/agent/`, `ein-pi/core/`, and `ein-pi/workbench.ts`;
- installer: `installer/src/cli/`, `installer/src/core/`, `installer/src/tui/`,
  `installer/src/assets.d.ts`, `installer/scripts/`, package/build declarations,
  and `.github/workflows/ci.yml`;
- tests: launcher/E2E, payload/bundle/entrypoint, install/update/uninstall plans,
  Claude SDD/continuity/settings/parity, runtime sessions/adapters, workbench,
  guardrail/frozen corpus, release asset, README IA, and template inventory
  contracts under `tests/`;
- narrative: root README/EIN/changelog, live `docs/`, `docs-site/src/components/`,
  and docs-site start/concept/workflow/runtime/reference/debug pages;
- current contracts: the three selected OpenSpec domains plus the two
  structure-only candidate domains above.

This is a review inventory, not permission for blind replacement. In particular,
`.pi-ein/agent` substrings are classified before mutation, generated Claude
files follow their generator, and generic `cc` abstractions are retained unless
they encode the retired product identity.

## Integrated verification and alpha gate

After all groups are present in one worktree, and before version/tag/publish:

1. Run the focused naming audit and inspect every allowed result by class.
2. Run the complete root suite: `bun test`.
3. Run root type checking: `bun run typecheck`.
4. Run installer type checking: `cd installer && bun run typecheck`.
5. Run the installer build/bundle and Claude payload smoke commands exposed by
   the repository package scripts; verify archive members and executable names.
6. Build the public docs site and resolve broken links or stale generated labels.
7. Exercise fresh install plus upgrade from a managed old alpha for Pi-only,
   Claude-only, and combined selection; verify the unowned-collision fixture.
8. Run release-asset contract/E2E checks and inspect `ein --help`,
   `ein-install --help`, install completion, `ein-pi`, `ein-cc`, and
   `ein-cc-sdd --help` output.

Only after all gates pass: update the alpha version in the existing authoritative
version/package surfaces, add current changelog/release notes including the
bounded legacy cleanup and stable data homes, build final assets from the clean
commit, tag the new alpha, publish it through the existing release workflow, and
smoke the published artifact. A failed publish/smoke does not authorize changing
the tag in place; follow the repository's next-version recovery convention.

## Design risks and required proofs

- **Ownership proof:** path equality alone is insufficient to delete old Fish
  functions or SDD binaries. Design must bind cleanup to journal ownership or a
  deterministic legacy fingerprint and test the collision case.
- **Generated/payload drift:** moving the Claude root without updating generator,
  staging, archive members, asset declarations, CI, and release assertions can
  produce a locally green source tree with a broken published alpha.
- **Naive replacement damage:** broad substitution would rename
  `~/.pi-ein/agent`, isolation variables, archived evidence, or generic Claude
  abstractions. The typed naming audit is the release gate.
- **Canonical delta gap:** structure-only matches in `sdd-lifecycle` and
  `style-delivery` are not authorized for hand edits; design must classify them
  and use an exact delta if they describe current observable behavior.
- **Protected active change:** its files cannot be silently rewritten. Any old
  current vocabulary that survives there must be reconciled by its owner before
  the integrated naming gate and release.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/rename-ein-runtime-surfaces/scope.md", lines: 211, estimated_tokens: 4050 }
    - { path: "openspec/changes/rename-ein-runtime-surfaces/preflight.json", lines: 5, estimated_tokens: 50 }
    - { path: "openspec/changes/rename-ein-runtime-surfaces/lane.json", lines: 3, estimated_tokens: 30 }
    - { path: "openspec/changes/rename-ein-runtime-surfaces/specs/installer-runtime/spec.md", lines: 21, estimated_tokens: 390 }
    - { path: "openspec/changes/rename-ein-runtime-surfaces/specs/public-entry/spec.md", lines: 15, estimated_tokens: 300 }
    - { path: "openspec/changes/rename-ein-runtime-surfaces/specs/surface-wiring/spec.md", lines: 9, estimated_tokens: 180 }
    - { path: "ein-pi/core/agents/sdd-map.md", lines: 121, estimated_tokens: 1900 }
    - { path: "openspec/config.yaml", lines: 43, estimated_tokens: 500 }
    - { path: "openspec/changes/fix-overlay-repaint-recovery/map.md", lines: 105, estimated_tokens: 2500 }
    - { path: "openspec/changes/archive/surface-wiring/map.md", lines: 147, estimated_tokens: 3400 }
    - { path: "openspec/changes/archive/update-astro-documentation/map.md", lines: 119, estimated_tokens: 2800 }
    - { path: "structure search: non-archived retired names and identifier variants", lines: 0, estimated_tokens: 2600 }
    - { path: "structure search: current and archived map artifacts", lines: 0, estimated_tokens: 200 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 18900, reads: 13 }
  budget_exceeded: true
  budget_source: scope.md

## Skill resolution and phase note

skill_resolution: none

Mapping only. No source, tests, canonical specs, documentation, build, or release
commands were changed or run. Next recommended phase: `sdd-design`.
