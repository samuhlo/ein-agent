# Ein: guía de comandos

Author: samuhlo

Esta es la lista de comandos **reales** de Ein. Si un comando no está aquí, no existe.

## Antes de nada

La forma normal de usar Ein es **hablarle en lenguaje natural**. No necesitas comandos. Los comandos `/ein:*` son control manual: úsalos cuando quieras forzar algo concreto.

El prefijo (`ein`) sale de `~/.pi/agent/brand.json`. Si quieres otro prefijo, cambia solo `commandPrefix` ahí; `agentName` (Ein) y `author` (samuhlo) son fijos.

---

## Estado y ayuda

| Comando | Qué hace |
| --- | --- |
| `/ein:status` | Vista rápida del sistema (agentes, chains, skills, proyecto, MCP) |
| `/ein:init` | Genera/refresca `EIN.md` (contexto de proyecto: comandos, arquitectura, convenciones). Zona auto regenerable + zona curada que no se pisa |
| `/ein:help` | Lista compacta de comandos |
| `/ein:help full` | Guía completa por grupos |
| `/ein:persona` | Muestra/cambia la persona activa (solo **tono**) |
| `/ein:persona samuhlo` | Modo docente (explica con estructura) |
| `/ein:persona neutral` | Modo directo (texto plano) |
| `/ein:lang` | Idioma de conversación/UI y de artefactos (ver «Idioma») |
| `/ein:resume` | Lista sesiones recientes (todos los proyectos) con `pi --session <id>` para recuperarlas |

Recuperar una sesión: `pi -c` (continuar la última), `pi -r` (elegir de una lista), o `pi --session <id>` (una concreta). El banner muestra las sesiones recientes al arrancar.

## Modelos

| Comando | Qué hace |
| --- | --- |
| `/ein:models` | Ver o cambiar el modelo de cada agente (menú) |
| `/ein:models:full` | Orquestador + `sdd-design` → `gpt-5.5`, resto → `MiniMax-M2.7` |
| `/ein:models:lite` | Todos los agentes → `MiniMax-M2.7` (escape cuando gpt-5.5 se queda sin cupo) |

> Cambiar el modelo del orquestador requiere reiniciar Pi. Los subagentes cambian al instante.

## Idioma

Dos ejes independientes, configurables con `/ein:lang`:

| Eje | Qué controla | Dónde se guarda |
| --- | --- | --- |
| **Conversación / UI** | Cómo te habla Ein + interfaz (help, paneles, notificaciones) | Locale compartido de `rpiv-i18n` (`~/.config/rpiv-i18n/locale.json`), global |
| **Artefactos** | PR, commits, issues y comentarios de Linear | `.pi/ein/lang.json` del proyecto; hereda el de conversación si no se fija |

- Idiomas hoy: **es** (por defecto) y **en**. `gl` contemplado, UI pendiente.
- El eje conversación/UI también responde a `pi --locale <code>` y a `/languages` (picker de `rpiv-i18n`).
- El cambio toma efecto al **reiniciar Pi** o abrir sesión nueva.
- La persona (`/ein:persona`) controla el **tono**, no el idioma: son ortogonales.

## SDD (trabajo serio en 5 fases)

El flujo SDD es `init → explore → design → apply → verify`. Se usa **hablando natural** ("continúa con SDD") o lanzando la chain `ein-sdd`. Para prepararlo:

| Comando | Qué hace |
| --- | --- |
| `/ein:ai:install-sdd` | Instala el OpenSpec en el proyecto actual |
| `/ein:ai:sdd-preflight` | Preflight (Linear + repo) antes de una sesión SDD |
| `/sdd-init` | Inicializa el contexto SDD mínimo (`openspec/config.yaml`) |

> No existe `/ein:sdd:new` ni `/ein:sdd:apply`. El flujo se lanza por lenguaje natural o por la chain.

## Skills

| Comando | Qué hace |
| --- | --- |
| `/ein:skills` | Estado del stack (perfil, drift de hash, fuera de stack) |
| `/ein:skills update` | Actualiza locales (desde tu repo) + bajadas (desde el catálogo) |
| `/ein:skills update --local` | Solo las locales |
| `/ein:skills update --downloaded` | Solo las bajadas |
| `/ein:skills add <skill>` | Instala una skill del catálogo (ej. `/ein:skills add vue`) |
| `/ein:skills clean` | Lista las skills fuera de stack en `downloaded/` |
| `/ein:skills clean --yes` | Borra las skills fuera de stack |
| `/ein:skills:advisor <tarea>` | Resuelve qué skills usar para una tarea + digest con Context7 |

El advisor, para tecnologías sin skill curada (drizzle, zod, tailwind...), indica traer la doc fresca con Context7 (`resolve-library-id` + `query-docs`).

Comandos legacy del registro (compatibilidad, no la ruta principal): `/skill-registry`, `/skill-registry:refresh`.

## Linear

| Comando | Qué hace |
| --- | --- |
| `/ein:linear:new <petición>` | Crea o reutiliza proyecto/issue con preflight |
| `/ein:linear:project-bootstrap <proyecto>` | Crea/reutiliza proyecto + milestones + issues base |
| `/ein:linear:milestones <proyecto>` | Lista los milestones de un proyecto |
| `/ein:linear:help` | Ayuda de Linear |

Reglas: team por defecto `Samuhlodev`; reutiliza antes de crear duplicados.

## Diagnóstico

| Comando | Qué hace |
| --- | --- |
| `/ein:doctor` | Diagnóstico completo y explicado |
| `/ein:doctor-output` | Smoke checks técnicos (8 grupos: core, MCP, agentes+chain, extensiones, skills, guardrails, integraciones, i18n) |

## MCP (pi-mcp-adapter)

| Comando | Qué hace |
| --- | --- |
| `/mcp` | Panel de servidores MCP (estado, toggles) |
| `/mcp setup` | Configuración guiada / importar configs |
| `/mcp reconnect <server>` | Conecta/reconecta un servidor (fuerza el registro de directTools) |

MCP va por el adapter: engram por proxy (`mcp()`, ahorro de contexto), context7 con `directTools` (tools first-class para el digest). El tool `ask_user_question` (de rpiv-ask-user-question) no es un comando: Ein lo invoca en checkpoints para pedirte decisiones con diálogos estructurados.

`FAIL` bloquea: hay algo roto. `OK` = todo en orden.

---

## Comandos del instalador (terminal, fuera de Pi)

| Comando | Qué hace |
| --- | --- |
| `ein` | Menú interactivo (TUI dorada) |
| `ein install` | Instala/repara Ein (deps → deploy → secrets → doctor) |
| `ein update` | Actualiza Ein y Pi, con backup previo |
| `ein doctor` | Diagnóstico sin lanzar Pi |
| `ein uninstall` | Quita Ein (conserva auth.json, secrets y sesiones) |
| `ein restore` | Restaura desde un backup |

Flags: `--yes` (no interactivo), `--no-engram`, `--no-secrets`, `--no-linear`.

---

## Archivos de configuración

| Archivo | Para qué |
| --- | --- |
| `~/.pi/agent/brand.json` | Nombre y prefijo de comandos |
| `~/.pi/agent/settings.json` | Config de Pi (modelo por defecto, extensiones, skills) |
| `~/.pi/agent/skills/stack-profile.json` | Perfil de skills: `core`, `secondary`, `catalog`, `context7` |
| `~/.pi/agent/skills/skills-lock.json` | Qué skills hay instaladas + su hash |
| `~/.pi/ein/models.json` | Modelo asignado a cada subagente |
| `.pi/ein/lang.json` | Idioma de artefactos del proyecto (eje artefactos) |
| `~/.config/rpiv-i18n/locale.json` | Idioma de conversación/UI (eje global) |

## Persona y estilo de salida

- `samuhlo`: explicación docente, estructura `// 000`, profundidad.
- `neutral`: salida plana, directa, sin plantilla.
- El **idioma** no depende de la persona: se controla con `/ein:lang` (ver «Idioma»).
