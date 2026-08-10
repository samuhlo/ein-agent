<!-- ein:init rev=0abd936 generado=2026-08-10 · refresca con /ein:init -->
## Overview
<!-- CURADA — 2-3 líneas: qué es el proyecto y para quién. -->
Harness de coding-agent sobre Pi Coding Agent y Claude Code: dos runtimes aislados con una sola disciplina de entrega. Convierte trabajo ambiguo en cambios pequeños, verificados y explicados, con el estado del cambio en disco (`openspec/`) y no en la conversación.
Herramienta personal de Samu antes que producto público; cuando las dos cosas chocan, gana el uso propio.

**Hoja de ruta canónica: [`docs/roadmap-features-ein.md`](docs/roadmap-features-ein.md).** Es la única fuente de priorización y secuencia. El resto de documentos de `docs/` son catálogo de ideas o material en crudo; ver el índice de estado al final de ese fichero antes de asumir que algo está vigente.

## Arquitectura
<!-- CURADA — estilo (p.ej. screaming architecture) y dónde viven las features. -->
Núcleo portable + adaptadores por runtime. `ein-pi/core/` es contenido agnóstico del runtime (agentes, skills, docs, prompts) y lo comparten los dos adaptadores; `ein-pi/agent/` es el runtime específico de Pi (extensiones, chains, `lib/`). `pi-ein/` y `cc-ein/` son solo superficie de adaptación; `installer/` posee instalación, despliegue, backups y releases; `docs-site/` es la documentación pública.

La lógica vive en `ein-pi/agent/lib/` como módulos deterministas y sin estado global: reciben la evidencia como parámetro y devuelven un resultado. Los marcados `[CORE]` no leen, no escriben y no ejecutan nada — la E/S se queda en el borde (extensiones, CLI, installer). Las features se nombran por lo que hacen, no por su capa.

El flujo es SDD: `scope → map → design → tasks → apply → verify → close`, un artefacto por fase en `openspec/changes/<cambio>/`, y el estado de fase lo calcula una herramienta determinista, no una opinión del modelo.

## Convenciones
<!-- CURADA — naming y patrones específicos de ESTE repo. -->
- **Naming:** ficheros y carpetas en kebab-case (`shared-config-update-advisor.ts`). Cada módulo de `lib/` tiene su espejo en `tests/<mismo-nombre>.test.ts`.
- **Idioma:** código, identificadores y comentarios en inglés; commits, PRs y documentación en español. Sin atribución de IA en el historial.
- **TDD estricto** (`openspec/config.yaml: strict_tdd: true`). La puerta es `bun test` desde la raíz. Typecheck: `cd installer && bun run typecheck`.
- **Fail-closed:** la incertidumbre nunca se convierte en un estado bueno. Un probe que falla, expira o llega obsoleto se representa como `unavailable`/`unknown`, jamás como `current`.
- **Evidencia con procedencia:** los contratos conservan de dónde salió cada dato (`provenance`, `freshness`) para que un consumidor pueda distinguir un hecho de una suposición.
- **Aislamiento primero:** `pi` y `claude` vanilla no se tocan. Ein entra por superficies explícitas (`pi-ein`, `cc-ein`) y hogares propios (`~/.pi-ein`, `~/.claude-ein`).
- Bun como runtime y gestor de paquetes. Los comentarios explican el porqué; si repiten el código, se borran.

## Índice
<!-- SEMI-CURADA — una línea por carpeta/pieza: qué es. Ein la siembra; el modelo/tú la mantenéis al crecer el proyecto. -->
- `cc-ein/` — Adaptador Claude y sincronización de superficies.
- `docs/` — Documentación y roadmap del proyecto.
- `docs-site/` — Sitio de documentación pública de Ein.
- `e2e/` — Escenarios E2E del instalador en contenedores limpios.
- `ein-pi/` — Core Ein, agentes y sincronización OpenSpec.
- `installer/` — CLI, binarios y runtime del instalador.
- `openspec/` — Especificaciones y ciclos de cambios SDD.
- `pi-ein/` — Adaptador Pi aislado (`pi-ein`) y migración desde `~/.pi`.
- `tests/` — Suite Bun de contratos y paridad.

<!-- ein:auto:start — generado por /ein:init, no editar a mano -->

## Comandos

_No detectados automáticamente._

## Estructura

- `cc-ein/`
- `docs/`
- `docs-site/`
- `e2e/`
- `ein-pi/`
- `installer/`
- `openspec/`
- `pi-ein/`
- `tests/`

## Docs

- [README](README.md)
- [CHANGELOG](CHANGELOG.md)
- [docs/EIN_DOCUMENTATION_BRIEF.md](docs/EIN_DOCUMENTATION_BRIEF.md)
- [docs/borrador_nuevas_feats_EIN.md](docs/borrador_nuevas_feats_EIN.md)
- [docs/ein-multiagente-plan.md](docs/ein-multiagente-plan.md)
- [docs/ein_futuras_features.md](docs/ein_futuras_features.md)
- [docs/fricciones-dogfooding.md](docs/fricciones-dogfooding.md)
- [docs/review-workload-guard.md](docs/review-workload-guard.md)
- [docs/roadmap-beta.md](docs/roadmap-beta.md)
- [docs/roadmap-codegraph-tdd-launcher.md](docs/roadmap-codegraph-tdd-launcher.md)
- [docs/roadmap-features-ein.md](docs/roadmap-features-ein.md)

<!-- ein:auto:end -->

## Codegraph (pre-indexed code knowledge graph — ACTIVE in this project)
