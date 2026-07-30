## // 000. RESUMEN
El cambio cerró el contrato de enrutamiento de investigación del parent: consultas amplias pre-scope van a `ein-scout`, `sdd-map` queda reservado para cambios ya acotados, y la evidencia aceptada se reutiliza sin redescubrimiento automático.
La remediación posterior normalizó la cabecera canónica del spec a `openspec-spec/v1` / `scout-routing`, dejando la sincronización lista.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/assets/orchestrator.md`: límites deterministas de routing, packet de investigación acotado, fan-out de scouts y regla sin estado SDD/OpenSpec.
- `ein-pi/core/agents/ein-scout.md`: consumo mínimo del packet y retorno solo del contrato cerrado `ein-scout-report/v1`.
- `tests/orchestrator-context-diet.test.ts`: cobertura de umbrales, spot-checks, reutilización de evidencia y fan-out.
- `tests/orchestrator-scope-gate.test.ts`: cobertura del `RESEARCH PACKET`, ceilings exactos y bloqueo de `sdd-map` pre-scope.
- `openspec/specs/scout-routing/spec.md`: metadata canónica restaurada para parseo y sync.

## // 002. CÓMO FUNCIONA POR DENTRO
El parent usa una política única en `orchestrator.md`: si la comprensión exige ≥4 archivos o ≥2 clases de fuente, delega a `ein-scout`; antes de hacerlo solo hace hasta 2 lecturas de routing, y tras aceptar un reporte solo permite hasta 2 spot-checks materiales.
El `RESEARCH PACKET` obliga pregunta concreta, roots permitidos, memoria/documentación acotadas y budgets finitos; el scout consume esos límites pero responde únicamente con `version`, `summary`, `summaryReferenceIds`, `findings`, `references` y `uncertainties`.
La síntesis de `severity`, `bounded alternatives` y `optional candidate slices` queda en el parent, mientras `sdd-map` sigue disponible solo después de un scope acotado.
La cabecera del spec canónico quedó alineada con `format: openspec-spec/v1` y `domain: scout-routing`, por eso el parser y la planificacion de sync vuelven a aceptar el spec sin tocar escenarios.

## // 003. DECISIONES
- Se mantuvo el esquema cerrado del scout; ampliar el reporte habría reabierto validación y handoff ya resueltos.
- Se eligió un cambio de prompt-contract, no un router runtime; es la superficie mínima y ya tenía tests focalizados.
- `alternatives` y `candidate_slices` se reubicaron como responsabilidad de síntesis del parent para no pedir campos que el validador rechaza.
- La verificación quedó estática a propósito: valida el contrato escrito, no cumplimiento observable del modelo en runtime.
- La corrección canónica del spec fue metadata-only para restaurar parseo y sincronización, sin alterar escenarios.

## // 004. VERIFICACIÓN
- `timeout 120 bun test tests/orchestrator-context-diet.test.ts` — pass (30/30).
- `timeout 120 bun test tests/orchestrator-scope-gate.test.ts` — pass (9/9).
- `timeout 120 bun test tests/readonly-scout-contract.test.ts` — pass (12/12).
- `timeout 120 bun test tests/openspec-specs.test.ts` — pass (26/26).
- `cd installer && timeout 120 bun run typecheck` — pass.
- `git diff --check` — pass.
- Cobertura confirmada: 16 criterios de Slice 05 verificados; diff productivo de 16 líneas, muy por debajo del presupuesto de 400.
- Re-verificación del spec canónico: `parseOpenSpec(...)` ok para `openspec/specs/scout-routing/spec.md`, cabecera normalizada, y `planOpenSpecSync(...)` reportó `state: synchronized`, `conflicts: 0`.

## // 005. PENDIENTE / RIESGOS
- Verificación solo estática; no prueba cumplimiento real del modelo en ejecución.
- No se hizo live-smoke del nuevo wording del packet; queda para una fase posterior si hiciera falta.
- Ningún rollback adicional: revertir juntos los archivos tocados deshace el cambio.
