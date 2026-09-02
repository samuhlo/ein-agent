## // 000. RESUMEN

La decisión interactiva de intención deja de estar repartida entre los hooks de Pi. Un único dueño conserva el estado por sesión, clasifica la petición y decide cuándo preguntar, adoptar un cambio ya resuelto o bloquear herramientas mutantes.

## // 001. QUÉ CAMBIÓ

- `ein-pi-intent-gate.ts`: nuevo dueño de la clasificación y del estado pendiente, en confirmación o resuelto.
- `ein-ai.ts`: crea la compuerta y limita cada hook a invocar su operación correspondiente.
- Los tests de contrato siguen al dueño real y prohíben que la clasificación regrese a la fachada.

## // 002. CÓMO FUNCIONA POR DENTRO

Solo el hook de entrada puede iniciar la conversación. Los hooks secundarios pueden adoptar una intención persistida y el hook de herramientas deja pasar únicamente lecturas mientras falte resolverla. La confirmación conserva el mismo material, la misma clasificación y el mismo cierre seguro que antes.

## // 003. DECISIONES

- Mantener estado, clasificación y política juntos porque forman una sola máquina de estados.
- Exponer operaciones distintas para entrada, arranque de agente y llamada de herramienta.
- No enseñar el `Map` de sesiones a la fachada; el dueño también limpia su estado.

## // 004. VERIFICACIÓN

- 105 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Los hooks todavía poseen la coordinación de sesión, delegación y resultados. La compuerta ya puede pasarse como dependencia explícita al extraerlos.
