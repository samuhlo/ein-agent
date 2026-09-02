## // 000. RESUMEN

`ein-ai.ts` delega por fin las consultas, auditorías y navegación SDD en el módulo preparado por la PR anterior. La fachada baja de 1.725 a 1.507 líneas y deja de mezclar esas superficies con las herramientas que escriben el flujo.

## // 001. QUÉ CAMBIÓ

- La extensión principal llama una vez a `registerSddReadSurface`.
- Salen de la fachada dos herramientas y cinco comandos completos.
- Los contratos estáticos recorren la composición real en vez de exigir que todo esté escrito en un único fichero.

## // 002. CÓMO FUNCIONA POR DENTRO

`ein-ai.ts` crea el registrador común de herramientas y lo entrega al nuevo dueño. Así todas las herramientas mantienen sus recibos humanos. Estado, auditoría, forecast, foco y siguiente paso se registran desde un único módulo; cierre, preflight, lane, check y escritores permanecen separados porque sí cambian estado.

## // 003. DECISIONES

- Proteger la composición completa en los tests, no la ubicación histórica de cada cadena.
- Mantener `ein_sdd_check` fuera: puede guardar un recibo de memoria y no es una consulta pura.
- Conservar en la fachada el binding que usa el cierre; la navegación mantiene su binding privado.

## // 004. VERIFICACIÓN

- 124 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La fachada todavía posee las herramientas que escriben carril, preflight, memoria, cierre, sincronización y deltas. Esa será la siguiente frontera, con dependencias de memoria explícitas.
