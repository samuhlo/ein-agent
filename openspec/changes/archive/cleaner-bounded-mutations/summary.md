## // 000. RESUMEN
Se entregó el contrato I para convertir un único hallazgo H revisado en una mutación mecánica, explícita y acotada. La implementación falla cerrada ante evidencia, ownership o estado inciertos y exige verificación fresca antes de completar.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/cleaner-bounded-mutations.ts`: admisión, reemplazo exacto de un archivo y evaluación separada de completitud.
- `tests/cleaner-bounded-mutations.test.ts`: cobertura TDD de cardinalidad, límites, escritura única, invalidación, incertidumbre y verificación.
- `openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md`: delta de tres comportamientos: slice único, invalidación por cambio de estado y verificación fresca.
- Artefactos SDD (`scope.md`, `map.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`) documentan alcance, diseño y evidencia.

## // 002. CÓMO FUNCIONA POR DENTRO
La frontera I consume proyecciones frescas H/G/B y exige un finding único, área canónica, actor/revisor, un archivo regular y una sustitución UTF-8 exacta con hashes antes/después. Revalida estado y contenido inmediatamente antes de una sola escritura; no permite loops, patches genéricos, multiarchivo, staging, rollback ni reparación de evidencia. El resultado conserva refs exactas antes/después y queda `verification-required`; la evaluación de completitud sólo acepta verificación atribuible, exitosa y ligada al estado resultante. H, G, B y el router permanecen autoridades separadas.

## // 003. DECISIONES
- Se añadió un módulo I independiente; el audit H sigue siendo estrictamente read-only.
- Se eligió una sustitución contigua única en vez de patches/AST/codemods para hacer imposibles expansiones implícitas.
- La invalidación se representa como transición de estado, sin modificar reportes H ni ledger G.
- El delta de especificación es válido y no existe spec canónica de dominio seleccionada (0 archivos/bytes).

## // 004. VERIFICACIÓN
- Suite cleaner: 27 tests / 125 assertions; compatibilidad H/G/B/router: 97 / 468; combinada: 124 / 593; todo pasó.
- `cd installer && bun run typecheck`: pasó. Diagnóstico directo del módulo cambiado: 0 errores.
- TDD, higiene EOF/whitespace, ownership, no-staged y autoridad: pasaron. Producción: 400 líneas añadidas, 0 eliminadas, exactamente el techo de 400.
- No hay build de producción configurado ni se ejecutó.

## // 005. PENDIENTE / RIESGOS
- Riesgo baseline: el `tsc` directo termina con 20 diagnósticos preexistentes fuera de `cleaner-bounded-mutations.ts`.
- La implementación está exactamente en el límite de 400 líneas; cualquier expansión requiere nueva decisión de presupuesto.
- No se ejecutó build de producción porque no existe comando configurado. Sin otros pendientes; cambio listo para cerrar.

```acceptance-report
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"verify-report.md confirma 0 diagnósticos en el módulo cambiado, suites 27/125 y 97/468 pasadas, límites y ownership verificados."}],
  "changedFiles": ["ein-pi/agent/lib/cleaner-bounded-mutations.ts","tests/cleaner-bounded-mutations.test.ts","openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md"],
  "testsAddedOrUpdated": ["tests/cleaner-bounded-mutations.test.ts"],
  "commandsRun": [{"command":"bun test cleaner + compatibilidad","result":"passed","summary":"124 tests, 593 assertions."},{"command":"cd installer && bun run typecheck","result":"passed","summary":"tsc --noEmit."},{"command":"direct tsc changed-module gate","result":"passed","summary":"0 diagnósticos del módulo; 20 baseline externos."}],
  "validationOutput": ["TDD, hygiene, authority, no-staged y presupuesto pasaron; 400/400 líneas."],
  "residualRisks": ["20 diagnósticos baseline externos","módulo exactamente en 400 líneas","sin build configurado"],
  "noStagedFiles": true,
  "diffSummary": "Contrato I y pruebas bounded implementados sin cambios a autoridades H/G/B/router.",
  "reviewFindings": ["no blockers en el área cambiada","baseline: 20 diagnósticos tsc externos"],
  "manualNotes": "Listo para cierre; no archivar ni mover archivos en esta fase."
}
```