status: complete
change: install-journal-contract-boundary
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El vocabulario estable del diario de instalación queda separado del módulo que valida, persiste y ejecuta. El nuevo contrato reúne la forma persistida, el error cerrado y la identidad determinista, sin cambiar la API ni los bytes del diario.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/install-journal-contract.ts` contiene tipos, `InstallJournalError`, validación acotada del detalle, digest y equivalencia con el plan.
- `installer/src/core/install-journal.ts` consume ese contrato y reexporta exactamente los mismos nombres públicos.
- Validación del diario, codec, almacenamiento, reentrada, señales y lifecycle permanecen donde estaban.

## // 002. CÓMO FUNCIONA POR DENTRO

`install-journal.ts` depende del contrato; el contrato sólo depende de `install-plan.ts` y del hash de Node. No conoce filesystem, almacén, ejecutor, señales ni lifecycle. La validación y la ejecución comparten el predicado acotado de detalle mediante un import interno.

## // 003. DECISIONES

- Se eligió el corte más pequeño que puede mergearse y revertirse solo.
- No se añadieron clases, repositorios genéricos, eventos ni nuevas guardas textuales.
- Las siguientes fronteras —validación, codec y ejecución— quedan fuera para conservar una sola idea por PR.

## // 004. VERIFICACIÓN

- verify: `bun test tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/release-update-integration.test.ts`
- Resultado enfocado: 34 pass, 0 fail, 249 assertions.
- Suite completa: `bun test` — 2905 pass, 0 fail, 14150 assertions.
- Typechecks raíz e installer: pass.
- `git diff --check`: pass.
- Presupuesto productivo: 102 líneas cambiadas de 400.

## // 005. PENDIENTE / RIESGOS

- Siguiente unidad: separar la validación fail-closed del coordinador sin ampliar el contrato público.
- Riesgo residual bajo: refactor interno sin migración de datos ni cambio de comportamiento observable.
