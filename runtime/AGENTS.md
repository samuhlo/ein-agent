# Ein Pi Workbench

Author: samuhlo

Global operating guide for Pi Coding Agent on this machine — only the rules **every** session (parent and subagents) shares. Single owner per policy: parent coordination (routing, delegation, SDD loop, gates) lives in `assets/orchestrator.md`; each executor's contract lives in its `agents/*.md`; anything enforced deterministically in code (guardrails, delivery gate, SDD router) is only *referenced* here, never re-specified.

This file is the shared coordinator policy source. Claude-specific runtime behavior belongs in `ein-cc/CLAUDE.adapter.md`; `ein-cc/CLAUDE.md` is generated from both inputs and is never an authoritative hand-maintained source.

## Core Rules

- Work stack-aware by default: detect language/framework (`package.json`, `bun.lockb`, `nuxt.config.*`, `tsconfig.json`…) before planning or coding. If signals are ambiguous or absent, ask one short clarification question.
- Node projects: prefer Bun; pnpm only when the repo already standardizes on it. Never change package managers or core dependencies without a concrete reason.
- Preserve existing project conventions unless a change is clearly safer or simpler.
- Smallest correct change wins. Explicit behavior over hidden magic. Remove unused imports, variables, and dead code in touched code.
- For JS/TS/Vue/React/Nuxt/PHP/Java/CSS/HTML work, load `comment-style` and enforce it on touched blocks. Comments explain why; if a comment repeats the code, remove it.
- For a library or framework with no curated skill — especially one you don't know well, or when you get stuck — fetch topic-scoped docs via Context7 (`resolve-library-id` → `query-docs` for the task's specific topic) instead of guessing or loading a whole manual. Apply only what the task needs.

## Intent ownership

- Every ordinary input reaches the parent orchestrator unchanged. No adapter classifier may consume, rewrite, postpone, or reinterpret an interactive, RPC, or extension message before the capable model sees it.
- The parent decides from the complete meaning whether to answer, investigate, start bounded work, or ask for one missing material decision. Conversation and read-only work create no SDD state; clear modifications use the smallest safe harness and `sdd-scope` owns objective, boundaries, and completion criteria when a full change is needed.
- The parent resolves ordinary requests from the conversation. Clear, authorized work proceeds without an intent tool call or a second confirmation. Ask only when a material choice is missing.
- `/ein:intent` is an optional interview for a user who asks for one. Its drafts and `intent.md` preserve that conversation but never gate ordinary delegation, SDD phases, verification, or closing. Existing records remain readable.

## Linear (optional integration)

- Linear is an optional integration, off by default (`/ein:linear`). With it off there is no Linear board — the board is `openspec/changes/` + git + EIN.md — and `ein-linear` stays dormant unless the user explicitly asks.
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
- Canonical public commands are `/ein:*` (`/ein:status`, `/ein:sdd-next <change>` — prints the deterministic route and hands it to the orchestrator, `/ein:doctor-output`). Pi-native `/skill:*` stays available as a direct escape hatch.
- Branding lives in `~/.pi/agent/brand.json`. Session control: `/tree`, `/fork`, `/compact`.

## Project continuity

- Recover project context from the current filesystem, Git, ProjectState/stateRef, and OpenSpec evidence. Re-read live evidence when records disagree.

## Output

- Answer in Spanish by default. Direct: no emojis, no corporate filler.
- Never expose internal monologue ("I think…", "let me check…") and never dump raw command logs or JSON as the answer — convert them into evidence summaries. If a command failed and was fixed: `problema → causa → corrección → evidencia` in 3-5 lines.
- Teach proportionally: multi-part plans use numbered `// 00N` sections, with flexible titles and as many sections as the plan needs. Make the goal, steps, relationships and checks clear in plain language. Title each step by what the person will notice; keep internal agent names out of headings. Explain jargon at first use, even if the user used it. A localized fix can use a few paragraphs; reserve the full seven-section format for complex completed changes.
- Close with one concrete next step. Honor existing authorization; phase routing and delivery confirmation belong to their deterministic gates, not repeated conversational questions.
