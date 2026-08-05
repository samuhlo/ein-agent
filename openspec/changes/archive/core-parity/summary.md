## // 000. RESUMEN
core-parity entrega una superficie Claude derivada determinísticamente del core Ein, con adaptación explícita y validación fail-closed. Añade sincronización OpenSpec explícita en `cc-ein-sdd`; la re-verificación fresca pasó y el cambio está listo para cierre.

## // 001. QUÉ CAMBIÓ
- `ein-pi/core/AGENTS.md` es la fuente compartida; `cc-ein/CLAUDE.adapter.md` contiene la adaptación Claude.
- `cc-ein/sync.ts` compila y valida coordinator/agentes antes de promocionar, con mappings, tokens runtime y routing.
- `cc-ein/CLAUDE.md` es salida generada con proveniencia y conserva `ein:harness-discipline`.
- `cc-ein/sdd-cli/cli.ts` añade `sync <change>` sobre `synchronizeOpenSpecFilesystem`, con JSON y códigos deterministas.
- `tests/core-parity.test.ts` protege generación, traducción, drift, idempotencia, CLI y no-sincronización implícita.
- `EIN.md` conserva su contenido curado; `docs/roadmap-beta.md` registra la evidencia acotada de core-parity.

## // 002. CÓMO FUNCIONA POR DENTRO
La sincronización lee el coordinator canónico y la adaptación Claude, ordena el inventario de agentes y compila todo en memoria. Valida herramientas desconocidas, referencias `ein_*`/marcadores runtime, rutas de modelo ausentes u obsoletas y drift generado; solo después escribe la superficie. El CLI Claude delega el delta al sincronizador compartido, que mantiene conflicto sin overwrite, reporte, atomicidad y rollback.

## // 003. DECISIONES
- Separar política compartida y adaptación Claude evita duplicar el brain sin fusionar runtimes.
- Validación declarativa y léxica reemplaza passthrough desconocido y el escape `CC_NOTE`.
- El inventario canónico define identidades; routing y traducciones deben coincidir exactamente.
- `sync` es explícito y devuelve JSON estable (0 éxito, 2 conflicto, 3 entrada inválida, 4 error operativo, 64 uso); `status`, `check`, `close` y `guard` no sincronizan implícitamente.

## // 004. VERIFICACIÓN
- Re-verificación `2026-08-05T11:41:17Z`: `status: pass`, `behavior_coverage: verified`, sin blockers ni findings.
- `bun test tests/core-parity.test.ts`: PASS, 20 tests, 168 expectativas; regresiones: PASS, 133 tests, 338 expectativas; suite completa: PASS, 1.066 tests, 3.493 expectativas.
- CLI standalone, `bun cc-ein/sync.ts --dry`, typecheck de installer y comprobaciones de delta/paridad: PASS.
- Coordinator y 10 agentes byte-identical; delta `sdd-lifecycle` sincronizado con seis `ADDED` y digest canónico coincidente.

## // 005. PENDIENTE / RIESGOS
- Ningún bloqueo de implementación; los archivos siguen unstaged hasta la entrega del parent.
- MCP Claude externo no se probó contra servicios vivos.
- `installer-beta` permanece fuera de este alcance.
