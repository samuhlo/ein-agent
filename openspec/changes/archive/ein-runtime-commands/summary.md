## // 000. RESUMEN

Los mandos propios del runtime Pi salen de la fachada. Instalación de assets, preflight manual y controles de Cleaner/Architect quedan registrados por un módulo con una superficie cerrada.

## // 001. QUÉ CAMBIÓ

- `ein-runtime-commands.ts`: registra cuatro comandos de operación local.
- `ein-ai.ts`: entrega la función canónica de preflight y no conoce sus handlers.
- Un test fija el inventario exacto y la delegación desde la fachada.

## // 002. CÓMO FUNCIONA POR DENTRO

El refresco de assets conserva su informe, el comando manual llama al mismo preflight que la entrada automática y los dos agentes comparten una fábrica de control por sesión. No se duplica ninguna decisión de dominio.

## // 003. DECISIONES

- Agrupar solo comandos del runtime, no configuración general ni estado.
- Inyectar el preflight para evitar que este módulo reconstruya su ciclo de vida.
- Fijar el inventario de comandos para detectar pérdidas o crecimiento accidental.

## // 004. VERIFICACIÓN

- 98 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Estado y ayuda todavía se renderizan en `ein-ai.ts`. Es la última implementación que queda dentro de la fachada.
