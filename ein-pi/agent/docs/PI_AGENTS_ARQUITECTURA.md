# Ein: guía técnica de arquitectura

Author: samuhlo

## Propósito

Ein es el workbench local construido sobre Pi Coding Agent. Da una capa de trabajo segura, didáctica y extensible: tareas simples por ruta barata, tareas complejas escalan a subagentes, y las acciones irreversibles quedan protegidas por hard gates.

## Branding

`~/.pi/agent/brand.json`:

```json
{ "agentName": "Ein", "commandPrefix": "ein", "author": "samuhlo" }
```

Identidad fija: `agentName=Ein`, `author=samuhlo`. Solo `commandPrefix` es configurable.

## Capas del sistema

1. **Política**: `AGENTS.md` define reglas globales.
2. **Branding**: `ein-brand.ts` carga nombre, prefijo y autor.
3. **Rutas**: `ein-paths.ts` centraliza paths y binarios.
4. **Orquestación**: el prompt padre (cargado por `ein-ai.ts` desde `assets/orchestrator.md`) decide directo vs agentes/chains.
5. **Herramientas**: Linear, Doctor, Engram, Context7, skills, guardrails.
6. **Skills**: stack curado + advisor de tarea + Context7 para el resto.

## Extensiones (9)

Todas en `~/.pi/agent/extensions/` y cargadas por directorio:

| Extensión | Responsabilidad |
| --- | --- |
| `ein-ai.ts` | Orquestador: inyecta prompt padre, guards, modelos (`/ein:models*`), persona, status, help, install-sdd |
| `ein-banner.ts` | Banner dorado animado al iniciar (gradiente + shine + subtítulo SAMUHLO) |
| `ein-brand.ts` | Identidad de marca (`commandName`, `slashCommand`, persona) |
| `ein-doctor.ts` | Diagnóstico (`/ein:doctor`, `/ein:doctor-output`) |
| `ein-linear.ts` | Capa Linear (GraphQL) + comandos `/ein:linear:*` |
| `ein-paths.ts` | Rutas canónicas del workbench |
| `ein-skill-maintenance.ts` | Updater de skills (`/ein:skills`): locales desde repo + bajadas desde catálogo |
| `ein-skill-registry.ts` | Advisor/registro de skills + digest con Context7 + inyección a subagentes |
| `sdd-init.ts` | Comando `/sdd-init` |

## Agentes y chain visibles

`~/.pi/agent/agents/` y `~/.pi/agent/chains/`:

| Nombre | Tipo | Propósito |
| --- | --- | --- |
| `ein-linear` | Agent | Preflight, CRUD Linear, sync, comentarios humanos |
| `ein-github` | Agent | Delivery GitHub, PR, review |
| `sdd-init/explore/design/apply/verify` | Agent | Fases SDD |
| `ein-sdd` | Chain | Flujo SDD: init → explore → design → apply → verify |

**Invocación de la chain (importante):** el tool `subagent` recibe `chain` como **array de objetos** (pasos), nunca como string. `chain: "ein-sdd"` falla validación. El atajo manual fiable es `/run-chain ein-sdd -- <tarea>`, que expande el nombre a pasos internamente. Ver `assets/orchestrator.md`.

## Routing

1. Tu mensaje se entrega **sin modificar** al modelo.
2. El system prompt contiene las reglas de routing.
3. Ein decide: directo, delega a un agente visible, o ejecuta la chain.
4. Los nombres y outputs de los agentes son **visibles** en la conversación.

Si ves un bloque tipo `Actúa como orquestador... HARD REQUIREMENT...` en el chat, es una **regresión**: el texto del usuario debe preservarse.

## Modelos

Por defecto (preset `full`): orquestador + `sdd-design` → `gpt-5.5`; resto → `MiniMax-M2.7`.

| Comando | Efecto |
| --- | --- |
| `/ein:models` | Menú por agente |
| `/ein:models:full` | Orquestador + `sdd-design` → gpt-5.5, resto → MiniMax-M2.7 |
| `/ein:models:lite` | Todo → MiniMax-M2.7 (escape de rate-limit) |

El orquestador se controla con `defaultProvider`/`defaultModel` en `settings.json`; los subagentes con `~/.pi/ein/models.json`. Cambiar el orquestador requiere reiniciar Pi.

## Guardrails

En `ein-ai.ts`: bloquea comandos destructivos, escrituras en secretos y cambios peligrosos en Git en runtime (no solo por prompt).

## Memoria y MCP

`~/.pi/agent/mcp.json` conecta Engram (stdio) sobre `~/.engram-pi` y Context7 (`bunx --bun @upstash/context7-mcp`). Ambos lazy. `CONTEXT7_API_KEY` se exporta desde el shell rc, no va en `mcp.json`.

El cableado MCP usa **`pi-mcp-adapter`** (declarado en `settings.json` packages): un proxy de un solo tool `mcp()` (~200 tokens) en vez de cargar todas las defs (10k+ tokens/server). Estrategia híbrida:
- **engram** → proxy (`directTools: false`). Sus 15 tools no inflan el contexto; el modelo los descubre on-demand vía `mcp()`. Ahí está el ahorro.
- **context7** → `directTools: true`. Sus 2 tools (`resolve-library-id`, `query-docs`) se exponen como first-class para que el digest de Context7 (`ein-skill-registry.ts`) funcione sin cambios.

Comandos del adapter: `/mcp` (panel), `/mcp setup`, `/mcp reconnect <server>`. Tras tocar `directTools`, `/mcp reconnect context7` fuerza el registro de tools.

## Paquetes (settings.json)

Ein declara en `settings.json` → `packages`: `pi-subagents` (subagentes), `pi-mcp-adapter` (proxy MCP), `@juicesharp/rpiv-ask-user-question` (tool `ask_user_question`: diálogos estructurados en checkpoints), `@juicesharp/rpiv-i18n` (locale; español en `~/.config/rpiv-i18n/locale.json`). Pi resuelve estos paquetes (su subsistema de extensiones es npm por dentro).

## Skills (3 capas)

Archivos:

```text
~/.pi/agent/skills/local/            # opinadas propias (sync desde el repo GitHub)
~/.pi/agent/skills/downloaded/       # set curado de fuentes fiables
~/.pi/agent/skills/stack-profile.json # core, secondary, catalog, context7
~/.pi/agent/skills/skills-lock.json   # instaladas + hash
```

Capas:
1. **local**: insustituibles, sincronizadas desde `samuhlo/ein-agent` (sparse clone).
2. **downloaded**: curado de onmax/antfu/greensock/vercel-labs/yusukebe/midudev.
3. **context7**: lo no listado en `catalog` (mapa `context7` del perfil) se trae on-demand.

Comandos (`ein-skill-maintenance.ts`):
- `/ein:skills` → estado (perfil, drift de hash, fuera de stack).
- `/ein:skills update [--local|--downloaded]` → clona fuentes, hashea, copia si cambió, reconcilia el lock de forma autoritativa.
- `/ein:skills add <skill>` → instala una del catálogo.
- `/ein:skills clean [--yes]` → **borra** las bajadas fuera de `core+secondary` (no archiva).

Advisor (`ein-skill-registry.ts`): `/ein:skills:advisor <tarea>` resuelve skills relevantes y, para techs sin skill curada, emite instrucción de Context7 (`resolve-library-id` + `query-docs`). La inyección a subagentes (`resolveSkillInjection`) incluye tanto rutas `SKILL.md` como la guía de Context7.

## SDD runtime

OpenSpec file-backed: `openspec/config.yaml` y `openspec/changes/`. El flujo `ein-sdd` se lanza por lenguaje natural o por la chain (no por `/ein:sdd:new`). Preparación: `/ein:ai:install-sdd`, `/ein:ai:sdd-preflight`, `/sdd-init`.

## Doctor

`ein-doctor.ts`: `/ein:doctor` (explicado) y `/ein:doctor-output` (smoke estático, ~45 checks: core, MCP, agentes+chain, extensiones (9), skills, guardrails, runtime, integraciones). Devuelve `OK` / `OK_WITH_WARNINGS` / `FAIL`.

## Instalador

Carpeta `installer/` del repo (Bun + TypeScript, compilado a binarios standalone). Comandos del binario `ein`: `install`, `update`, `uninstall`, `restore`, `doctor` (+ menú TUI sin args). Flags: `--yes`, `--no-engram`, `--no-secrets`, `--no-linear`. Backups en `~/.pi/agent/backups/installer/` antes de mutar; restore reversible. Releases por tag `installer-v*` (GitHub Actions cross-compila 4 targets).

## Reglas de mantenimiento

1. `AGENTS.md` es la política fuente.
2. `brand.json` define el prefijo; no hardcodear prefijos.
3. Si añades una extensión, actualiza `CORE_EXTENSIONS` en `ein-doctor.ts` y `installer/src/core/verify.ts`.
4. Toda mutación Linear usa `linearMutation(...)`.
5. Si añades un comando público, actualiza `/ein:help full` y `PI_AGENTS_COMANDOS.md`.
6. Para añadir una skill, edita `catalog` (fuente fiable) o `context7` (mapa) en `stack-profile.json`.

## Troubleshooting

- **Cambiar prefijo**: edita `commandPrefix` en `brand.json`.
- **Linear falla**: `/ein:doctor-output`.
- **Algo roto**: `ein restore` (terminal) recupera un backup.

## Futuro (Fase 2b, no construido)

Selector multi-perfil: `profiles/<persona>.json` + persona acoplada a un stack distinto, para que otras personas instalen Ein con su propio set de skills. La base existe (`stack-profile.json` es un perfil con nombre y `loadProfile()` lee una ruta resoluble); falta el selector.
