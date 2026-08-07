## // 000. RESUMEN
Se entregó y verificó un proyector determinista, de solo lectura, para compartir el estado público del proyecto entre futuros adaptadores Pi/Claude y el launcher. `ProjectStateV1` conserva la autoridad en OpenSpec, EIN.md y Git sin crear otro almacén de estado.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/project-state.ts`: contrato `ProjectStateV1`, proyección OpenSpec/EIN/Git/verificación/runtime y lector Git acotado.
- `tests/shared-project-state.test.ts`: contrato, determinismo, degradación, privacidad, Git exacto y frescura de verificación.
- `openspec/changes/shared-project-state-contract/apply-progress.md`: evidencia TDD y remediación documentada.
- No cambiaron los módulos existentes de router, contexto, baseline Git ni presentación de estado.

## // 002. CÓMO FUNCIONA POR DENTRO
La proyección compone `listActiveChanges`, `resolveSddStatus`/`resolveSddNext` y `readEinMd`; no duplica sus reglas ni escribe sus fuentes. La selección múltiple sin selección explícita queda `ambiguous`, y las raíces OpenSpec inválidas o ilegibles fallan cerrado.

El Git privado calcula una referencia `git-v1:sha256:<digest>` con HEAD, rama/detached/unborn, índice, worktree y todos los untracked relevantes; expone solo rutas relativas y clasificaciones acotadas. La verificación solo es `current` cuando un reporte `pass` contiene esa referencia exacta y el router no lo marca stale; reportes legacy/unbound nunca se promueven.

EIN.md conserva revisión y frontera curated/AUTO, distinguiendo ausencia, incompletitud y disponibilidad. Runtime queda limitado a capacidades, referencias opacas y errores estables; por defecto es `not-provided`, sin sesiones ni transcripts.

## // 003. DECISIONES
- Se eligió proyección bajo demanda, sin cache, snapshot, base de datos ni fichero competidor.
- La ambigüedad no se resuelve alfabéticamente: la intención debe venir del consumidor futuro.
- El fingerprint Git conservador invalida por cualquier cambio relevante del worktree para evitar falsos `current`.
- La compatibilidad conserva router, baseline y salida existentes; el cambio C (`runtime-session-adapters`) será dueño de adaptar Pi/Claude.

## // 004. VERIFICACIÓN
- `bun test tests/shared-project-state.test.ts`: 39 tests, 160 expectativas; OK.
- Suites de compatibilidad (`sdd-router`, `sdd-status-output`, `project-context`, `git-baseline`): 84 tests, 225 expectativas; OK.
- `git diff --check`, checks de archivos no rastreados, inmutabilidad del índice y probe de raíz ilegible: OK.
- Strict TDD documentado RED/GREEN/TRIANGULATE/REFACTOR para todos los grupos y remediación.
- TypeScript dirigido: no hay diagnósticos en `project-state.ts` ni su test; queda riesgo baseline no bloqueante en módulos importados (`lang.ts`, parser/sync OpenSpec, `project-context.ts`, guardrails/router y tipos Pi ausentes).

## // 005. PENDIENTE / RIESGOS
- Ningún bloqueo para cerrar este cambio.
- El baseline TypeScript importado requiere resolución independiente.
- Siguiente cambio de roadmap: C, `runtime-session-adapters`; no se implementaron adaptadores ni launcher aquí.
