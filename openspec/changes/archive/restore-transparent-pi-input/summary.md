status: complete
change: restore-transparent-pi-input
work_groups: 5
verification_status: pass

## // 000. RESUMEN

Todo mensaje ordinario de Pi llega ahora intacto al orquestador. El runtime deja
de interpretar lenguaje con regex; el modelo capaz decide si responde, trabaja,
pregunta por una decisión material u ofrece el canal explícito `/ein:intent`.

## // 001. QUÉ CAMBIÓ

- `ein-session-lifecycle.ts`: conserva delivery/SDD setup y devuelve siempre `continue` para input ordinario.
- `ein-ai.ts`, prompt hook y tool-call gate: dejan de componer, inyectar o bloquear por intent léxico.
- `ein-pi-intent-gate.ts`: owner automático Pi eliminado (189 líneas).
- `orchestrator.md` y `AGENTS.md`: decisión semántica en el parent e intent solo con consentimiento.
- `CLAUDE.md`: política compartida regenerada; Claude conserva su preflight post-ingress.
- `pi-input-transparency.test.ts`: matriz real de fuentes, textos y cambios activos.

## // 002. CÓMO FUNCIONA POR DENTRO

El input hook registra únicamente la posible intención de delivery y ejecuta el
setup técnico si el texto pide SDD; después entrega el mismo evento al modelo.
No hay estado pending/confirming, `handled`, replay ni directiva oculta. El
orquestador interpreta la petición completa y las puertas deterministas siguen
actuando sobre tools, artifacts, packets, verify y delivery.

## // 003. DECISIONES

- No ampliar regex: comprender lenguaje pertenece al modelo capaz.
- `/ein:intent` sigue siendo opcional, explícito y separado del SDD normal.
- Scope posee objetivo/límites/terminado; el preflight técnico conserva TDD/lane.
- Readers y core histórico permanecen por compatibilidad; no se migra ni borra estado.
- El hotfix parte de `main` y no mezcla `pi-prelaunch-latest`.

## // 004. VERIFICACIÓN

Verificación fresca con cobertura conductual y strict TDD; 3078 tests, 14879 assertions,
cero fallos, ambos typechecks, bundle host y runtime latest en verde.

- verify: `bun test tests/pi-input-transparency.test.ts`
- verify: `bun test tests/pi-input-transparency.test.ts tests/sdd-flow-contract.test.ts tests/apply-packet-observation.test.ts`
- verify: `bun test tests/pi-input-transparency.test.ts tests/apply-packet-observation.test.ts tests/agent-tools-contract.test.ts`
- verify: `bun test tests/pi-input-transparency.test.ts tests/intent-channel.test.ts tests/intent-channel-parity.test.ts tests/prompt-budget.test.ts`
- verify: `bun test`
- verify: `bun test tests/`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `bun tooling/verify-latest-pi-runtime.ts`
- verify: `git diff --check`
- verify: `bun ein-cc/sdd-cli/cli.ts check restore-transparent-pi-input`

## // 005. PENDIENTE / RIESGOS

- Publicar `0.95.0-alpha.2` tras merge y repetir `hola` + auditoría en Berro.
- `0.95.0-alpha.1` continúa inutilizable para lenguaje no reconocido.
