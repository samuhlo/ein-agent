status: complete
change: ein-general-commands-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La fachada delega los doce comandos generales en su registrador independiente.

## // 001. QUÉ CAMBIA

- Sustituye el bloque de configuración, resume y accounting por `registerGeneralCommands`.
- Retira imports y formateadores exclusivos de esos comandos.
- Mantiene separados los comandos SDD y de diagnóstico.

## // 002. CÓMO FUNCIONA POR DENTRO

La extensión entrega la API de Pi al registrador general. Este conserva los handlers humanos y delega cada decisión a su módulo de dominio, sin conocer hooks ni herramientas SDD.

## // 003. CÓMO PROBARLO

- `bun test tests/ein-general-commands.test.ts tests/agent-tools-contract.test.ts tests/sdd-aliases.test.ts tests/sdd-flow-contract.test.ts tests/template-agent-inventory.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 76 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

El inventario podía perder un comando durante la delegación. La prueba dedicada comprueba los doce nombres y que la fachada no conserva otra definición de `ein:models`.
