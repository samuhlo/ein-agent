# Ein

**Ein** es un workbench de desarrollo de software autónomo construido sobre [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent). Transforma la forma en que un ingeniero aborda tareas complejas: en lugar de ejecutar el agente paso a paso, Ein planifica, implementa y verifica de forma autónoma siguiendo una metodología estructurada — con memoria persistente, integración nativa con Linear y GitHub, y guardrails que evitan que el agente tome decisiones destructivas sin confirmación.

**Diseñado para una persona. Entrenado para saber cuándo actuar y cuándo preguntar.**

---

## Qué hace Ein

### Flujo SDD — Software Design Driven

Ein organiza todo el trabajo en una cadena de cinco fases. Cada agente tiene responsabilidades acotadas y no puede saltar pasos:

```
sdd-init → sdd-design → sdd-explore → sdd-apply → sdd-verify
```

| Fase | Qué hace |
|---|---|
| **sdd-init** | Crea el OpenSpec del proyecto: objetivos, constraints, stack, contexto de negocio |
| **sdd-design** | Diseña la solución técnica con propuesta + spec + lista de tareas priorizadas |
| **sdd-explore** | Explora el código base antes de tocar nada: mapea dependencias, identifica riesgos |
| **sdd-apply** | Implementa por batches, con TDD y commits atómicos por unidad de trabajo |
| **sdd-verify** | Verifica la implementación contra el spec: tests, tipos, integración, regresiones |

### Agentes de delivery

Además de la cadena SDD, Ein incluye dos agentes especializados que gestionan el flujo hacia los sistemas externos:

- **ein-linear** — Crea y actualiza issues, milestones y proyectos en Linear. Mantiene sincronía entre el OpenSpec y el estado real del backlog.
- **ein-github** — Abre PRs bien documentadas, gestiona branches y conecta cada unidad de trabajo con su issue correspondiente.

### Sistema de skills (3 capas)

Ein no acumula manuales que se quedan viejos. Organiza el conocimiento en tres capas:

1. **Locales** (`skills/local/`) — skills opinadas propias (workflow, disciplina, convenciones). Insustituibles. Se sincronizan desde este repo de GitHub.
2. **Bajadas** (`skills/downloaded/`) — set **curado** de fuentes fiables: [onmax/nuxt-skills](https://github.com/onmax/nuxt-skills) (ecosistema Nuxt), [antfu/skills](https://github.com/antfu/skills) (Vue/tooling), greensock (GSAP), vercel-labs (React/Next), yusukebe (Hono), midudev (Bun).
3. **Context7** — todo lo demás (Drizzle, Zod, Tailwind, Postgres...) se resuelve **on-demand** con docs frescas, sin guardar nada que envejezca.

El comando `/ein:skills` mantiene las capas 1 y 2 al día; el advisor decide, por tarea, si usar una skill curada o tirar de Context7. Todo se configura en `skills/stack-profile.json` (`catalog` + mapa `context7`).

### Memoria persistente

Ein usa **Engram** para mantener contexto entre sesiones. No reexplica el proyecto cada vez que se abre — recuerda el estado, las decisiones de diseño y el progreso del OpenSpec.

### Guardrails

Ein no ejecuta comandos destructivos sin confirmación. Tiene una lista explícita de patrones denegados (`git reset --hard`, `rm -rf`, `DROP TABLE`, etc.) y patrones que requieren confirmación explícita antes de proceder.

### Persona docente

En modo `samuhlo`, ante un **cambio importante** (nueva dependencia, patrón nuevo, endpoint, decisión de arquitectura, código no trivial, seguridad) Ein no entrega un parte de estado: **te enseña cómo funciona por dentro** — qué hace cada pieza y cómo encajan, el mecanismo paso a paso. Lo trivial sigue siendo breve. El objetivo es que termines entendiendo mejor el sistema, no solo qué se tocó.

---

## Instalación

### Bootstrap (macOS y Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El script detecta tu plataforma, descarga el binario correcto de la última release y **abre la TUI de Ein** directamente para que elijas qué hacer.

### Instalación interactiva

Al ejecutar `ein install` (o al lanzarlo desde el menú) se presenta un wizard completo:

1. Detecta OS, arquitectura, distro y shell
2. Instala dependencias faltantes: **bun** y **pi** (obligatorias), **engram** y **gh** (opcionales)
3. Pregunta si quieres incluir **integración con Linear** (se puede activar/desactivar después)
4. Despliega el workbench en `~/.pi/agent`, templando rutas automáticamente según tu sistema
5. Wizard opcional de secrets (Context7, Linear, MiniMax)
6. Corre el doctor y reporta el estado del entorno

> **Nunca toca** `auth.json`, `sessions/` ni `backups/` — tu estado es siempre tuyo.

### Requisitos

| Dependencia | Requerida | Instalación |
|---|---|---|
| [Bun](https://bun.sh) ≥ 1.3 | Sí | El installer la gestiona |
| [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) | Sí | El installer la gestiona |
| [Engram](https://github.com/Gentleman-Programming/engram) | No (recomendado) | El installer la gestiona |
| [GitHub CLI](https://cli.github.com) | No (recomendado) | El installer la gestiona |

---

## Comandos `ein`

El binario `ein` gestiona el workbench. El runtime de uso diario es `pi`.

```bash
ein                 # Menú interactivo (TUI gold)
ein install         # Instala o repara Ein
ein update          # Actualiza Ein y pi (hace backup previo)
ein doctor          # Diagnóstico completo sin lanzar pi
ein uninstall       # Elimina Ein (conserva auth, secrets y sesiones)
ein restore         # Restaura desde un backup anterior
```

**Flags disponibles:** `--yes`, `--no-engram`, `--no-secrets`, `--no-linear`

---

## Dentro de Pi — comandos `/ein:*`

Una vez instalado, Pi expone estos comandos:

### Flujo de trabajo
```
/ein:ai:install-sdd     Instalar el OpenSpec en el proyecto actual
/ein:ai:sdd-preflight   Preflight de Linear + repositorio antes de una sesión SDD
```

### Control del sistema
```
/ein:status             Estado completo: agentes, cadenas, skills, proyecto, MCP
/ein:models             Ver o cambiar el modelo asignado a cada agente
/ein:models:full        Preset potencia: orquestador + sdd-design → gpt-5.5
/ein:models:lite        Preset ahorro: todos → MiniMax-M2.7 (escape de rate-limit)
/ein:persona            Alternar entre persona "samuhlo" y "neutral"
```

### Skills
```
/ein:skills                       Estado del stack (perfil, drift, fuera de stack)
/ein:skills update [--local|--downloaded]   Actualiza locales (repo) + bajadas (catálogo)
/ein:skills add <skill>           Instala una skill del catálogo
/ein:skills clean [--yes]         Borra skills fuera de stack
/ein:skills:advisor <tarea>       Qué skills usar + digest con Context7
```

### Linear
```
/ein:linear:new <petición>              Crea o reutiliza una issue
/ein:linear:project-bootstrap <proy>    Proyecto + milestones + issues base
/ein:linear:milestones <proyecto>       Lista milestones
/ein:linear:help                        Ayuda de Linear
```

### Diagnóstico
```
/ein:doctor             Smoke test completo del entorno (45 checks, 8 grupos)
/ein:doctor-output      Versión compacta, sin lanzar pi
/ein:help               Referencia de todos los comandos /ein:*
/ein:help full          Guía completa con flujos canónicos
```

---

## Modelos

Ein está configurado para usar los mejores modelos según la fase:

| Componente | Modelo por defecto |
|---|---|
| Orquestador | `gpt-5.5` (preset full) / `MiniMax-M2.7` (preset lite) |
| `sdd-design` | `gpt-5.5` — la fase que más razonamiento requiere |
| `sdd-init`, `sdd-explore`, `sdd-apply`, `sdd-verify` | `MiniMax-M2.7` |
| `ein-linear`, `ein-github` | `MiniMax-M2.7` |

Si gpt-5.5 llega al límite de uso, `/ein:models:lite` cambia todo a MiniMax-M2.7 al instante.

---

## Estructura del repo

```
ein-agent/
├── ein-pi/                 # Workbench (se despliega en ~/.pi/agent/)
│   └── agent/
│       ├── agents/         # 7 agentes (5 SDD + ein-linear + ein-github)
│       ├── chains/         # Cadena ein-sdd
│       ├── extensions/     # 9 extensiones del runtime de Pi
│       ├── skills/         # 13 locales + 34 bajadas curadas + mapa Context7
│       ├── prompts/        # Prompts del sistema
│       ├── brand.json      # Identidad de Ein
│       ├── models.json     # Modelos disponibles
│       └── mcp.json        # Servidores MCP (engram, context7)
│
└── installer/              # Instalador cross-platform (macOS + Linux)
    ├── src/cli/            # install, update, uninstall, restore, doctor
    ├── src/core/           # deploy, deps, secrets, backup, verify...
    ├── src/tui/            # Banner gold #FFCA40 + prompts
    ├── scripts/            # bundle-template + build cross-compile
    └── install.sh          # Bootstrap curl | bash
```

---

## Actualizar

```bash
ein update
```

Hace backup del estado actual, redespliega el workbench y actualiza `pi`. Tu `auth.json`, sesiones y secrets se conservan.

## Publicar una nueva release

```bash
git tag installer-v0.4.0
git push origin installer-v0.4.0
```

GitHub Actions compila los 4 binarios (darwin/linux × arm64/x64), genera checksums y publica la release automáticamente. La última release publicada es `installer-v0.3.0`.

---

## Roadmap

**Fase 2b — Selector multi-perfil (no construido todavía).** Poder tener varios perfiles (`profiles/<persona>.json`), cada uno con su propia persona y su propio stack de skills, para que otra persona pueda instalar Ein con un stack distinto. La base ya existe (`stack-profile.json` es un perfil con nombre y `loadProfile()` lee una ruta resoluble); falta el selector y el acople persona ↔ perfil.

---

## Para contribuidores

```bash
# Clonar y entrar al instalador
git clone https://github.com/samuhlo/ein-agent
cd ein-agent/installer
bun install

# Desarrollo sin compilar
bun run dev

# Verificar tipos
bun run typecheck

# Empaquetar el workbench como template
bun run bundle-template

# Compilar todos los targets (o uno solo)
bun run build:all
bun run build:all linux-x64
```

Los cambios al workbench van en `ein-pi/agent/`. Tras modificarlos, `bun run bundle-template` regenera el template embebido en el installer.
