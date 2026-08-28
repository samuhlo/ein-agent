---
change: add-intent-channel
phase: design
created: 2026-08-28T00:00:00Z
lane: standard
tdd: strict
spec_delta: none
---

# DESIGN: Intent Channel (`/ein:intent`, `/ein:eh`)

## Canonical spec context

`scope.md` recorded **no** canonical spec references and declared `spec_delta: none`
(the change adds optional commands and one artefact; it does not alter router,
phase, or decision semantics). `map.md` mapped **no** additional domain hints to
`openspec/specs/<domain>/spec.md`. Therefore **zero canonical spec files were
loaded** in this phase: nothing to hash, nothing to budget. Ground truth for this
design is `scope.md`, `map.md`, `MANIFIESTO.md`, and the source files cited inline
(each read directly, not reconstructed).

---

## A. Proposal

### Intent

Give the user a **pre-SDD decision channel**: `/ein:intent` interrogates a request
as a decision tree and closes the user's decisions to disk in `intent.md`;
`/ein:eh` restates the last message in plain project language. Both are
user-invoked only, optional, and defined **once** as a shared skill that each
runtime reaches by its own native mechanism.

### Scope

**In**

- One shared skill: `ein-pi/core/skills/local/intent-channel/SKILL.md` — the only
  place the protocol text exists.
- One shared pure module: `ein-pi/agent/lib/intent-channel.ts` — command names,
  skill name, artefact name, skill-path resolution, artefact-path resolution,
  kickoff-message builders.
- Pi surface: a small extension registering `ein:intent` and `ein:eh` that inject
  the kickoff via `pi.sendUserMessage()`.
- Claude surface: `ein-cc/commands/ein/intent.md` and `ein-cc/commands/ein/eh.md`,
  which point Claude at the same skill.
- Artefact `openspec/changes/<change>/intent.md`, written only on user confirmation.
- Tests: unit tests for the pure module, a contract test for the Pi registration,
  and a **new cross-runtime parity test** — the gap `map.md` flagged as unfilled.

**Out (non-goals)**

- No eighth SDD phase, no gate, no router change, no `ein_sdd_status` change.
- No preflight third axis, no auto-launch on lane `standard` — that is the *next*
  change; this design only keeps the door open (Decision C7).
- No `sdd-scope` consumption of `intent.md` (future change; the artefact shape is
  fixed here so that consumer can be written against it).
- No new CONTEXT.md / glossary; EIN.md already owns vocabulary.
- No change to `fix-overlay-repaint-recovery`.
- No adoption of to-spec, to-tickets, implement, triage, wayfinder.

### Affected areas

| Path | Change |
|---|---|
| `ein-pi/core/skills/local/intent-channel/SKILL.md` | new — the protocol, once |
| `ein-pi/agent/lib/intent-channel.ts` | new — pure, shared, testable |
| `ein-pi/agent/extensions/ein-intent.ts` | new — `registerCommand` × 2 + `sendUserMessage` |
| `ein-pi/agent/extensions-manifest.json` | +1 line (installer presence check) |
| `ein-cc/commands/ein/intent.md`, `.../eh.md` | new — Claude surface |
| `tests/intent-channel.test.ts`, `tests/intent-channel-parity.test.ts` | new |

Nothing existing is modified except one manifest line. `ein-cc/sync.ts` needs **no**
edit: it already deploys every `.md` in `commands/ein/` (`listClaudeCommands()`,
sync.ts:704) and copies `core/skills/{local,downloaded}` flattened into
`${CLAUDE_CONFIG_DIR}/skills/` (sync.ts:717-732).

### Risks

1. **Prompt drift between surfaces.** Two entry points, one protocol: if a surface
   restates rules instead of pointing at the skill, they diverge silently. Mitigated
   by R1/R3 and the parity test; this is the single risk worth a test.
2. **Phantom active change.** `listActiveChanges()` (sdd-router.ts:275) treats *any*
   subdirectory of `openspec/changes/` as an active change. An abandoned intent
   session that had already created a directory would pollute routing. Mitigated by
   R8: nothing is written before the user confirms.
3. **Silent absence after install.** A Pi extension that exists in the repo but is
   not in `extensions-manifest.json` is not checked by installer verify
   (`installer/src/core/verify.ts:148`) — the command would be missing with no
   signal. Mitigated by R14. (`ein-continuity.ts` is today in this exact hole; not
   fixed here, out of scope.)
4. **Skill-load cost creep.** Verified non-issue: `compileStyleContract` materializes
   a **fixed** list, `["comment-style", "logging-style"]` (style-contract.ts:79), so a
   new local skill does not grow the generated `ein-cc/CLAUDE.md`. R4 pins this.

### Rollback

Purely additive plus one manifest line. `git revert` of the change commit removes
the two commands, the skill, the extension, the lib and the tests, and restores the
manifest. No migration, no persisted state, no consumer: `intent.md` files already
written stay on disk and remain inert (they are not phase artefacts). Partial
rollback is also safe: deleting only `ein-cc/commands/ein/{intent,eh}.md` degrades
to a Pi-only channel without breaking sync, though it breaks the parity test — which
is the intended alarm.

### Success criteria (summary; full list in D)

The two commands exist and run in **both** runtimes against the **same** skill; the
deterministic router's answer is byte-identical with and without `intent.md` present;
the fixed per-turn prompt does not grow; nothing reaches disk before the user says so.

---

## B. Spec

Verification mode is tagged per requirement so `sdd-tasks` can slice RED-GREEN
directly: `[unit]` pure-function test · `[contract]` structural test over repo files
· `[parity]` cross-runtime test · `[manual]` transcript check by the user (prose
behavior that no test can honestly assert).

### R1 — One definition of the protocol `[contract]`

The system MUST define the intent-channel behavior exactly once, in
`ein-pi/core/skills/local/intent-channel/SKILL.md`. Neither runtime surface MAY
restate the round protocol, the frontier rules, or the artefact template.

> **Given** the skill file exists with sections for `/ein:intent` and `/ein:eh`,
> **When** the Pi extension source and both Claude command `.md` files are read,
> **Then** each references the skill name `intent-channel` and none of them contains
> the protocol body (asserted by the absence of the skill's rule sentences and by a
> byte ceiling on each surface file).

### R2 — Both commands exist in both runtimes `[parity]`

For each name in `{ein:intent, ein:eh}` the system MUST register a Pi command via
`pi.registerCommand("<name>", …)` and MUST ship a Claude command file
`ein-cc/commands/ein/<short>.md` with valid YAML frontmatter including `description`.

> **Given** the canonical command list exported by `ein-pi/agent/lib/intent-channel.ts`,
> **When** the parity test scans the Pi extension source and `listClaudeCommands()`,
> **Then** every canonical name is found on both sides, and a name present on only
> one side fails the test.

### R3 — Both surfaces resolve to the same, existing skill `[parity]`

Each surface MUST resolve the skill to a file that exists in that runtime's deployed
layout: Pi at `${AGENT_DIR}/skills/local/intent-channel/SKILL.md`
(`LOCAL_SKILLS_DIR`, ein-paths.ts:36), Claude at
`${CLAUDE_CONFIG_DIR}/skills/intent-channel/SKILL.md` (flattened by sync.ts:726).
A surface MUST NOT hardcode the other runtime's path.

> **Given** a synced deployment tree, **When** each surface's skill reference is
> resolved, **Then** both resolve to a readable `SKILL.md` whose frontmatter `name`
> equals `intent-channel`, and the two files have identical content.

### R4 — Zero fixed prompt cost `[contract]`

Adding this skill MUST NOT increase the per-turn prompt bill (`// 001`: "cada byte
que imprime un comando se queda ahí para toda la sesión"). The skill body MUST NOT
appear in `ein-pi/core/AGENTS.md`, `ein-cc/CLAUDE.adapter.md`, the generated
`ein-cc/CLAUDE.md`, `assets/orchestrator.md`, or the materialized style contract.

> **Given** the new skill is present under `core/skills/local/`, **When**
> `compileStyleContract(core/skills/local)` runs, **Then** its `bytes` and `text` are
> unchanged versus before the change, and no coordinator/orchestrator prompt file
> contains the string `intent-channel` protocol body.

### R5 — User-invoked only `[contract]`

Both commands MUST be invocable only by the user. The system MUST NOT register them
as tools, MUST NOT instruct any agent to invoke them, and the skill MUST carry an
activation contract stating it runs only on explicit user invocation.

> **Given** the repo after the change, **When** agent prompts (`ein-pi/core/agents/*.md`),
> the orchestrator asset, and all `registerTool(...)` call sites are scanned,
> **Then** no instruction to call `/ein:intent` or `/ein:eh` is found and no tool
> bears those names.

### R6 — Not a phase, not a gate `[unit]`

`intent.md` MUST NOT be an SDD phase artefact, and its presence MUST NOT change any
deterministic routing answer (`// 004`: a harness that blocks work is bureaucracy).

> **Given** a change directory in a fixture tree, **When** the router's next-phase,
> audit, and lane checks run first without and then with an `intent.md` added,
> **Then** both runs produce identical results, and `intent.md` never appears in the
> phase-artefact map or in an out-of-order-artefact diagnostic.

### R7 — Optional by construction `[contract]`

No phase, command, or gate MAY require `intent.md` to exist. `sdd-scope` and the
lane definitions MUST be unchanged by this change.

> **Given** a change with no `intent.md`, **When** the standard lane runs
> scope → … → close, **Then** no step reports a missing or blocked artefact.

### R8 — Nothing on disk before confirmation `[unit]` + `[manual]`

The session MUST NOT create a directory or write any file before the user explicitly
confirms closure. On confirmation it MUST write exactly one file,
`openspec/changes/<change>/intent.md`.

> **Given** an intent session abandoned mid-rounds, **When** the working tree is
> inspected, **Then** it is unchanged: no new directory under `openspec/changes/`,
> no partial artefact.

### R9 — Safe artefact path `[unit]`

The artefact path resolver MUST reject any change name that fails
`isSafeChangeName` (sdd-router.ts:239) — empty, `archive`, or containing `/`, `\`,
or `..` — and MUST return `<changesDir>/<change>/intent.md` otherwise, honoring the
`openspec/changes` → `.sdd/changes` fallback of `resolveChangesDir`.

> **Given** the input `../../etc`, **When** the resolver is called, **Then** it
> returns a rejection instead of a path, and no write is attempted.
> **Given** `add-intent-channel` in a repo with `openspec/changes/`, **When** the
> resolver is called, **Then** it returns `openspec/changes/add-intent-channel/intent.md`.

### R10 — Artefact shape `[contract]`

`intent.md` MUST contain YAML frontmatter (`change`, `phase: intent`, `created`) and
these sections, in this order: `Petición`, `Decisiones cerradas`, `Hechos
verificados`, `Fuera de alcance`, `Abierto`. Each closed decision MUST record the
option chosen and one line of why. Each verified fact MUST carry a `path:line`
reference obtained from `ein-scout`.

> **Given** the skill, **When** its artefact template is read, **Then** it declares
> exactly those sections, so a future `sdd-scope` consumer can be written against a
> stable shape.

### R11 — Rounds over the decision frontier `[manual]`

`/ein:intent` MUST model the request as a decision tree and ask, per round, only the
decisions whose prerequisites are already closed (the *frontier*). Each question MUST
be numbered and carry a recommended answer. A round MUST be delivered as one plain
text message answerable in one shot (`"1A, 2B"`), never as a modal dialog. The
session MUST end when the frontier is empty and MUST NOT act on the request until the
user confirms.

> **Given** a request with dependent decisions, **When** round 1 is emitted, **Then**
> it contains only prerequisite-free decisions, numbered, each with a recommendation,
> and no decision whose answer depends on an unanswered question in the same round.

### R12 — Facts are found, decisions are asked `[manual]`

Fact-finding MUST be delegated to `ein-scout` and MUST NOT block emission of the
round: the round is presented while scout work is outstanding, and scout results are
folded into the *next* round. The session MUST NOT ask the user for anything the
codebase can answer, and MUST NOT decide anything on the user's behalf.

> **Given** a round needing two facts from the codebase, **When** the round is
> emitted, **Then** the questions are already visible to the user and the scout
> findings arrive with the following round, carrying `path:line` references.

### R13 — `/ein:eh` restates, it does not act `[contract]` + `[manual]`

`/ein:eh` MUST restate the user's last message in plain language using project
vocabulary, and MUST NOT act, edit, delegate, or investigate. The Claude command
MUST declare an empty/absent `allowed-tools` so the restriction is enforced by the
runtime, not merely stated.

> **Given** a dense technical last message, **When** `/ein:eh` runs, **Then** the
> reply is a plain-language restatement only; no tool call and no file change occurs.

### R14 — Busy guard and installer visibility `[contract]`

The Pi handler MUST NOT inject a kickoff while the agent is busy: when `ctx.isIdle()`
is false it MUST notify and return (precedent: ein-skill-registry.ts:505). The new
extension file MUST be listed in `ein-pi/agent/extensions-manifest.json` so installer
verification fails loudly if it is missing after install (`// 003`: what is promised
must exist and execute).

> **Given** a busy session, **When** `/ein:intent` is invoked, **Then** no message is
> injected and the user is told to retry.
> **Given** a fresh install, **When** `verify` runs, **Then** it checks the intent
> extension's presence.

### R15 — Attribution, out of the prompt `[contract]`

`SKILL.md` MUST end with one line crediting `grilling` from mattpocock/skills (MIT,
Copyright 2026 Matt Pocock) and stating what Ein changes: closure to disk via
`intent.md`, and fact-finding delegated to `ein-scout`. That line MUST NOT appear in
the orchestrator prompt or any coordinator file.

> **Given** the skill, **When** the last non-empty line is read, **Then** it contains
> the attribution; **and when** orchestrator/coordinator files are scanned, **Then**
> the line is absent.

### R16 — Language boundary `[contract]`

User-facing prose MUST use the Spanish product vocabulary — "árbol de decisiones",
"frontera", "ronda", and the rule "los hechos los busco yo, las decisiones son
tuyas". Identifiers, file names, command names and code MUST be English (EIN.md
convention).

> **Given** the skill and both command files, **When** their user-facing prose is
> read, **Then** the four vocabulary items are present; **and when** identifiers are
> read, **Then** they are English (`intent-channel`, `ein:intent`, `ein:eh`,
> `intent.md`).

### R17 — First round is independently addressable `[contract]`

The first-round protocol MUST live in its own addressable `##` section of the skill,
so a future caller (the preflight third axis) can request just that round without
loading a different contract. This change MUST NOT add the preflight axis, any
`preflight.json` key, or any auto-launch.

> **Given** the skill, **When** its headings are listed, **Then** a first-round
> section exists as a standalone heading; **and when** `sdd-preflight*.ts` and
> `preflight.json` handling are diffed, **Then** they are untouched.

---

## C. Decisions

### C1 — The map's "critical asymmetry" is a mechanism difference, not a capability gap. Confirmed.

`map.md:22` treats `pi.sendUserMessage()` as a "parity lever not available on the
Claude side" and defers the resolution here. Verified and **refuted as a blocker**:

- `sendUserMessage` is a declared, contract-pinned part of the Pi surface
  (`PI_EXTENSION_API`, pi-contract.ts:63) and is already used in production to inject
  SDD phase instructions (`pi.sendUserMessage(result.prompt)`, ein-ai.ts:1093), plus
  `ein-doctor.ts`, `ein-linear.ts`, `ein-skill-registry.ts:526`.
- In Claude, the command `.md` **is** the injected instruction; the runtime does
  natively what Pi's handler does explicitly.

Both paths end in the same observable event: an instruction enters the session and
the model executes the protocol. That is exactly the functional-not-textual parity
`// 003` demands. The asymmetry is in *how the instruction is delivered*, and it is
absorbed by the surface layer — which is what a surface is for ("los adaptadores son
superficie: traducen, no reimplementan"). **The map's open questions are answered:**
(1) yes, identical observable behavior; (2) yes, the command exists in both, no
handoff-to-Pi; (3) Claude's `.md` is not the protocol — it is a pointer to the shared
skill, so there is no "single round" limitation to work around.

The residual, real risk is not capability but **drift**: two pointers to one text can
stop pointing at the same thing. That is why R1/R3 exist and why the parity test is
the one genuinely new test this change owes.

### C2 — Ownership boundaries

| Responsibility | Owner |
|---|---|
| What the channel does (rounds, frontier, artefact template, `eh` rules) | `core/skills/local/intent-channel/SKILL.md` — once |
| Names, paths, kickoff strings, artefact-path validation | `ein-pi/agent/lib/intent-channel.ts` — pure TypeScript, the shared brain |
| Pi delivery (register + busy guard + inject) | `ein-pi/agent/extensions/ein-intent.ts` |
| Claude delivery (declare + tool allowlist) | `ein-cc/commands/ein/{intent,eh}.md` |
| Deployment | existing `ein-cc/sync.ts` — unchanged |
| Cross-runtime agreement | `tests/intent-channel-parity.test.ts` |

The kickoff builders live in the pure module, not in the extension, so the RED-GREEN
cycle has real units to test without Pi installed — the same discipline as
`pi-contract.ts` ("este fichero NO importa nada de Pi").

### C3 — One skill with two sections, not two skills

`/ein:eh` needs roughly five lines of instruction. A second skill directory for it
would buy an independent activation contract at the price of a second file to keep
in sync and a second entry in every parity assertion. One skill, `intent-channel`,
with clearly separated `##` sections and a command that names the section it runs,
keeps a single source and a single parity assertion.

*Rejected: two skills* (`intent` + `eh`) — duplicate machinery for a five-line rule.
*Rejected: inlining the `eh` rules into both command files* — that is the drift
failure mode of R1, in miniature, and it is exactly how "translated the file name
without the file existing" happens.

Accepted cost: `/ein:eh` loads a skill slightly larger than it needs. It is
user-invoked and occasional; `// 001` is about the *fixed* per-turn bill, which stays
at zero (R4, verified against `compileStyleContract`'s fixed list).

### C4 — The artefact lands in the change directory, but only on confirmation

`listActiveChanges()` (sdd-router.ts:275) makes *any* subdirectory of
`openspec/changes/` an active change. So writing `intent.md` eagerly would let a
half-finished conversation invent an active change — noise in `/ein:status` and
ambiguity when resolving "the active change". Deferring every write to the moment of
user confirmation collapses that risk: an abandoned session leaves zero trace, and a
confirmed one produces a change directory whose next phase is `sdd-scope`, which is
precisely correct — `intent.md` is the input `sdd-scope` will later consume.

*Rejected: a neutral staging area* (`openspec/intent/<slug>.md`) — a second storage
location, a second thing to archive, a second thing `sdd-close` must learn about.
`// 005`: the smallest correct change wins, and the change directory is already the
right home.
*Rejected: requiring an existing change id up front* — that would make the channel
useless for its main case, deciding *before* a change exists (`// 004`).

The change name is asked as part of the closing confirmation, not up front, and is
validated with the existing `isSafeChangeName` rather than a new validator.

### C5 — A new small extension, not a new block inside `ein-ai.ts`

`ein-ai.ts` is already the 1000+ line command hub. `ein-continuity.ts` sets the better
precedent: a small extension exporting a factory (`createEinContinuityExtension`) for
injection plus a default instance, auto-loaded because Pi loads the whole
`extensions/` directory (`cfg.extensions = ["{{AGENT_DIR}}/extensions"]`,
installer/scripts/bundle-template.ts:68). The manifest is a *verification* list, not
a loader — which is why R14 requires adding the entry: without it the installer
cannot notice the command going missing.

*Rejected: registering inside `ein-skill-registry.ts`* — thematically close (both are
"load a skill and run it") but it mixes a user-facing product command into the
registry's internals, and the registry's own commands are advisory tooling, not a
product surface.

### C6 — What is testable, stated honestly

This change is mostly prompt-shaped, and pretending otherwise would produce tests
that assert nothing. The split is explicit in section B: `[unit]` and `[contract]`
and `[parity]` requirements are machine-checked; R11, R12 and the behavioral half of
R13 are `[manual]` — round quality is judged in the transcript, not by grep. Writing
a fake assertion over prose ("the skill contains the word 'ronda'") to claim
coverage of R11 would be the "mentira que pasa los tests" `// 003` names. The
vocabulary greps in R16 are deliberately scoped to *vocabulary presence*, which is
what they can honestly prove, not to behavior.

### C7 — Keeping the preflight door open without opening it

The next change will add a third preflight axis that offers the first round on lane
`standard`. The only thing this design owes that future is an addressable entry
point, so R17 requires the first-round protocol to be its own `##` section. No
`mode` parameter is added to the kickoff builder and no `preflight.json` key is
reserved: speculative parameters that no caller uses are the kind of generality
`// 005` rejects, and a heading is enough for the future caller to aim at.

### C8 — Artefact language

`design.md` is written in English to match `scope.md` and `map.md` of this same
change. The Spanish product vocabulary of R16 is normative *content* — those strings
must be Spanish wherever the user reads them — not a directive about this file.

---

## D. Success Criteria

### Observable acceptance

1. `/ein:intent` and `/ein:eh` are invocable in **both** runtimes and, in each, the
   session begins executing the protocol from `intent-channel/SKILL.md` (R2, R3).
2. An intent session asks numbered, recommended, plain-text rounds; answering
   `"1A, 2B"` advances it; it stops when the frontier is empty and asks for
   confirmation before doing anything (R11).
3. On confirmation, exactly one file appears: `openspec/changes/<change>/intent.md`,
   with the five required sections (R8, R10). Abandoning the session leaves the tree
   untouched (R8).
4. `/ein:eh` returns a plain-language restatement with no tool call and no file
   change (R13).
5. `ein-cc-sdd status` / the Pi router return the same `next:` with and without
   `intent.md` present (R6), and a change never blocks for its absence (R7).
6. The generated `ein-cc/CLAUDE.md` and the orchestrator prompt are byte-identical
   to before the change except for nothing at all — the skill adds zero fixed prompt
   (R4, R15).

### Verification commands

| Check | Command |
|---|---|
| New unit tests (paths, builders, safe-name) | `bun test tests/intent-channel.test.ts` |
| New cross-runtime parity test | `bun test tests/intent-channel-parity.test.ts` |
| Existing surface contracts still hold | `bun test tests/claude-project-settings.test.ts tests/sdd-aliases.test.ts` |
| Fixed prompt did not grow | `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` |
| Router untouched by `intent.md` | `bun test tests/sdd-router*.test.ts` |
| Full suite | `bun test` |
| Types (root: `ein-pi` + `ein-cc`) | `bun run typecheck` |
| Types (installer) | `cd installer && bun run typecheck` |
| Deployment reaches both surfaces | `bun ein-cc/sync.ts --dry` — output must list the two new commands and the new skill |

### Parity checks, named explicitly

- **Command presence**: every name in the canonical list resolves on both sides;
  a command added to only one runtime fails (R2). This is the test `map.md` reported
  as missing ("No test currently enforces that a command name exists in **both**
  runtimes").
- **Skill identity**: both surfaces reference skill `intent-channel`; the deployed
  Pi copy (`skills/local/intent-channel/SKILL.md`) and the deployed Claude copy
  (`skills/intent-channel/SKILL.md`) are byte-identical (R3).
- **No protocol restatement**: neither surface file carries the protocol body (R1).
- **Installer visibility**: the new extension is listed in `extensions-manifest.json`
  so a missing-after-install command is caught by `verify` (R14).

### Manual checks (recorded in `verify-report.md`, not automated)

- One real intent session on a non-trivial request: round 1 contains only
  prerequisite-free decisions; scout facts arrive with round 2 without having
  delayed round 1; the run closes with a confirmation prompt (R11, R12).
- One `/ein:eh` run on a dense message (R13).

---

## Next recommended phase

`sdd-tasks` — slice sections B and D into the RED-GREEN checklist. Suggested cut:
(1) pure module + unit tests, (2) skill, (3) Pi surface + contract test,
(4) Claude surface, (5) parity test, (6) manifest + zero-cost assertions.
