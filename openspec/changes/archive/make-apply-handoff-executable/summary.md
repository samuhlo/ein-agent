status: complete
change: make-apply-handoff-executable
work_groups: 6
verification_status: pass

## // 000. RESUMEN

Ein ya convierte cada grupo de `tasks.md` en una orden `apply-packet/v2`
verificable y la observa en la delegación real de `sdd-apply` sin bloquearla.
Planning concentra las decisiones con razonamiento alto y apply conserva trabajo mecánico.

## // 001. QUÉ CAMBIÓ

- `apply-packet.ts` y `apply-packet-compile.ts`: schema, validación y compilación v2 por grupo con pasos ordenados, fronteras separadas y fuentes selladas.
- `apply-packet-observation.ts` y `ein-tool-call-gate.ts`: observación fail-closed inmediatamente antes del apply, todavía en modo informativo.
- `sdd-tasks.md`: gramática obligatoria de outcome, read, edit, behavior, stop y verify.
- `model-config.ts`: scope, design y tasks recomiendan thinking alto; apply conserva low sin escoger proveedor.
- `ein-pi-intent-gate.ts`: un hijo con identidad completa no vuelve a pedir intención humana; una marca parcial no basta.
- ADR 0005, roadmap y guías SDD: documentan el programa capaz → packet → worker barato → verificación → accounting.

## // 002. CÓMO FUNCIONA POR DENTRO

El compilador puro selecciona el grupo del próximo checkbox pendiente y produce pasos
con contexto de lectura, permiso de escritura y checks independientes. El adaptador lee
`design.md` y `tasks.md`, calcula sus SHA-256, compila y valida una sola vez. El hook de
delegación muestra `executable`, `incomplete`, `rejected` o `unavailable` sin cambiar el
input ni impedir el flujo. Los digests obsoletos, campos ausentes y fronteras inválidas
nunca se convierten en éxito por defecto.

## // 003. DECISIONES

- V1 y el corpus histórico permanecen congelados; v2 es un contrato separado.
- La unidad ejecutable es el grupo delegado, no una tarea suelta ni el cambio completo.
- Nombrar un fichero en un check no concede permiso de escritura.
- La observación precede al bloqueo para medir la calidad real del productor.
- La intención humana pertenece al padre; el bypass del hijo no amplía sus herramientas.

## // 004. VERIFICACIÓN

Verificación independiente: `status: pass`, `behavior_coverage: verified` y
`strict_tdd_compliance: pass`; 12/12 tareas, 3067 tests y 14803 assertions sin fallos,
ambos typechecks en verde y smoke real `CHILD_OK` con `gpt-5.6-luna:xhigh`.

- verify: `bun test`
- verify: `bun test tests/`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `bun tooling/verify-delegated-child-intent.ts --agent-home "$PI_CODING_AGENT_DIR"`
- verify: `bun ein-cc/sdd-cli/cli.ts check make-apply-handoff-executable`

## // 005. PENDIENTE / RIESGOS

- El rollout aún es report-only: no confina tools ni bloquea packets inválidos.
- Receipts, accounting por grupo, canary y promoción a barato/local quedan para cambios posteriores.
- Una exclusión cacheada del único modelo candidato puede caer silenciosamente al modelo por defecto; debe resolverse antes del canary.
