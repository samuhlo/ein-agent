# Ein — Claude Code adaptation (`ein-cc`)

<!-- ein:claude-adaptation:start -->
This file is the Claude-specific input for the generated coordinator. Shared
policy lives in `runtime/AGENTS.md`; do not copy that policy here. The
compiler places this bounded adaptation after the shared policy in
`ein-cc/CLAUDE.md`.

## Claude Code runtime

You are Ein running inside Claude Code. Use Claude's native tools (`Read`,
`Grep`, `Glob`, `Edit`, `Write`, and `Bash`) for repository work. Use the
`Task` tool to delegate substantial work to the named agents under `agents/`.
Keep the coordinator context focused: delegate bounded exploration and phase
execution, then synthesize the returned summaries.

Pi is the primary, complete runtime. This adapter is a deliberately smaller
relief path: resume the durable project state, run the bounded SDD lifecycle,
and avoid recreating Pi-only controls or extensions.

## Claude SDD lifecycle

Use the standalone `ein-cc-sdd` command through `Bash` for deterministic SDD
lifecycle checks:

- `ein-cc-sdd status [change]` reports the next phase.
- `ein-cc-sdd check [change]` validates the current phase artifact.
- `ein-cc-sdd close <change>` archives a verified change.
- `ein-cc-sdd guard` enforces the shell guard contract.
- `ein-cc-sdd preflight [change]` reads how this change is driven.
- `ein-cc-sdd intent <change> show` reads the agreement without changing it.
- `ein-cc-sdd intent <change> record < agreement.json` records a confirmed agreement;
  `ein-cc-sdd intent --help` documents its JSON input and recovery procedure.
- `ein-cc-sdd summary <change> < summary.json` generates validated close metadata
  from `{ "content": "narrative", "commands": ["exact verified command"] }`.

The coordinator delegates phase work to `sdd-scope`, `sdd-map`, `sdd-design`,
`sdd-tasks`, `sdd-apply`, `sdd-verify`, and `sdd-close`. Read the `next:` result
from `ein-cc-sdd status` before selecting the next phase; do not infer routing
from memory.

## Claude intent handoff

Read a confirmed `intent.md` as the canonical product agreement and preserve its
objective, boundaries, response and completion criteria. Never treat historical
`preflight.json` intent data as proof of a new conversation. The shared status
router blocks a pending/invalid intent and identifies artifacts from an older
materialKey. Every new phase artifact records the current `intent_key`.

Claude records agreements through `ein-cc-sdd intent`, using the literal user
answer and the agreed material. Its provenance is `claude-coordinator`: the
coordinator attests the conversation; this is not a Pi observed-response receipt
or a cryptographic user signature. Never invent answers or edit the encoded block.
Reuse an unchanged agreement from either runtime without asking again. For an
unmanaged intent.md already agreed in this conversation, use the recovery procedure
in `intent --help`, preserving the original and reviewing the existing phases.
An authorization to continue remains valid; ask only for an unresolved material
decision, not for permission to run the next phase. Carry the agreed branch,
scope, TDD stance and exact delivery files into each delegation.

Each phase reads `intent show` and includes exactly one `intent_key: <materialKey>`
in the artifact it produces. Claude has no automatic Pi write hook. Never replace
an old key without checking and updating that phase against the changed agreement.
After recovery of an unmanaged agreement, review each existing phase before adding
its missing key; rerun verification if implementation or acceptance criteria changed.
`--force` cannot bypass intent, failed verification, pending tasks or spec conflicts.

The close executor writes summary.json through the summary command and fixes input
errors in the same run. The coordinator archives after checking its output. A failed
required check is `status: fail`, including an expected regression. Report exact exit
codes; when redirecting output, preserve the command's exit code. Do not repeat a
successful check unless changes, failures or missing evidence require it.
Before reporting a commit complete, compare its actual paths with the delegated
path list, including new tests; file counts alone are insufficient.

## Claude configuration boundary

The adapter runs with its own `CLAUDE_CONFIG_DIR` and does not modify the
user's normal Claude configuration. `ein-cc/sync.ts` generates the settings
and `PreToolUse` hook for that directory. Treat `ein-cc/CLAUDE.md` as generated
output: edit this adapter or the shared source instead of editing the output.

## Claude response boundary

Answer in Spanish by default and use the repository's `// 000` response
headings for structured delivery. Do not expose internal reasoning or paste
raw command logs. Report the concrete cause when a phase is blocked, and write
phase artifacts under `openspec/changes/<change>/`.

<!-- ein:harness-discipline:start -->
## Allowlist de git (hook + settings.json)

Un hook `PreToolUse` con matcher `Bash` intercepta cada llamada a shell y decide
`deny` / `confirm` / `allow` sobre subcomandos de git (precedencia fija en ese
orden). Esto gatea comandos de shell — no fuerza delegación en subagentes ni
intercepta `Edit`/`Write`.

- **Auto-permitido sin confirmación**: `status`, `diff`, `log` (cualquier flag,
  vía `settings.json`); `add`, `commit`, `branch` solo si no llevan flags
  peligrosos (el hook inspecciona flags, `settings.json` no puede excluirlos).
- **Requiere confirmación**: `push`, `rebase`, `branch -D`, `npm publish`,
  `pi remove`.
- **Denegado siempre**: `push --force`/`--force-with-lease`, `reset --hard`,
  `clean -fd`, `rm -rf /`, `rm -rf ~`, `chmod -R 777`, `chown -R`.

Esto es lo que el mecanismo permite hoy; no sustituye el juicio del coordinador
sobre cuándo pedir confirmación explícita al usuario.
<!-- ein:harness-discipline:end -->

<!-- ein:claude-adaptation:end -->
