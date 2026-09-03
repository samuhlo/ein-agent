status: complete
change: measure-live-apply-packets
work_groups: 4
verification_status: pass

## // 000. RESUMEN

Cada intento real de delegar únicamente a `sdd-apply` deja ahora un recibo
pequeño y durable; accounting puede medir si el modelo caro entregó trabajo
ejecutable sin fingir que eso demuestra todavía código correcto.

## // 001. QUÉ CAMBIÓ

- `apply-packet-observation-record.ts`: codec v1, digest canónico, parser estricto y agregado de readiness.
- `ein-tool-call-gate.ts`: una custom entry pre-ejecución por sole apply, también headless, siempre report-only.
- `session-accounting*.ts` y `ein-general-commands.ts`: accounting v2 lee en la pasada existente y muestra estados, malformed, tasa y racha.
- `cheap-apply-accounting-baseline.json`, ADR 0005 y roadmap: congelan el antes y el gate para el rollout.

## // 002. CÓMO FUNCIONA POR DENTRO

El borde vivo convierte `executable`, `incomplete`, `rejected` o `unavailable`
en `apply-packet-observation/v1` y lo une al `toolCallId`. El record no copia
packet, task, prompt ni detalle libre. El scanner acotado de sesiones valida
cada custom entry fail-closed; el agregado cuenta muestras válidas, malformed,
digests y cambios distintos, tasa y racha actual. Cero muestras se expresa como
`unknown`.

## // 003. DECISIONES

- El transcript padre es el almacén: ya aporta sesión, retención y exclusión del contexto LLM.
- La telemetría no puede bloquear; incluso un fallo de persistencia deja pasar el apply.
- Accounting sube a schema v2 para no cambiar en silencio el significado de v1.
- No se duplica el fallback de `pi-subagents`: latest 0.64.0 ya falla cerrado.
- Enforcement espera 20 ejecutables seguidos en al menos 3 cambios reales.

## // 004. VERIFICACIÓN

`status: pass`, cobertura de comportamiento verificada y strict TDD completo;
3077 tests, 14858 assertions y cero fallos en 234 ficheros.

- verify: `bun test tests/apply-packet-observation.test.ts`
- verify: `bun test tests/session-accounting.test.ts tests/session-accounting-store.test.ts tests/ein-general-commands.test.ts`
- verify: `bun tooling/verify-latest-pi-runtime.ts`
- verify: `bun test`
- verify: `bun test tests/`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `git diff --check`
- verify: `bun ein-cc/sdd-cli/cli.ts check measure-live-apply-packets`

## // 005. PENDIENTE / RIESGOS

- La instalación local aún debe recibir este runtime para empezar a medir.
- Readiness no es outcome: falta unir recibo, modelo/coste y verificación final.
- El canary capaz/barato y la selección de modelo local siguen fuera de este cambio.
