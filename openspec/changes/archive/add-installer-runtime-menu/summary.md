## // 000. RESUMEN
Se añadió al instalador la selección de runtime Pi, Claude Code o ambos, con ejecución aislada, payload Claude determinista y resultados fail-closed. La verificación final pasó con `behavior_coverage: verified`; B3/update quedó fuera.

## // 001. QUÉ CAMBIÓ
- `installer/src/cli/menu.ts`: prompt de Pi/Claude Code/Both tras Install, preservando cancelación y no-TTY.
- `installer/src/cli/install.ts`: `InstallTarget`, Bun compartido una vez, runners, aislamiento de modo Pi y agregación Pi→Claude.
- `installer/src/core/{paths,pi-migration,launcher,cc-payload*}.ts`: contexto Pi post-migración, migración EIN validada, launchers Fish idempotentes y staging Claude.
- `installer/scripts/{bundle-cc-ein,build-all}.ts`, `cc-ein/sync.ts` y assets: payload empaquetado y sync con fallos requeridos explícitos.
- `tests/installer-runtime-menu.test.ts`: selección, aislamiento, migración, launchers, payload, cleanup y fallos.

## // 002. CÓMO FUNCIONA POR DENTRO
El menú pasa un único target al orquestador; `ein install` directo conserva Pi por defecto. Bun se prepara una vez y cada runner seleccionado corre exactamente una vez. Pi valida el marcador legacy antes de migrar, resuelve luego el contexto aislado y ejecuta backup, deploy, paquetes, marker, doctor y `pi-ein.fish`. Claude extrae el payload versionado, ejecuta `bun cc-ein/sync.ts` desde staging, limpia siempre y solo instala `cc-ein.fish` tras sync exitoso. Both continúa tras un fallo y agrega resultados sin rollback cruzado.

## // 003. DECISIONES
- Contexto Pi explícito después de migrar para evitar `AGENT_DIR` obsoleto.
- Payload Claude embebido para no depender de `cwd` ni reimplementar `sync`.
- Both es agregado, no transaccional: conserva éxitos independientes y reporta fallos.
- TDD quedó explícitamente **OFF**; no se reclama evidencia RED/GREEN retroactiva.

## // 004. VERIFICACIÓN
- `behavior_coverage: verified`; typecheck del instalador pasado.
- Test enfocado: 19 tests / 62 aserciones; regresiones relevantes: 35 / 121; suite completa: 945 / 2.742; todos pasaron.
- Build Linux x64 y smoke empaquetado pasaron; payload Claude de 835 archivos.
- Smokes reales Claude-only y Both desde cwd no relacionado pasaron, con aislamiento y cleanup confirmados.
- `git diff --check` pasó y no hubo cambios staged ni edits de producción durante verify.

## // 005. PENDIENTE / RIESGOS
- Riesgo bajo: solo se validó ejecución empaquetada Linux x64; otros targets quedan fuera.
- Pi doctor conserva un warning no bloqueante por token Linear; resultado `OK_WITH_WARNINGS`, cero fallos.
- Rollback: revertir instalador/sync/assets y reconstruir; usar snapshot Pi o backup pre-migración. Un fallo Claude no revierte Pi exitoso ni borra estado Claude previo.
