# cc-ein — el cerebro de Ein en Claude Code

Adaptador que despliega EIN a Claude Code en un **config aislado** (`~/.claude-ein`) sin tocar tu `~/.claude`. Escribes `claude` = tu Claude normal; escribes `cc-ein` = el cerebro de Ein. History, projects, sessions y settings **separados**; solo comparten el login (symlink de credenciales).

## Uso

```bash
bun cc-ein/sync.ts        # compila core → ~/.claude-ein (idempotente)
cc-ein                    # lanza Claude Code con el cerebro de Ein
cc-ein -c                 # continúa la última conversación de cc-ein
claude                    # tu Claude normal, intacto
```

El launcher (`cc-ein.fish`) se instala en `~/.config/fish/functions/`. Setea `CLAUDE_CONFIG_DIR=~/.claude-ein` solo para esa invocación (no contamina tu shell).

## Cómo funciona

`sync.ts` es un mini-compilador (patrón "un cerebro, muchos cuerpos"):

- **Fuente canónica** = `ein-pi/core/` (agentes + skills), compartida con Pi. No se duplica: se traduce/copia en cada sync.
- **Específico de CC** = este dir (`CLAUDE.md`, `settings.json`, `hooks/`). 
- Traduce el frontmatter de agentes Pi→CC (`read→Read`, `find→Glob`, …) y descarta lo específico de Pi (`budget`, `turnBudget`, `completionGuard`…).
- Symlinkea `~/.claude/.credentials.json` (login compartido).

## Estado (por incrementos)

- **✅ Incremento 1 — fundación (funciona):** aislamiento vía `CLAUDE_CONFIG_DIR`, launcher, cerebro (`CLAUDE.md`), 10 agentes traducidos (7 SDD + scout/git/linear), ~50 skills, primer gate de seguridad (deny de force-push vía `permissions`). Verificado: responde como Ein, aislado, sin tocar `~/.claude`.
- **⏳ Incremento 2 — paridad SDD:** portar el core determinista (`sdd-router.ts`, `sdd-guardrails.ts` — TS puro, sin API de Pi) a un CLI `cc-ein-sdd status|check|close` que los agentes llaman por Bash. Es lo que da la máquina de estados SDD real.
- **⏳ Incremento 3 — gates fuertes:** el bloqueador de comandos destructivos y el delivery gate como hooks `PreToolUse` (script + `settings.json`).
- **⏳ Incremento 4 — MCP:** Context7 (+ Engram) vía `claude mcp add` sobre el config aislado.

## Huecos honestos (vs Pi)

- La **inyección proactiva de skills** en subagentes (Pi `resolveSkillInjection`) no tiene equivalente 1:1: se apoya en el descubrimiento nativo de skills de CC + la instrucción de pasar rutas en la tarea.
- La **re-ejecución de acceptance** del runtime de Pi no existe en CC; la cubren la fase `sdd-verify` + los hooks.
