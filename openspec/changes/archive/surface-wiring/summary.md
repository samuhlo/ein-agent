## // 000. RESUMEN
Se expusieron el audit del cleaner, sus fases de mutación/completado y el workbench mediante comandos explícitos en `pi-ein` y `cc-ein`. Ambas superficies comparten protocolo, runner y semántica fail-closed.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/surfaces/surface-runner.ts`: protocolo JSON versionado, validación acotada y dispatch de audit, mutate, complete y workbench.
- `ein-pi/agent/surfaces/workbench-entrypoint.ts` y `ein-pi/workbench.ts`: ensamblaje compartido, conservando compatibilidad y comportamiento interactivo.
- `pi-ein/pi-ein.fish`: reserva `cleaner`/`workbench`, resuelve el runner aislado y mantiene el passthrough restante.
- `cc-ein/sync.ts` y `cc-ein/cc-ein.fish`: compilación/promoción obligatoria del runner y dispatch Claude aislado.
- `tests/surface-wiring.test.ts` y `tests/minimal-workbench-launcher.test.ts`: seams de runtime, seguridad, paridad, workbench y aislamiento.

## // 002. CÓMO FUNCIONA POR DENTRO
Los launchers solo reconocen los namespaces reservados y delegan al mismo surface runner. El runner valida versión, capability, claves, tamaño y diagnósticos; ensambla lecturas frescas de B/G/H y router; y deja la política en los engines existentes. `mutate` admite/aplica una única escritura síncrona acotada, mientras `complete` consume después la transición y verificación sin ejecutar comandos. Pi ejecuta el closure distribuido y Claude usa un binario compilado desde la misma fuente; la diferencia está limitada al empaquetado.

## // 003. DECISIONES
- Un runner común evita duplicar lógica entre Pi y Claude y reduce deriva semántica.
- La mutación y el completado permanecen separados; no se añaden cachés, selección automática, reintentos ni nuevas autoridades.
- La superficie falla cerrada ante evidencia ausente, entradas inseguras, payload ausente o escritura incierta.
- El workbench conserva TTY, cancelación, límites, diagnósticos y clasificación de salida existentes.

## // 004. VERIFICACIÓN
- `bun test`: 1.453 tests, 0 fallos; `bun test tests/`: 1.453, 0 fallos.
- Regresiones directas: 106 tests; superficie: 30; workbench: 55; todos pasan.
- `cd installer && bun run typecheck`, sintaxis Fish y `git diff --check`: correctos.
- Runner Claude compilado realmente en home temporal: audit, mutate y complete procesados; workbench no-TTY salió con código 2. Aislamiento y paridad verificados.

## // 005. PENDIENTE / RIESGOS
- Riesgo bajo: no se ejecutó `runSync()` contra un home real por sus efectos opcionales de MCP; compilación, promoción y payload real sí se probaron en temporales.
- Riesgo bajo: `git diff --check` no cubre archivos no trackeados; tests y compilación cubren el runner.
