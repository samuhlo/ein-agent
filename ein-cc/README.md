# ein-cc — relevo SDD de Ein en Claude Code

Adaptador que despliega EIN a Claude Code en un **config aislado** (`~/.claude-ein`) sin tocar tu `~/.claude`. Escribes `claude` = tu Claude normal; escribes `ein-cc` = el cerebro de Ein. History, projects, sessions y settings **separados**; solo comparten el login (symlink de credenciales).

La entrada normal del producto es `ein`; `ein-cc` es el acceso directo avanzado.
Pi sigue siendo el runtime principal. Claude ofrece una superficie SDD reducida
para trabajo puntual y para retomar el estado que Pi dejó en `openspec/`; no
persigue copiar cada control o extensión de Pi.

## Uso

```bash
bun ein-cc/sync.ts        # compila core → ~/.claude-ein (idempotente)
ein-cc                    # lanza Claude Code con el cerebro de Ein
ein-cc -c                 # continúa la última conversación de ein-cc
claude                    # tu Claude normal, intacto
```

El launcher fuente vive en `ein-cc/launchers/ein-cc.fish` y se instala en `~/.config/fish/functions/`. Setea `CLAUDE_CONFIG_DIR=~/.claude-ein` solo para esa invocación (no contamina tu shell).

`ein-cc` supervisa el Claude nativo sin alterar sus argumentos iniciales. `/ein:handoff status|to pi|to claude|refresh|clear` se intercepta en `UserPromptSubmit` antes del modelo; los handoffs crean una sesión nueva y nunca usan Resume.

## Cómo funciona

`sync.ts` es un mini-compilador (patrón "un cerebro, muchos cuerpos"):

- **Fuente propia canónica** = `runtime/` (agentes + skills propias), compartida con Pi. No se duplica: se traduce/copia en cada sync.
- **Fuentes externas** = `vendor/skills/`; se copian como `skills/downloaded/` sin mezclarlas con la autoría de Ein.
- **Específico de CC** = este dir (`CLAUDE.md`, `settings.json`, `hooks/`). 
- Traduce el frontmatter de agentes Pi→CC (`read→Read`, `find→Glob`, …) y descarta lo específico de Pi (`budget`, `turnBudget`, `completionGuard`…).
- Symlinkea `~/.claude/.credentials.json` (login compartido).

## Estado (por incrementos)

- **✅ Incremento 1 — fundación:** aislamiento vía `CLAUDE_CONFIG_DIR`, launcher, cerebro (`CLAUDE.md`), 10 agentes traducidos (7 SDD + scout/git/linear), ~50 skills, primer gate (deny de force-push vía `permissions`). Verificado: responde como Ein, aislado, sin tocar `~/.claude`.
- **✅ Incremento 2 — SDD reducido:** CLI determinista `ein-cc-sdd status|check|close` (`sdd-cli/cli.ts`). Reutiliza las decisiones deterministas necesarias para leer el cambio, pasar sus puertas y cerrarlo, compiladas en un binario **standalone** bajo `~/.claude-ein/bin/` (no depende del repo en runtime). El launcher lo pone en el PATH; los agentes lo llaman por Bash. Verificado end-to-end: ein-cc en un proyecto real leyó el estado SDD y enrutó por `next:`.
- **✅ Incremento 3 — gate fuerte:** hook `PreToolUse` sobre Bash (`ein-cc-sdd guard`) que reusa los MISMOS patrones que el guardrail de Pi (`evaluateDeniedCommand`/`commandRequiresConfirmation`): destructivos (`rm -rf ~`/`/`, `git reset --hard`, `push --force`, `chmod -R 777`…) → `deny`; `git push`/`rebase`/`branch -D`/`npm publish` → `ask` (confirmación nativa de CC). El sync inyecta el hook con ruta absoluta. Verificado end-to-end: ein-cc intentó `git reset --hard` y el hook lo bloqueó. La maquinaria de grants de Pi no hace falta: el `ask` de CC la cubre.
- **✅ Incremento 4 — MCP:** el sync configura **Context7** (docs on-demand) y **Engram** (memoria, si el binario está) a scope **user** en el `.claude.json` aislado, idempotente. La key de Context7 va por env (el launcher la exporta desde `~/.config/opencode-secrets/context7-api-key`) → sin secretos en el config. Engram usa data dir propio (`~/.engram-ein`). Verificado: rebuild limpio desde cero con un solo `sync`, ambos MCP `✔ Connected`, y ein-cc trajo docs de Hono vía Context7.

- **✅ Incremento 5 — ajustes del proyecto:** Claude lee la configuración que elegiste en Pi (`.pi/ein/*.json`) en vez de arrancar con sus defaults. Un módulo compartido (`project-directives.ts`) recorre el mismo catálogo de ajustes que usa la app de terminal y traduce cada uno a su directiva, reusando los constructores que ya poseen mode/lang/tdd/persona/codegraph. Un hook `SessionStart` los inyecta una vez por sesión vía `ein-cc-sdd settings --hook`. **Fail-closed:** un ajuste que este runtime no puede honrar (`hypa`, que engancha el tool `bash` desde una extensión de Pi) se reporta como `unsupported` con su motivo, nunca se omite en silencio; y un ajuste nuevo en el catálogo sin traducción sale `unhandled` y rompe el contrato. De paso se retiraron las traducciones de `.pi/ein/…`: es configuración **del proyecto**, compartida por los dos runtimes, y reescribirla la convertía en una ruta de la instalación que nadie creaba ni leía.

- **✅ Incremento 6 — cabina:** `/ein:status` y `/ein:settings` como comandos de sesión. Son envoltorios finos sobre el CLI determinista (`!`ein-cc-sdd status`` inyecta la salida antes de que el modelo la vea), así que no hay presentación duplicada ni segunda fuente de verdad. `status` incorpora ahora el resumen de ajustes: contesta *dónde estoy* y *qué reglas rigen* de una vez, que es lo que hace falta al aterrizar tras un handoff. El sync despliega el directorio de comandos entero, no una lista a mano.

  **Los que deliberadamente NO existen aquí:** `/ein:linear`, `/ein:tdd`, `/ein:persona` y demás son selectores interactivos en Pi, y Claude Code no tiene ese widget — un comando que solo dice «ejecuta este bash» no es un control, es documentación disfrazada. La configuración se cambia en Pi o en el launcher (que ya posee ese catálogo) y vale para los dos runtimes, porque vive en el proyecto. `/ein:models` tampoco: el modelo de cada agente sale del frontmatter desplegado, así que es asunto del sync, no de una sesión.

> El binario `ein-cc-sdd` pesa ~90 MB (Bun compila el runtime dentro → cero deps en uso). Vive en `~/.claude-ein/bin/`, fuera del repo; se regenera en cada `sync`.
>
> **Nota de aislamiento:** al compartir login, ein-cc hereda los conectores MCP remotos de tu cuenta claude.ai (Drive/Gmail/Linear). Es inherente a compartir credenciales; no afecta a los MCP locales de ein-cc. Todo lo demás (history, projects, sessions, settings, agents, skills) sigue aislado.

## Alcance deliberadamente menor que Pi

- La **inyección proactiva de skills** en subagentes (Pi `resolveSkillInjection`) no tiene equivalente 1:1: se apoya en el descubrimiento nativo de skills de CC + la instrucción de pasar rutas en la tarea.
- La **re-ejecución de acceptance** del runtime de Pi no existe en CC; la cubren la fase `sdd-verify` + los hooks.
