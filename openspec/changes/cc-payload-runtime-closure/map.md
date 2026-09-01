# Map — cc-payload-runtime-closure

status: complete
scope_status: accepted
change: cc-payload-runtime-closure
phase: map

ledger:
  reads:
    - { path: ein-pi/agent/lib/project-settings.ts, bytes: 8146 }
    - { path: ein-pi/agent/lib/terminal-app.ts, lines: 918 }
    - { path: ein-pi/agent/lib/terminal-app-controller.ts, lines: 262 }
    - { path: ein-pi/agent/surfaces/terminal-app-entrypoint.ts, role: consumer }
    - { path: shared/ports/sdd.ts, role: claude-bridge }
    - { path: installer/scripts/bundle-ein-cc.ts, bytes: 7104 }
    - { path: installer/src/core/cc-payload-inventory.ts, role: canonical-inventory }
    - { path: tests/cc-payload-bundle.test.ts, bytes: 5816 }
    - { path: tests/cc-payload-entrypoints.test.ts, role: entrypoint-inventory }
    - { path: tests/architecture-boundaries.test.ts, bytes: 6381 }
    - { path: installer/scripts/cc-payload-smoke.ts, role: compiled-smoke }
    - { path: .github/workflows/installer-release.yml, role: release-gate }
    - { path: openspec/specs/claude-payload-transport/spec.md, role: canonical-domain }
  commands:
    - { command: bundleEinCcPayload to isolated tmp, result: 914 manifest files; 67 under ein-pi/agent; 19420 Pi lines }
  webfetch_used: false
  webfetch_urls: []

## // 001. Mecanismo actual

El inventario copia completos `ein-cc/`, `runtime/` y `vendor/skills`, añade cuatro ficheros explícitos y calcula el cierre relativo de cuatro entradas fuente. El cierre abre cada fichero, aplica `IMPORT_RE`, resuelve cada ruta local por extensión y repite hasta no encontrar archivos nuevos.

La expresión regular ve texto, no significado. `import type`, `export type` y un import de valor son la misma arista para ella. Tampoco puede detectar una fuente sintácticamente inválida: mientras encuentre cadenas que parezcan imports, continúa y puede publicar un cierre aparentemente válido.

## // 002. Arista accidental actual

La rama demostrada es:

`shared/ports/sdd.ts` → `project-directives.ts` → `project-settings.ts` → `terminal-app.ts`

La última arista es `import type { Setting }`. TypeScript la borra, pero el bundler la sigue. Además expresa la propiedad al revés: `project-settings.ts` construye los valores y la interfaz sólo los presenta y recorre.

`Setting` tiene consumidores directos en `terminal-app.ts`, `terminal-app-controller.ts`, `terminal-app-entrypoint.ts` y dos tests. Todos pueden importar el contrato desde `project-settings.ts` sin reexport de compatibilidad.

La comparación contra `origin/main` después de invertir esa arista conserva las 914 rutas del manifiesto. La causa es una segunda entrada independiente:

`ein-cc/continuity-runner.ts` → `shared/ports/continuity.ts` → `terminal-continue-transport.ts` → `terminal-app-controller.ts`

La última arista también es sólo de tipo: `terminal-continue-transport.ts` importa `LaunchOutcome` desde el controlador. El controlador sí importa la aplicación como valor, de modo que el perseguidor textual mantiene la rama completa aunque `Setting` ya tenga dueño correcto. Esta evidencia confirma que corregir un import concreto no sustituye a reparar el algoritmo.

## // 003. Semántica que debe conservarse

- Un import sin cláusula ejecuta efectos y siempre cuenta.
- Un import o export declarado enteramente `type` no cuenta.
- Una cláusula mixta cuenta si conserva al menos un valor.
- `export * from` cuenta de forma conservadora porque puede transportar valores.
- Un `import()` dinámico con ruta relativa literal cuenta.
- Módulos externos no entran en el archive; los resuelve el entorno de compilación.
- Inventario explícito y roots completos no se podan por este algoritmo.

## // 004. Fallo cerrado

TypeScript produce un árbol incluso cuando hay errores de parseo. El bundler debe inspeccionar `parseDiagnostics` antes de aceptar los specifiers. El error identifica el source relativo y ocurre antes de escribir el tar. Una ruta relativa no resoluble conserva el fallo actual.

## // 005. Red existente

`tests/cc-payload-bundle.test.ts` ya construye checkouts temporales y examina archive y manifiesto. Se amplía ese arnés con una entrada situada fuera de los roots copiados completos, para que inclusión y exclusión prueben realmente el cierre.

`tests/cc-payload-entrypoints.test.ts` fija las cuatro entradas. El workflow de release ejecuta `build:all` y después compila `cc-payload-smoke.ts` con BunFS. No hace falta inventar otro smoke: hay que ejecutar el existente sobre el resultado reducido.

## // 006. Corte de PRs

1. `cc-payload-setting-ownership`: fija con test la dirección dominio → interfaz, mueve `Setting`, actualiza consumidores y documenta que el manifiesto todavía no cambia por la segunda arista de solo tipo.
2. `cc-payload-semantic-closure`: sustituye `IMPORT_RE` por el parser, añade fixtures de semántica/fallo, ejecuta la verificación aislada, sincroniza spec, retira la fase del roadmap y cierra el cambio.

## // 007. Presupuesto

La primera PR sólo mueve un tipo y sus imports. La segunda concentra una función de clasificación sintáctica y tests tabulares. Ambas se miden con el forecast reparado; si la segunda supera el presupuesto, se separa la prueba de release del parser sin comprimir código.
