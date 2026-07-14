<p align="center">
  <img src="ein-logo.png" alt="Ein · Pi Workbench" width="440">
</p>

<p align="center">
  <a href="https://github.com/samuhlo/ein-agent/releases/latest"><img src="https://img.shields.io/github/v/release/samuhlo/ein-agent?label=release&color=FFCA40" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-737373.svg" alt="License: MIT"></a>
</p>

> Intención corta: un harness **personal** sobre [Pi](https://github.com/earendil-works/pi-coding-agent) que convierte trabajo ambiguo en cambios pequeños, verificados y explicados — modelos caros donde se razona, baratos donde se ejecuta.

El modelo fuerte hace de arquitecto (piensa, acota, enseña); los baratos ejecutan órdenes cerradas. Baja el coste y reduce errores. Ein deja artefactos (OpenSpec + EIN.md), verifica, y al terminar **te explica cómo funciona** lo que hizo — no solo "hecho".

No es un producto para todos: es **mi** workbench. Está **curado para mi stack** — Nuxt 4 · Vue 3 · TypeScript · Bun · Tailwind v4 · Pinia · Drizzle + Neon · Zod · Nuxt UI · GSAP/Motion · Hono · Vitest — y para mi forma de trabajar. Funcionaría bien con un stack parecido; cualquiera puede clonarlo y reajustar skills, modelos y persona a lo suyo.

## // INSTALACIÓN RÁPIDA

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bootstrap es el único canal de instalación confirmado para Ein.
[Ver instalación detallada](#instalacion-detallada): plataforma, dependencias y recuperación.

## // ÚLTIMA RELEASE REGISTRADA

**Última release publicada según el registro canónico local:** [0.18.0 · 2026-07-13](CHANGELOG.md#0180---2026-07-13).

- **CodeGraph** es opt-in y conmutable; en SDD concentra la lectura acotada antes de explorar código.
- **CodeGraph** es una dependencia opcional del instalador, con la telemetría desactivada tras instalarse.
- El bootstrap crea `openspec/config.yaml` con `create-if-absent` y evita el bloqueo prematuro por `tasks.md`.

---

## // 000. MODOS DE TRABAJO

Ein arranca en **Solo** — listo para trabajar sin configurar nada. Subes a **Team** con `/ein:mode team` el día que un proyecto necesite board compartido.

**Solo** — tú y el repo. El plan, el estado y la trazabilidad viven dentro del propio proyecto: artefactos OpenSpec en `openspec/changes/`, `EIN.md` como memoria versionada, y la entrega por **GitHub** vía `ein-git`. Cero setup externo, cero cuentas que conectar. Es el día a día: trabajo en solitario, proyectos personales, aprender.

**Team** — todo lo de Solo **+ Linear como board de verdad**: issues, milestones y estados sincronizados con el OpenSpec, y un preflight que reutiliza o crea la issue antes de cada flujo SDD. Para trabajo profesional o de cliente, donde alguien más mira el backlog y hace falta trazabilidad formal. Aquí es donde `ein-linear` entra en juego (en Solo permanece dormido salvo que lo pidas puntualmente).

La entrega —commits y PRs por GitHub— pasa por `ein-git` en **ambos** modos: nunca git a pelo desde el orquestador caro.

## // 001. FLUJO VISIBLE

| La tarea es… | Ein hace… |
|---|---|
| pequeña | directo, inline |
| mediana | plan corto → ejecución con subagentes baratos → verifica → explica |
| grande / ambigua | SDD completo (scope → map → design → tasks → apply → verify → close) |
| (Team) con board | sincroniza Linear |

Tú dices qué quieres; Ein elige el carril más pequeño que sea seguro.

## // 002. FLUJO SDD

Para trabajo serio, siete fases. Cada agente tiene responsabilidades acotadas y no salta pasos:

```
sdd-scope → sdd-map → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-close
```

| Fase | Qué hace |
|---|---|
| **sdd-scope** | Define alcance, constraints, presupuesto y contexto mínimo |
| **sdd-map** | Mapea el código antes de tocar nada: dependencias, riesgos |
| **sdd-design** | Propuesta + spec (RFC 2119 + Given/When/Then) + decisiones |
| **sdd-tasks** | Convierte el diseño en checklist ejecutable `tasks.md` |
| **sdd-apply** | Implementa por slices, con TDD y commits atómicos por unidad de trabajo |
| **sdd-verify** | Verifica contra el spec: tests, tipos, integración, regresiones |
| **sdd-close** | Condensa el cambio en un `summary.md` revisable y ejecuta el cierre determinista |

**Routing determinista (sin que el modelo adivine).** El orquestador no enruta de memoria: dos tools deterministas (`ein_sdd_status`, `ein_sdd_check`) leen los ficheros de `openspec/changes/<cambio>/` y devuelven hechos — en qué fase va y si el artefacto está sano. El flujo es **fase a fase**: el router dice qué toca → se delega esa fase → el gatekeeper la valida → siguiente. Al abrir una sesión nueva, `/ein:sdd-status` reubica el cambio al instante, **sin volcar contexto ni quemar tokens**. Al cerrar, `sdd-close` deja un `summary.md` legible meses después y `openspec/changes/` con solo cambios vivos.

Guardarraíles del flujo: **Scope Gate** (acota tokens de entrada), **Plan Gate** (mutaciones ambiguas/bulk → plan + confirmación antes de ejecutar), **Review Workload Guard** (el parent mide las líneas de **producción** —tests y generados se reportan pero no cuentan— y pregunta single/split **antes** de delegar el PR; `ein-git` como backstop), **Design hygiene** (`/ein:sdd-check`), **gate de TDD** (en modo `ask` el orquestador clasifica el cambio y solo pregunta si merece la pena — los mecánicos no interrumpen), **gate de entrega** (`/ein:git`: en `auto`, si pides commit/push/PR no se reconfirma; force-push siempre bloqueado).

## // 003. AGENTES DE DELIVERY

- **ein-git** — branches, commits, PRs documentadas, reviews. Modelo barato; el orquestador no toca git a mano. Activo en Solo y Team.
- **ein-linear** *(Team)* — issues, milestones y proyectos en Linear, en sync con el OpenSpec. Inactivo en Solo salvo que lo pidas.

## // 004. MODELOS

Elige por capacidad, riesgo y coste. Personaliza cada agente con `/ein:models` o aplica los presets `/ein:models:full` y `/ein:models:lite`.

| Tipo de trabajo | Criterio de elección |
|---|---|
| Arquitectura, ambigüedad, revisión adversarial o alto riesgo | Prioriza razonamiento fuerte: acota mejor las decisiones y detecta fallos costosos. |
| Trabajo acotado, bien especificado, repetitivo o mecánico | Prioriza ejecución económica: conserva presupuesto cuando el camino ya está definido. |

Ein **no hace fallback automático de modelo** a mitad de tarea. Ante un corte transitorio, reintenta en el mismo modelo; cambiar de modelo lo decides tú. Así coste y calidad no cambian en silencio.

## // 005. ESTÉTICA DEL OUTPUT (persona)

Ein tiene una estética propia, parte de la persona `samuhlo`:

- **Respuestas**: formato `// 00N` (resumen → qué se hizo → **cómo funciona por dentro** → decisión → verificación → riesgos → siguiente). Lo importante se enseña, no se reporta.
- **Comentarios de código**: minimalistas, brutalistas; placa `// ===` por fichero; explican el *por qué*, no el *qué* (skill `comment-style`).
- **Logging**: estilo brutalista de runtime (skill `logging-style`).
- **Markdown publicado** (PRs, issues, commits): tags `[[TAG]]`, `> Intención corta:`, secciones `// NNN`.

Todo esto se **apaga con `/ein:persona neutral`**: mismo motor, tono neutro/profesional sin las convenciones de marca. La persona controla el **tono y la estética**; el idioma se gestiona aparte con `/ein:lang`.

## // 006. PERSONA DOCENTE

En persona `samuhlo`, ante un **cambio importante** (nueva dependencia, patrón, endpoint, decisión de arquitectura, código no trivial, seguridad) Ein no entrega un parte de estado: **te enseña el mecanismo paso a paso** — qué hace cada pieza y cómo encajan. Lo trivial sigue en una línea. El objetivo es que termines entendiendo mejor el sistema, no solo qué se tocó.

## // 007. CONTEXTO DE PROYECTO (EIN.md)

`/ein:init` (o el onboarding first-run) genera un **`EIN.md`** versionado en la raíz: la verdad de base del proyecto (stack, comandos, arquitectura, convenciones) que se inyecta al orquestador y a las fases SDD para que los modelos baratos **no re-descubran lo mismo cada run** (ahorro de tokens, más control). Zona **curada** (la escribes tú, Ein no la pisa) — incluye un **`## Índice`** sembrado con las carpetas del repo para que tú/el modelo pongáis una línea de "qué es cada cosa" — + zona **auto** (comandos, estructura y **links a docs**, regenerada con sello `rev` + fecha; `sdd-close` la refresca al cerrar un cambio; `/ein:status` avisa de la deriva). Se commitea: es conocimiento del repo.

## // 008. SKILLS (3 capas)

1. **Locales** (`skills/local/`) — skills opinadas propias (workflow, disciplina, convenciones). Se sincronizan desde este repo.
2. **Bajadas** (`skills/downloaded/`) — set **curado** de fuentes fiables: [onmax/nuxt-skills](https://github.com/onmax/nuxt-skills), [antfu/skills](https://github.com/antfu/skills), greensock (GSAP), vercel-labs (React/Next), yusukebe (Hono), midudev (Bun).
3. **Context7** — todo lo demás (Drizzle, Zod, Tailwind, Postgres…) on-demand, con docs frescas, sin guardar nada que envejezca.

`/ein:skills` mantiene 1 y 2 al día; el advisor decide por tarea entre skill curada o Context7. Configuración en `skills/stack-profile.json`.

## // 009. PLATAFORMA

- **Memoria (opcional, verificada en fuente/desarrollo)** — Engram se integra mediante un adapter CLI acotado. OpenSpec sigue siendo canónico; los fallos no bloqueantes no interrumpen el flujo.
- **Idioma (2 ejes)** — `/ein:lang` separa conversación/UI de artefactos (PR/commit/Linear). Charlar en castellano y generar PRs en inglés, por ejemplo.
- **Guardrails** — lista explícita de patrones denegados (`git reset --hard`, `rm -rf`, `DROP TABLE`…) y patrones que exigen confirmación.
- **MCP eficiente** — `pi-mcp-adapter` (proxy de un tool, ~200 tokens vs 10k+/server) + `context-mode` (sandbox de salidas, persistencia de sesión sobre compactaciones).
- **Onboarding first-run** — la primera vez que Ein entra a un proyecto **sin configurar** (agnóstico a su edad: mira "¿está configurado?", no "¿es nuevo?"), un wizard único resuelve los esenciales — persona, idioma de artefactos, TDD, Hypa — y genera `EIN.md`. Un toque para "usar recomendados" o personalizar. Los pendientes = ficheros ausentes; una vez escritos, no vuelve a preguntar. Relánzalo con `/ein:onboard`.
- **Grafo de código (CodeGraph)** — si el proyecto está indexado con [codegraph](https://github.com/colbymchenry/codegraph) (`codegraph init`; índice local SQLite, determinista, AST vía tree-sitter), Ein inyecta al orquestador y a las fases SDD la directiva "un `codegraph explore` antes que una docena de grep/read": código verbatim + call paths + blast radius en una llamada, por CLI (sin MCP). `/ein:codegraph` (auto | off, default `auto`); sin binario o sin índice, cero prompt gastado y todo funciona como siempre. Medido: -38% mediana de payload (hasta -85% en ficheros grandes) y una fracción de los tool-calls en las fases que leen código.
- **Compresión de salida (Hypa)** — envuelve `bash` con [Hypa](https://github.com/Hypabolic/Hypa): reducción **determinista** de la salida de comandos con reducer real (git de lectura, vitest/eslint, dotnet, cargo, terraform…). Envuelve `bunx vitest` normalizando el prefijo; deja crudo lo genérico (de eso ya se encarga `context-mode`) y **nunca** toca streaming/interactivo (dev, serve, `--watch`, `logs`, `-f`). Default **`auto`** (`/ein:hypa`): detecta el stack — **on** en proyectos verbosos no-Bun (dotnet/gradle/k8s → 90-100% menos ruido), **off** en Bun puro (ya terso). Si falta el binario `hypa`, el wrap queda inerte.
- **Sesiones recientes** — el banner las lista al arrancar; recupéralas con `pi -c`/`pi -r`/`pi --session <id>` o `/ein:resume`.
- **`ask_user_question`** — en los checkpoints (gates SDD, delivery, scope) Ein pregunta con diálogos estructurados, no prosa, solo cuando la respuesta cambia el siguiente paso.

---

<a id="instalacion-detallada"></a>

## // 010. INSTALACIÓN

El bootstrap es el único canal de instalación confirmado para Ein. Detecta plataforma y descarga el binario de la última release. Al ejecutarlo con el bootstrap, Linux reabre la TUI si hay una terminal disponible; en macOS te pedirá ejecutar `ein` para empezar. El wizard (`ein install`): detecta OS/arch/distro/shell, instala dependencias faltantes (**bun** y **pi** obligatorias; **engram** y **gh** opcionales), pregunta el modo (Solo por defecto, Team opt-in), despliega el workbench en `~/.pi/agent` templando rutas, wizard opcional de secrets, y corre el doctor.

> **Nunca toca** `auth.json`, `sessions/` ni `backups/` — tu estado es siempre tuyo.

**Windows (vía WSL como camino Linux).** Ein corre en Windows a través de WSL2 (que por dentro es Linux):

```powershell
wsl --install        # PowerShell como admin; reinicia y abre Ubuntu
```

Dentro de Ubuntu (WSL), usa el bootstrap de la ruta rápida. El instalador detecta WSL y despliega la build de Linux. Trabaja con tus proyectos **dentro del FS de WSL** (`~/...`), no en `/mnt/c/...` (mucho más lento y con permisos raros); `bun`, `pi` y `engram` se instalan dentro de WSL, y el estado de Ein vive en `~/.pi` **de WSL**. Windows nativo (sin WSL) llegará más adelante.

| Dependencia | Requerida |
|---|---|
| [Bun](https://bun.sh) ≥ 1.3 | Sí (el installer la gestiona) |
| [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) | Sí (el installer la gestiona) |
| [Engram](https://github.com/Gentleman-Programming/engram) | No, recomendado |
| [GitHub CLI](https://cli.github.com) | No, recomendado |
| [Hypa](https://github.com/Hypabolic/Hypa) | No, opcional (compresión de salida; `/ein:hypa`) |
| [codegraph](https://github.com/colbymchenry/codegraph) | No, opcional (grafo de código; `codegraph init` + `/ein:codegraph`) |

## // 011. COMANDOS `ein`

```bash
ein                 # Menú interactivo (TUI brutalista)
ein install         # Instala o repara Ein
ein update          # Actualiza Ein (backup previo)
ein doctor          # Diagnóstico sin lanzar pi
ein uninstall       # Elimina Ein (conserva auth, secrets, sesiones)
ein restore         # Restaura desde un backup
```

Flags: `--yes`, `--dry-run` (muestra el plan sin ejecutar nada), `--no-engram`, `--no-secrets`, `--no-linear` (arranca en modo Solo), `--no-hypa` (omite la compresión de salida), `--no-codegraph` (omite el grafo de código).

**Backups con red de seguridad.** Cada `install`/`update`/`uninstall`/`restore` snapshota antes en `~/.pi/agent/backups/installer/` (tar.gz): dedup si nada cambió, poda automática conservando los 5 más recientes (`ein restore --pin <nombre>` protege uno), y **rollback automático** si un deploy falla a medias. Los backups nunca incluyen `auth.json` ni sesiones — restaurar no pisa tus credenciales.

## // 012. DENTRO DE PI — `/ein:*`

```
# Control
/ein:mode               Modo de trabajo: solo (sin Linear) | team (Linear board)
/ein:status             Estado: modo, agentes, cadenas, skills, proyecto, MCP
/ein:init               Genera/refresca EIN.md
/ein:models[:full|:lite] Ver/cambiar el modelo por agente · presets potencia/ahorro
/ein:persona            Tono y estética: samuhlo | neutral
/ein:lang               Idioma de conversación/UI y de artefactos
/ein:tdd                TDD estricto: auto (config) | strict | off | ask
/ein:git                Confirmación de entrega: auto | ask | off
/ein:hypa               Compresión de salida de comandos (Hypa): auto | on | off
/ein:codegraph          Grafo de código (codegraph) del proyecto: auto | off
/ein:onboard            Reconfigurar esenciales del proyecto (persona/lang/tdd/hypa/EIN.md)

# SDD
/ein:ai:install-sdd     Instala el OpenSpec en el proyecto
/ein:ai:sdd-preflight   Preflight de la sesión SDD
/ein:sdd-audit [ruta]   Valida un cambio (todas las fases) o lint determinista de un design.md
/ein:sdd-close [cambio] Cierra un cambio verificado
/ein:sdd-check [ruta]   [legacy alias de /ein:sdd-audit]

# Skills · Linear (Team) · Diagnóstico · Sesiones
/ein:skills [update|add|clean] · /ein:skills:advisor <tarea>
/ein:linear:new · :project-bootstrap · :milestones · :help
/ein:doctor · /ein:doctor-output · /ein:resume · /ein:help [full]
```

## // 013. ESTRUCTURA DEL REPO

La fuente canónica del workbench vive en `ein-pi/` con dos raíces: `ein-pi/core/` (contenido portable, agnóstico del runtime) y `ein-pi/agent/` (runtime de Pi). El installer las compone y despliega planas en `~/.pi/agent` (destino instalado, no se edita desde el repo) — Pi espera ese layout, así que el desplegado no cambia.

```
ein-agent/
├── ein-pi/
│   ├── core/              # Portable: reutilizable por un futuro adapter no-Pi
│   │   ├── agents/        # SDD (7) + ein-linear + ein-git (prompts de fase)
│   │   ├── skills/        # Locales + bajadas curadas + mapa Context7
│   │   ├── prompts/ · docs/ · AGENTS.md
│   └── agent/             # Runtime Pi
│       ├── extensions/    # Extensiones del runtime de Pi
│       ├── lib/           # Lógica compartida (mode, persona, lang, modelos, guardrails…)
│       ├── chains/        # Cadena ein-sdd
│       ├── assets/        # orchestrator.md (leído por lib/ en runtime)
│       ├── brand.json · mcp.json · settings.json
└── installer/             # Instalador cross-platform (macOS + Linux)
```

`ein-pi/core/` + `ein-pi/agent/` son la única fuente versionada del workbench; `installer/scripts/bundle-template.ts` las empaqueta como template embebido (con `template-manifest.json` describiendo el contenido exacto). Cada push a `main` pasa por CI (tests + typecheck + smoke de empaquetado).

> `assets/orchestrator.md` es contenido portable en espíritu, pero hoy `lib/persona.ts` y `lib/sdd-preflight.ts` lo leen relativo al módulo, así que vive con el runtime. Se moverá a `core/` cuando esa lógica se extraiga al CLI (fase multi-agente).

## // 014. ACTUALIZAR / PUBLICAR

```bash
ein update                          # backup + redeploy de Ein (conserva tu estado)

git tag installer-v<semver>         # publicar release
git push origin installer-v<semver> # GitHub Actions compila 4 binarios + checksums
```

> **Validación local** (opcional, antes de publicar):
> `cd installer && bun run build:all` compila localmente sin publicar.
> La publicación real ocurre al pushear el tag `installer-v*`.

## // 015. ROADMAP

- **Multi-perfil** — `profiles/<persona>.json`, cada uno con su persona y stack de skills, para que otra persona instale Ein con otro stack. La base existe (`stack-profile.json` + `loadProfile()`); falta el selector.
- **Galego en la UI** — el sistema de idioma ya contempla `gl`; falta traducir los mapas de `lib/i18n/strings.ts`.
- **Windows nativo** (sin WSL) — binario `ein-installer-windows-x64.exe` (Bun ya soporta el target) + `install.ps1` (`irm … | iex`) + `platform.ts`/`deps`/`exec` portados (winget/scoop, `where.exe`). Pendiente de validar la TUI ANSI en consola Windows y el templado de rutas. Hoy el camino es WSL (ver Instalación).

---


>**Ein** es el corgi de *Cowboy Bebop*: un "data dog" modificado, mucho más inteligente de lo que aparenta, que resuelve lo difícil sin hacer ruido ni buscar protagonismo. Justo lo que quiero de esta herramienta: discreta pero profundamente capaz, hace el trabajo inteligente por debajo y te deja a ti al mando.

<p align="center">
  <img src="ein_ins.webp" alt="Ein" width="280">
</p>
