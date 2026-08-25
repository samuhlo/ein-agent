# Design: style-parity-claude

**Change:** `style-parity-claude`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

`compileClaudeSurface` appends the compiled style block to the agents that write
code and to the coordinator. The generated `CLAUDE.md` is regenerated from its
sources.

## B. Spec

- The Claude surface MUST carry the compiled style rules in the `sdd-apply`
  agent and in the coordinator.
- The materialized block MUST equal the contract compiled from the skill.
- Agents that do not write code MUST NOT carry the block.
- A style contract that cannot be compiled MUST fail the surface compilation.

## C. Decisions

### D1 — Materialized at sync, and the difference is written down

In Pi the block is injected per turn, reading the skills from the installed
home. Claude has no per-turn mechanism: its agents are markdown files deployed
by `sync.ts`. So the block is frozen at sync time. That is a real behavioural
difference between runtimes, and hiding it would be the pointer defect all over
again — so a test asserts the materialized text still matches the skill. Edit
the skill without re-syncing and the test falls.

### D2 — The coordinator gets it too, and that is not symmetry for its own sake

Policy says the parent delegates code to `sdd-apply`. Practice says otherwise:
this very session wrote code from the coordinator across six files, which is
precisely why its comments did not follow the style. The block goes where code
actually gets written, not where the policy says it should.

### D3 — Fail the sync, not the deployment

If the style contract cannot compile, `compileClaudeSurface` throws a parity
error. A surface deployed without style is the silent failure this whole unit
exists to remove, and the sync is the right place to stop.

### D4 — Only `sdd-apply` among the agents

`STYLE_CONSUMERS` is a list of one today. It is a list because Cleaner parity
may add a writer later; it is explicit so nobody has to guess who carries 2 KB.

## D. Success Criteria

| # | Proven by |
|---|---|
| 1-2 | The block's own phrases appear in `sdd-apply.md` and the coordinator |
| 3 | The materialized text is asserted to contain the freshly compiled contract |
| 4 | `ein-scout`, `sdd-scope` and `ein-linear` asserted clean |
| 5 | The compiler's fail-closed path, already covered, now reaches the sync |
| 6 | `apply-progress.md` |

## Risks

- **The coordinator grows by 2 KB** (10.5 → 12.6 KB) and it is loaded every
  session, including sessions that never write code. Accepted deliberately:
  the alternative is the pointer that did not work.
- **A stale deployment is only caught by the test**, not at runtime. Someone
  editing the skill on a machine without running the suite gets old rules until
  the next sync.
