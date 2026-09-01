# Tasks — cc-payload-runtime-closure

status: ready
blocked_by: none

## // 001. Propiedad del modelo — PR 1

- [x] 1.1 Añadir una prueba RED de dirección y mover `Setting` desde la interfaz al dominio de ajustes, actualizando todos sus consumidores sin reexport temporal.
  - skills: `none`
  - why: el productor del modelo debe poseer el contrato y la interfaz sólo consumirlo.
  - architecture: `project-settings.ts` no conoce `terminal-app.ts`; terminal, controlador y entrypoint importan el tipo desde el dominio.
  - avoid: renombrar el tipo, mover lógica o cambiar los valores mostrados.
  - verify: `bun test tests/architecture-boundaries.test.ts tests/terminal-app.test.ts tests/terminal-app-controller.test.ts`

- [x] 1.2 Generar el payload antes y después, registrar que la segunda arista de solo tipo mantiene el manifiesto intacto y verificar los dos typechecks.
  - skills: `none`
  - why: una corrección de propiedad no debe venderse como poda si otra entrada conserva el mismo contenido.
  - architecture: los roots e inventario explícito permanecen intactos.
  - avoid: versionar tarballs generados o confundir ficheros ya necesarios por otra entrada con peso retirado.
  - verify: `bun run typecheck && (cd installer && bun run typecheck)`

## // 002. Cierre semántico — PR 2

- [ ] 2.1 Añadir fixtures RED de imports/exports runtime, sólo tipo, mixtos, dinámicos y transitivos; sustituir `IMPORT_RE` por clasificación sintáctica con TypeScript.
  - skills: `none`
  - why: un import que el compilador borra no debe convertirse en carga instalada.
  - architecture: el collector sólo descubre specifiers; el resolvedor existente conserva rutas y extensiones.
  - avoid: crear un `Program`, type-checkear el repo, resolver paquetes externos o añadir otro parser.
  - verify: `bun test tests/cc-payload-bundle.test.ts tests/cc-payload-entrypoints.test.ts`

- [ ] 2.2 Añadir una prueba RED de sintaxis inválida y abortar el bundle con el source identificado antes de escribir el archive.
  - skills: `none`
  - why: un cierre dudoso no puede presentarse como completo.
  - architecture: `parseDiagnostics` es evidencia mecánica y fail-closed.
  - avoid: continuar con avisos, volver a regex o publicar un archive parcial.
  - verify: `bun test tests/cc-payload-bundle.test.ts`

- [ ] 2.3 Regenerar y comparar el manifiesto, compilar las cuatro entradas desde el payload aislado, pasar el smoke BunFS compilado, ejecutar suite y ambos typechecks, sincronizar spec, retirar la fase 4 del roadmap y cerrar el cambio.
  - skills: `none`
  - why: `bun test` no demuestra que el payload distribuido sea autocontenido.
  - architecture: la evidencia usa las entradas y el smoke canónicos existentes.
  - avoid: cerrar con tareas pendientes, depender del checkout durante la compilación o ejecutar la fase condicionada del prompt sin necesidad.
  - verify: `bun run ein-cc/sdd-cli/cli.ts check cc-payload-runtime-closure`
