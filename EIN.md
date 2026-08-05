<!-- ein:init rev=8fdd38e generado=2026-08-05 · refresca con /ein:init -->
> Contexto de proyecto para Ein. La zona AUTO la regenera `/ein:init`; la zona curada es tuya (Ein no la pisa).

## Overview
<!-- CURADA — 2-3 líneas: qué es el proyecto y para quién. -->
_(pendiente)_

## Arquitectura
<!-- CURADA — estilo (p.ej. screaming architecture) y dónde viven las features. -->
_(pendiente)_

## Convenciones
<!-- CURADA — naming y patrones específicos de ESTE repo. -->
_(pendiente)_

## Índice
<!-- SEMI-CURADA — una línea por carpeta/pieza: qué es. Ein la siembra; el modelo/tú la mantenéis al crecer el proyecto. -->
- `cc-ein/` — Adaptador Claude y sincronización de superficies.
- `docs/` — Documentación y roadmap del proyecto.
- `e2e/` — _(describe)_
- `ein-pi/` — Core Ein, agentes y sincronización OpenSpec.
- `installer/` — _(describe)_
- `openspec/` — Especificaciones y ciclos de cambios SDD.
- `pi-ein/` — _(describe)_
- `tests/` — Suite Bun de contratos y paridad.

<!-- ein:auto:start — generado por /ein:init, no editar a mano -->

## Comandos

_No detectados automáticamente._

## Estructura

- `cc-ein/`
- `docs/`
- `e2e/`
- `ein-pi/`
- `installer/`
- `openspec/`
- `pi-ein/`
- `tests/`

## Docs

- [README](README.md)
- [CHANGELOG](CHANGELOG.md)
- [docs/ein-multiagente-plan.md](docs/ein-multiagente-plan.md)
- [docs/review-workload-guard.md](docs/review-workload-guard.md)
- [docs/roadmap-beta.md](docs/roadmap-beta.md)

<!-- ein:auto:end -->

## Codegraph (pre-indexed code knowledge graph — ACTIVE in this project)

This project is indexed by codegraph (deterministic AST graph of every symbol, call edge, and file; reads are sub-millisecond; the index lags writes by ~1s). Use it via bash INSTEAD of grep/read exploration loops:

- `codegraph explore "<natural-language question or symbol/file names>"` — ONE call returns the verbatim, line-numbered source of the relevant symbols grouped by file (Read-equivalent, safe to Edit from) PLUS the call path among them and a blast-radius summary.
- `codegraph callers <symbol>` / `codegraph callees <symbol>` — surgical caller/callee lists.

Rules:
- Reach for codegraph BEFORE any grep/read exploration of indexed source. One explore usually replaces a dozen reads — a manual grep+read loop repeats work the index already did and costs more.
- Treat returned source as already-Read; do NOT re-verify codegraph results with grep.
- If output starts with a staleness banner ("⚠️ … edited since the last index sync"), Read those specific files directly; everything else stays trustworthy. Configs, docs, and non-indexed files still go through read/grep as usual. It does not replace the compiler or the test suite.