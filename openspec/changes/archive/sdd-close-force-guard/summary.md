# Summary: sdd-close-force-guard

## // 000. RESUMEN
Forced SDD close (`--force`) now fails closed: it cannot archive changes with pending tasks, incomplete apply, missing/stale/ failing verify, stale summary, pending spec, conflict, malformed spec, or stale canonical bytes. The sole exception is one exact declarationless-legacy unresolved record shape, which requires `--force` **and** `--reason "<audit reason>"` and returns a distinct legacy-escape result — it never synchronizes specs silently.

## // 001. QUÉ CAMBIÓ
- **`ein-pi/agent/lib/sdd-router.ts`** — añade códigos de blocker (task/apply/verify/summary/spec) y expone `legacyEligibility: "declarationless-record" | null` solo cuando la evaluación completa del lifecycle pasa y el registro tiene estado `unresolved` con `scope.md` legible, sin delta, sin sync-report y sin `.sdd/changes/`.
- **`ein-pi/agent/lib/sdd-close.ts`** — reemplaza el bypass general por la tabla de decisión completa: todos los blockers no-spec son absolutos; `unresolved` admite el escape solo con `declarationless-record` + `force` + razón válida. `normalizeLegacyReason` rechaza vacío, >200 caracteres y los placeholders `none/n/a/na/tbd/unknown/-`. Añade `legacyEscape` al `CloseResult` sin modificar la forma de éxito normal.
- **`ein-pi/agent/extensions/ein-ai.ts`** — cablea `--reason` de la orden y `reason` de la tool hasta `legacyReason`; actualiza la ayuda con la regla estrecha; distingue el mensaje de legado (`Closed through legacy escape…`) de la close normal (`Verified change… closed. openspec/changes/ is clean.`).
- **`openspec/specs/sdd-lifecycle/spec.md`** — tres escenarios: `MODIFIED` `canonical-close-readiness` (corrige que el escape solo admite `unresolved` declarationless, no `pending`); `ADDED` `forced-close-preserves-readiness-gates`; `ADDED` `forced-close-explicit-legacy-escape`.
- **`tests/sdd-router.test.ts`**, **`tests/sdd-close.test.ts`**, **`tests/sdd-flow-contract.test.ts`** — 101 tests cubren toda la tabla de decisión (11 rechazos por blocker absoluto, 1 positivo + 4 negativos de elegibilidad, 5 razones inválidas + 1 válida, múltiples blockers simultáneos, no-movimiento en rechazo, fallback `.sdd/changes/`, compatibilidad de forma de resultado normal).

## // 002. CÓMO FUNCIONA POR DENTRO

**Bloqueadores estructurados (source: `sdd-router.ts`).**
`assessCloseReadiness` devuelve `{ ready, reasons }` con códigos como `tasks-pending`, `apply-not-complete`, `verify-missing`, `verify-failed`, `verify-stale`, `summary-missing`, `summary-stale`, `spec-conflict`, `spec-pending`, `spec-unresolved`. La elegibilidad de legado es un campo adicional `legacyEligibility: "declarationless-record" | null` que es `null` para todo lo que no sea el caso exacto.

**Política fail-closed en `sdd-close.ts`.**
`closeChange` filtra los blockers: si alguno no es `spec-unresolved` → rechazo absoluto; si todos son `spec-unresolved` pero `legacyEligibility` no es `"declarationless-record"` → rechazo absoluto. Solo cuando `legacyEligibility === "declarationless-record"` y existe `legacyReason` válida, la close procede como escape de legado. La validación de la razón (`normalizeLegacyReason`) es atómica en la biblioteca, no en la UI.

**Forma de resultado diferenciada.**
Éxito normal: `{ ok: true, from, to }` — sin `legacyEscape`. Escape de legado: `{ ok: true, from, to, legacyEscape: { used: true, priorSpecState: "unresolved", eligibility: "declarationless-record", reason: <razón normalizada> } }`. Rechazo: `{ ok: false, reason, blockers: [{ code, message }] }`.

**Cadena de cableado en `ein-ai.ts`.**
Slash command: `/ein:sdd-close <change> --force --reason "<audit reason>"`. Tool: parámetro `reason`. Ambos fluyen hasta `legacyReason`. La descripción de la tool contiene la regla estrecha y no menciona "bypass readiness".

**Orden de operaciones preservado.**
Readiness → validación de razón → mkdir archive → rename → cp/remove fallback. Ningún rechazo mueve archivos ni modifica specs. La close nunca invoca `synchronizeOpenSpecFilesystem`.

## // 003. DECISIONES

| Decisión | Alternativas descartadas |
|---|---|
| Solo `declarationless-record` es elegible, no todo `unresolved` | Permitir todo `unresolved` — rechazado porque cubre declaraciones malformadas, deltas corruptos y fallos de lectura. |
| `pending` nunca es elegible | `pending or unresolved` — rechazado porque `pending` implica sincronización canónica no aplicada o no probada, no un defecto de formato antiguo. |
| Validación de razón atómica en `sdd-close.ts` | Validar solo en la UI — rechazado porque callers programáticos podrían archivar sin auditoría. |
| `legacyEscape` aditivo, no se modifica la forma de éxito | Sobrescribir la forma existente — rechazado para mantener compatibilidad con callers existentes. |
| No crear archivo de auditoría en archive | Nuevo archivo de auditoría — rechazado para no alterar el layout ni la integridad del archive; la evidencia vive en el resultado/transcripción. |
| `sdd-router.ts` fuente única de hechos de readiness | Reconstruir task/apply/verify freshness en `sdd-close.ts` — rechazado para evitar duplicación y divergencia. |
|`.sdd/changes/` no usa este escape | Reclasificar fallback como escape — rechazado; sigue el comportamiento legacy existente y cierra normalmente cuando sus gates no-espec pasan. |

## // 004. VERIFICACIÓN

- **101/101 tests pass** en `tests/sdd-close.test.ts`, `tests/sdd-router.test.ts`, `tests/sdd-flow-contract.test.ts` (323 `expect()` calls).
- **Producción: 175 líneas** (+126/-49) — dentro del forecast (≤280) y del gate de revisión (≤400).
- **Tests: 207 líneas** (+150/-57); **Specs/docs: 52 líneas** (+47/-5). Reportados por separado, nunca contados hacia el gate.
- `git diff --check` limpio en los 6 paths in-scope.
- Cobertura de requisitos R1–R6 verificada: 11 casos de blocker absoluto, 1 positivo + 4 negativos de elegibilidad, 5 razones inválidas + 1 válida, múltiples blockers simultáneos, no-movimiento, `.sdd/changes/` fallback, forma de resultado normal intacta.
- Help/tool wording: `--force --reason` descrito como "only for … declarationless legacy record", ausencia confirmada de `bypass readiness` (salgo en negación). Dos mensajes de éxito distintos.
- Sync: `closeChange` nunca llama `synchronizeOpenSpecFilesystem`; `sync-report.md` muestra `state: synchronized`, `conflicts: 0`, `domains: sdd-lifecycle`.

## // 005. PENDIENTE / RIESGOS

**Pendiente:**
- El `map.md` tiene `status: partial` y `budget_exceeded: true`; es un artefacto de fase map, no un blocker de close. Recomendación: resolver en el próximo ciclo `sdd-tasks`/`sdd-design`.
- Si el proyecto activa `strict_tdd: true` en el futuro, los tests actuales son aserciones de caja negra — compatibles con strict TDD, no requieren refactorización.

**Riesgos residuales:**
- `normalizeLegacyReason` rechaza `none/n/a/na/tbd/unknown/-` case-insensitivamente. Si un caso de uso futuro necesita documentar literalmente "n/a", debe discutirse antes de añadirlo a la denylist — la denylist es deliberadamente corta por diseño.
- Ningún otro riesgo residual encontrado. Sin staged files, sin hallazgos bloqueantes.

**Ninguno.**
