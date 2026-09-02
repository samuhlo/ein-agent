## // 000. RESUMEN

La selección de contexto OpenSpec para scope y design deja de estar enterrada entre hooks. Un módulo acotado posee los límites, hashes y reglas de selección exacta; el hook solo pide el bloque que debe inyectar.

## // 001. QUÉ CAMBIÓ

- `ein-canonical-spec-context.ts`: resuelve y renderiza referencias canónicas acotadas.
- `ein-ai.ts`: importa `canonicalSpecPrompt` y elimina toda la política local.
- El test importa el dueño real y conserva el contrato de integración con la fachada.

## // 002. CÓMO FUNCIONA POR DENTRO

La tarea aporta dominios explícitos o reutiliza referencias ya selladas. El módulo admite hasta tres specs y 32 KiB, calcula SHA-256 y devuelve rutas exactas. Si la selección es mayor, bloquea y pide acotarla; nunca hace glob ni recorta contenido.

## // 003. DECISIONES

- Separar selección de contexto de la mecánica del evento `before_agent_start`.
- Mantener los límites junto a quien los aplica, no como números sueltos en la fachada.
- Retirar el export accidental desde `ein-ai.ts`; esta capacidad es interna y su dueño ya es importable directamente.

## // 004. VERIFICACIÓN

- 69 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La interpretación general de eventos de agentes sigue en la fachada. Será la siguiente pieza pura antes de separar el registro de hooks.
