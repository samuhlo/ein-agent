# Guia Ein Workbench

Esta guia explica Ein, el workbench local construido sobre Pi Coding Agent. Ein no elimina OpenCode: lo deja intacto como rollback y reconstruye los flujos importantes con extensiones, prompts, skills y pi-subagents visibles.

## Idea Simple

- Ein es la capa operativa principal sobre Pi.
- OpenCode queda intacto como rollback.
- Las reglas globales viven en `~/.pi/agent/AGENTS.md`.
- Los comandos viven como prompt templates y extension commands en `~/.pi/agent/prompts` y `~/.pi/agent/extensions`.
- Las skills viven dentro de Pi, separadas entre `downloaded` y `local`. Los comandos `/skill:*` siguen activos.
- El prompt padre de Ein decide entre trabajo directo, agentes visibles y el flujo `ein-sdd`. La chain queda para el flujo SDD explicito o slash commands manuales.
- Engram de Pi esta separado en `/Users/samu/.engram-pi`.

## Como Arrancar

En una nueva terminal:

```bash
pi
```

Si la terminal actual aun no conoce el binario:

```bash
export PATH="$HOME/.bun/bin:$PATH"
pi
```

## Comandos Principales

Trabajo simple:

```text
Pide el cambio normal. Pi puede resolverlo directo.
```

Trabajo complejo:

```text
Describe la tarea en lenguaje natural. Ein conserva tu texto y decide la ruta.
```

Los comandos slash siguen disponibles como fallback/manual control cuando quieras forzar una ruta.

Si quieres saltarte el orquestador a proposito:

```text
directo: <tarea>
```

```text
/ein:sdd:init
/ein:sdd:new <cambio>
/ein:sdd:apply <cambio>
/ein:sdd:verify <cambio>
/ein:sdd:continue <cambio>
```

```text
/ein:linear:new <request>
/ein:linear:start <issue-id>
/ein:linear:sync <issue-id>
/ein:linear:verify <issue-id>
/ein:linear:close <issue-id>
```

```text
/ein:github:branch <issue-or-topic>
/ein:github:commit <issue-or-topic>
/ein:github:pr <issue-or-topic>
/ein:github:review [pr-or-diff]
/ein:github:sync <issue-id>
/ein:github:coderabbit [pr] [--wait N] [--fix] [--push]
```

```text
/ein:skills
/ein:skills update
/ein:skills add zod
/ein:skills clean
/ein:skills:advisor <tarea>
/ein:backup
/ein:doctor-output
```

Algunos comandos antiguos quedan como aliases de compatibilidad cuando existen. No son la interfaz publica recomendada; usa siempre `/ein:*` en documentacion, prompts y uso diario.

## Que Migro

- Reglas globales de trabajo, stack detection, GitHub, Linear y teaching mode.
- Skills copiadas dentro de Pi:
  - `~/.pi/agent/skills/local`
  - `~/.pi/agent/skills/downloaded`
- Comandos diarios como templates y extension commands.
- Guardrails para bloquear comandos destructivos y rutas sensibles.
- Auth de MiniMax en `auth.json` y secreto MCP sincronizado en `/Users/samu/.config/opencode-secrets/minimax-api-key`; no compartir, no commitear, no pegar en logs.
- Auth de Linear en `/Users/samu/.config/opencode-secrets/linear-api-key`; la extension tambien acepta `LINEAR_API_KEY` o `LINEAR_TOKEN` si prefieres entorno.
- Herramientas Engram basicas mediante CLI local: `engram_context`, `engram_search`, `engram_save`.
- Orquestador Pi con routing simple/directo vs agents/chains visibles.
- Delegacion visible con `pi-subagents`:
  - `ein-linear`
  - `ein-github`
  - `sdd-*` (init, explore, design, apply, verify)
  - chain `ein-sdd`
- Bloque 4 skills reforzado:
  - `ein_skill_registry`
  - `ein_skill_resolve`
  - `ein_skill_digest`
  - `ein_skill_feedback`

- Mantenimiento simple de stack fijo:
  - `~/.pi/agent/skills/stack-profile.json`
  - `~/.pi/agent/skills/skills-lock.json`
  - `~/.pi/agent/skills/archived/`
  - `/ein:skills` (status)
  - `/ein:skills update` (faltantes + updates por hash)
  - `/ein:skills add <skill>`
  - `/ein:skills clean [--yes]`
  - `/ein:skills:advisor <tarea>` (resolve/digest)
- Doctor-output ampliado:
  - core y branding,
  - comandos canonicos,
  - SDD prompts/chains/agentes,
  - skills,
  - guardrails,
  - integraciones,
  - contratos Linear.

## Que No Migro 1:1

- MCP nativo: Pi no trae MCP de serie.
- Subagentes OpenCode: Ein usa `pi-subagents` visibles en lugar de copiar wrappers de OpenCode.
- Plan mode OpenCode: Pi no trae plan mode nativo.

## Modelos

- Base/default: `minimax/MiniMax-M2.7`.
- Heavy/escalation: `openai-codex/gpt-5.5`.
- Orquestador explicito: `openai-codex/gpt-5.5`.
- `minimax-cn` fue eliminado de auth para evitar usar la region China por error.

## Diagnostico Rapido

Usa `/ein:status` para ver estado operativo con salida compacta `/// 000`.

Usa `/ein:doctor-output` para un smoke test tecnico verificable. El resultado puede ser `OK`, `OK_WITH_WARNINGS` o `FAIL`.

Usa `/ein:doctor` cuando quieras una lectura explicada y didactica del estado general.

## Como Pensarlo

OpenCode tenia funciones integradas en `opencode.json`. Pi prefiere primitivas:

- instrucciones en `AGENTS.md`
- skills bajo demanda
- prompts para comandos
- extensiones TypeScript para comportamiento real
- sesiones con arbol para navegar y bifurcar contexto

La migracion buena no copia el JSON: reconstruye el workflow en piezas mas simples.

## Flujo SDD

- **Flujo unico `ein-sdd`**: init → explore → design → apply → verify. `design` reune propuesta, spec y tareas en un solo artefacto.
- **Apply** no ocurre automaticamente despues de planificar; hace falta scope aprobado.
- **Linear** arranca por `ein-linear` (preflight obligatorio antes de SDD salvo "no linear").

## Rollback

OpenCode sigue disponible:

```bash
opencode-trabajo
ocw
```

No se ha borrado ni mutado `/Users/samu/.config/opencode-trabajo/opencode`.
