status: complete
change: accept-scout-fanout-reports
work_groups: 5
verification_status: pass

## // 000. RESUMEN

Scout canonicaliza reportes con variantes de forma segura (alias de clave, array vacío de incertidumbres) rechazando alias ambiguos antes de `closed`, con diagnóstico que nombra la clave culpable. El smoke opt-in queda preparado para demostrar en vivo 3/3 ramas por producción sin reintento ni fallback de modelo; esa corrida contra proveedor sigue pendiente.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/lib/scout-contract.ts` — `canonicalizeReport` (normaliza `schema`→`version`, descarta `id` de finding, `uncertainties: []`→nivel `none`), `normalizeReference` devuelve resultado explicado con rama `lineStart`/`lineEnd` y `quote`→`supports`, ambigüedad rechaza nombrando claves conflictivas.
- `tests/readonly-scout-contract.test.ts` — +5 tests (001 variantes y ambigüedad), +6 tests (002 referencias), +1 neto (003 cicatriz reescrita de `uncertainties: []`, conserva casos de missing/multiple/malformed/oversized).
- `tests/fixtures/scout-live-smoke-observer.ts` — `isScoutLaunch` reemplazado por `delegationIncludes(input, "ein-scout")`, `observations` almacena `{ toolCallId, input, details, isError }`.
- `tests/scout-live-smoke.ts` — Fan-out de 3 ramas, sesiones alineadas, validación por `normalizeScoutLaunch`+`acceptTrackedScoutResult`, anti-reintento y anti-fallback con evidencia positiva.

## // 002. CÓMO FUNCIONA POR DENTRO

`canonicalizeReport` entra en `parseReport` entre `isRecord` y `closed`, reconstruyendo el objeto con claves canónicas exactas. `normalizeReference` devuelve `{ ok, value|reason }` en lugar de `null`, soportando tres formas de referencia (rango canónico, `lineStart`/`lineEnd`, `quote`); mezclarlas rechaza nombrando ambas. Cada rechazo de forma nombra la clave: `invalid report schema: missing "<key>"`, `invalid reference R1: "quote" and "supports" are both present`. Observer usa `delegationIncludes` compartida con contrato para reconocer fan-out. Smoke siembra tracking con lanzamiento observado y acepta por ruta de producción; exige 3 ramas sin fallback de modelo (checks: `store === "present"`, `runs >= 1`, `fallbacks.count === 0 && undetermined === 0`).

## // 003. DECISIONES

1. Normalización ANTES de `closed`, no relaja `closed` — mantiene una definición única de reporte canónico.
2. Ambigüedad = rechazo nombrando ambas claves, no precedencia silenciosa — evita fabricar contenido cuando el modelo escribió dos valores.
3. `uncertainties: []` → nivel `none` en `canonicalizeReport`, antes de cota `length >= 1` — distingue "miré y no hay nada" de "olvidó declarar".
4. Observer usa función compartida `delegationIncludes` — elimina bifurcación de lógica entre arnés y contrato.
5. Smoke seco (no ejecutado contra proveedor) — verifica forma y tipos; la validación contra prompt/modelo queda como aceptación obligatoria de la release, no se presenta como evidencia ya obtenida.

## // 004. VERIFICACIÓN

- `bun test` → 3103 pass, 0 fail (3091 baseline + 5 tests 001 + 6 tests 002 + 1 neto 003, sin regresiones).
- `bun run typecheck` (raíz) → limpio.
- `cd installer && bun run typecheck` → limpio.
- 7 seams verificadas: 5 variantes normalizan, 3 ambigüedades rechazan nombrando claves, rechazo nombra clave culpable, gold (`checkReference`) intacto, la aceptación sintética de fan-out devuelve 3/3, observer reconoce forma y el smoke seco pasa typecheck.
- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck)`

## // 005. RIESGOS

- Smoke escrito en seco: prompt de fan-out no ejecutado contra proveedor; error en solicitud de 3 ramas solo aparecerá en corrida real.
- Layout `pi-subagents` con sesiones aisladas no confirmado en ejecución viva; diseño falla en alto sin evidencia de store presente y runs ≥ 1.
- Grupo 004 (observer) verificado por typecheck + lectura, sin RED unitario; fixture no testeable en aislamiento.
