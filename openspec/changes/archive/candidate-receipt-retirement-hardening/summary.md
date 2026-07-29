## // 000. RESUMEN
Remediación que conserva el endurecimiento post-revisión de `961aefa` (persistencia durable, resolución única de push-URL, observación con timeout, lock PID/token, fsync, metadatos inmutables, `cleanupPending`), restaura los seis artefactos archivados originales y el spec canónico a su línea base verificada `1f89b0f`, añade la prueba conductual del adaptador de JSON normalizado vía runner inyectado, sincroniza exactamente seis escenarios sibling con estado limpio, y produce evidencia fresca de verificación y sincronización para los bytes finales. El recibo candidato activo para el árbol `1c3138ed` es stale y debe reemplazarse tras el cierre.

## // 001. QUÉ CAMBIÓ

- **Conservado sin rollback** — `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`, `ein-pi/agent/lib/candidate-receipt.ts` unchanged vs. `961aefa`: +361/-96 líneas de producción.
- **Restauración byte-por-byte** — seis ficheros del archivo `candidate-receipt-retirement/` (`apply-progress.md`, `design.md`, `specs/sdd-lifecycle/spec.md`, `summary.md`, `sync-report.md`, `verify-report.md`) iguais a `git show 1f89b0f:<path>`.
- **Spec canónico** — `openspec/specs/sdd-lifecycle/spec.md` baseline `1f89b0f` + 6 escenarios sibling = 33 escenarios totales; sync `state: synchronized`, `conflicts: 0`, `added=6`.
- **Test nuevo** — fixture de PR merged vía runner inyectado en `tests/candidate-receipt-retirement-remote.test.ts`: asserts completos de argumentos, timeout, `AbortSignal` y los 9 campos normalizados.
- **Test relabeled** — `tests/candidate-receipt-retirement-tool.test.ts` re-etiquetado como smoke-only estático; sin ejecución runtime.
- **Tests existentes** — `tests/candidate-receipt.test.ts` y `tests/delivery-gate.test.ts` retained con cobertura de endurecimiento intacta.

## // 002. CÓMO FUNCIONA POR DENTRO

El fluxo de aplicación divide el trabajo en cuatro grupos auditados:

**Grupo 001 — Restauración histórica.** Se extraen los seis ficheros del archivo original desde `git show 1f89b0f:<path>` y se comparan byte a byte con `cmp`. Paralelamente se restaura `openspec/specs/sdd-lifecycle/spec.md` a la misma línea base, con snapshot temporal para rollback hasta que el sync sibling confirme. Ningún source ni test cambia aquí.

**Grupo 002 — Cobertura del adaptador remote.** Se inyecta un runner real (`RemoteCommandRunner`) que devuelve JSON válido de PR merged; el test ejercita `observeMergedPullRequest` en su frontera observable y asserta los 9 campos normalizados exactos (`repository`, `prNumber`, `url`, `state`, `headRepository`, `headRef`, `baseRef`, `headRefOid`, `mergeCommitOid`), timeout, y `AbortSignal` propagado. El test de la tool pública se mantiene como smoke estático con riesgo residual explícito.

**Grupo 003 — Sincronización sibling.** Deterministic OpenSpec sync contra la línea base ya limpia añade exactamente 6 escenarios sibling al spec canónico. El sync-report resultante dice `state: synchronized`, `conflicts: 0`. El spec canónico contiene 27 escenarios baseline + 6 sibling, cada ID sibling ocurre una vez.

**Grupo 004 — Auditoría final.** Focused (116 tests, 277 assertions), OpenSpec (26 tests, 55 assertions), full suite (939 tests, 2.578 assertions, 83 files), `bun run --cwd installer typecheck`, `git diff --check`, 6 comparaciones byte-for-byte de archivo restaurado: todo pasa. Las tres piezas de endurecimiento (`ein-ai.ts`, `candidate-receipt-retirement-remote.ts`, `candidate-receipt.ts`) se confirman byte-estables contra `961aefa`.

**Cadena de evidencia:** `apply-progress.md` → `verify-report.md` (este cambio) → `summary.md` (este documento) → cierre/archive determinista (`sdd-close`) → receipt candidato fresco para HEAD final `961aefa` (tree `595f589f`).

## // 003. DECISIONES

- **Conservar `961aefa` hardening sin rollback:** el map no encontró defecto de implementación; revertirlo eliminaría protección real sin reparar la procedencia de evidencia.
- **Restauración antes de sync, mismo flujo bloqueante:** evita que el sync contra el spec ya contaminado genere `added-existing` o enmascare propiedad; la restauración y el sync son auditablemente distintos pero atómicamente bloqueantes.
- **Runner inyectado para el test de adaptador:** testa la normalización de JSON sin red ni GitHub real; es la seam acotada definida en el diseño.
- **Smoke estático con límite explícito:** detecta cableado eliminado económicamente; ejecutar `ExtensionAPI` runtime no estaba acotado ni era objetivo de este slice.
- **Sync determinista con exactamente 6 escenarios:** cada escenario tiene identidad única y el delta sibling owns solo sus seis adiciones; no se replayan los once escenarios originales ni se declara `spec_delta: none`.
- **Receipt fresco tras close:** el receipt activo (.git/ein/candidate-receipt.json) bindea tree `1c3138ed` (cambio original) y es stale para `595f589f`; se rechaza su uso y se requiere emisión fresca post-cierre.
- **Presupuesto de revisión excedido:** 689 líneas producción/docs vs. presupuesto 400; la decisión de PR único vs. encadenado es explícitamente del usuario vía Review Workload Guard; no se planean PRs encadenados en esta summary.

## // 004. VERIFICACIÓN

| Comprobación | Resultado |
|---|---|
| Focused retirement suite (`bun test` 4 archivos) | 116 pass, 277 assertions, 0 fail |
| OpenSpec specs (`bun test tests/openspec-specs.test.ts`) | 26 pass, 55 assertions, 0 fail |
| Full suite (`bun test`) | 939 pass, 2.578 assertions, 0 fail, 83 files |
| `bun run --cwd installer typecheck` | pass (exit 0, sin output) |
| `git diff --check` | pass (sin errores de whitespace) |
| 6 archivos archivados byte-identical a `1f89b0f` | 6/6 EQUAL |
| Sync sibling `state: synchronized` | pass (`conflicts: 0`, `added=6 modified=0 removed=0`) |
| Sync archivo original `state: synchronized` | pass (evidencia histórica preservada) |
| `grep 'state: conflict'` en ambos sync-report | 0 matches |
| 3 archivos producción byte-estables vs. `961aefa` | pass |
| `delivery-gate.ts` byte-identical a `1f89b0f` | pass |
| `RECEIPT_VERSION = 1` unchanged | pass |
| Workload: producción 457 + docs 232 = 689 vs. presupuesto 400 | excedido — decisión de usuario pendiente |
| Tests reportados separadamente | +205 líneas |

## // 005. PENDIENTE / RIESGOS

- **Riesgo residual runtime tool:** el test de la tool pública (`tests/candidate-receipt-retirement-tool.test.ts`) ejercita solo cableado estático; la ejecución runtime del `ExtensionAPI` no está cubierta más allá de la verificación de presencia de strings. Una regresión en el nombre de registro o en el call-site wiring no sería detectada por la suite actual.
- **Workload excede presupuesto:** 689 líneas producción/docs (budget 400); delivery bloqueado hasta decisión explícita de usuario (PR único vs. PRs encadenados). No se planifican chained PRs desde esta summary.
- **Receipt stale:** `.git/ein/candidate-receipt.json` bindea tree `1c3138ed...` (original) y NO `595f589f...` (HEAD actual). Debe emitirse receipt fresco tras el cierre determinista, no antes.
- **Cadena de evidencia frágil:** cualquier cambio de bytes posterior a la verificación requiere regenerar verify-report, summary y receipt. La evidencia no es reusable tras modificaciones.
- **Ninguno:** el diff-check, typecheck, sync, comparaciones byte e historial lineal están limpios. Sin history rewrite, force-push, WIP en paths de producción, cambio de grants/gates/declaración/receipt-version, o rollback de hardening.
