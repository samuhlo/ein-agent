# Ein

[![Release](https://img.shields.io/github/v/release/samuhlo/ein-agent?label=release&color=FFCA40)](https://github.com/samuhlo/ein-agent/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-737373.svg)](LICENSE)

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
- **ein-readme** — Genera el README de un proyecto (estética brutalista + bloque de metadata para el portfolio), analizando el código directamente.

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

En modo `samuhlo`, ante un **cambio importante** (nueva dependencia, patrón nuevo, endpoint, decisión de arquitectura, código no trivial, seguridad) Ein no entrega un parte de estado: **te enseña cómo funciona por dentro** — qué hace cada pieza y cómo encajan, el mecanismo paso a paso. Lo trivial sigue siendo breve. El objetivo es que termines entendiendo mejor el sistema, no solo qué se tocó. La persona controla el **tono**; el idioma se gestiona aparte (ver abajo).

### Sistema de idioma (es / en)

Ein separa el idioma en **dos ejes independientes**, configurables con `/ein:lang`:

- **Conversación y UI** — cómo te habla Ein y el idioma de la interfaz (ayuda, paneles, notificaciones). Es el locale compartido de [`rpiv-i18n`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-i18n) (`~/.config/rpiv-i18n/locale.json`), autodetectado de `LANG` y cambiable también con `pi --locale <code>` o `/languages`.
- **Artefactos** — el idioma de lo que Ein **escribe de cara afuera**: cuerpos de PR, mensajes de commit, issues y comentarios de Linear. Se guarda por proyecto en `.pi/ein/lang.json`; si no lo fijas, hereda el de conversación.

Esto habilita el caso real: **charlar en castellano y a la vez generar PRs e issues en inglés** para un repo internacional. El idioma entra como directiva autoritativa en el prompt (por encima de la persona). Galego contemplado en la arquitectura, pendiente de traducir su UI.

### Contexto de proyecto (EIN.md)

`/ein:init` genera un **`EIN.md`** versionado en la raíz: la verdad de base del proyecto que se inyecta al orquestador y a las fases SDD para que los modelos baratos **no re-descubran lo mismo cada run** (ahorro de tokens, más control). Dos zonas para no pudrirse:

- **Curada** (Overview, Arquitectura, Convenciones) — la escribes tú; Ein nunca la pisa al refrescar.
- **Auto** (Comandos build/test/lint, Estructura) — la regenera `/ein:init`, con un sello `rev` (SHA de git) + fecha. `/ein:status` avisa cuántos commits atrás quedó para detectar la deriva.

Todo el **estado** de Ein vive consolidado bajo `.pi/ein/` (junto a `.pi/agents`, `.pi/chains`), y Ein mantiene solo un bloque gestionado en tu `.gitignore` (`.pi/ein/`, `.piagents/`). `EIN.md`, en cambio, **sí se commitea**: es conocimiento del repo.

### Preguntas estructuradas y MCP eficiente

- **`ask_user_question`** (vía `rpiv-ask-user-question`): en los checkpoints (gates SDD, confirmaciones de delivery, bifurcaciones de scope) Ein te pregunta con diálogos estructurados —single/multi-select, previews, en español— en vez de prosa. Solo cuando la respuesta cambia el siguiente paso.
- **`pi-mcp-adapter`**: los servidores MCP (engram, context7) van por un proxy de un solo tool (~200 tokens) en vez de cargar todas sus defs (10k+ tokens/server). engram por proxy; context7 con `directTools` para el digest.

### Sesiones recientes

El banner muestra al arrancar tus **sesiones recientes** (de todos los proyectos, con su antigüedad). Recupéralas con `pi -c` (última), `pi -r` (elegir) o `pi --session <id>`; el comando `/ein:resume` lista las recientes con su `id` listo para copiar.

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
ein                 # Menú interactivo (TUI brutalista)
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
/ein:init               Genera/refresca EIN.md (contexto de proyecto versionado)
/ein:models             Ver o cambiar el modelo asignado a cada agente
/ein:models:full        Preset potencia: orquestador + sdd-design → gpt-5.5
/ein:models:lite        Preset ahorro: todos → MiniMax-M2.7 (escape de rate-limit)
/ein:persona            Alternar entre persona "samuhlo" y "neutral" (tono)
/ein:lang               Idioma de conversación/UI y de artefactos (PR/commit/Linear)
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
/ein:doctor             Smoke test completo del entorno (8 grupos de checks)
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
│       ├── agents/         # 8 agentes (5 SDD + ein-linear + ein-github + ein-readme)
│       ├── chains/         # Cadena ein-sdd
│       ├── extensions/     # 9 extensiones del runtime de Pi
│       ├── lib/            # Lógica compartida (persona, lang, guardrails, modelos...)
│       ├── skills/         # 15 locales + 34 bajadas curadas + mapa Context7
│       ├── prompts/        # Prompts del sistema
│       ├── brand.json      # Identidad de Ein
│       ├── models.json     # Modelos disponibles
│       └── mcp.json        # Servidores MCP (engram, context7)
│
└── installer/              # Instalador cross-platform (macOS + Linux)
    ├── src/cli/            # install, update, uninstall, restore, doctor
    ├── src/core/           # deploy, deps, secrets, backup, verify...
    ├── src/tui/            # Banner brutalista (paleta plana de marca) + prompts
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
git tag installer-v0.10.0
git push origin installer-v0.10.0
```

GitHub Actions compila los 4 binarios (darwin/linux × arm64/x64), genera checksums y publica la release automáticamente. La última release publicada es `installer-v0.10.0` (ver [`CHANGELOG.md`](CHANGELOG.md)).

> Cada push a `main` y cada PR pasan por CI (`.github/workflows/ci.yml`): suite de tests, typecheck del installer y smoke de empaquetado.

---

## Roadmap

**Multi-perfil (no construido todavía).** Poder tener varios perfiles (`profiles/<persona>.json`), cada uno con su propia persona y su propio stack de skills, para que otra persona pueda instalar Ein con un stack distinto. La base ya existe (`stack-profile.json` es un perfil con nombre y `loadProfile()` lee una ruta resoluble); falta el selector y el acople persona ↔ perfil.

**Galego en la UI.** El sistema de idioma ya contempla `gl` en el tipo, las directivas y el selector; falta traducir los mapas de UI (`lib/i18n/strings.ts`) y, si se quiere en el picker compartido, contribuirlo a `rpiv-i18n`.

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
