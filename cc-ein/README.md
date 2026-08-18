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

`cc-ein` supervisa el Claude nativo sin alterar sus argumentos iniciales. `/ein:handoff status|to pi|to claude|refresh|clear` se intercepta en `UserPromptSubmit` antes del modelo; los handoffs crean una sesión nueva y nunca usan Resume.

## Cómo funciona

`sync.ts` es un mini-compilador (patrón "un cerebro, muchos cuerpos"):

- **Fuente canónica** = `ein-pi/core/` (agentes + skills), compartida con Pi. No se duplica: se traduce/copia en cada sync.
- **Específico de CC** = este dir (`CLAUDE.md`, `settings.json`, `hooks/`). 
- Traduce el frontmatter de agentes Pi→CC (`read→Read`, `find→Glob`, …) y descarta lo específico de Pi (`budget`, `turnBudget`, `completionGuard`…).
- Symlinkea `~/.claude/.credentials.json` (login compartido).

## Estado (por incrementos)

- **✅ Incremento 1 — fundación:** aislamiento vía `CLAUDE_CONFIG_DIR`, launcher, cerebro (`CLAUDE.md`), 10 agentes traducidos (7 SDD + scout/git/linear), ~50 skills, primer gate (deny de force-push vía `permissions`). Verificado: responde como Ein, aislado, sin tocar `~/.claude`.
- **✅ Incremento 2 — paridad SDD:** CLI determinista `cc-ein-sdd status|check|close` (`sdd-cli/cli.ts`). Reusa el MISMO core que Pi (`ein-pi/agent/lib` — `sdd-router`/`sdd-guardrails`/`sdd-close`, TS puro), compilado a binario **standalone** en `~/.claude-ein/bin/` (no depende del repo en runtime). El launcher lo pone en el PATH; los agentes lo llaman por Bash. Verificado end-to-end: cc-ein en un proyecto real leyó el estado SDD y enrutó por `next:`.
- **✅ Incremento 3 — gate fuerte:** hook `PreToolUse` sobre Bash (`cc-ein-sdd guard`) que reusa los MISMOS patrones que el guardrail de Pi (`evaluateDeniedCommand`/`commandRequiresConfirmation`): destructivos (`rm -rf ~`/`/`, `git reset --hard`, `push --force`, `chmod -R 777`…) → `deny`; `git push`/`rebase`/`branch -D`/`npm publish` → `ask` (confirmación nativa de CC). El sync inyecta el hook con ruta absoluta. Verificado end-to-end: cc-ein intentó `git reset --hard` y el hook lo bloqueó. La maquinaria de grants de Pi no hace falta: el `ask` de CC la cubre.
- **✅ Incremento 4 — MCP:** el sync configura **Context7** (docs on-demand) y **Engram** (memoria, si el binario está) a scope **user** en el `.claude.json` aislado, idempotente. La key de Context7 va por env (el launcher la exporta desde `~/.config/opencode-secrets/context7-api-key`) → sin secretos en el config. Engram usa data dir propio (`~/.engram-ein`). Verificado: rebuild limpio desde cero con un solo `sync`, ambos MCP `✔ Connected`, y cc-ein trajo docs de Hono vía Context7.

- **✅ Incremento 5 — ajustes del proyecto:** Claude lee la configuración que elegiste en Pi (`.pi/ein/*.json`) en vez de arrancar con sus defaults. Un módulo compartido (`project-directives.ts`) recorre el mismo catálogo de ajustes que usa la app de terminal y traduce cada uno a su directiva, reusando los constructores que ya poseen mode/lang/tdd/persona/codegraph. Un hook `SessionStart` los inyecta una vez por sesión vía `cc-ein-sdd settings --hook`. **Fail-closed:** un ajuste que este runtime no puede honrar (`hypa`, que engancha el tool `bash` desde una extensión de Pi) se reporta como `unsupported` con su motivo, nunca se omite en silencio; y un ajuste nuevo en el catálogo sin traducción sale `unhandled` y rompe el test de paridad. De paso se retiraron las traducciones de `.pi/ein/…`: es configuración **del proyecto**, compartida por los dos runtimes, y reescribirla la convertía en una ruta de la instalación que nadie creaba ni leía.

- **✅ Incremento 6 — cabina:** `/ein:status` y `/ein:settings` como comandos de sesión. Son envoltorios finos sobre el CLI determinista (`!`cc-ein-sdd status`` inyecta la salida antes de que el modelo la vea), así que no hay presentación duplicada ni segunda fuente de verdad. `status` incorpora ahora el resumen de ajustes: contesta *dónde estoy* y *qué reglas rigen* de una vez, que es lo que hace falta al aterrizar tras un handoff. El sync despliega el directorio de comandos entero, no una lista a mano.

  **Los que deliberadamente NO existen aquí:** `/ein:mode`, `/ein:tdd`, `/ein:persona` y demás son selectores interactivos en Pi, y Claude Code no tiene ese widget — un comando que solo dice «ejecuta este bash» no es un control, es documentación disfrazada. La configuración se cambia en Pi o en el launcher (que ya posee ese catálogo) y vale para los dos runtimes, porque vive en el proyecto. `/ein:models` tampoco: el modelo de cada agente sale del frontmatter desplegado, así que es asunto del sync, no de una sesión.

> El binario `cc-ein-sdd` pesa ~90 MB (Bun compila el runtime dentro → cero deps en uso). Vive en `~/.claude-ein/bin/`, fuera del repo; se regenera en cada `sync`.
>
> **Nota de aislamiento:** al compartir login, cc-ein hereda los conectores MCP remotos de tu cuenta claude.ai (Drive/Gmail/Linear). Es inherente a compartir credenciales; no afecta a los MCP locales de cc-ein. Todo lo demás (history, projects, sessions, settings, agents, skills) sigue aislado.

## Huecos honestos (vs Pi)

- La **inyección proactiva de skills** en subagentes (Pi `resolveSkillInjection`) no tiene equivalente 1:1: se apoya en el descubrimiento nativo de skills de CC + la instrucción de pasar rutas en la tarea.
- La **re-ejecución de acceptance** del runtime de Pi no existe en CC; la cubren la fase `sdd-verify` + los hooks.
