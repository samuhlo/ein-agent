status: complete
change: fix-scout-model-exclusion-diagnostics
work_groups: 4
verification_status: pass

## // 000. RESUMEN

Ein ya no culpa al foreground cuando un modelo excluido impide arrancar scouts:
muestra la causa real, corta el retry del turno y reduce la exclusión gestionada
de 24 horas a cinco minutos sin escoger un fallback oculto.

## // 001. QUÉ CAMBIÓ

- `scout-contract.ts`: error runtime tipado, causas acotadas/deduplicadas y tracking unavailable.
- `extensions/subagent/config.json`: `modelExclusions.defaultTtlMs=300000`.
- `orchestrator.md`: unavailable no se reintenta; ofrece espera o `/ein:models` y conserva reads acotados.
- Tests: shape exacto de Berro, separación off-contract y config sin fallback.

## // 002. CÓMO FUNCIONA POR DENTRO

Si `results` está vacío, el adapter lee únicamente errores estructurados de
`workflow.value` y `workflow.trace`. Con causa, lanza `ScoutRuntimeUnavailable`,
marca el turno y un segundo launch se rechaza antes de crear children. Sin causa
estructurada conserva el fallo genérico; un finalOutput incorrecto sigue el
contador off-contract independiente. Al reiniciar, pi-subagents acorta también
exclusiones activas al TTL de cinco minutos.

## // 003. DECISIONES

- Preservar el error del runtime; nunca inferir async/foreground.
- Un unavailable terminal no merece retry; un report corregible conserva la regla previa.
- Sin fallback configurado: modelo y proveedor siguen siendo decisión humana.
- TTL breve protege del loop inmediato sin bloquear siete agentes un día.

## // 004. VERIFICACIÓN

Cobertura conductual y strict TDD pass; 3091 tests y 14927 assertions sin
fallos en ejecuciones secuenciales, tipos, bundle, latest y prompt en verde.

- verify: `bun test tests/readonly-scout-contract.test.ts tests/subagent-intercom-config.test.ts tests/orchestrator-context-diet.test.ts`
- verify: `bun test tests/readonly-scout-contract.test.ts`
- verify: `bun test tests/subagent-intercom-config.test.ts tests/orchestrator-context-diet.test.ts tests/prompt-budget.test.ts`
- verify: `bun test`
- verify: `bun test tests/`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `bun tooling/verify-latest-pi-runtime.ts`
- verify: `git diff --check`
- verify: `bun ein-cc/sdd-cli/cli.ts check fix-scout-model-exclusion-diagnostics`

## // 005. PENDIENTE / RIESGOS

- Publicar alpha.3 y ejecutar un scout real tras reload del config.
- Cinco minutos siguen siendo fail-closed; no se cambia la selección del usuario.
