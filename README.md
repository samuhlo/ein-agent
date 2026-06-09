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

### Memoria persistente

Ein usa **Engram** para mantener contexto entre sesiones. No reexplica el proyecto cada vez que se abre — recuerda el estado, las decisiones de diseño y el progreso del OpenSpec.

### Guardrails

Ein no ejecuta comandos destructivos sin confirmación. Tiene una lista explícita de patrones denegados (`git reset --hard`, `rm -rf`, `DROP TABLE`, etc.) y patrones que requieren confirmación explícita antes de proceder.

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

### Diagnóstico
```
/ein:doctor             Smoke test completo del entorno (44 checks, 8 grupos)
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
│       ├── extensions/     # 8 extensiones del runtime de Pi
│       ├── skills/         # 13 locales + 41 del ecosistema Pi
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
git tag installer-v0.2.0
git push origin installer-v0.2.0
```

GitHub Actions compila los 4 binarios (darwin/linux × arm64/x64), genera checksums y publica la release automáticamente.

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
