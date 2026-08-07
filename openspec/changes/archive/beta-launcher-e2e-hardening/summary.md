## // 000. RESUMEN
Se cerró la cobertura E del launcher beta sin cambiar comportamiento de producción: un PTY real y reproducible atraviesa el flujo de workbench, proyección de proyecto y adaptadores Pi/Claude, usando exclusivamente ejecución fixture segura. La evidencia confirma aceptación beta para éxitos, fallos, cancelación, privacidad, frescura y limpieza.

## // 001. QUÉ CAMBIÓ
- `tests/beta-launcher-e2e-hardening.test.ts`: escenarios PTY sincronizados por prompts, matriz de salidas, frescura, doctor, privacidad y ownership/cleanup.
- `tests/fixtures/beta-launcher-e2e-driver.ts`: driver hijo Bun, fixtures Git/OpenSpec, sentinelas de proveedores y `LaunchExecutor` registrador.
- Las superficies de producción (`ein-pi/workbench.ts`, workbench, projector y adapters) permanecieron sin cambios; son dependencias reales de las pruebas.
- La cobertura E depende de la prerequisita fixture-isolation: raíces temporales separadas, manifests exactos y única mutación rastreada permitida.

## // 002. CÓMO FUNCIONA POR DENTRO
El driver abre `Bun.Terminal`, espera prompts exactos y ejecuta el entrypoint real con EOF/SIGINT y timeouts acotados. El flujo compone `projectProjectState`, `createRuntimeSessionAdapter`, `buildLaunchPlan` y `executeLaunchPlan`; sólo el plan validado llega al executor registrador, que nunca lanza Pi/Claude y verifica cwd, ejecutable, argv vacío, entorno aislado y `shell:false`. Un fixture limpio enlaza verificación a `stateRef`; la mutación de código cambia la referencia y la segunda proyección/renderización muestra `freshness=stale`, conserva el reporte y no reproyecta al lanzar. Doctor usa tanto delegates acotados como el fallback productivo `unavailable`.

## // 003. DECISIONES
- Se eligió PTY nativo Bun y sincronización por prompts, no stdin simulado, sleeps ni dependencia de UI/PTY externa.
- Se mantuvo el límite de ownership: no bridge de doctor, persistencia, historial, runtime real, instalador ni cambios productivos.
- El rollback es eliminar los dos archivos de test; los roots temporales se limpian en teardown.

## // 004. VERIFICACIÓN
- Suite E: PASS, 26 tests / 325 expectations; 3/3 stress runs PASS.
- Regresiones B–E: PASS, 151 tests / 850 expectations.
- Suite Bun completa: PASS, 1.259 tests / 4.534 expectations / 0 fallos.
- `cd installer && bun run typecheck`: PASS; residue scan y `git diff --check`: PASS.
- Diff de producción/dependencias vacío, sin archivos staged; 15/15 tareas completas.

## // 005. PENDIENTE / RIESGOS
- La portabilidad PTY nativa sólo está evidenciada en Bun 1.3.14 sobre macOS; no se certifican Windows/Linux.
- La comparación normaliza ANSI, CRLF y echo, por lo que no afirma identidad byte-a-byte entre plataformas.
- Ninguno adicional; no se ejecutan proveedores reales ni se modifica estado persistente.
