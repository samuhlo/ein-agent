<!-- ein:init rev=5a6b65a generado=2026-08-28 · refresca con /ein:init -->
## Overview
<!-- CURADA — 2-3 líneas: qué es el proyecto y para quién. -->
Harness de coding-agent sobre Pi Coding Agent y Claude Code: dos runtimes aislados con una sola disciplina de entrega. Convierte trabajo ambiguo en cambios pequeños, verificados y explicados, con el estado del cambio en disco (`openspec/`) y no en la conversación.
Herramienta personal de Samu antes que producto público; cuando las dos cosas chocan, gana el uso propio.

**Rumbo canónico: [`MANIFIESTO.md`](MANIFIESTO.md).** Define lo que Ein tiene que ser; manda sobre cualquier plan.

**Hoja de ruta canónica: [`docs/roadmap.md`](docs/roadmap.md).** Solo contiene trabajo vigente. `docs/README.md` explica dónde vive cada clase de información y `docs/adr/` conserva decisiones duraderas.

## Arquitectura
<!-- CURADA — estilo (p.ej. screaming architecture) y dónde viven las features. -->
Núcleo portable + adaptadores por runtime. `ein-pi/core/` es contenido agnóstico del runtime (agentes, skills, docs, prompts) y lo comparten los dos adaptadores; `ein-pi/agent/` es el runtime específico de Pi (extensiones, chains, `lib/`). El mismo árbol `ein-pi/` posee el adaptador Pi y `ein-cc/` posee el adaptador Claude; `installer/` controla instalación, despliegue, backups y releases; `docs-site/` es la documentación pública.

La lógica vive en `ein-pi/agent/lib/` como módulos deterministas y sin estado global: reciben la evidencia como parámetro y devuelven un resultado. Los marcados `[CORE]` no leen, no escriben y no ejecutan nada — la E/S se queda en el borde (extensiones, CLI, installer). Las features se nombran por lo que hacen, no por su capa.

El flujo es SDD: `scope → map → design → tasks → apply → verify → close`, un artefacto por fase en `openspec/changes/<cambio>/`, y el estado de fase lo calcula una herramienta determinista, no una opinión del modelo.

## Convenciones
<!-- CURADA — naming y patrones específicos de ESTE repo. -->
- **Naming:** ficheros y carpetas en kebab-case (`shared-config-update-advisor.ts`). Cada módulo de `lib/` tiene su espejo en `tests/<mismo-nombre>.test.ts`.
- **Idioma:** código, identificadores y comentarios en inglés; commits, PRs y documentación en español. Sin atribución de IA en el historial.
- **TDD estricto** (`openspec/config.yaml: strict_tdd: true`) es el DEFAULT del proyecto, no una obligación por cambio: cada cambio declara su postura en `openspec/changes/<change>/preflight.json` y esa declaración manda sobre el config. La puerta es `bun test` desde la raíz. **Hay DOS typechecks y CI corre los dos**: `bun run typecheck` desde la raíz (cubre `ein-pi/` y `ein-cc/`) y `cd installer && bun run typecheck`. `bun test` en verde no basta: Bun no comprueba tipos.
- **Dos instalaciones, un solo comando: `bun run setup`.** El repo instala en la raíz y en `installer/`, y la suite necesita las dos: varios tests lanzan `bun run` dentro de `installer/`. Sin la segunda salían 16-19 rojos que parecían tests rotos y no lo estaban. Hoy el preload de `bun test` corta antes y dice qué escribir, en vez de dejar que la suite mienta.
- **Fail-closed:** la incertidumbre nunca se convierte en un estado bueno. Un probe que falla, expira o llega obsoleto se representa como `unavailable`/`unknown`, jamás como `current`.
- **Evidencia con procedencia:** los contratos conservan de dónde salió cada dato (`provenance`, `freshness`) para que un consumidor pueda distinguir un hecho de una suposición.
- **Aislamiento primero:** `pi` y `claude` vanilla no se tocan. Ein entra por superficies explícitas (`ein-pi`, `ein-cc`) y hogares propios (`~/.pi-ein`, `~/.claude-ein`).
- Bun como runtime y gestor de paquetes. Los comentarios explican el porqué; si repiten el código, se borran.

## Índice
<!-- SEMI-CURADA — una línea por carpeta/pieza: qué es. Ein la siembra; el modelo/tú la mantenéis al crecer el proyecto. -->
- `docs/` — Documentación y roadmap del proyecto.
- `docs-site/` — Sitio de documentación pública de Ein.
- `e2e/` — Escenarios E2E del instalador en contenedores limpios.
- `ein-cc/` — Adaptador Claude y sincronización de superficies.
- `ein-pi/` — Core compartido, runtime Pi, launcher aislado y migración.
- `evals/` — Corpus y evaluaciones reproducibles que no participan en el runtime.
- `installer/` — CLI, binarios y runtime del instalador.
- `openspec/` — Especificaciones y ciclos de cambios SDD.
- `tests/` — Suite Bun de contratos y paridad.

<!-- ein:auto:start — generado por /ein:init, no editar a mano -->

## Comandos

| Acción | Comando |
|---|---|
| install | `bun install` |
| test | `bun run test` |
| typecheck | `bun run typecheck` |
| setup | `bun run setup` |

## Estructura

- `docs/`
- `docs-site/`
- `e2e/`
- `ein-cc/`
- `ein-pi/`
- `evals/`
- `installer/`
- `openspec/`
- `tests/`

## Docs

- [README](README.md)
- [CHANGELOG](CHANGELOG.md)
- [docs/README.md](docs/README.md)
- [docs/roadmap.md](docs/roadmap.md)
- [docs/adr/0001-review-workload-guard.md](docs/adr/0001-review-workload-guard.md)
- [docs/adr/0002-retain-legacy-terminal-renderer.md](docs/adr/0002-retain-legacy-terminal-renderer.md)

<!-- ein:auto:end -->

## Codegraph (pre-indexed code knowledge graph — ACTIVE in this project)
