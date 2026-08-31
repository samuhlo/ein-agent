# Summary — add-intent-channel

status: complete
change: add-intent-channel
work_groups: 7
verification_status: pass

## Resultado

Se añadieron `/ein:intent` y `/ein:eh` en Pi y Claude sobre una única skill compartida. `intent` conduce una conversación de decisiones y escribe `intent.md` solo después de confirmación; `eh` reformula la petición sin actuar.

## Decisiones

- El canal de intención es opcional y anterior a SDD; no es una octava fase ni altera el router.
- Pi conserva handlers TypeScript delgados y Claude comandos declarativos; el protocolo vive únicamente en `runtime` compartido.
- La exploración del repositorio se delega en `ein-scout`; la resolución del artefacto usa `resolveIntentPath` y no se reimplementa desde shell.

## Verificación

- Contratos de intención y paridad Pi/Claude verdes.
- Suite completa, typecheck raíz y typecheck del installer verdes en la entrega.
- El comportamiento principal de `/ein:intent` fue ejercitado en vivo; `/ein:eh` quedó cubierto estructuralmente.
- verify: `bun test tests/intent-channel.test.ts tests/intent-channel-parity.test.ts`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## Riesgos conocidos

- La observancia de las reglas de herramientas depende del contrato de la skill.
- `/ein:eh` no disponía de una aceptación interactiva registrada, pero su superficie no tiene herramientas ni efectos.
