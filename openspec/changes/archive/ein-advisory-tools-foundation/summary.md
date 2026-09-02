status: complete
change: ein-advisory-tools-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Las herramientas opcionales de participantes, Cleaner y Architect reciben un registrador independiente antes de retirar sus copias.

## // 001. QUÉ CAMBIA

- Añade `ein-advisory-tools.ts` con diez superficies acotadas.
- Conserva temporalmente las herramientas activas en `ein-ai.ts`.
- Hace que el inventario de extensiones recorra módulos internos.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo posee los esquemas públicos y el estado efímero que enlaza evidencia pasiva y activa de Cleaner. Las decisiones de dominio siguen en `lib/`; esta pieza solo traduce sus contratos a tools de Pi.

## // 003. CÓMO PROBARLO

- `bun test tests/agent-tools-contract.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 22 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Durante un escalón existen definiciones duplicadas, pero solo las históricas están conectadas. La siguiente PR registra el dueño nuevo y elimina las copias.
