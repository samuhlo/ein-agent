# Apply progress — beta-phase-zero-baseline

status: complete

## Resultado

- La plantilla distribuida ya no elige proveedor, modelo ni allowlist de modelos.
- El wizard normal conserva Context7/Linear y deja de solicitar MiniMax implícitamente.
- `/ein:models` recomienda únicamente esfuerzo y usa una distancia mínima de dos niveles para alertar.
- Los accesos actuales desde `installer` y `ein-cc` al runtime de Pi quedan congelados en un baseline AST decreciente.

## Evidencia TDD

| Seam | RED | GREEN | Triangulación |
|---|---|---|---|
| Settings del bundle | El tar extraído todavía contenía `defaultProvider: minimax` | La plantilla fuente quedó neutral y el tar real pasó | Inspección directa del bundle host confirma ausencia de los tres campos |
| Wizard de secrets | La captura inyectada quedó vacía y el flujo real siguió mostrando MiniMax | `requestSecret` permite observar Context7/Linear y MiniMax fue retirado | Casos Linear `on` y `off` prueban listas distintas |
| Recomendación de esfuerzo | Los exports effort-only no existían y los tests de tier seguían vigentes | La recomendación contiene solo `thinking` y `reason` | Matriz igual/adyacente/lejana + panel real `medium→high` y `low→high` |
| Fila del orquestador | La triangulación mostró que el detalle avisaba pero la fila especial no tenía `!` | La rama del orquestador usa el mismo helper | El test real exige ausencia/presencia tanto en fila como en detalle |
| Boundary guard | Inventario AST levantado sobre el árbol actual | Baseline literal exacto de deuda conocida | Una referencia nueva o retirada obliga a revisar el contrato |

## Verificación focal final

`bun test tests/sdd-cost-block-g.test.ts tests/model-config.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts tests/architecture-boundaries.test.ts` — PASS, 49 tests.

`bun test tests/models-panel-orchestrator-thinking.test.ts tests/sdd-cost-block-g.test.ts` — PASS, 14 tests.

Deviaciones del diseño: la triangulación añadió el marcador a la fila especial del orquestador; era necesario para aplicar el mismo umbral a toda la superficie.
