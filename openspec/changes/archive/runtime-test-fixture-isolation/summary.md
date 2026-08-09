## // 000. RESUMEN
Se aisló el estado global de fixtures runtime/session para que Bun ejecute la suite de forma determinista, sin modificar producción ni las assertions de beta-launcher. La verificación independiente pasó todos los gates; el cambio está listo para cierre.

## // 001. QUÉ CAMBIÓ
- `tests/preload-env.ts` crea y dispone el owner runtime único por proceso/cache.
- `tests/fixtures/runtime-test-fixture.ts` añade homes descartables, snapshots exactos, leases serializados y cleanup de hijos, recursos, cwd y namespaces.
- `tests/fixtures/runtime-test-fixture-isolation-probe.{test,worker}.ts` cubre owners concurrentes, señales, residuos y sucesores.
- `tests/runtime-test-fixture-isolation.test.ts` cubre cache, restauración, fallos, timeout/cancelación, cwd y lease.
- `tests/sessions.test.ts` y `tests/runtime-session-adapters.test.ts` usan namespaces/leases propios, preservando assertions existentes.
- `tests/model-config.test.ts`, `tests/lang.test.ts` y `tests/tdd.test.ts` dejan de competir por `EIN_PI_AGENT_HOME` y restauran sus globals locales.

## // 002. CÓMO FUNCIONA POR DENTRO
El preload publica un home único antes de importar módulos que cachean `AGENT_DIR`/`SESSIONS_DIR`. Cada fixture crea un namespace temporal propio; las operaciones de escritura y escaneo del root de sesiones toman un mutex owner-local, y el cleanup elimina sólo ese namespace. La disposición awaited restaura ausencia, string vacío o valor previo, cwd, globals, recursos e hijos; el owner se elimina al finalizar, sin resetear el cache ESM de producción.

## // 003. DECISIONES
- Se alineó ownership con el límite real del import cache, no con cada test.
- Se serializa sólo el critical section de sesiones, no archivos ni la suite completa.
- El cambio queda estrictamente en harness/tests; no hay migración de producción ni modificación de assertions E.
- Rollback: revertir preload, helper, probes y tests tocados. Esto restaura el blocker conocido y vuelve a bloquear E hasta otra solución de aislamiento.

## // 004. VERIFICACIÓN
- Foco aislamiento/probe/sesiones/adapters: 53 pass, 0 fail, 285 expectations.
- Stress default Bun: 10/10 pass; targeted E: 153 pass, 0 fail, 627 expectations.
- `cd installer && bun run typecheck`: pass.
- Suite completa: 3/3 runs, cada una 1.256 tests, 4.297 expectations, 0 failures.
- Residuo: 0 roots `ein-runtime-test-owner-*`; diff prohibido vacío; `git diff --check` limpio; env absent/empty/value, cwd, hijos, recursos, timeout/cancelación y SIGINT/SIGTERM verificados.

## // 005. PENDIENTE / RIESGOS
- Terminación no capturable (p. ej. SIGKILL) no puede ejecutar cleanup JavaScript; la seguridad depende de roots nunca reutilizados.
- Hay artefactos E no rastreados en el workspace, no editados por este cambio.
- Handback explícito: `beta-launcher-e2e-hardening` puede reanudar sin cambiar sus assertions; debe repetir sus checks existentes y `bun test`, manteniendo bloqueado E sólo si reaparecen las nueve fallas mapeadas.
