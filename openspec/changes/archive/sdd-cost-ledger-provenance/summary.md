## // 000. RESUMEN

Ein ahora etiqueta cada recibo de ejecución con identidad estructurada inmutable (flowId/changeId/phase/runId) vinculada a bytes estables del artefacto de fase y del метаfichero del producer. Los valores faltantes se muestran como `n/a` (unavailable) en vez de cero inventado, y los costos del provider nunca se confunden con estimaciones.

## // 001. QUÉ CAMBIÓ

- **Nuevo módulo local:** `ein-pi/agent/lib/sdd-cost-provenance.ts` (448 líneas) — acuña identidad, snapshot de bytes estables, sidecars inmutables, normalización de métricas, deduplicación y agregación.
- **`ein-pi/agent/extensions/ein-ai.ts`:** conecta `beginDelegationObservation` / `observeDelegationResult` en los hooks existentes del subagent, antes de `reconcilePhaseFailure` (sin tocarlo).
- **`ein-pi/agent/lib/sdd-router.ts`:** reducido a fachada de compatibilidad; delega a `readSddCostLedger`.
- **`openspec/specs/sdd-lifecycle/spec.md`:** un escenario ADDED sincronizado vía motor OpenSpec (SHA-256 `f895e00…` verificado).
- **Tests:** `tests/sdd-real-cost-provenance.test.ts`, `tests/sdd-status-output.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-reconcile.test.ts`.

## // 002. CÓMO FUNCIONA POR DENTRO

**Adapter de provenance local (`sdd-cost-provenance.ts`):** antes de cada delegación directa de fase SDD, `beginDelegationObservation` acuña `flowId`/`runId`, snapshot del artefacto de fase y del `_meta.json` del producer con conteo de bytes y SHA-256. Después del resultado, `observeDelegationResult` busca exactamente un nuevo/changed pair; si hay cero, múltiples, o inestables, escribe un problema acotado y ningún recibo.

**Sidecar inmutable:** cada ejecución exitosa persiste un `RunReceiptV1` bajo `.pi/ein/sdd-cost-ledger/v1/` con identidad estructurada, tres timestamps, bind de artefacto de fase y fuente, métricas normalizadas con discriminated `{value, provenance: reported|estimated|unavailable, reason}`, y problemas acotados. Bytes estables + SHA-256 impiden reescritura posterior del historial.

**Deduplicación y agregación:** `readSddCostLedger` valida sidecars, deduplica por `runId`, excluye conflictos, y deriva change/phase/attempt/agent aggregates con `memberRunIds` ordenado. Cada total incompleto es `null` provenance=unavailable; nunca se suma un parcial como total.

**Hook de rendering en `ein-ai.ts`:** conserva `details.realCost` para compatibilidad, añade `details.costLedger` como versión preferida, y renderiza `n/a` + `(reported|estimated|unavailable)` en vez de "real cost".

**Reconciliación de timeout (`sdd-reconcile.ts`):** completamente intacta. Observation corre antes de `reconcilePhaseFailure` y no altera su decisión.

## // 003. DECISIONES

| Decisión | Razón |
|---|---|
| Adapter local en vez de modificar `pi-subagents` | No se posee el paquete externo; modificarlo rompería el contrato de frontera. |
| bind a bytes estables de artefacto de fase + `_meta.json` | Garantiza que un receipt pertencece a la fase exacta del cambio exacto; ni `foo` ni `foo-bar` comparten runs. |
| `usage.cost` sin clasificar → ambos campos unavailable | Ningún contrato in-repo prueba si es billing provider o estimación; safest path. |
| Sin gates numéricos de tokens/costo | Scope lo excluía; no se introducen. |
| Diff 567 líneas como single-PR exception aprobada por el usuario | El usuario registró explícitamente la aprobación en `apply-progress.md // 005.delivery`. |

## // 004. VERIFICACIÓN

- `bun test tests/sdd-real-cost-provenance.test.ts` → 15 pass, 0 fail
- `bun test tests/sdd-status-output.test.ts` → 17 pass, 0 fail
- `bun test tests/sdd-reconcile.test.ts` → 17 pass, 0 fail
- `bun test tests/sdd-phase-runtime-contract.test.ts` → 26 pass, 0 fail
- Combinado: **75 pass, 0 fail, 190 expect() calls**
- `cd installer && bun run typecheck` → pass
- `git diff --check` en paths in-scope → pass
- SHA-256 triple del sync-report reconciliado con bytes en disco
- Diff producción: +480/-87 = **567 líneas** (user-approved single-PR exception)

## // 005. PENDIENTE / RIESGOS

- **Claves i18n deprecated** (`sdd-status.real-cost*`) siguen en `ein-pi/agent/lib/i18n/strings.ts` sin referencia en `ein-ai.ts`; limpieza en tarea separada, no regression.
- **Diff 567 líneas** excede el presupuesto de 400; exception aprobada por el usuario.
- Spec canonical en working tree (SHA-1 `0b926a7`) vs HEAD (`186ead2`); el slice es unstaged consistentemente.
- `sdd-reconcile.ts` y `sdd-phase-runtime-contract.test.ts` prueban que la reconciliación queda intacta byte-por-byte.
