## // 000. RESUMEN
Convertrió OpenSpec en fuente canónica de comportamiento con cuatro módulos TypeScript puros (contrato, parser, sync, fs-adapter), guardas cableadas en close/router/guardrails y adopción inicial de `sdd-lifecycle` sincronizado con informe versionado. El cambio pasa 133 tests enfocados y la verificación digest confirma reproducibilidad byte-a-byte.

## // 001. QUÉ CAMBIÓ
- **`ein-pi/agent/lib/openspec-spec-contract.ts`** — contrato puro: tipos de dominio y escenario, identidad `<domain>/<scenario-id>`, serialización canónica LF, SHA-256 de manifiesto con prefijo `len(path):pathlen(bytes):bytes`.
- **`ein-pi/agent/lib/openspec-spec-parser.ts`** — parser estricto: acepta `openspec-spec/v1` y `openspec-delta/v1`; rechaza encabezados estructurales adicionales, operaciones distintas de `ADDED/MODIFIED/REMOVED`, IDs duplicados y bloques incompletos.
- **`ein-pi/agent/lib/openspec-spec-sync.ts`** — planificador puro: evalúa operaciones contra el snapshot original, calcula `delta_sha256`/`base_sha256`/`result_sha256`, genera `sync-report.md` versionado, determina estado `unresolved|pending|conflict|synchronized` (incluye `malformed` y `stale`).
- **`ein-pi/agent/lib/openspec-spec-sync-fs.ts`** — adaptador de filesystem: snapshot pre-sync, escritura con temporales, reemplazo, informe escrito al final y restauración ante error capturable en el loop de dominios.
- **`ein-pi/agent/lib/sdd-guardrails.ts`** — validación de declaración `spec_delta: none` con razón no centinela (1–200 caracteres); rechaza mezcla con delta y raisons centinela.
- **`ein-pi/agent/lib/sdd-router.ts`** — expone estado canónico en routing y `assessCloseReadiness`; mantiene prioridad `openspec/changes/` y fallback `.sdd/changes/`.
- **`ein-pi/agent/lib/sdd-close.ts`** — guarda canónica: rechaza `unresolved|pending|conflict|malformed|stale` incluso con `--force`; no ejecuta sync ni muta specs.
- **`ein-pi/agent/extensions/ein-ai.ts`** — `resolveCanonicalSpecContext`: hints explícitos de dominio, paths exactos `openspec/specs/<domain>/spec.md`, cap 3 archivos y 32 KiB agregados por fase; bloquea en vez de truncar o globbing.
- **`openspec/specs/sdd-lifecycle/spec.md`** — 3 escenarios canónicos iniciales: `canonical-close-readiness`, `canonical-context-budget`, `legacy-sdd-fallback`.
- **`openspec/changes/canonical-openspec/specs/sdd-lifecycle/spec.md`** — delta `openspec-delta/v1` con `ADDED` puro para los 3 escenarios.
- **`openspec/changes/canonical-openspec/sync-report.md`** — informe final `state: synchronized`, `delta_sha256:454c35…`, `base_sha256:e3b0c4…`, `result_sha256:c4724e…`, `added=3 modified=0 removed=0`, `conflicts: 0`.

## // 002. CÓMO FUNCIONA POR DENTRO
El contrato establece `<domain>/<scenario-id>` como identidad estable: títulos, posición y contenido son descartables; `MODIFIED` reemplaza el registro completo por identidad, `REMOVED` conserva la razón y `ADDED` inserta una identidad ausente. Cada spec canónica vive en `openspec/specs/<domain>/spec.md` con gramática `openspec-spec/v1`; cada delta en `openspec/changes/<change>/specs/<domain>/spec.md` con gramática `openspec-delta/v1`. Los cambios mecánicos declaran `spec_delta: none` con razón justificada en `scope.md`.

La sincronización opera en memoria antes de escribir: `planOpenSpecSync` lee specs y deltas, calcula SHA-256 sobre manifiestos ordenados por path+bytes, evalúa cada operación contra el snapshot original y genera un plan; ante cualquier conflicto retorna informe `conflict` sin mutar. Si no hay conflictos, construye resultados en memoria y el adaptador fs escribe temporales → reemplaza → escribe `sync-report.md` al final. El catch interior restaura snapshots y re-lanza; no deja evidencia `synchronized` tras un fallo.

El estado se deriva de declaración + gramática + versión + SHA-256: `unresolved` (falta declaración o gramática inválida), `pending` (delta válido sin informe o con digests obsoletos), `conflict` (ambigüedad o múltiples targets), `synchronized` (informe vigente con digests coincidentes). `assessCloseReadiness` usa esa precedencia; close rechaza todo lo que no sea `synchronized`, sin IA ni sync.

El contexto canónico para scope y design se resuelve mediante `resolveCanonicalSpecContext` con hints explícitos de dominio, leyendo solo paths exactos bajo `openspec/specs/`, ordenados por nombre, con hard cap 3 archivos y 32 KiB agregados; si se excede retorna `blocked`.

## // 003. DECISIONES
- **Identidad explícita** — `<domain>/<scenario-id>` es la única clave; `MODIFIED` reemplaza todo el registro y `REMOVED` conserva razón auditable. Se rechazan título, posición y hashes como identidad porque varían aunque el comportamiento no cambie.
- **Plan puro + mutación explícita** — parseo, validación y planificación ocurren en memoria antes de escribir; el sync es una utilidad determinista cableada al flujo existente, no una fase.
- **Estado calculado, no heurístico** — se deriva de declaración + gramática + SHA-256; no se usan mtimes.
- **Costuras puras + adaptador fs** — el módulo de specs no toca el filesystem; el adaptador solo lee, temporales, reemplazo y restauración.
- **Adopción incremental** — primera slice solo `sdd-lifecycle`; no se reconstruyen specs desde historial ni de `.sdd`.
- **Compatibilidad con `.sdd`** — cambios existentes bajo `.sdd/changes/` conservan el flujo previo; `resolveChangesDir` sigue soportando el fallback.
- **`EIN.md` fuera de esta slice** — el placeholder `openspec/ — _(describe)_` fue restaurado tras el tick post-verify; la descripción del índice pertenece a la slice 07 del roadmap de calidad.

## // 004. VERIFICACIÓN
133 tests passed en 7 suites enfocadas + typecheck:
- `bun test tests/openspec-specs.test.ts` — **10/10** (contrato + parser + sync determinista + idempotencia + conflicto)
- `bun test tests/sdd-guardrails.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts` — **72/72** (17 guardrails + 27 router + 28 close)
- `bun test tests/sdd-scope-packet.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` — **51/51** (12 scope-packet + 22 flow-contract + 17 reconcile)
- `cd installer && bun run typecheck` — **pass**

`sync-report.md` congruente byte-a-byte: `state: synchronized`, `delta_sha256:454c35…`, `base_sha256:e3b0c4…` (empty-file), `result_sha256:c4724e…`, dominios=`sdd-lifecycle`, `added=3 modified=0 removed=0`, `conflicts: 0`. Los tres digests recalculados con `digestManifest` coincidieron con los declarados. `EIN.md` placeholder confirmado en su lugar original; ningún task checkbox reclama su update descriptivo.

## // 005. PENDIENTE / RIESGOS
**Cobertura parcial — restauración mid-replace multidominio sin test versionado.** El código de restauración existe (`openspec-spec-sync-fs.ts:73-86`) y una verificación funcional ad-hoc confirmó que el error propaga y no deja evidencia `synchronized`; pero ningún test versionado inyecta un fallo capturable en mitad del loop de reemplazo de dominios para verificar: snapshots restaurados byte-a-byte, ausencia de `sync-report.md synchronized` en disco, y `evaluateOpenSpecState` → `pending` / `assessCloseReadiness` → `ready === false`. Recomendación: añadir un test con spy/monomodificador de fs en `tests/openspec-specs.test.ts`.

**Riesgo residual menor:** el adaptador usa `Process.pid + Math.random()` para temporales — suficiente para uso local secuencial, no para write concurrente al mismo spec.

**Adopción futura:** cualquier editor del contrato debe sincronizar parser + sync + report tests simultáneamente.
