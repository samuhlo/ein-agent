# Apply progress — cc-payload-runtime-closure

status: partial

## // 001. Propiedad del modelo — PR 1

Completadas 1.1 y 1.2. `Setting` vive junto al catálogo que lo produce en `project-settings.ts`; terminal, controlador, entrypoint y tests lo importan directamente. La prueba arquitectónica impide que el dominio vuelva a depender de la aplicación de terminal.

La comparación contra `origin/main` produjo 914 rutas antes y 914 después. No se atribuye una poda inexistente: `continuity-runner.ts` alcanza `terminal-continue-transport.ts`, cuyo `import type { LaunchOutcome }` sigue llevando al controlador y desde ahí a la interfaz mientras el bundler use texto.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Propiedad de `Setting` | La prueba encontró `./terminal-app.ts` entre los imports de `project-settings.ts` | 93 pruebas pasaron tras mover el tipo y actualizar consumidores | La prueba exige simultáneamente que dominio no importe interfaz y que interfaz importe dominio | Sin reexport, alias ni cambio de nombre; el contrato tiene un dueño | `bun test tests/architecture-boundaries.test.ts tests/terminal-app.test.ts tests/terminal-app-controller.test.ts` |

## Files changed

- `ein-pi/agent/lib/project-settings.ts`
- `ein-pi/agent/lib/terminal-app.ts`
- `ein-pi/agent/lib/terminal-app-controller.ts`
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`
- `tests/terminal-app.test.ts`
- `tests/terminal-app-controller.test.ts`
- `tests/architecture-boundaries.test.ts`
- artefactos de `openspec/changes/cc-payload-runtime-closure/`

## Verification run in apply

- Focused: 93 pass, 0 fail, 610 assertions.
- Root typecheck: pass.
- Installer typecheck: pass.
- Payload comparison: 914 → 914 routes; no additions or removals.

## Remaining

Pendientes collector semántico, fallo cerrado, verificación aislada, sync, roadmap y cierre.
