## // 000. RESUMEN

La construcción de contexto para agentes deja de estar mezclada con el registro de comandos. Un único hook decide qué prompt recibe el padre, una fase SDD, un scout o un agente de entrega.

## // 001. QUÉ CAMBIÓ

- `ein-agent-prompt-hook.ts`: registra `before_agent_start` y posee sus reglas de selección.
- `ein-ai.ts`: delega el hook completo y elimina su estado de versión por sesión.
- Los contratos de intención, scouts y contexto canónico siguen el nuevo dueño.

## // 002. CÓMO FUNCIONA POR DENTRO

El hook identifica al destinatario y compone únicamente las piezas que necesita: preflight, persona, memoria, skills, idioma, convenciones, contexto del proyecto, specs canónicas y codegraph. También avisa si la instalación cambió durante una sesión ya arrancada.

## // 003. DECISIONES

- Mantener aquí las reglas de selección, pero no el contenido de cada dominio.
- Excluir scouts de skills y agentes de entrega del contexto de proyecto como contratos explícitos.
- Conservar la compuerta de intención como dependencia, sin duplicar su estado.

## // 004. VERIFICACIÓN

- 162 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La fachada ya no implementa hooks. Aún contiene comandos de instalación, controles, estado y ayuda; son el último bloque antes de quedar como composición pura.
