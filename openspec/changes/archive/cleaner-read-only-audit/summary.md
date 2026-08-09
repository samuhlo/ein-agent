## // 000. RESUMEN
Se entregó el corte H: una auditoría de limpieza estrictamente de solo lectura sobre el estado proyectado por B y la evidencia de áreas revisadas de G. Produce hallazgos trazables, deterministas y fail-closed, sin aplicar cambios.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/cleaner-read-only-audit.ts`: entrada pura `auditCleanerReadOnly`, hallazgos versionados, clasificación, severidad, trazabilidad y salida inmutable.
- `tests/cleaner-read-only-audit.test.ts`: contratos de lectura, incertidumbre, determinismo, privacidad, inmutabilidad y rechazo de capacidades de mutación.
- `behavior_coverage: partial`: cubiertos `observed-fact` y `unresolved-question`; no existe regla soportada de `inferred-opportunity` en este delta.

## // 002. CÓMO FUNCIONA POR DENTRO
B suministra un único `ProjectStateV1` con calidad e identidad Git exacta; G suministra evaluaciones normalizadas de áreas y evidencia opaca. La auditoría solo proyecta esos valores: conserva outcome/freshness/reason, nunca reinterpreta ledger ni adquiere estado por su cuenta. Genera IDs `cleaner-finding-v1:sha256`, orden UTF-8 estable, ubicaciones relativas/áreas acotadas, referencias de evidencia sin contenido sensible, confianza e incertidumbre deterministas. Estados no actuales, ausentes o inválidos permanecen como preguntas sin claims actuales. El informe está congelado, declara `mode: read-only`, `appliedChanges: 0` y cada hallazgo `applied: false`.

## // 003. DECISIONES
- Mantener una función pura sin `cwd`, filesystem, Git executor, writer, red, persistencia ni callback de aplicación; B y G siguen siendo las autoridades.
- No convertir cambios Git, artefactos, sesiones o automatización en oportunidades, revisión o aprobación.
- La ausencia de heurística de limpieza es intencional: cualquier oportunidad inferida requiere un delta de comportamiento separado, con regla explícita y pruebas propias.

## // 004. VERIFICACIÓN
- Suite focalizada B/G/H: 64 tests, 356 assertions, PASS.
- Suite Bun completa: 1.314 tests, 4.820 assertions, PASS.
- `cd installer && bun run typecheck`: PASS.
- Scan de dependencias prohibidas y `git diff --check`: PASS.
- Supplemental strict TypeScript: diagnóstico baseline/transitivo no relacionado; sin errores en H ni su test.
- Revisión: sin blockers de cambio; `behavior_coverage: partial` queda explícito.

## // 005. PENDIENTE / RIESGOS
- Persisten diagnósticos strict baseline en `ein-pi/agent/lib/lang.ts:28:39`, `project-context.ts:18:39`, `openspec-spec-parser.ts:231:23`, `openspec-spec-sync.ts:96:32` y `reviewed-area-ledger.ts:355,366`.
- El typecheck configurado del instalador no incluye `ein-pi`.
- Ninguna oportunidad de limpieza inferida en este corte; añadirla exige un delta de comportamiento futuro separado.
