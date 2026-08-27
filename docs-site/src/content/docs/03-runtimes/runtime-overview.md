---
title: "Runtimes"
description: "EIN tiene un núcleo compartido y dos adaptadores que no son idénticos."
sources: ["README.md", "ein-cc/README.md", "ein-pi/README.md", "openspec/specs/installer-runtime/spec.md"]
verified_rev: "eeceb7c"
---

EIN se despliega sobre dos runtimes: **Pi Coding Agent** y **Claude Code**.

Normalmente se entra por `ein` y se elige runtime en la aplicación. `ein-pi` y
`ein-cc` son atajos avanzados para saltarse esa selección.

Comparten el núcleo —los agentes de fase, las skills, el flujo SDD, los
artefactos— pero cada uno tiene su adaptador, y **no ofrecen exactamente las
mismas capacidades**.

## Qué se comparte

`ein-pi/core/` es contenido portable, agnóstico del runtime:

```text
ein-pi/core/
├── agents/     los ejecutores de fase (sdd-scope, sdd-map, …)
├── skills/     las skills locales y descargadas
├── docs/       la documentación interna del sistema
└── prompts/    los prompts compartidos
```

De ahí sale lo mismo para los dos. Un cambio en un agente de fase llega a Pi y a
Claude Code.

## Qué es distinto

Cada adaptador traduce ese núcleo a lo que su runtime entiende:

| | Pi Coding Agent | Claude Code |
| :--- | :--- | :--- |
| Acceso directo avanzado | `ein-pi` | `ein-cc` |
| Casa de EIN | `~/.pi-ein/agent` | `~/.claude-ein` |
| Runtime vanilla | `pi` → `~/.pi/agent` | `claude` → `~/.claude` |
| Variable de entorno | `PI_CODING_AGENT_DIR` | `CLAUDE_CONFIG_DIR` |

Los dos se instalan como funciones de shell que exportan su variable **solo para
esa invocación**. No contaminan tu sesión ni tu configuración normal.

## El núcleo compartido no lo hace portable

Conviene decirlo claro porque es fácil deducir lo contrario: que exista un
`core/` agnóstico no significa que EIN funcione sobre cualquier agente.

Hoy la superficie soportada son estos dos. Cada uno necesitó su adaptador, y
añadir un tercero sería trabajo, no configuración.

## Instalar uno, otro o los dos

```bash
ein-install install --runtime pi
ein-install install --runtime claude
ein-install install --runtime both
```

`both` despliega ambos sin mezclar sus rutas ni sus artefactos. Cada uno mantiene
su casa y su runtime vanilla intacto.

## Continuidad entre ellos

Lo que se transfiere de un runtime a otro es **el estado del proyecto**: el
cambio activo, la fase, los artefactos en `openspec/`. Eso vive en el
repositorio, así que abrir el mismo proyecto con el otro runtime funciona.

Lo que **no** se transfiere son los historiales de conversación. Las sesiones de
Pi y las de Claude Code son privadas de cada runtime y siguen siéndolo.

## Siguiente

- [Pi Coding Agent](/ein-agent/03-runtimes/pi-coding-agent/)
- [Claude Code](/ein-agent/03-runtimes/claude-code/)
- [Matriz de runtimes](/ein-agent/03-runtimes/runtime-matrix/) — la comparación,
  solo con lo comprobable.
