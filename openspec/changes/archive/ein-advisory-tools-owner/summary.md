status: complete
change: ein-advisory-tools-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La fachada delega las herramientas de participantes, Cleaner y Architect en su registrador independiente.

## // 001. QUÉ CAMBIA

- Sustituye diez definiciones incrustadas por `registerAdvisoryTools`.
- Retira de `ein-ai.ts` esquemas, estado Cleaner e imports de dominio exclusivos.
- Conserva el inventario y los recibos de las 18 tools.

## // 002. CÓMO FUNCIONA POR DENTRO

La fachada crea la puerta común y entrega esa puerta al registrador de asesoría. Este posee el pequeño estado de sesión de Cleaner y traduce las funciones de dominio a contratos Pi.

## // 003. CÓMO PROBARLO

- `bun test tests/tool-receipts.test.ts tests/agent-tools-contract.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 48 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Una herramienta omitida rompería las allowlists de agentes. El inventario recursivo y la prueba que instancia la extensión comprueban que las diez superficies siguen registradas.
