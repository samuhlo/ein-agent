status: complete
change: install-journal-shape-boundary
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La comprobación de forma del diario de instalación queda separada de su codec, persistencia y ejecución. La puerta pública no cambia y ahora garantiza además que una colección hostil se rechaza con el error estable del diario, sin filtrar un `TypeError` interno.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/install-journal-shape.ts` valida objetos planos, sobre, plataforma, arrays densos, entradas y campos opcionales.
- `installer/src/core/install-journal.ts` conserva `validateInstallJournal` y encadena forma con alcanzabilidad.
- `tests/install-journal.test.ts` cubre opcionales fuera de vocabulario y arrays revocados.
- No cambian los bytes, estados, identificadores, runtimes ni secuencias admitidas.

## // 002. CÓMO FUNCIONA POR DENTRO

El type guard recibe `unknown` y sólo afirma el contrato completo cuando todas las propiedades son datos propios, enumerables y exactos. Valida después cada entrada contra el orden y runtime autoritativos del plan. Un cierre exterior convierte cualquier excepción de introspección en `false`; la fachada traduce ese resultado a `InstallJournalError` y sólo entonces consulta la política de alcanzabilidad.

## // 003. DECISIONES

- Mantener un único type guard evita schemas paralelos y nuevas dependencias.
- Validar los opcionales antes de afirmar el tipo cierra una promesa TypeScript que antes habría sido demasiado amplia.
- Capturar introspección hostil en la frontera protege el error público sin esconder fallos de ejecución.
- El único comentario nuevo explica el motivo fail-closed y sigue el estilo local; no narra el código.

## // 004. VERIFICACIÓN

- verify: `bun test tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/release-update-integration.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `git diff --check`
- Suite enfocada: 34 pass, 0 fail, 254 assertions.
- Suite completa: 2905 pass, 0 fail, 14155 assertions en 209 ficheros.
- Typecheck raíz e installer: pass.

## // 005. PENDIENTE / RIESGOS

No queda riesgo funcional conocido en este corte. `install-journal.ts` todavía coordina codec, reentrada y ejecución; la siguiente unidad debe separar el codec sin arrastrar la máquina de ejecución.
