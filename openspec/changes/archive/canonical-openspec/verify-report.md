# Verify Report — canonical-openspec

status: pass
behavior_coverage: partial

> Fresh re-verification. The previous `verify-report.md` (14:05) predates the post-verify apply tick in `apply-progress.md` (14:08) that documents the restoration of the untracked `EIN.md` placeholder. This report re-runs every required command, re-checks the EIN.md / scope guards, and re-confirms spec/delta/sync-report digest agreement.

## 1. Spec coverage (design.md B/C ↔ tasks.md ↔ apply-progress.md ↔ code)

| Requirement | Surface / Test that exercises it | Status |
|---|---|---|
| **C1** Canonical grammar `openspec-spec/v1`, stable `<domain>/<scenario-id>`, LF serialization | `openspec-spec-contract.ts` + `tests/openspec-specs.test.ts` (4 contract tests) | covered |
| **C2** Identidad estable `<domain>/<scenario-id>`; `MODIFIED` reemplaza por identidad | contract unit + `tests/openspec-specs.test.ts` "plans against the original snapshot …" (ADDED on existing → `code=added-existing`) | covered |
| **D1** Solo `ADDED/MODIFIED/REMOVED`; secciones en orden; IDs únicos; rechaza `CHANGED`, incompletos, duplicados | `openspec-spec-parser.ts` + `tests/openspec-specs.test.ts` (parses canonical spec with CRLF; parses allowed delta operations; rejects malformed input) | covered |
| **D2** `spec_delta: none` con razón no centinela; mezcla con delta → inválido | `sdd-guardrails.ts` `readSpecDeltaDeclaration` + `tests/sdd-guardrails.test.ts` (OpenSpec spec delta declaration block) | covered |
| **S1** Estado `unresolved \| conflict \| synchronized \| pending` (incluye `malformed`, `stale`) | `openspec-spec-sync.ts` `evaluateOpenSpecState` + `tests/sdd-router.test.ts` ("estado OpenSpec > surface unresolved, pending, conflict y synchronized en orden") | covered |
| **S2** Sync determinista: snapshot original, sin mtimes, planificación pura, write report last, idempotencia | `tests/openspec-specs.test.ts` ("plans against the original snapshot …", "leaves canonical bytes intact when the plan conflicts", "writes canonical results and report last, then no-ops on matching evidence") | covered |
| **S3** `sync-report.md` byte-stable, versionado, sin mtimes/absolute paths; `result_sha256 == base_sha256` en conflict | `serializeSyncReport` + `tests/openspec-specs.test.ts` (conflict test asserts `resultSha256 == baseSha256` and `code=added-existing`) | covered |
| **L1** Readiness rechaza `unresolved/pending/malformed/stale/conflict` incluso con `force`; no muta | `sdd-close.ts` + `assessCloseReadiness` + `tests/sdd-close.test.ts` (`--force no sortea la guarda OpenSpec sin resolver`) + `tests/sdd-router.test.ts` (full state matrix) | covered |
| **L2** Scope/design contexto acotado: 3 files, 32 KiB; hints explícitos; nunca trunca/glob/.sdd | `ein-ai.ts` `resolveCanonicalSpecContext` + `tests/sdd-scope-packet.test.ts` ("reads only explicit canonical paths …", "blocks instead of truncating …", "keeps the exact-path and no-truncation instructions in the prompt contract") | covered |
| **L3** Adopción inicial solo `sdd-lifecycle`; no migra históricos | `openspec/specs/sdd-lifecycle/spec.md` (3 escenarios) + delta con solo `ADDED`; ausencia de otros specs en `openspec/specs/`; regresión `tests/sdd-config-bootstrap.test.ts` (3/3) | covered |
| **L4** OpenSpec canónico; aliases activos; fallback `.sdd` | `resolveChangesDir` en router + `tests/sdd-router.test.ts` ("Raíz dual", "openspec/changes/ tiene prioridad sobre .sdd/changes/") + `tests/sdd-close.test.ts` ("cierra cambios en la raíz legacy .sdd/changes/") | covered |
| **L5** Costuras puras + adaptador fs; cubre validez, encabezado inválido, IDs duplicados, target ausente, orden estable, reporte obsoleto, fallo de escritura, close, fallback legacy | todo lo anterior + restauración ante error | **partial** — path de restauración **mid-replace** multi-dominio implementado en `openspec-spec-sync-fs.ts:73-86` pero no ejercitado por un test versionado (ver §5) |

## 2. Task completion status (tasks.md)

Todas las casillas marcadas `- [x]` y reflejadas en `apply-progress.md`:

| Group | Tarea | Estado declarado | Evidencia real (esta sesión) |
|---|---|---|---|
| 001 — Contrato/gramática canónica | 1.1 | done | `openspec-spec-contract.ts` + 4 contract tests verde |
| 002 — Parser estricto | 2.1 | done | `openspec-spec-parser.ts` + 3 parser tests verde |
| 003 — Sync determinista + fs adapter | 3.1 / 3.2 | done | `openspec-spec-sync.ts` + `openspec-spec-sync-fs.ts` + 3 sync tests verde |
| 004 — Guardrails/router/close | 4.1 / 4.2 | done | `sdd-guardrails.ts`+`sdd-router.ts`+`sdd-close.ts` actualizados, 17+27+17 tests verde |
| 005 — Scope/design contexto acotado | 5.1 / 5.2 | done | `ein-ai.ts` `resolveCanonicalSpecContext`; orquestador + `sdd-scope.md` + `sdd-design.md` actualizados; 12+22 tests verde |
| 006 — Spec sdd-lifecycle + delta inicial + sync | 6.1 | done | `openspec/specs/sdd-lifecycle/spec.md`, delta local con solo `ADDED`, `sync-report.md` final `state: synchronized`, `added=3 modified=0 removed=0` |

`apply-progress.md` deja `status: complete` y el único movimiento post-verify es la restauración del placeholder `EIN.md` (ver §4).

## 3. Commands run (esta sesión, sin production build)

| # | Comando | Resultado |
|---|---|---|
| 1 | `bun test tests/openspec-specs.test.ts` | **pass** — 10/10 (4 contract + 3 parser + 3 sync) |
| 2 | `bun test tests/sdd-guardrails.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts` | **pass** — 72/72 (17 + 27 + 28) |
| 3 | `bun test tests/sdd-scope-packet.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` | **pass** — 51/51 (12 + 22 + 17) |
| 4 | `cd installer && bun run typecheck` | **pass** — exit 0 |
| 5 | Focused textual check `EIN.md` ↔ tasks (ver §4) | **pass** — placeholder restaurado, ninguna tarea lo reclama |
| 6 | Spec/delta/sync-report digest agreement + close readiness (ver §6) | **pass** — digests reproduciblemente coincidentes, `state: synchronized` |

**Total enfocado: 133 tests verde** en 7 suites (`openspec-specs` + guardrails/router/close + scope-packet/flow-contract + reconcile). Sin `bun run build` por instrucción explícita; el `tsc --noEmit` desde el installer cubre tipos en producción.

## 4. Focused textual check — `EIN.md` ↔ canonical-openspec tasks

- `EIN.md` línea 24 contiene el placeholder original sin editar: `` - `openspec/` — _(describe)_ `` (índice semi-curado). Confirmado por `grep -n "openspec/" EIN.md`.
- `openspec/changes/canonical-openspec/tasks.md` no contiene ninguna referencia a `EIN.md` (`grep -c "EIN.md" tasks.md` = 0). Ningún task checkbox lo lista como producción, docs/specs o focused tests.
- Las únicas menciones de `EIN.md` dentro del change están en `apply-progress.md` (línea 91) documentando el rollback post-verify, y en `tests/sdd-flow-contract.test.ts` y `tests/sdd-close.test.ts` como asserts de comportamiento **del agente sdd-close**, no del change canonical-openspec.
- Restricción de scope respetada: el update descriptivo del índice de `EIN.md` pertenece a la slice 07 del roadmap de calidad, fuera de alcance aquí.

## 5. Coverage gap — declarado honestamente

**Path de restauración mid-replace multi-dominio sin test versionado.**

`ein-pi/agent/lib/openspec-spec-sync-fs.ts:73-86` implementa el comportamiento exigido por Requirement L5 (esquina `## // 003.2` del design):

```ts
for (const { path, result } of plan.domains) {
    const snapshot = await readIfPresent(path);
    if (result) {
        try { await replaceWithTemporary(path, Buffer.from(serializeOpenSpec(result))); }
        catch (error) {
            // restore every prior snapshot, never leave a synchronized report
            for (const [priorPath, priorSnapshot] of snapshots) {
                try { await restore(priorPath, priorSnapshot); } catch { /* preserve the original failure */ }
            }
            throw error;
        }
        snapshots.set(path, snapshot);
    }
}
await replaceWithTemporary(reportPath, Buffer.from(report));
```

El catch interior restaura snapshots previos, no escribe `reportPath`, y re-lanza el error original. Sin embargo, **ningún test versionado fuerza `replaceWithTemporary` a fallar a mitad del loop** para verificar:

1. que cada `path` previo recupera sus bytes del snapshot,
2. que `openspec/changes/<change>/sync-report.md` no queda en disco como `synchronized`,
3. que `evaluateOpenSpecState` retorna `pending` y `assessCloseReadiness(...).ready === false`.

Cobertura actual sustituta (no equivalente):

- `tests/openspec-specs.test.ts` "leaves canonical bytes intact when the plan conflicts" verifica no-mutación **dentro del planificador puro**, no durante el reemplazo fs.
- "writes canonical results and report last, then no-ops on matching evidence" cubre el path feliz y la idempotencia, tampoco fuerza el catch.

Una verificación funcional ad-hoc (script inyectando un fallo en mitad del replace) confirmó que el error propaga y no se emite evidencia `synchronized` viable; no es test versionado.

**Recomendación**: añadir en `tests/openspec-specs.test.ts` un test con spy/monomodificador del fs que fuerce `replaceWithTemporary` a fallar a la segunda llamada; validar el error propagado, los bytes restaurados, la ausencia de `sync-report.md` `synchronized` y el `evaluateOpenSpecState`/`assessCloseReadiness` posteriores.

## 6. Spec / delta / sync-report digest agreement

Tres artefactos canónicos y tres digests a reconciliar:

| Digest | Valor declarado en `sync-report.md` | Valor calculado desde los bytes actuales | Match |
|---|---|---|---|
| `delta_sha256` (manifest) | `454c354015af577c4df2512699a55380cff34788213c5ca725f98e3877460aaa` | SHA-256 sobre `specs/sdd-lifecycle/spec.md` (bytes actuales del delta) con prefijo `len(path):pathlen(bytes):bytes` | ✓ |
| `base_sha256` (manifest) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | SHA-256 sobre input vacío (dominio `sdd-lifecycle` ausente antes del sync, manifiesto sin entradas) | ✓ |
| `result_sha256` (manifest) | `c4724ec45daf895033cb0aaa20710db820acb88354b5e0575b55f39e4007647b` | SHA-256 sobre `specs/sdd-lifecycle/spec.md` (bytes actuales de la spec canónica) con prefijo `len(path):pathlen(bytes):bytes` | ✓ |
| `before` per-domain `sdd-lifecycle` | `absent` | `openspec/specs/sdd-lifecycle/spec.md` no existía antes del sync (verificado por ausencia en historial del change) | ✓ |
| `after` per-domain `sdd-lifecycle` | `766d0ae23e0532486bc5f3220bec844cac7154eabd71d717b1e66f4439a01ca9` | `sha256sum openspec/specs/sdd-lifecycle/spec.md` → `766d0ae23e0532486bc5f3220bec844cac7154eabd71d717b1e66f4439a01ca9` | ✓ |

Concordancia computada con el mismo algoritmo `digestManifest` (`sort(path).map → "len(path):path"+"len(bytes):bytes" → sha256(concat)`) definido en `ein-pi/agent/lib/openspec-spec-contract.ts:55-70`.

### Close readiness behavior

`sync-report.md` declara `state: synchronized`, `conflicts: 0`, `operations: added=3 modified=0 removed=0`, `domains: sdd-lifecycle`. Bajo la precedencia del evaluador (`unresolved` → `conflict` → `synchronized` → `pending`), el cambio queda en `synchronized`. `assessCloseReadiness` (`tests/sdd-close.test.ts`) acepta ese estado y rechaza `unresolved/pending/conflict/malformed/stale` incluso con `--force` (tests `--force no sortea la guarda OpenSpec sin resolver` verde, `verify obsoleto` cubre el caso stale → `pending`).

Para `state: conflict` la invariante exige `result_sha256 == base_sha256` y todos los `after == before`; el test `leaves canonical bytes intact when the plan conflicts` lo verifica en planificación.

## 7. Strict TDD compliance

`openspec/config.yaml` → `strict_tdd: false`. `apply-progress.md` documenta explícitamente "TDD Cycle Evidence: not applicable; strict TDD is disabled". Esta fase no invoca el contrato formal de strict TDD; los tests deterministas añadidos (133/133 verde) ejercen paths reales (FS, parser, planificador, evaluador, close-guard) más allá de la verificación de tipos.

## 8. Assertion quality

- `tests/openspec-specs.test.ts` calcula `digestManifest` sobre dos enumeraciones alternativas y exige igualdad byte-a-byte — no tautología.
- El test de conflict preserva el spec original (`readFile ... exact text`) — observable, no trivial.
- El test de idempotencia compara el report antes y después de una segunda invocación de sync — observable, captura path real.
- `tests/sdd-router.test.ts` "estado OpenSpec > surface unresolved, pending, conflict y synchronized en orden" cubre los seis estados del evaluador (incluye `stale`) en orden determinado — denso, real.
- `tests/sdd-scope-packet.test.ts` para `resolveCanonicalSpecContext` usa `sha256` concreto, valida orden por nombre y bytes, y simula un `.sdd` viejo para confirmar prioridad canonical — completo.

Sin tautologías, ghost loops ni asserts solo-de-tipo identificados.

## 9. Residual risks

- **Cambio cohesivo**: cualquier editor futuro del contrato debe actualizar simultáneamente parser + sync + report tests. Superficie pequeña; tests cableados al snapshot canónico.
- **Temporales `Process.pid + Math.random()`** en `openspec-spec-sync-fs.ts`: suficientes para uso local secuencial, insuficientes para write concurrente al mismo spec (escenario no esperado en SDD humano).
- **Restauración mid-replace sin test versionado** (ver §5): el código está implementado y un ad-hoc confirma el comportamiento, pero la guarda no tiene un test que dispare el catch. Una regresión silenciosa en ese path no se detectaría hasta la próxima ejecución real.

## 10. Acceptance contract

- **criterion-1** — Implementar el cambio sin ampliar alcance: **satisfied**. Solo los 4 módulos del contrato (`openspec-spec-{contract,parser,sync,sync-fs}.ts`), el cableado de `sdd-{guardrails,router,close}.ts` con la guarda OpenSpec, el contexto acotado en `ein-ai.ts` + 2 agentes fuente + orchestrator, y `sdd-lifecycle` como único dominio adoptado. Sin fase nueva, sin migración histórica, sin tocar `package.json`/deps core, sin cambiar package manager. La restauración del placeholder en `EIN.md` quedó documentada y no reclama el update descriptivo.
- **No staged files**: `git status` muestra modificados y untracked; ninguno está en el staging area. Confirmado.
- **Diferencial** (resumen): 12 archivos modificados, 287 insertions / 20 deletions; 8 archivos untracked (4 módulos del contrato + 1 test nuevo + `openspec/` + `EIN.md` placeholder restaurado). Bajo el review budget de 400 líneas.

## 11. Next recommended

1. Cerrar la cobertura parcial del path mid-replace con el test descrito en §5 — única acción previa al delivery que añadiría regresión durable al código de restauración.
2. Si se decide mergear sin ese test, declararlo explícitamente en el commit body para que `ein-git` quede con la limitación registrada en lugar de oculta.

Sin bloqueos visibles para delivery tras la decisión del paso anterior.
