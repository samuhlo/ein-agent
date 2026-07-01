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

Routing por fase. Estos son **mi elección personal** — un setup parecido funciona igual de bien; personalízalo por agente con `/ein:models` (o los presets `/ein:models:full` y `/ein:models:lite`).

| Componente | Full | Lite |
|---|---|---|
| Orquestador | `gpt-5.5` | `MiniMax-M3` |
| `sdd-design` | `gpt-5.5` | `MiniMax-M3` |
| `sdd-apply` | `MiniMax-M3` | `MiniMax-M3` |
| `sdd-scope`, `sdd-map`, `sdd-tasks`, `sdd-verify`, `sdd-close`, `ein-linear`, `ein-git` | `MiniMax-M2.7` | `MiniMax-M2.7` |

`apply` (que escribe código) va a M3 a propósito: M2.7 se quedaba corto. Si gpt-5.5 se queda sin tokens, **el cambio es manual** — `/ein:models:lite` baja las fases pesadas a M3 al instante. Pi no hace fallback automático de modelo a mitad de tarea; ese cambio lo decides tú.

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

`/ein:init` genera un **`EIN.md`** versionado en la raíz: la verdad de base del proyecto (stack, comandos, arquitectura, convenciones) que se inyecta al orquestador y a las fases SDD para que los modelos baratos **no re-descubran lo mismo cada run** (ahorro de tokens, más control). Zona **curada** (la escribes tú, Ein no la pisa) + zona **auto** (la regenera `/ein:init` con sello `rev` + fecha; `/ein:status` avisa de la deriva). Se commitea: es conocimiento del repo.

## // 008. SKILLS (3 capas)

1. **Locales** (`skills/local/`) — skills opinadas propias (workflow, disciplina, convenciones). Se sincronizan desde este repo.
2. **Bajadas** (`skills/downloaded/`) — set **curado** de fuentes fiables: [onmax/nuxt-skills](https://github.com/onmax/nuxt-skills), [antfu/skills](https://github.com/antfu/skills), greensock (GSAP), vercel-labs (React/Next), yusukebe (Hono), midudev (Bun).
3. **Context7** — todo lo demás (Drizzle, Zod, Tailwind, Postgres…) on-demand, con docs frescas, sin guardar nada que envejezca.

`/ein:skills` mantiene 1 y 2 al día; el advisor decide por tarea entre skill curada o Context7. Configuración en `skills/stack-profile.json`.

## // 009. PLATAFORMA

- **Memoria** — Engram mantiene contexto entre sesiones (no reexplica el proyecto cada vez). Opcional.
- **Idioma (2 ejes)** — `/ein:lang` separa conversación/UI de artefactos (PR/commit/Linear). Charlar en castellano y generar PRs en inglés, por ejemplo.
- **Guardrails** — lista explícita de patrones denegados (`git reset --hard`, `rm -rf`, `DROP TABLE`…) y patrones que exigen confirmación.
- **MCP eficiente** — `pi-mcp-adapter` (proxy de un tool, ~200 tokens vs 10k+/server) + `context-mode` (sandbox de salidas, persistencia de sesión sobre compactaciones).
- **Sesiones recientes** — el banner las lista al arrancar; recupéralas con `pi -c`/`pi -r`/`pi --session <id>` o `/ein:resume`.
- **`ask_user_question`** — en los checkpoints (gates SDD, delivery, scope) Ein pregunta con diálogos estructurados, no prosa, solo cuando la respuesta cambia el siguiente paso.

---

## // 010. INSTALACIÓN

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

Detecta plataforma, descarga el binario de la última release y abre la TUI. El wizard (`ein install`): detecta OS/arch/distro/shell, instala dependencias faltantes (**bun** y **pi** obligatorias; **engram** y **gh** opcionales), pregunta el modo (Solo por defecto, Team opt-in), despliega el workbench en `~/.pi/agent` templando rutas, wizard opcional de secrets, y corre el doctor.

> **Nunca toca** `auth.json`, `sessions/` ni `backups/` — tu estado es siempre tuyo.

**Windows (vía WSL).** Ein corre en Windows a través de WSL2 (que por dentro es Linux):

```powershell
wsl --install        # PowerShell como admin; reinicia y abre Ubuntu
```

Dentro de Ubuntu (WSL), el mismo one-liner de arriba. El instalador detecta WSL y despliega la build de Linux. Trabaja con tus proyectos **dentro del FS de WSL** (`~/...`), no en `/mnt/c/...` (mucho más lento y con permisos raros); `bun`, `pi` y `engram` se instalan dentro de WSL, y el estado de Ein vive en `~/.pi` **de WSL**. Windows nativo (sin WSL) llegará más adelante.

| Dependencia | Requerida |
|---|---|
| [Bun](https://bun.sh) ≥ 1.3 | Sí (el installer la gestiona) |
| [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) | Sí (el installer la gestiona) |
| [Engram](https://github.com/Gentleman-Programming/engram) | No, recomendado |
| [GitHub CLI](https://cli.github.com) | No, recomendado |

## // 011. COMANDOS `ein`

```bash
ein                 # Menú interactivo (TUI brutalista)
ein install         # Instala o repara Ein
ein update          # Actualiza Ein y pi (backup previo)
ein doctor          # Diagnóstico sin lanzar pi
ein uninstall       # Elimina Ein (conserva auth, secrets, sesiones)
ein restore         # Restaura desde un backup
```

Flags: `--yes`, `--no-engram`, `--no-secrets`, `--no-linear` (arranca en modo Solo).

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

La fuente canónica del workbench vive en `ein-pi/agent/`. El installer la empaqueta y despliega en `~/.pi/agent` (destino instalado, no se edita desde el repo).

```
ein-agent/
├── ein-pi/agent/          # Fuente canónica del workbench
│   ├── agents/            # SDD (7) + ein-linear + ein-git
│   ├── chains/            # Cadena ein-sdd
│   ├── extensions/        # Extensiones del runtime de Pi
│   ├── lib/               # Lógica compartida (mode, persona, lang, modelos, guardrails…)
│   ├── skills/            # Locales + bajadas curadas + mapa Context7
│   ├── brand.json · mcp.json · settings.json
└── installer/             # Instalador cross-platform (macOS + Linux)
```

`ein-pi/agent/` es la única fuente versionada del workbench; `installer/scripts/bundle-template.ts` la empaqueta como template embebido. Cada push a `main` pasa por CI (tests + typecheck + smoke de empaquetado).

## // 014. ACTUALIZAR / PUBLICAR

```bash
ein update                          # backup + redeploy + actualiza pi (conserva tu estado)

git tag installer-v0.13.5           # publicar release
git push origin installer-v0.13.5   # GitHub Actions compila 4 binarios + checksums
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
