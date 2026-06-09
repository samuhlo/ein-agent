# Ein: guia tecnica de arquitectura

Author: samuhlo

## Proposito

Ein es el workbench local construido sobre Pi Coding Agent. Su objetivo es dar una capa de trabajo segura, didactica y extensible: tareas simples van por ruta barata, tareas complejas escalan a subagentes, y las acciones irreversibles quedan protegidas por hard gates.

## Branding

Archivo:

```text
~/.pi/agent/brand.json
```

Configuracion actual:

```json
{
  "agentName": "Ein",
  "commandPrefix": "ein",
  "author": "samuhlo"
}
```

Ein mantiene identidad fija: `agentName=Ein` y `author=samuhlo`.
Solo `commandPrefix` es configurable.

## Capas del sistema

1. **Politica**: `AGENTS.md` define reglas globales.
2. **Branding**: `ein-brand.ts` carga nombre, prefijo y autor.
3. **Rutas**: `ein-paths.ts` centraliza paths y binarios.
4. **Orquestacion**: el prompt padre decide directo vs agentes/chains visibles; `ein-ai.ts` solo inyecta esa politica y aplica guards pequenos.
5. **Herramientas**: Linear, Doctor, Engram, Context7, MiniMax, backups, guardrails.
6. **Prompts**: workflows diarios en `prompts/`.
7. **Skills**: mantenimiento de stack fijo + advisor de tarea. `/skill:*` queda activo como interfaz nativa de Pi.

## Arquitectura de Agentes: pi-subagents visible

Ein utiliza una arquitectura de **pi-subagents visible**. Esto significa que las capacidades como planificacion, Linear, GitHub y diseno estan implementadas como archivos Markdown en `~/.pi/agent/agents/*.md`, y los workflows repetibles como chains en `~/.pi/agent/chains/*.chain.md`.

### Principios fundamentales

1. **Prompts invisibles al chat.** Ein no reemplaza el mensaje del usuario con prompts internos largos. Las reglas de routing se inyectan via system prompt y permanecen invisibles en la conversacion. Tu texto original se preserva.

2. **Agentes Ein bajo `~/.pi/agent/agents/`.** Linear, GitHub, design y SDD son agentes visibles de Pi. No se duplican con subprocess privados.

3. **`/ein:*` es control manual de emergencia.** Los comandos slash son puntos de entrada para control manual directo. No son la ruta feliz — son el fallback cuando el routing nativo no cubre el caso.

### Agentes y chains visibles

Estos archivos viven en `~/.pi/agent/agents/` y `~/.pi/agent/chains/`:

| Nombre | Proposito | Tipo |
| --- | --- | --- |
| `ein-linear` | Preflight, CRUD Linear, sync y comentarios humanos | Agent |
| `ein-github` | Delivery GitHub, PR, review y sync opcional | Agent |
| `sdd-init`, `sdd-explore`, `sdd-design`, `sdd-apply`, `sdd-verify` | Fases SDD | Agent |
| `ein-sdd` | Flujo SDD unico: init → explore → design → apply → verify | Chain |

El nivel de modelo por agente se configura con `/ein:models` (ver seccion Modelos).

### Como funciona el routing

Cuando hablas con Ein en lenguaje natural:

1. Tu mensaje se entrega **sin modificaciones** al modelo.
2. El system prompt contiene las reglas de routing hacia los agentes nativos.
3. Ein decide si ejecuta directo, delega a un agente visible, o ejecuta una chain SDD/GitHub cuando el flujo lo justifica. Linear start/status usa `ein-linear` directo.
4. Los nombres y outputs de los agentes nativos son **visibles** en la conversacion — no monologos internos ocultos.

### Arquitectura anterior (regression)

Si ves un prompt visible como:

```
Actua como orquestador... HARD REQUIREMENT...
```

Eso es una **regression**. El comportamiento esperado es: texto original del usuario + llamadas visibles a agentes nativos de Pi. No debe aparecer texto de orchestration como parte del chat.

## Orquestador

Archivo:

```text
~/.pi/agent/extensions/ein-ai.ts
```

Responsabilidades:

- cargar el prompt padre Ein,
- preservar input natural sin transformarlo a `/run-chain`,
- aplicar el guard de continuacion ambigua,
- dejar que slash commands explicitas usen rutas manuales,
- limpiar monologo interno,
- aplicar quality gate didactico,
- registrar fallos en telemetria local.

El orquestador visible es la interfaz primaria de UX: cuando hablas con Ein en natural, el orquestador recibe tu peticion, decide el camino y ejecuta. Los comandos slash (`/ein:*`) son puntos de entrada de emergencia para control manual, no la ruta principal.

## Modelos

| Nivel | Uso | Modelo |
| --- | --- | --- |
| Standard | tareas normales | `minimax/MiniMax-M2.7` |
| Heavy | review, seguridad, arquitectura, bloqueos | `openai-codex/gpt-5.5` |
| Planner | orquestacion explicita | `openai-codex/gpt-5.5` |

## Guardrails

Archivo:

```text
~/.pi/agent/extensions/ein-ai.ts
```

Bloquea comandos destructivos, escrituras en secretos y cambios peligrosos en Git. Esta capa protege en runtime; no depende solo del prompt.

## Memoria

Archivo:

```text
~/.pi/agent/mcp.json
```

Ein conecta Engram via MCP (stdio transport):

```json
{
  "mcpServers": {
    "engram": {
      "command": "/opt/homebrew/bin/engram",
      "args": ["mcp", "--tools=agent"],
      "lifecycle": "lazy"
    }
  }
}
```

Capas:

- Engram: `~/.engram-pi` (DB SQLite; 15 tools disponibles en el perfil `agent`).
- Snapshot de sesion: `.piagents/session.md` (generado por Pi runtime).

El perfil `--tools=agent` expone tools de lectura/escritura de memoria para el modelo: `engram_save`, `engram_search`, `engram_context`, `engram_timeline`, entre otras. Instalacion inicial: `engram setup pi`.

Context7 (docs de librerias) corre via `bunx --bun @upstash/context7-mcp` (stdio). La clave `CONTEXT7_API_KEY` se exporta desde `~/.zshrc` y se hereda por el proceso — no va en `mcp.json`.

## Linear

Archivo:

```text
~/.pi/agent/extensions/ein-linear.ts
```

La capa Linear usa `linearGraphql(...)` para queries y `linearMutation(...)` para mutaciones. Las mutaciones pasan por `LINEAR_MUTATION_CONTRACTS` para evitar regresiones de tipos `ID` vs `String`. Estas tools siguen registradas porque `ein-linear` las necesita como capa API; el agente decide el flujo humano.

## Doctor

Archivo:

```text
~/.pi/agent/extensions/ein-doctor.ts
```

Comandos:

```text
/ein:doctor
/ein:doctor-output
```

`/ein:doctor-output` ejecuta smoke checks estaticos del sistema Ein. Revisa core, comandos canonicos, SDD, skills, guardrails, integraciones y contratos Linear. Devuelve `OK`, `OK_WITH_WARNINGS` o `FAIL`.

`/ein:doctor` queda como diagnostico explicativo. `/ein:doctor-output` queda como salida tecnica rapida y verificable.

## Comandos

La interfaz publica canonica usa siempre `/ein:*`.

Grupos principales:

```text
/ein:status
/ein:help [full]
/ein:persona
/ein:models
/sdd-init
/ein:ai:sdd-preflight
/ein:ai:install-sdd
/ein:linear:new
/ein:linear:project-bootstrap
/ein:linear:milestones
/ein:linear:help
/ein:skills
/ein:skills:advisor <tarea>
/ein:doctor
/ein:doctor-output
```

### Skills subsystem

Archivos:

```text
~/.pi/agent/skills/stack-profile.json
~/.pi/agent/skills/skills-lock.json
~/.pi/agent/skills/archived/
```

Reglas:

- `/ein:skills` muestra estado del stack fijo y chequea hashes.
- `/ein:skills update` instala faltantes core y actualiza core cuando cambia hash en fuente.
- `/ein:skills add <skill>` instala skill puntual desde catalogo.
- `/ein:skills clean [--yes]` archiva extras en `archived/` (no borra directo).
- `/ein:skills:advisor <tarea>` mantiene el flujo de resolve/digest para ejecucion.

Algunos aliases legacy se mantienen para no romper memoria muscular ni prompts antiguos, pero no deben documentarse como ruta principal.

### SDD runtime

Ein usa OpenSpec: la configuracion vive en `openspec/config.yaml` y los cambios activos en `openspec/changes/`.

Assets preferidos:

```text
~/.pi/agent/agents/sdd-*.md
~/.pi/agent/agents/ein-*.md
~/.pi/agent/chains/ein-*.chain.md
```

El flujo `ein-sdd` es el unico: `/ein:sdd:new` ejecuta la cadena init → explore → design → apply → verify, donde `design` reune propuesta, spec y tareas. `/ein:sdd-preflight` prepara la sesion con modo de ejecucion y store de artefactos.

## Backups

Archivo:

```text
~/.pi/agent/extensions/ein-backup.ts
```

Ein crea backup automatico al mutar `~/.pi/agent` y permite snapshot manual con:

```text
/ein:backup
```

## Telemetria

Archivo generado bajo demanda:

```text
~/.pi/agent/logs/tool-failures.ndjson
```

Registra fallos de subagentes/tools sin bloquear la respuesta.

## Reglas de mantenimiento

1. `AGENTS.md` es la politica fuente.
2. `brand.json` define el prefijo (`commandPrefix`).
3. No registres comandos con prefijos hardcoded.
4. No agregues alias antiguos salvo decision explicita. Si se agregan, documentalos como compatibilidad, no como interfaz publica.
5. Toda mutacion Linear debe usar `linearMutation(...)`.
6. Los comandos informativos deben ser read-only.
7. Si una tool falla, revisar `tool-failures.ndjson`.
8. Si agregas un comando publico, actualiza `/ein:help full` y `PI_AGENTS_COMANDOS.md`.

## Troubleshooting

### Cambiar el prefijo de comandos

Edita:

```text
~/.pi/agent/brand.json
```

Ejemplo:

```json
{
  "commandPrefix": "tachikoma"
}
```

`agentName` siempre se normaliza a `Ein` y `author` a `samuhlo`.

### Linear falla con GraphQL

Ejecuta:

```text
/ein:doctor-output
```

### No quiero snapshot local

Usa:

```bash
export EIN_MEMORY_MODE=engram-only
```

### El agente no explica suficiente

Revisar `enforceTeachingQuality(...)` en `ein-ai.ts`.
