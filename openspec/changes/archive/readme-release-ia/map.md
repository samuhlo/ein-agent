status: partial
scope_status: partial-budget-capped
change: readme-release-ia
phase: map
skill_resolution: paths-injected
budget: { max_tokens: 15000, max_reads: 30, source: scope.md }
budget_exceeded: true

# Map — README/release IA

The requested evidence is substantially mapped, but the final archive batch reached the hard 30-read cap (and its returned material exceeded the 15k token allocation). No further reads were made. The only unresolved precision is the terminal total line count of `README.md`; its final numbered section begins at line 230 and the observed tail ends immediately after the Ein image. All section start/end dependencies below are exact where headings provide a boundary.

## Current README IA

| Current range | Section / anchors | Current truth and move dependency |
|---|---|---|
| 1–14 | hero, release and MIT badges; no heading anchor | Badge release target is `https://github.com/samuhlo/ein-agent/releases/latest`; keep image alt text and both badges. Hero claims personal curated workbench and capability/cost routing. It must precede the quick path, but has no stable Markdown anchor to preserve. |
| 20–28 | `## // 000. MODOS DE TRABAJO` | Solo/Team concepts; may follow latest-release block. |
| 30–39 | `// 001. FLUJO VISIBLE` | Task-routing explanation; depends only on hero. |
| 41–61 | `// 002. FLUJO SDD` | Phase flow and deterministic routing; should remain after concepts. |
| 63–66 | `// 003. AGENTES DE DELIVERY` | Delivery roles; concept-level. |
| 68–79 | `// 004. MODELOS` | Contains all volatile names and the no-auto-fallback contract; replace table/copy, retain `/ein:models[:full|:lite]` command surface. |
| 81–90 | `// 005. ESTÉTICA DEL OUTPUT` | Persona explanation. |
| 92–94 | `// 006. PERSONA DOCENTE` | Teaching behavior. |
| 96–98 | `// 007. CONTEXTO DE PROYECTO (EIN.md)` | Project context concept. |
| 100–106 | `// 008. SKILLS (3 capas)` | Skills sources; links are external but not release facts. |
| 108–120 | `// 009. PLATAFORMA` | Optional integrations; current Engram sentence overstates persistence unless qualified by the archived E2 gate. |
| 122–147 | `// 010. INSTALACIÓN` | First supported bootstrap command at line 125; currently too late. Detailed install is the canonical destination for quick-path link. Includes WSL guidance, platform boundary and dependency table. |
| 149–162 | `// 011. COMANDOS ein` | CLI command list and backup claim. |
| 164–191 | `// 012. DENTRO DE PI — /ein:*` | Commands; internal `# Control`, `# SDD`, `# Skills…` headings at 167/180/187 break logical level under an H2 and should be normalized only if touched. |
| 193–215 | `// 013. ESTRUCTURA DEL REPO` | Architecture and source/template explanation. |
| 217–228 | `// 014. ACTUALIZAR / PUBLICAR` | Release example is stale (`installer-v0.15.0`, lines 222–223); must be either generic tag syntax or reconciled to locally declared 0.18.0. It duplicates the bootstrap command already at 125. |
| 230–end | `// 015. ROADMAP`, divider, character footer | Keep as the tail; Windows-native remains explicitly future, not an installation channel. |

### Required ordering constraints, not final design

1. Hero/badges remain first; then one concise supported bootstrap command and descriptive link to detailed installation.
2. The locally declared latest-release summary must appear before the first concepts/architecture section (currently `// 000`), link to the changelog anchor, and not duplicate platform/manual detail.
3. Detailed install remains the one source for WSL, dependencies, recovery and commands. Moving it requires preserving existing `// 010` anchor or a compatibility anchor because the quick path will target it.
4. Existing numbered `// 00N` headings are the only visible structural anchors; renumbering changes their generated GitHub anchors. Preserve numbers where possible or add explicit compatible anchors.

## Canonical local source matrix

| Fact | Local canonical evidence | Current value / contract | Documentation implication |
|---|---|---|---|
| Published-summary version and date | `CHANGELOG.md` first release heading | `## [0.18.0] - 2026-07-13`; GitHub anchor convention is expected to be `#0180---2026-07-13` (must be checked by an offline heading-slug test, not guessed by prose) | Local records coherently identify 0.18.0 as latest summary. This is not GitHub publication proof. |
| Release tag convention | `CHANGELOG.md` preamble; `.github/workflows/installer-release.yml` | tags `installer-v*`; release workflow triggers on `installer-v*` | The corresponding local convention is `installer-v0.18.0`; no remote tag/release was inspected. |
| Current installer source version | `installer/package.json`; `installer/src/core/version.ts` | both `0.18.0` | A deterministic check can require package, TS marker, README release block, and first changelog heading to agree. Version files alone do not prove a published release. |
| Bootstrap command | `README.md:125`, `installer/README.md`, `installer/install.sh` header/workflow notes | `curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash` | Supported local bootstrap path. `install.sh` chooses latest release asset, not 0.18.0 explicitly. |
| Bootstrap assets | `installer/install.sh`; `installer/scripts/build-all.ts` | `ein-installer-{darwin|linux}-{arm64|x64}`, downloaded from `releases/latest/download`; WSL maps to Linux; macOS/Linux only | Four exact names are stable. Bootstrap checksum fetch is optional: it verifies only if `checksums.txt` downloads and contains a matching line. |
| Manual release asset/checksum contract | workflow + build script + archived `release-asset-contract` evidence | workflow publishes the four binaries, `checksums.txt`, and `install.sh`; `checksums.txt` is GNU `sha256sum` output (`<sha256>  <asset>`) | A manual path is documentable only conditionally as the tag-shaped GitHub-release URL plus matching `checksums.txt`; local workflow is a publication contract, not proof that those remote assets currently exist. |
| Release notes | workflow inline `/tmp/release-notes.md` | title `Ein installer ${GITHUB_REF_NAME}` and only the bootstrap command | No existing generator updates README/latest-release copy. |
| Model configuration command | `README.md:171`; `ein-pi/agent/lib/model-config.ts` via CodeGraph | `/ein:models`, `/ein:models:full`, `/ein:models:lite`; per-agent config is persisted in `~/.pi/ein/models.json` | Commands and customization are stable to document without provider/model names. |
| Preset implementation | `model-config.ts:479–503` via CodeGraph | Full/lite presets assign concrete provider/model IDs to orchestrator and named SDD/delivery agents | README must not reproduce IDs while leaving implementation untouched. |
| No silent fallback | README:79 and archived changelog 0.15.2 | failures retry the selected model; changing model is user-directed, no automatic cross-model switch | This behavioral promise can remain provider-neutral. |

## Release state evidence: published vs merged development vs fake/TUI-only

| Area | Locally published-summary evidence | Verified source/development evidence | Forbidden or qualified claim |
|---|---|---|---|
| 0.18.0 latest summary | Changelog first heading, date, and both current version sources agree; release convention is `installer-v*`. Known historical tag evidence is `installer-v0.18.0`. | None needed for summary bullets beyond first changelog `Added`/`Changed` entries. | Do not say GitHub currently hosts/published it: no network or remote tag/release read occurred. |
| Updater/release transaction | Not present in 0.18.0 changelog release bullets. | Archived `release-update-semantics` VERIFY: selector forms, eligibility, results/exits, SHA-256 same-release check, marker/banner semantics, external-owner block and recovery behavior are fake-capability/filesystem verified. | Do not include in 0.18.0 latest-release bullets. SHA-256 is not a publisher-independent signature; no real GitHub/API/update/build/publication evidence. |
| Engram E2 | Not a 0.18.0 published-summary bullet. | Archived VERIFY: bounded optional project-scoped CLI adapter, fake process/transport tests, advisory retrieval at session/map/design/apply/verify seams, post-gate saves; OpenSpec canonical and failures non-blocking. | No real CLI/notebook/DB/MCP/persistence/retrieval claim; no mandatory memory or full artifact store. Source behavior must be explicitly qualified if mentioned. |
| Banner Git semantics | Not a 0.18.0 release bullet. | Archived VERIFY: HEAD/LOCAL/UPSTREAM rows at source-contract 80/60/40 layouts; porcelain logical entries; tracking-ref ahead/behind/diverged; fake runner read-only. `behavior_coverage: partial`. | No remote-live synchronization, real terminal/TUI, real repo/remotes, deployment or installer-version claim. Tracking ref may be stale; server OID mismatch means counts unavailable. |
| Bootstrap/manual installer | Workflow and scripts prove intended asset/checksum shape. | `release-asset-contract.test.ts` has archived PASS evidence that workflow/build names match strict updater parser. | Do not say a manual 0.18.0 URL was downloaded or checksum-validated remotely. |

## Stale, forbidden, or volatile README material

- `README.md:74–77`: hardcoded `gpt-5.5`, `MiniMax-M3`, `MiniMax-M2.7` table.
- `README.md:79`: hardcoded names, provider failure phrasing and “M3” capability claim. Keep only user-selected presets, stronger-reasoning vs bounded/mechanical-cost guidance, and no-silent-fallback behavior.
- `README.md:10–14`, 65, 98 contain generic “models expensive/cheap” phrasing; these can become stable capability/cost guidance without names.
- `README.md:222–223`: obsolete release example `installer-v0.15.0`; changelog itself records an earlier repair of a 0.13.0 example, so this is recurrent drift.
- `README.md:108–120`: “Engram mantiene contexto entre sesiones” is too broad unless reduced to the optional, bounded, fake-verified E2 seam and OpenSpec-canonical limitation.
- `README.md:125–147` says bootstrap downloads latest release and opens TUI. Current script does select `releases/latest`, but macOS piped execution prints “run ein” rather than execing because `/dev/tty` freezes there; avoid unconditional “opens TUI.”
- `README.md:149–162` says `ein update` updates Ein/Pi. Archived updater contract explicitly excludes Pi/declared packages from the release transaction; do not extend new release copy with a transaction guarantee for Pi.
- `README.md:217–228` is both duplicate install/release material and stale version example.
- No root README Homebrew string was found in the targeted inventory. Any `brew install`, tap/formula name, availability badge/promise, or upgrade instruction for Ein is forbidden.

## Directly adjacent docs only

| File | Duplicate/current drift | Scope handling |
|---|---|---|
| `installer/README.md` | Repeats bootstrap command, platform/asset behavior, CLI/backups, and release contract. Its flags omit current `--no-hypa`/`--no-codegraph`; it says release publishes binaries + `install.sh` but does not list exact names. | Supporting-doc candidate only if root wording would otherwise contradict it; avoid broad rewrite. |
| `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` | User-facing explanatory doc repeats bootstrap and contains obsolete provider/model names and an older SDD “5 steps” explanation despite listing seven names. | Not a directly maintained release contract; do not expand this change into its redesign. Touch only if a newly retained root claim would directly contradict a short duplicated statement. |
| `.github/workflows/installer-release.yml`, `installer/install.sh`, `installer/scripts/build-all.ts` | Contract sources, not docs to change for README IA. | Read-only references unless a later design proves an enforcement test belongs with them. |

## Homebrew absence gate

- No Ein Homebrew workflow, tap, formula, cask, or `brew install` documentation surfaced in root README, installer README, installer release workflow, or archived handoffs.
- The only `brew` source observed is `installer/src/core/engram.ts` for **Engram’s** macOS dependency (`Gentleman-Programming/homebrew-tap` / `brew install engram`), not an Ein install channel.
- `release-update-semantics/handoff.md` explicitly states no Ein tap/formula exists; a package-manager marker example is a future contract, not availability.
- Allowed wording: “Ein currently documents bootstrap; Homebrew is not an available Ein installation channel.” Blocked wording includes availability/roadmap-as-availability, tap/formula identifiers, `brew install ein`, and ownership/upgrade promises. Future gate: published real channel + clean install and upgrade verified against a published release + explicit updater ownership.

## Existing checks and feasible deterministic maintenance check

### Existing validation surfaces

- `tests/release-asset-contract.test.ts` reads workflow and build script as text; archived VERIFY reports six PASS cases covering four assets, `checksums.txt`, GNU checksum shape and rejection of BSD `*` format.
- Archived updater suites: `release-update-{contract,acquisition,exec,transaction,cli,integration}.test.ts`, plus `installer-backup`, `deploy-clean-managed`, `deploy-settings`; archived focused command uses `bun test` with these files.
- `tests/banner-git-semantics.test.ts` and Engram suites verify their fake/source contracts, not README release publication.
- Targeted test inventory found no existing test that parses root README or CHANGELOG to assert release metadata, heading order, command anchors, forbidden provider strings, or Homebrew absence.
- Local commands already evidenced: `bun test <focused files>`; `cd installer && bun run typecheck`; package scripts provide `bun run build:all`, `bundle-template`, `dev`, and `typecheck`, but map phase did not execute any command.

### Feasible offline guard

A focused Bun test (new target likely `tests/readme-release-ia.test.ts`) can deterministically parse local text and compare:

1. first `CHANGELOG.md` release heading version/date and its computed GitHub-compatible heading anchor;
2. `installer/package.json.version` and `INSTALLER_VERSION`;
3. an explicitly labelled README latest-release block’s version, date, and relative changelog link/anchor;
4. exactly one quick bootstrap command, its `installer/install.sh` target, and detailed-install anchor order;
5. an allowlist of bootstrap/manual asset/checksum terminology and the four workflow/build asset names;
6. required command strings `/ein:models`, `:full`, `:lite`, plus no-auto-fallback wording; reject the inventoried hardcoded names only in the new guidance/release block rather than historical/reference prose;
7. banned Ein Homebrew availability/command patterns, with an exclusion for the documented Engram dependency source if test scope scans beyond root README.

It cannot prove GitHub has a release, tag, release date, release assets, `releases/latest` resolution, checksums, GitHub-generated anchor behavior in production, or actual bootstrap success without GitHub API/network. The test must label 0.18.0 as local canonical published-summary evidence, not remote proof.

## Blast radius, targets, and workload

| Target | Expected purpose | Blast/risk |
|---|---|---|
| `README.md` | IA reorder, concise quick path, release summary, provider-neutral model guidance, forbidden-claim removal | Main review surface; preserve useful badges/anchors and avoid duplicated install detail. |
| `tests/readme-release-ia.test.ts` (new, if design accepts) | Offline release/docs drift contract | Isolated text parsing; brittle string bans are the primary risk. |
| `installer/README.md` (conditional) | Reconcile only direct contradiction from new root install/release wording | Do not broaden into installer documentation redesign. |
| `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` (normally out) | Only a narrow direct contradiction, otherwise leave untouched | Broad stale content means it is unsuitable for opportunistic cleanup. |
| `CHANGELOG.md`, installer version files, workflow, shell script, build script | Canonical read-only inputs | No release/history/version/workflow behavior changes are in scope. |

Forecast: README 180–320 changed lines and focused test 40–100 lines; production code 0. One docs-and-contract work unit remains plausibly below the 400 production/docs review guard, but moving/re-numbering every README section could exceed it. Keep supporting docs conditional and split if the forecast crosses 400.

## Open design questions

1. Is the latest-release block manual copy protected by the focused CI check, or can an existing local release process safely generate it? The mapped workflow generates only GitHub release notes and does not update README, so generation is not currently proven.
2. Should the release block cite only the two 0.18.0 changelog categories (CodeGraph and automatic OpenSpec bootstrap), or can it use another factual bullet from that same heading while staying within 2–4 bullets?
3. Should the manual asset path be documented as a generic tag-template with checksum verification, given local workflow proof but no remote asset inspection, or should root README retain bootstrap only and link installer details?
4. Which existing numbered headings require compatibility anchors if installation/release sections move; specifically, is preserving `// 010` preferable to renumbering the entire document?
5. Is a narrowly qualified optional Engram note still valuable in root README, or should it link to detailed docs to avoid converting fake-verified E2 behavior into a product-level promise?

## Next phase

Proceed to `sdd-design`. It should choose the smallest README-first arrangement, define the offline text-contract boundaries precisely, and retain the published-summary/source-dev distinction above.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 2200 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/readme-style/SKILL.md", lines: 92, estimated_tokens: 1700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 49, estimated_tokens: 900 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 170, estimated_tokens: 3400 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/work-unit-commits/SKILL.md", lines: 67, estimated_tokens: 1200 }
    - { path: "openspec/changes/readme-release-ia/scope.md", lines: 164, estimated_tokens: 5100 }
    - { path: "README.md", lines: 244, estimated_tokens: 8400 }
    - { path: "CHANGELOG.md", lines: 2000, estimated_tokens: 36000 }
    - { path: "installer/package.json", lines: 20, estimated_tokens: 350 }
    - { path: "installer/src/core/version.ts", lines: 45, estimated_tokens: 800 }
    - { path: "installer/install.sh", lines: 130, estimated_tokens: 2500 }
    - { path: "installer/README.md", lines: 65, estimated_tokens: 1400 }
    - { path: ".github/workflows/installer-release.yml", lines: 42, estimated_tokens: 800 }
    - { path: "codegraph://explore/release-assets-models-tests", lines: 540, estimated_tokens: 7000 }
    - { path: "README.md#headings", lines: 19, estimated_tokens: 500 }
    - { path: "README.md#volatile-claims", lines: 15, estimated_tokens: 800 }
    - { path: "openspec/changes#archive-discovery", lines: 100, estimated_tokens: 4300 }
    - { path: "tests#release-doc-contract-inventory", lines: 100, estimated_tokens: 4100 }
    - { path: "installer/scripts/build-all.ts", lines: 77, estimated_tokens: 1400 }
    - { path: "ein-pi/core/docs/EIN_OPERATING_SYSTEM.md", lines: 220, estimated_tokens: 4900 }
    - { path: "codegraph://explore/model-preset-build-assets", lines: 530, estimated_tokens: 6400 }
    - { path: "openspec/changes/archive/release-update-semantics/handoff.md", lines: 137, estimated_tokens: 4600 }
    - { path: "openspec/changes/archive/release-update-semantics/verify-report.md", lines: 285, estimated_tokens: 13300 }
    - { path: "openspec/changes/archive/release-update-semantics/summary.md", lines: 58, estimated_tokens: 2100 }
    - { path: "openspec/changes/archive/engram-deterministic-contract/handoff.md", lines: 25, estimated_tokens: 850 }
    - { path: "openspec/changes/archive/engram-deterministic-contract/verify-report.md", lines: 81, estimated_tokens: 3100 }
    - { path: "openspec/changes/archive/engram-deterministic-contract/summary.md", lines: 41, estimated_tokens: 1800 }
    - { path: "openspec/changes/archive/banner-git-semantics/handoff.md", lines: 28, estimated_tokens: 1000 }
    - { path: "openspec/changes/archive/banner-git-semantics/verify-report.md", lines: 80, estimated_tokens: 3100 }
    - { path: "openspec/changes/archive/banner-git-semantics/summary.md", lines: 39, estimated_tokens: 1700 }
  webfetch_used: false
  budget_consumed: { tokens: 119850, reads: 30 }
