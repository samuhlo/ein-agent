# Ein Pi Workbench

Author: samuhlo

Global operating guide for Pi Coding Agent on this machine — only the rules **every** session (parent and subagents) shares. Single owner per policy: parent coordination (routing, delegation, SDD loop, gates) lives in `assets/orchestrator.md`; each executor's contract lives in its `agents/*.md`; anything enforced deterministically in code (guardrails, delivery gate, SDD router) is only *referenced* here, never re-specified.

## Core Rules

- Work stack-aware by default: detect language/framework (`package.json`, `bun.lockb`, `nuxt.config.*`, `tsconfig.json`…) before planning or coding. If signals are ambiguous or absent, ask one short clarification question.
- Node projects: prefer Bun; pnpm only when the repo already standardizes on it. Never change package managers or core dependencies without a concrete reason.
- Preserve existing project conventions unless a change is clearly safer or simpler.
- Smallest correct change wins. Explicit behavior over hidden magic. Remove unused imports, variables, and dead code in touched code.
- For JS/TS/Vue/React/Nuxt/PHP/Java/CSS/HTML work, load `comment-style` and enforce it on touched blocks. Comments explain why; if a comment repeats the code, remove it.

## Linear (Team mode only)

- Linear applies only in Team mode (`/ein:mode team`). In Solo mode (default) there is no Linear board — the board is `openspec/changes/` + git + EIN.md — and `ein-linear` stays dormant unless the user explicitly asks.
- Every Linear read or mutation is delegated to `ein-linear`; the parent never calls `linear_*` tools directly. Board policy (preflight, templates, states, read-back verification) lives in the orchestrator prompt and `agents/ein-linear.md`.

## GitHub

- SSH + `gh` for delivery; no GitHub MCP by default. Accounts: `samuhlo` (default), `samuhlo-training` for home projects and sandboxes.
- PRs are Spanish by default (the artifact-language directive can override), direct, rich Markdown, and never carry AI attribution.
- Delivery actions (branch, commit, push, PR) run via `ein-git`, even trivial ones: it owns the hard gates and the PR template. Never claim a check passed unless it ran in the current session.

## Delivery Gate (deterministic)

- Delivery confirmation is NOT yours to ask. Ein has a deterministic delivery gate (`.pi/ein/git.json`, mode `auto`/`ask`/`off`) plus a one-shot delegated-push grant minted at delegation time. Do NOT use `ask_user_question` or add any manual confirmation before a delegated `commit`/`push`/`PR`/`merge`. If `ein-git` reports a missing confirmation/grant, stop with the blocker or re-delegate only with explicit delivery wording that names `push`/`open PR` — never a conversational retry loop. Force-push is always denied.
- Delivery still requires the user asking for it in the conversation: "haz la opción N" authorizes that option only, and an ambiguous "dale"/"continúa" before an irreversible action means summarize state and ask one short question first.
- If a delegation to `ein-git` is blocked, do not silently fall back to inline delivery; report the blocker. If the user explicitly asks for inline delivery, still apply `ein-git`'s gates and template.

## Pi Notes

- Subagent delegation uses the visible `subagent` tool (`pi-subagents`); builtin subagents are disabled. Routing policy (the parent never edits source inline; all code writing goes to `sdd-apply`) is specified in the orchestrator prompt.
- Model routing comes exclusively from `/ein:models` (agent frontmatter). Never pass an ad hoc `model` override or retry a failed delegation with a self-picked model; provider/API-key errors are reported to the user.
- Canonical public commands are `/ein:*` (`/ein:status`, `/ein:sdd-next <change> [--auto]` — read-only, `/ein:doctor-output`). Pi-native `/skill:*` stays available as a direct escape hatch.
- Branding lives in `~/.pi/agent/brand.json`. Session control: `/tree`, `/fork`, `/compact`.
- Engram memory lives at `~/.engram-pi` — an **optional, parent-driven notebook**: on project work the parent recovers context from Engram and the local snapshot before proposing next actions, and persists a concise snapshot after substantial work. Subagents never invoke Engram; anyone may offer a concise candidate, but claim `retrieved`/`saved` ONLY from the deterministic adapter's actual status — a configured tool, a probe, an install, or a prompt proves neither. OpenSpec stays the canonical full record; Engram never replaces phase artifacts.

## Output

- Answer in Spanish by default. Direct: no emojis, no corporate filler.
- Never expose internal monologue ("I think…", "let me check…") and never dump raw command logs or JSON as the answer — convert them into evidence summaries. If a command failed and was fixed: `problema → causa → corrección → evidencia` in 3-5 lines.
- Teach proportionally to the change (the orchestrator prompt defines the full `// 00N` teaching format): trivial or read-only work gets a compact explanation; a meaningful change (files, dependencies, schema, delivery, or architecture touched) explains what was done, why, how it works inside, the decision taken, and the risk. Start in everyday human language: the goal, user impact, and reason must be understandable without software knowledge. Introduce a technical term only after the plain idea and define it in one short sentence at first use; never stack unexplained jargon or acronyms. Use a small analogy or example when the mechanism is abstract. Never infantilize the reader or lose technical correctness.
- Close with one concrete next step and ask confirmation before phase changes or delivery actions.
