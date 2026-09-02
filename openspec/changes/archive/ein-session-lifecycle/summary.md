## // 000. RESUMEN

El arranque, apagado y tratamiento de mensajes dejan de estar mezclados con la construcción del prompt y los comandos. Un dueño coordina el ciclo de sesión de Pi y expone el preflight manual a la fachada.

## // 001. QUÉ CAMBIÓ

- `ein-session-lifecycle.ts`: registra `session_start`, `session_shutdown` e `input`.
- `ein-ai.ts`: inyecta intención, scouts y registro de entrega; conserva solo el comando manual.
- Los contratos de bootstrap, intención y scouts siguen la ubicación nueva.

## // 002. CÓMO FUNCIONA POR DENTRO

Al arrancar se preparan gitignore, codegraph, assets, modelos y onboarding. Cada entrada limpia el turno del scout, registra intención de entrega, ejecuta el preflight cuando toca y continúa el cambio resuelto. Al apagar se limpian los estados coordinados de esa sesión.

## // 003. DECISIONES

- Mantener juntos los tres hooks porque comparten el límite de vida de una sesión.
- Devolver `runSddPreflight` para que el comando manual reutilice exactamente el mismo camino.
- Inyectar los dueños de intención y herramientas en vez de leer sus mapas.

## // 004. VERIFICACIÓN

- 149 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La construcción de `before_agent_start` sigue en la fachada. Es el último hook que queda por separar.
