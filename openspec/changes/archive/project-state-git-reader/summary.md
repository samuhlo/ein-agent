status: complete
change: project-state-git-reader
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La ejecución de Git y la identidad exacta del árbol dejan de vivir en el coordinador general.

## // 001. QUÉ CAMBIA

- Añade `project-state-git.ts` como dueño de los probes Git acotados.
- Conecta el parser puro preparado en los dos escalones anteriores.
- Reduce `project-state.ts` a una fachada y coordinador de 67 líneas.

## // 002. CÓMO FUNCIONA POR DENTRO

El lector ejecuta comandos de solo lectura, limita salida y cambios, valida porcelain-v2 y liga HEAD, rama, metadatos y contenido actual en una huella estable.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 46 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La ejecución conserva `execFileSync` sin shell y límites previos. El corte no convierte Git en parte del núcleo compartido.
