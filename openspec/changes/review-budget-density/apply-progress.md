# Apply progress — review-budget-density

status: partial

## // 001. PR 1 — medición aditiva

Completadas 1.1 y 2.1. `review-forecast.ts` obtiene identidad y churn con `--numstat -z`, alinea el patch de contexto cero y mide bytes UTF-8 después de retirar whitespace. El contrato añade volumen total, número de ficheros y métricas localizadas; la decisión sigue dependiendo únicamente de 400 líneas. Tool y recibo presentan la medida. STYLE deja la placa como recomendación para módulos nuevos.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Medición de volumen de producción | El focused run falló en bytes, ficheros y exclusiones todavía ausentes | 37 tests pasaron tras implementar numstat y patch | Se añadieron renombres y binarios; 38 tests pasaron | Se silenció stderr esperado de Git y se separaron líneas densas; 38 tests pasaron | `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts` |
| Presentación aditiva sin puerta de bytes | El formato y el recibo fallaron al no mostrar 29.000/12.400 bytes | Tool y recibo mostraron volumen manteniendo la decisión lineal | El caso de 30 líneas y 29.000 bytes permaneció dentro en esta entrega | La descripción de la tool y el formato se dividieron en piezas legibles | `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts` |

## Files changed

- `docs/roadmap.md`
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/lib/review-forecast.ts`
- `ein-pi/agent/lib/tool-receipts.ts`
- `openspec/changes/review-budget-density/apply-progress.md`
- `openspec/changes/review-budget-density/continuity.json`
- `openspec/changes/review-budget-density/design.md`
- `openspec/changes/review-budget-density/map.md`
- `openspec/changes/review-budget-density/preflight.json`
- `openspec/changes/review-budget-density/scope.md`
- `openspec/changes/review-budget-density/specs/sdd-lifecycle/spec.md`
- `openspec/changes/review-budget-density/tasks.md`
- `runtime/docs/STYLE.md`
- `tests/review-workload-guard.test.ts`
- `tests/tool-receipts.test.ts`

## Verification run in apply

- `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts` — 38 pass, 0 fail.
- `bun run typecheck` — pass before the final readability refactor; scheduled again at the PR boundary.

## Remaining

Tasks 3.1–6.1 belong to the calibrated gate in PR 2. No deviation from design.
