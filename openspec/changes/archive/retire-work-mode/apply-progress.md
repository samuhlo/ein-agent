status: complete

# Apply progress: retire-work-mode

**Lane:** micro · **TDD:** strict

## Group 001 — the integration replaces the mode

- **RED** — `tests/mode.test.ts` is renamed to
  `tests/linear-integration.test.ts` and rewritten against a module that does
  not exist yet: 12 contracts covering default, round-trip, legacy migration,
  precedence, corruption, inspection provenance and both directive texts.
  Module not found: 1 fail.
- **GREEN** — `ein-pi/agent/lib/mode.ts` is renamed to
  `linear-integration.ts`. `EinMode = "solo" | "team"` becomes
  `LinearIntegration = "off" | "on"` with `off` as the default; the reader
  accepts the new `linear` key and the legacy `mode` key. 12 pass / 0 fail.
- **TRIANGULATE** — four independent axes beyond the happy path: a legacy
  `{"mode":"team"}` resolves to `on` **and the file bytes are asserted
  unchanged** after the read; `{"mode":"solo"}` resolves to `off`; with both
  keys present `linear` wins; and an unknown value (`"quizas"`) resolves to
  `off` while `inspect` still reports `invalid` with its provenance.
- **REFACTOR** — the module header records why the file on disk keeps its old
  name while the module does not: `mode.json` is user state, and moving it
  belongs to the deferred migration unit.

## Group 002 — the consumers

- **RED** — `bun run typecheck`: 8 errors across `ein-ai`, `ein-banner`,
  `ein-skill-registry`, `workbench`, and two test files. The compiler is the
  test for a rename, which is why this group is compiler-driven rather than
  assertion-driven.
- **GREEN** — eight consumers rewired: banner label, status line, prompt
  builder, skill gate (`skillAllowedInMode` → `skillAllowedWithLinear`),
  directive translator, persona, workbench advisor reader, and the settings
  catalogue (`mode: solo|equipo` → `linear: apagada|encendida`). Typecheck
  clean.
- **TRIANGULATE** — the settings contracts were rewritten rather than deleted:
  the catalogue id list, the write-through-owner path (asserting the file keeps
  its legacy name and gains the new key), the refusal of an unknown id, and the
  refusal of a value outside the declared options.
- **REFACTOR** — the advisor's generic `mode` slot is documented instead of
  renamed. It is that subsystem's vocabulary for "one inspected configuration",
  and expanding this change into `shared-config-update-advisor` and its tests
  would have widened the blast radius for a cosmetic gain.

## Group 003 — the told story

- **RED** — full suite: 3 failures, all of them surfaces still asserting a work
  mode (`project directives` ×2, `Claude reads the project settings` ×1).
- **GREEN** — the command becomes `/ein:linear` with its two i18n strings; the
  shared policy in `ein-pi/core/AGENTS.md`, the orchestrator prompt, the
  `ein-linear` agent contract, the `ein-discipline` skill and the workflow guide
  stop describing a two-valued mode; `cc-ein/CLAUDE.md` is regenerated from its
  sources rather than hand-edited.
- **TRIANGULATE** — the failing tests exposed a real consequence of decision D1:
  the `writeSetting` helper assumes `<id>.json` with a `mode` key, a convention
  this setting deliberately breaks. The tests now write the real file and say
  why, instead of being bent to match the helper.
- **REFACTOR** — the orchestrator prompt went from 43.006 to 42.988 bytes. The
  rename did not buy prose.

## Group 004 — the guards that fix the old vocabulary

- **RED** — full suite: 4 further failures, all of them contracts asserting the
  retired vocabulary. `tests/solo-team-narrative.test.ts` (3) required the
  orchestrator to say "work mode / solo / team" and the agent contract to say
  "Team mode only"; `tests/core-parity-coordinator.test.ts` (1) listed
  `## Linear (Team mode only)` among the headings that must live in the shared
  source and not in the Claude adapter.
- **GREEN** — the narrative guard is renamed to
  `tests/linear-optional-narrative.test.ts` and rewritten against the new
  vocabulary; the parity heading list is updated. 17 pass in the parity file,
  6 pass in the narrative file.
- **TRIANGULATE** — the rewritten guard is strictly stronger than the one it
  replaces: besides asserting the new wording, it now asserts the **absence** of
  `work mode`, `team mode` and `solo mode` in the orchestrator, so the retired
  setting cannot creep back into the prompt unnoticed.
- **REFACTOR** — none needed; the guard's own comment carries the history of the
  two vocabulary changes so its next reader knows why it exists.

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
