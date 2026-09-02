## // 000. RESUMEN

La frontera previa a ejecutar herramientas sale de la fachada. Un único módulo aplica la compuerta de intención, normaliza delegaciones, admite participantes, confirma entregas y protege comandos de shell.

## // 001. QUÉ CAMBIÓ

- `ein-tool-call-gate.ts`: nuevo dueño del hook `tool_call` y de la intención de entrega por sesión.
- `ein-ai.ts`: registra la pieza y solo le comunica cada mensaje del usuario.
- Los contratos de intención y reconciliación vigilan los dos dueños nuevos.

## // 002. CÓMO FUNCIONA POR DENTRO

Toda llamada cruza primero la intención. Una delegación se normaliza, comprueba su forma, aplica TDD, runtime y aceptación, guarda la foto de fase y pide consentimiento de entrega cuando corresponde. Un comando de shell pasa por seguridad, staging acotado y Hypa en ese orden.

## // 003. DECISIONES

- Mantener subagentes y shell juntos porque son las dos ramas de una misma frontera previa a efectos.
- Pasar la foto como callback para que lanzamiento y resultado no compartan mapas internos.
- Conservar la intención de entrega junto al gate que la consume.

## // 004. VERIFICACIÓN

- 254 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Los hooks de sesión, entrada y construcción del prompt siguen en `ein-ai.ts`. Ya no contienen la frontera de ejecución y pueden extraerse como un bloque de ciclo de sesión.
