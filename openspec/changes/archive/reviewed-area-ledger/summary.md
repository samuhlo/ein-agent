## // 000. RESUMEN
Se entregó el ledger local de áreas revisadas de Roadmap G: contratos deterministas, evaluación fail-closed de evidencia/Git y persistencia explícita, atómica y separada de los consumidores. La verificación fresca pasa y el cambio queda listo para cierre, sin implicar aprobación ni completar el ciclo SDD.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/reviewed-area-ledger.ts`: áreas acotadas por selectores `file`/`tree`, identidad canónica, esquema v1, evidencia opaca, intersección de transiciones y seis estados.
- `ein-pi/agent/lib/reviewed-area-ledger-store.ts`: lectura workspace-local y reemplazo CAS atómico explícito, con validación de exclusión B y confinamiento contra symlinks.
- `ein-pi/agent/lib/project-state.ts`: proyección B de estado Git para consumo de solo lectura.
- `openspec/.gitignore`: exclusión anclada únicamente de `reviewed-area-ledger.json`.
- `tests/reviewed-area-ledger.test.ts`: cobertura TDD de contrato, privacidad, carreras, symlinks, transición y no-mutación.

## // 002. CÓMO FUNCIONA POR DENTRO
Cada área válida es un conjunto ordenado de hasta 64 rutas relativas, sin duplicados ni expansión implícita; su ID es `area-v1:sha256:<64hex>`. El snapshot canónico vive en `openspec/reviewed-area-ledger.json`, se ordena y serializa con claves fijas, y la ausencia significa `unreviewed/no-record`.

Solo el workflow humano explícito puede escribir: requiere prueba B de exclusión Git, valida el snapshot completo, comprueba digest/precondición, crea temporal exclusivo, sincroniza y renombra atómicamente; los lectores nunca escriben. La frescura consume el `stateRef` exacto de B y evidencia normalizada inyectada por F. Igualdad completa produce `reviewed/current`; una transición B histórica exacta que intersecta rutas produce `stale`; cambios no demostrablemente afectados son `unknown`, nunca actuales.

Renames/copies intersectan origen y destino; deletes, cambios indexados, tracked-worktree y untracked explícitos usan la misma intersección file/tree. Estado Git incompleto, transiciones ambiguas, evidencia no verificable o corrupción nunca se elevan a revisión.

## // 003. DECISIONES
- Un único snapshot local, un único escritor explícito y consumidores read-only; no se añadieron escritores paralelos, watchers ni migración.
- Se rechazó inferir cambios históricos desde `git.changes` del snapshot actual: requiere transición B exacta para evitar falsos stale/current.
- F-6 permanece con el dueño F: generación/verificación del manifiesto y resolución de evidencia no se duplican en G.
- Los resultados son metadatos de revisión únicamente; no significan aprobación, verificación, merge readiness ni close readiness.

## // 004. VERIFICACIÓN
- `bun test tests/reviewed-area-ledger.test.ts`: 17 tests, 114 assertions, pasa.
- Regresiones B/F: 57 tests, 220 assertions; typecheck de installer pasa.
- Suite completa: 1307 tests, 4744 assertions, 0 fallos.
- Pasaron probes independientes de symlinks/ancestros, permisos, corrupción, versiones, evidencia opaca, carreras y preservación de bytes; también ignore anclado, residuos, callers prohibidos y `git diff --check`.
- F-1–F-8 remediados; F-8 confirma confinamiento por ancestros y mantiene usable el workspace canónico.

## // 005. PENDIENTE / RIESGOS
- F-6: evidencia-manifest y generación de IDs siguen siendo dependencia externa del dueño F; sin manifiesto válido el resultado falla cerrado.
- La evidencia externa y el presupuesto/topología de review siguen siendo riesgos/gates de entrega del padre.
- Rollback: revertir módulo, tests, integración B y regla `.gitignore`; limpiar por separado el archivo ignorado, sin migración ni reparación automática.
- No hay sesión, aprobación, commit, push, archivo de verificación modificado ni decisión de PR realizada.
