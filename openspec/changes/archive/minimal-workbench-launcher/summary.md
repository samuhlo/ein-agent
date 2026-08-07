## // 000. RESUMEN
Se entregó un workbench Bun separado y local al repositorio para confirmar un proyecto, elegir Pi/Claude y lanzar de forma segura sobre los contratos existentes. Verificación: `pass`, con `behavior_coverage: partial`.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/workbench.ts`: orquestación transitoria inyectable, selección/confirmación, renderizado ProjectStateV1, capacidades, sesiones, doctor y lanzamiento.
- `ein-pi/workbench.ts`: entrypoint Bun local (`bun ein-pi/workbench.ts`), argumentos, TTY, readline, cancelación y códigos de salida.
- `tests/minimal-workbench-launcher.test.ts`: suite estricta de comportamiento, privacidad, no-escritura, CLI y límites.
- No se tocaron installer, packaging global, specs, docs ni estado persistente.

## // 002. CÓMO FUNCIONA POR DENTRO
Los candidatos se proyectan mediante `projectProjectState` y se mantienen junto a su binding confirmado; el render determinista conserva status, fase/next, calidad/razón y freshness sin promover evidencia stale o desconocida. El menú obtiene capacidades de la matriz canónica: Pi lista, ambos crean request-only y ninguno reanuda; resultados y referencias opacas se normalizan sin filtrar rutas, IDs o transcriptos. La confirmación default-no entrega el intent y snapshot a `buildLaunchPlan` y únicamente el plan validado a `executeLaunchPlan` (argv vacío, `shell:false`, entorno aislado). Doctor delega por puente inyectado o degrada a `unavailable`; la CLI rechaza no-TTY, ofrece `--help`, y mapea normal/operativo/uso/cancelación a 0/1/2/130.

## // 003. DECISIONES
- Repositorio-local y separado: no convierte el instalador en dueño del launcher ni añade bin global, dependencia UI o persistencia.
- Capacidades y adapters son la autoridad; no se infiere paridad ni se aceptan referencias pegadas.
- Doctor permanece read-only y degradable porque no existe puente callable seguro en producción.
- El split aprobado del grupo 003 recuperó dos timeouts de 30 minutos; su reconciliación queda registrada como incidente, no como evidencia TDD.

## // 004. VERIFICACIÓN
- 155 tests secuenciales B/C/sesiones/installer/workbench: 0 fallos; suite workbench completa: 52 pass.
- CLI `--help` pass (0), no-TTY pass como salida fail-closed (2), `git diff --check` pass y perímetros/no-escritura pass.
- Strict-TDD/remediación documenta RED/GREEN/TRIANGULATE/REFACTOR; diagnóstico atribuible a launcher: cero.
- `behavior_coverage: partial`: no hubo TTY real, executor default, runtime Pi/Claude ni doctor callable real.

## // 005. PENDIENTE / RIESGOS
- Permanece el baseline TypeScript importado con errores preexistentes; no se atribuyen al launcher.
- Riesgo de tamaño de revisión: mantener el cambio acotado y dividir futuras ampliaciones.
- No se verificaron runtime/TTY reales ni packaging global. Siguiente roadmap: `beta-launcher-e2e-hardening`.
