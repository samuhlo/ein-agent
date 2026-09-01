# Scope — review-budget-density

scope: El presupuesto de revisión mide renglones de `git diff --shortstat`, una unidad que se puede empaquetar; añadir volumen de producción no comprimible, dispersión por ficheros y un aviso localizado de densidad para que el tamaño real de una entrega no se pueda esconder dentro de líneas largas.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000

## Problema

`ein-pi/agent/lib/review-forecast.ts` suma inserciones y borrados de `git diff --shortstat` contra un presupuesto de 400 (`ADR 0001`). Un renglón cuenta uno tenga 20 o 2.855 caracteres, así que una entrega grande puede presentarse como pequeña sin que nadie mienta.

Deformación medida en el árbol actual:

- `ein-pi/agent/lib/cleaner-coverage-evidence.ts`: 64 renglones, 15.327 caracteres, renglón máximo de 2.855.
- `ein-pi/agent/lib/cleaner-bounded-mutations.ts`: 400 renglones exactos, 29.206 caracteres. Su resumen archivado registra "400/400 líneas".
- Ocho módulos superan los 100 caracteres de media por renglón.
- El guardarraíl entró el 2026-07-31; esos módulos llegaron el 2026-08-09 y el 2026-08-16.

## Prior art dentro del repositorio

`tests/prompt-budget.test.ts` aporta un principio útil para el prompt del orquestador:

1. Techo medido en bytes — unidad que no admite empaquetado.
2. Presupuesto separado de `runtime/agents/*.md`, para que adelgazar el orquestador engordando a los ejecutores no cuente como poda.
3. Test de holgura sobre un artefacto estable: si el techo queda más de un 15% por encima de lo ocupado, falla.

Este cambio reutiliza la primera idea: acompañar una unidad comprimible con volumen real. El presupuesto separado y la holgura responden a la topología estable de los prompts; no tienen un equivalente demostrado en un diff arbitrario y no se copian como puertas de entrega.

## Entrega

El cambio SDD cubre un único comportamiento observable y se entrega mediante dos PRs encadenadas:

1. Medición: el forecast calcula y presenta renglones, bytes no pertenecientes a espacios en blanco, ficheros tocados y métricas por fichero, sin endurecer todavía la puerta.
2. Calibración y puerta: el presupuesto de bytes y el umbral del aviso localizado se fijan contra PRs mergeadas reales; el primero participa en la misma decisión que el presupuesto de renglones y el segundo solo orienta la revisión.

El cambio se cierra después de la segunda PR. Los cambios OpenSpec archivados aportan contexto sobre la intención de las entregas, pero la unidad de calibración es el diff que una persona revisó realmente.

## Non-goals

- No se introduce un bloqueo global por longitud de línea. Rompería expresiones regulares, tablas de constantes y cadenas legítimas, y necesitaría excepciones desde el primer día: sería otro metro torpe.
- No se reformatean los módulos densos existentes. Se descomprime lo que se toque, cuando se toque.
- No se cambia el valor del presupuesto de renglones ni la política de PRs encadenadas. Se añade un presupuesto independiente de volumen.
- No se toca el presupuesto de prompt, que ya está bien construido.

## Configuración SDD vigente

`openspec/config.yaml` existe y no se reescribe. Stack Node/TypeScript ESM con Bun; `strict_tdd: true` como default del proyecto, con la postura por cambio pendiente de declarar en `preflight.json` antes del primer apply. Runner `bun test`. La configuración registra un solo typecheck (`cd installer && bun run typecheck`) mientras que CI y `EIN.md` exigen dos —el de raíz cubre `ein-pi/` y `ein-cc/`—; esta discrepancia se anota como evidencia, no se corrige aquí.

## Áreas afectadas

- `ein-pi/agent/lib/review-forecast.ts` — medición y render.
- `tests/review-workload-guard.test.ts` — puerta existente del guardarraíl.
- Cálculo y decisión: `ein-pi/agent/lib/review-forecast.ts` y `ein-pi/agent/extensions/ein-ai.ts` (tool `ein_review_forecast`).
- Transporte y presentación: `ein-pi/agent/lib/tool-receipts.ts`.
- Contrato de entrega: `runtime/assets/orchestrator.md` y `runtime/agents/ein-git.md`.
- Compatibilidad indirecta por validar en `map`: `ein-pi/agent/lib/sdd-preflight.ts`, `ein-pi/agent/lib/sdd-lane.ts` y `ein-cc/sync.ts`; una mención textual no se tratará como consumo funcional.
- `docs/adr/0001-review-workload-guard.md` — el porqué, si la decisión cambia de forma.

## Riesgos

- El forecast alimenta la decisión de entrega del orquestador: un campo nuevo mal renderizado degrada una puerta que hoy funciona.
- El umbral de densidad sin calibrar produce avisos constantes y se vuelve ruido que se aprende a ignorar. La primera PR informa sin bloquear; la segunda calibra contra PRs mergeadas antes de activar la puerta de volumen.
- `docs/adr/0001` solo conserva el porqué; si la unidad de medida cambia, el ADR debe reflejarlo o quedará contradiciendo al código.

## Condiciones de retirada

- El presupuesto de bytes se retira si evidencia revisada demuestra que no predice coste adicional frente al presupuesto de renglones.
- El aviso de densidad se retira si no cambia ninguna decisión de revisión durante una muestra de 20 PRs que lo activen.
- El recuento de ficheros permanece informativo; no se convierte en bloqueo sin un fallo concreto y medido.
