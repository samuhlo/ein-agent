status: complete
change: ein-tool-registration
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Todas las herramientas de Ein atraviesan una puerta de presentación con dueño propio.

## // 001. QUÉ CAMBIA

- Añade `ein-tool-registration.ts` para registrar recibos humanos uniformes.
- Deja en `ein-ai.ts` únicamente la creación del registrador y las herramientas concretas.
- Amplía la triangulación de código fuente a ambos módulos.

## // 002. CÓMO FUNCIONA POR DENTRO

La puerta envuelve cada especificación con un nombre visible y un resultado humano compacto. El contenido que recibe el modelo permanece intacto y ninguna herramienta puede registrarse directamente por accidente.

## // 003. CÓMO PROBARLO

- `bun test tests/tool-receipts.test.ts tests/agent-tools-contract.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 48 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Una ruta de registro directa perdería su recibo. El test cuenta la única llamada a `pi.registerTool` y compara el inventario completo de 18 herramientas.
