---
title: "Runtimes"
description: "Pi es el núcleo de EIN y Claude Code un relevo opcional."
sources: ["README.md", "ein-cc/README.md", "ein-pi/README.md", "openspec/specs/installer-runtime/spec.md"]
verified_rev: "405a6c1"
---

EIN funciona sobre **Pi Coding Agent**. **Claude Code** es un relevo opcional
para continuar un cambio cuando conviene, no una instalación alternativa.

Normalmente se entra por `ein` y se elige runtime en la aplicación. `ein-pi` y
`ein-cc` son atajos avanzados para saltarse esa selección.

Comparten el núcleo —los agentes de fase, las skills, el flujo SDD, los
artefactos— pero cada uno tiene su adaptador, y **no ofrecen exactamente las
mismas capacidades**.

## Qué se comparte

`runtime/` es contenido propio y portable, agnóstico del runtime:

```text
runtime/
├── agents/     los ejecutores de fase (sdd-scope, sdd-map, …)
├── assets/     políticas y recursos portables del runtime
├── skills/     las skills propias de Ein
├── docs/       la documentación interna del sistema
└── prompts/    los prompts compartidos
```

Las skills externas curadas viven aparte en `vendor/skills/`. El empaquetado las
instala bajo `skills/downloaded/`, pero el checkout no las presenta como código
propio. Un cambio en un agente de fase de `runtime/` llega a Pi y Claude Code.

La lógica que sí ejecutan varios consumidores vive en `shared/`. Los módulos de
`shared/contracts/` no dependen de Pi, Claude ni del instalador. Los pocos
servicios cuya implementación aún es Pi-first se exponen expresamente mediante
`shared/ports/`; Claude y el instalador no atraviesan directamente el interior
de `ein-pi/agent/`. Esos puertos hacen visible la deuda; no convierten por sí
solos la implementación de Pi en código agnóstico. La suite comprueba ambas
fronteras automáticamente.

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

Pi es el camino principal y completo. Claude es un relevo deliberadamente más
pequeño: puede retomar el estado en disco y ejecutar el ciclo SDD necesario,
pero no intenta reproducir cada control interactivo o extensión de Pi.

## El núcleo compartido no lo hace portable

Conviene decirlo claro porque es fácil deducir lo contrario: que exista un
núcleo agnóstico no significa que EIN funcione sobre cualquier agente.

Hoy la superficie soportada son estos dos. Cada uno necesitó su adaptador, y
añadir un tercero sería trabajo, no configuración.

## Instalar Ein o añadir Claude

```bash
ein-install install --runtime pi
ein-install install --runtime both
```

`pi` instala Ein. `both` instala Ein y después añade Claude, sin mezclar rutas ni
artefactos. No existe una instalación nueva Claude-only.

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
