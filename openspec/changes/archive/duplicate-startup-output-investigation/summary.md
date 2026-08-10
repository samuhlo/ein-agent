## // 000. RESUMEN
Se entregó una ruta diagnóstica opt-in para correlacionar carga, registro, `session_start`, emisión de notificaciones y presentaciones visibles sin alterar el comportamiento normal. La cobertura de comportamiento es **parcial**: la causa original de la salida duplicada permanece **desconocida / missing-evidence**; no se afirma que el síntoma esté corregido ni diagnosticado.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/startup-provenance.ts`: contrato y recorder NDJSON opt-in con identidades, relojes, procedencia y evidencia explícita `unknown`/`unavailable`.
- `ein-pi/agent/lib/startup-provenance-classifier.ts`: resumen puro por ejecución y clasificador fail-closed para carga, registro, entrega de eventos, emisión y renderizado.
- `ein-pi/agent/extensions/ein-banner.ts`: instrumentación de evaluación, registro y entrada a `session_start` mediante canal lateral explícito.
- `ein-pi/agent/lib/ein-update-notice.ts`: correlación asíncrona hasta el límite inmediatamente anterior a `ctx.ui.notify`, con digest normalizado.
- `tests/startup-provenance.test.ts`, `tests/startup-provenance-classifier.test.ts` y `tests/ein-banner-updates.test.ts`: cobertura TDD de contratos, correlación, fallos no bloqueantes y clasificación.
- `evidence/`: una captura PTY acotada, procedencia de proceso/fuente y evidencia independiente de presentación, validada sin rellenar ausencias como ceros.

## // 002. CÓMO FUNCIONA POR DENTRO
Cada ejecución diagnóstica asigna un `runId`; los eventos de carga, registro, `session_start` y emisión conservan IDs únicos y enlaces padre. La identidad de invocación atraviesa el trabajo asíncrono y se registra antes de cada notificación, mientras la captura PTY observa presentaciones de forma independiente con digest y canal.

El clasificador exige evidencia completa, actual, correlacionada y con canal conocido: distingue multiplicidad de carga, registro, entrega, emisión o presentación, y devuelve `unknown/missing-evidence` ante cualquier hueco. En la captura real hubo una carga, un registro, una invocación UI y una presentación `banner-stdout-redraw`; detector, emisión, overlay y correlación emisión-presentación quedaron desconocidos.

## // 003. DECISIONES
- Se eligió observabilidad opt-in por canal lateral para no deduplicar ni modificar notificaciones, orden, filtros, loader o renderer antes de conocer la causa.
- Se separaron carga y registro, y se usaron identidades/enlaces en vez de conteos aislados para no confundir duplicación de eventos con duplicación de módulos.
- La interpretación es fail-closed: evidencia ausente, obsoleta o no correlacionada nunca se convierte en diagnóstico.

## // 004. VERIFICACIÓN
- `bun test`: PASS, 1471 tests / 109 archivos / 5561 assertions.
- `bun test tests/`: PASS, 1471 tests / 109 archivos / 5561 assertions.
- Focos, validador de evidencia y suite ordenada: PASS; el validador retuvo `events=3`, `presentations=1`, `classification=unknown/missing-evidence`.
- `cd installer && bun run typecheck`: PASS (`tsc --noEmit`).
- La verificación confirma cobertura parcial y comportamiento fail-closed; no confirma el origen de la duplicación.

## // 005. PENDIENTE / RIESGOS
- Riesgo residual: la escritura síncrona opt-in puede perturbar una reproducción sensible al timing; además no existe una presentación notification-overlay atribuible en la captura retenida.
- Evidencia exacta necesaria: **a reproducible duplicate notification-overlay session with complete emission-to-presentation correlation followed by re-verification before any diagnosis claim**.
- Hasta obtenerla, la causa original permanece desconocida/missing-evidence y no debe declararse ningún diagnóstico.
