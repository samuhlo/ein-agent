# ADR 0001 — Presupuesto de revisión

status: accepted
date: 2026-08-18

## Contexto

Una entrega muy grande puede superar la capacidad de revisión aunque sus tests estén verdes. La medida debe ser determinista y no depender de una estimación del modelo.

## Decisión

`ein_review_forecast` mide inserciones y borrados de producción contra la base. Tests, snapshots, lockfiles, OpenSpec y generados se informan por separado y no consumen el presupuesto de producción, cuyo valor por defecto es 400 líneas.

Si se supera el presupuesto, Ein pide elegir entre una excepción explícita o PRs encadenadas. El modo automático no elimina este guard.

## Consecuencias

- Los cambios grandes siguen siendo posibles, pero la estrategia de revisión queda declarada.
- La medición vive en código y sus tests; este ADR conserva únicamente el porqué.
