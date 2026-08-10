## // 000. RESUMEN
Se añadió un cierre explícito y auditable para entregas realizadas fuera de SDD, sin convertir `force` en un bypass ni archivar `docs-site-shell`. La política es determinista, estructural y compartida por Pi y Claude.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/sdd-reconciliation.ts`: contrato versionado y validador puro de evidencia.
- `ein-pi/agent/lib/sdd-router.ts`: perfil `scope-only-out-of-flow`, elegibilidad estructural y bloqueadores estables.
- `ein-pi/agent/lib/sdd-close.ts`: lectura de evidencia canónica, enlace al estado actual, validación antes de mutar y recibo `reconciliation`.
- `ein-pi/agent/extensions/ein-ai.ts` y `sdd-close-args.ts`: opciones explícitas para herramienta y slash command de Pi.
- `cc-ein/sdd-cli/cli.ts`: flags equivalentes para Claude.
- Tests focalizados de reconciliación, router, cierre, superficies y paridad.

## // 002. CÓMO FUNCIONA POR DENTRO
El perfil `scope-only-out-of-flow` debe seleccionarse explícitamente y acepta solo un registro scope-only con forma exacta: declarationless genuino o `spec_delta: none` con razón propia válida. `out-of-flow-reconciliation.json` es la evidencia canónica: enlaza cambio, razón, resumen, checks concretos y una identidad única de repositorio.

El validador puro no lee filesystem, ejecuta comandos ni muta Git: valida versión, identidad, razones, resumen fresco hash/bytes, checks pasados y estado actual. `sdd-close` obtiene esos datos en el borde y no mueve archivos hasta agregar todos los bloqueadores. La identidad de repositorio evita que timestamps recientes oculten evidencia obsoleta.

El resumen debe decir literalmente `Delivery occurred outside SDD.`, declarar los artefactos de ciclo excluidos, referenciar todos los checks y declarar sucesores. La forma del registro, no su nombre, determina elegibilidad. Se preservan readiness normal, secuencia, sincronización, conflictos, tareas, apply/verify y el escape declarationless-only `force`/`legacyEscape`.

Pi y Claude solo traducen opciones (`reconciliation-profile`, evidencia canónica y `reason`) hacia el mismo core; `check` sigue siendo no archivador.

## // 003. DECISIONES
- Perfil separado de `force` para mantener semántica y guardas existentes.
- JSON local más resumen humano, unidos por hash y tamaño, en vez de inferencia o Markdown ambiguo.
- Validador puro compartido; adaptadores sin lógica duplicada.
- Sin allowlist por nombre, artefactos de ciclo fabricados, rutas de evidencia arbitrarias ni ejecución de comandos suministrados.

## // 004. VERIFICACIÓN
Verificación fresca: suites focalizadas de reconciliación (11), router (37), cierre (51), contratos Pi (9), parser/flujo Pi (45) y paridad Claude (8), todas pasaron; agregado focalizado: 116 tests. `bun test`: 1.415 tests en 105 archivos, 0 fallos. `cd installer && bun run typecheck`: correcto. `git diff --check`: correcto.

## // 005. PENDIENTE / RIESGOS
- Ningún bloqueo de comportamiento; `docs-site-shell` no fue cerrado ni modificado.
- Riesgo bajo: no se ejecutó una sesión interactiva real de Pi; sí se verificaron esquema, parser y flujo compartido.
- Riesgo bajo: permanece whitespace de hard-break Markdown en `design.md`; es higiene documental fuera de esta entrega. El texto histórico de `apply-progress.md` conserva una referencia antigua ya reconciliada en `tasks.md` y la verificación fresca.
