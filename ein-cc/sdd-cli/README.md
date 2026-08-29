# Claude SDD CLI

La CLI separa tres responsabilidades:

- `cli.ts` adapta `argv`, stdin/stdout y códigos de salida.
- `presentation.ts` transforma resultados SDD en texto, sin tocar el proceso.
- `sync-command.ts` ejecuta la sincronización y devuelve un resultado cerrado,
  sin decidir cómo se emite ni terminar el proceso.

El motor de dominio entra únicamente por `shared/ports/sdd.ts`. La clausura de
imports del payload incluye estos módulos automáticamente desde `cli.ts`.
