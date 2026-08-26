# Scope: installer-plan-progress

## Qué se toca

- `installer/src/core/install-executor.ts` — emite lo que hace, por un oyente
  opcional que no cambia ninguna decisión.
- `installer/src/core/install-journal.ts` — deja pasar ese oyente.
- `installer/src/tui/progress.ts` — módulo puro: plan + eventos → líneas.
- `installer/src/tui/progress-view.ts` — la mitad impura: mantiene el modelo,
  repinta y expone un spinner que alimenta la fila que corre.
- `installer/src/cli/install.ts` — cablea la pantalla y manda los tres spinners
  de los handlers por el efecto que ya existía para eso.
- `tests/installer-plan-progress.test.ts` — los contratos.

## Qué NO se toca

- El plan, su inventario, su orden ni sus estados: `createInstallPlan` ya
  calculaba todo esto antes de tocar nada. Lo único que faltaba era enseñarlo.
- El journal: sigue envolviendo handlers sin enterarse del oyente.
- Qué se instala, en qué orden y con qué resultado. Sin oyente, el ejecutor se
  comporta exactamente igual — hay un contrato que lo fija.

## Capacidad de prueba

`bun test` en la raíz. `install-executor.ts`, `install-plan.ts` y `progress.ts`
se importan sin arrastrar el template empaquetado; `progress-view.ts` recibe su
salida inyectada, así que se prueba sin terminal.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Anade una pantalla de avance sobre un plan que ya se calculaba. No cambia que se instala, en que orden, ni el contrato del journal o del release.
