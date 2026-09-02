## // 000. RESUMEN

La recogida de resultados de subagentes deja de vivir en la fachada. Un único módulo posee el borde `tool_result`, reconoce entregas terminales, valida scouts y reconcilia fases contra evidencia persistida.

## // 001. QUÉ CAMBIÓ

- `ein-delegation-results.ts`: registra y procesa el hook de resultados.
- `ein-ai.ts`: solo entrega al nuevo dueño la foto previa de cada fase.
- El inventario de consumidores de envelopes audita la ubicación nueva, no una ruta histórica.

## // 002. CÓMO FUNCIONA POR DENTRO

Antes de delegar se guarda una foto del artefacto. Al volver el resultado, el módulo distingue participantes, scouts y reconciliación. Una forma desconocida queda como evidencia no disponible o aviso; nunca se convierte en éxito inventado.

## // 003. DECISIONES

- Agrupar los tres consumidores porque comparten el mismo borde frágil de Pi.
- Mantener la foto privada y exponer solo `rememberPhaseSnapshot` al lanzador.
- Mover con el handler su auditoría de mundo cerrado para conservar cobertura real.

## // 004. VERIFICACIÓN

- 87 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

El lanzamiento y las puertas previas siguen dentro de `ein-ai.ts`. El siguiente corte debe darles dueño sin duplicar el estado de scouts ni la intención de entrega.
