status: complete

## Resumen

Sustituida la negación acumulada (`status !== "update-available"`) por una lista positiva de admitidos `RENDERABLE_UPDATE_STATUSES = ["update-available", "unavailable"]` en `renderPiEinAdvisorNotice()` (`ein-pi/agent/lib/ein-update-notice.ts:309-320`). El corte ahora permite que evidencia incompleta (`unavailable`) llegue al filtro por componente existente, que sigue decidiendo qué se nombra (`quality === "update-available" && freshness === "current"`).

## Ficheros cambiados

- `ein-pi/agent/lib/ein-update-notice.ts` — constante + condición (10 líneas netas). Único fichero de producción tocado.
- `tests/ein-banner-updates.test.ts` — 5 tests nuevos (defecto + 3 guardias fail-closed + límite `current`). Los dos tests existentes (~441, ~458) no se tocaron.

## TDD Cycle Evidence

| Seam | RED | GREEN | Comando final |
| :--- | :--- | :--- | :--- |
| Renderiza componente accionable con faceta agregada `unavailable` | Falla: `expect(rendered).toBe(...)` recibe `null` (corte rechazaba `unavailable`) | Pasa tras añadir `RENDERABLE_UPDATE_STATUSES` | `bun test tests/ein-banner-updates.test.ts` |
| Silencio fail-closed en `ambiguous`/`error`/`unsupported` con item accionable | Ya pasaba en RED (guardia de contrato, no motor del cambio) | Sigue pasando | `bun test tests/ein-banner-updates.test.ts` |
| Silencio en faceta `current` (límite superior, D2) | Ya pasaba en RED | Sigue pasando | `bun test tests/ein-banner-updates.test.ts` |

Solo el test del caso del defecto fue motor real de RED→GREEN, tal como especificaba el diseño (D4): los guardias son aserciones negativas del mismo contrato, no fallan intencionalmente en RED.

## Verificación

- `bun test tests/ein-banner-updates.test.ts`: 24 pass, 0 fail (19 preexistentes + 5 nuevos).
- `bun test` (raíz): 1476 pass, 0 fail, 109 ficheros (línea base medida 1471 + 5 nuevos).
- Diff aislado: solo `ein-pi/agent/lib/ein-update-notice.ts` y `tests/ein-banner-updates.test.ts`. Ningún otro fichero de `ein-pi/` tocado. `shared-config-update-advisor.ts` intacto.

## Desviaciones

Ninguna. Implementación siguió tasks.md y design.md sin reabrir decisiones.

## Correcciones de forma (post-revisión del coordinador, mismo pase)

1. **JSDoc huérfano.** La constante `RENDERABLE_UPDATE_STATUSES` y su JSDoc se habían insertado entre el JSDoc de `renderPiEinAdvisorNotice()` y la función, dejando el JSDoc original documentando la constante. Corregido: la constante se movió junto a `UPDATE_COMMANDS`/`HANDOFF_COMMANDS` (otras constantes de módulo), y el JSDoc de la función vuelve a quedar pegado a ella.
2. **`.includes()` no compilaba con `tsc --strict`.** `RENDERABLE_UPDATE_STATUSES` tipada con `as const` estrechaba a `readonly ["update-available", "unavailable"]`, incompatible con el tipo más ancho `AdvisorUpdateStatus` de `result.update.status`. Corregido: tipado explícito `ReadonlySet<AdvisorUpdateStatus>` (import de tipo añadido al import existente de `shared-config-update-advisor.ts`), consultado con `.has()`. Sin casts. Verificado con `installer/node_modules/.bin/tsc --noEmit --strict --allowImportingTsExtensions --types node --typeRoots installer/node_modules/@types ein-pi/agent/lib/ein-update-notice.ts` — 0 errores.
3. **Ternario anidado de tres ramas en el bucle de guardias fail-closed** (tests). Sustituido por una tabla `[status, reason][]` iterada con `for...of`, construyendo las observaciones una sola vez por iteración. Mismas aserciones que antes (`result.update.status` igual al esperado, render `null`).

Re-verificación tras las tres correcciones: `bun test tests/ein-banner-updates.test.ts` → 24 pass, 0 fail. `bun test` (raíz) → **1476 pass, 0 fail**, 109 ficheros. Diff sigue aislado a `ein-pi/agent/lib/ein-update-notice.ts` y `tests/ein-banner-updates.test.ts`.

## Tareas restantes

Ninguna. Todas las tareas de los grupos 001 y 002 completadas, incluidas las correcciones de forma solicitadas antes de `verify`.
