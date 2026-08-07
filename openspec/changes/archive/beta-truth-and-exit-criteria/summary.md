## // 000. RESUMEN
Se reconcilió la verdad documental de beta con el roadmap canónico A–L. El repositorio queda con baseline local del instalador 0.42.0, pero sin afirmar que la ruta launcher beta A–E esté completa.

## // 001. QUÉ CAMBIÓ
- `docs/roadmap-beta.md`: fuente mantenida de estado beta, secuencia A–E, matriz de requisitos/posterior/descartado y gates BE-01–BE-06.
- `README.md`: baseline local 0.42.0, superficies Pi/Claude y `--runtime pi|claude|both` como capacidad del instalador; sin prometer launcher implementado.
- `installer/README.md`: selección Pi/Claude, ownership del instalador y separación entre E2E del instalador y futuro E2E del launcher.

## // 002. CÓMO FUNCIONA POR DENTRO
`docs/roadmap-features-ein.md` conserva la autoridad sobre prioridad y orden A–L; `docs/roadmap-beta.md` concentra el estado, la evidencia y los criterios de salida. A es la puerta documental; B define estado compartido; C adapta sesiones Pi/Claude; D construye el workbench mínimo; E valida el launcher y la invalidación de verificación obsoleta. La continuidad transfiere estado normalizado, no historiales privados, y la instalación/actualización permanece bajo ownership del instalador.

## // 003. DECISIONES
- Separar baseline de release (instalador 0.42.0) de readiness del launcher: no hay evidencia de finalización de B–E.
- Mantener la matriz y BE-01–BE-06 en un único documento para evitar divergencia entre READMEs.
- Tratar el catálogo amplio, dashboard/TUI, updater universal, migración de historiales y mutaciones paralelas como posteriores o fuera de beta.
- Mantener `spec_delta: none`; no cambió comportamiento ni evidencia histórica archivada.

## // 004. VERIFICACIÓN
- Resultado: `status: pass`; REQ-01–REQ-07 y criterios 1–10 satisfechos.
- Perímetro confirmado: exactamente los tres documentos permitidos; sin cambios en código, specs, workflows, E2E, changelog, archivos archivados ni estado sucio ajeno.
- Checks de diff, presencia de BE-01–BE-06, baseline, selector y límites históricos: pasaron.
- `behavior_coverage: n-a`: no se ejecutaron tests, build ni typecheck por ser un cambio exclusivamente documental.

## // 005. PENDIENTE / RIESGOS
- Evidencia limitada deliberadamente: no prueba ejecuciones remotas/publicación/assets, ejecución nativa macOS, live Claude MCP ni launcher E2E; el installer-beta histórico conserva cobertura parcial y una rama Bun no asertada.
- Próximo cambio del roadmap: **B — estado compartido determinista del proyecto**, incluyendo OpenSpec, EIN, Git, capacidades/runtime y frescura de verificación.
