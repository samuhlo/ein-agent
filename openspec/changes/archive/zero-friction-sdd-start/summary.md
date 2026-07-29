## // 000. RESUMEN
Se eliminó la fricción de arranque SDD: una solicitud explícita prepara OpenSpec si falta configuración y continúa hacia `sdd-scope`, sin eliminar las compuertas interactivas posteriores. El status ahora distingue artefactos futuros de bloqueos accionables.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/openspec-config-bootstrap.ts`: extracción del detector/renderizador y creación segura de configuración solo si falta.
- `ein-pi/agent/extensions/sdd-init.ts`: `/sdd-init` conserva su compatibilidad y delega en el bootstrap compartido.
- `ein-pi/agent/extensions/ein-ai.ts`: el preflight SDD inicializa OpenSpec y conserva la solicitud original para entrar en scope.
- `ein-pi/agent/lib/sdd-router.ts`: la ausencia futura de `tasks.md` no bloquea durante scope/map/design; los fallos accionables posteriores siguen visibles.
- `ein-pi/agent/assets/orchestrator.md`: flujo de arranque actualizado, con gates posteriores intactos y una sola fila `sdd-scope`.
- `tests/sdd-config-bootstrap.test.ts`, `sdd-router.test.ts`, `sdd-status-output.test.ts` y `sdd-flow-contract.test.ts`: cobertura focalizada de bootstrap, preservación, flujo y diagnósticos.

## // 002. CÓMO FUNCIONA POR DENTRO
El módulo neutral de bootstrap detecta y renderiza la configuración existente, crea directorios OpenSpec y usa creación exclusiva: si `openspec/config.yaml` ya existe, devuelve preservado y no lo reescribe. Tanto `/sdd-init` como el startup SDD llaman a esa misma frontera.
Tras el preflight cacheado, los hooks de entrada explícita y de arranque lazy ejecutan el bootstrap y devuelven `action: "continue"`; el orquestador recibe la intención original y delega primero `sdd-scope`. `sdd-router` filtra únicamente la ausencia futura de tasks según la fase, manteniendo los bloqueos reales de tasks/apply/verify.

## // 003. DECISIONES
- Mantener el bootstrap en un módulo neutral evita ciclos entre extensiones y permite compatibilidad manual/automática.
- Preservar configuración existente significa no regenerar, mezclar ni normalizar bytes, incluso en llamadas repetidas o competidas.
- Automatizar solo la preparación inicial; map, design, tasks, apply y verify conservan sus confirmaciones interactivas.
- La cobertura de runtime Pi queda explícitamente aceptada como parcial: la cadena request → bootstrap → continuación → delegación efectiva está validada por contratos estáticos.

## // 004. VERIFICACIÓN
- `status: pass`; `behavior_coverage: partial`.
- Tests Bun enfocados: 57 tests, 132 assertions, 0 fallos.
- `cd installer && bun run typecheck`: pasa (`tsc --noEmit`).
- `git diff --check`: pasa; `openspec/config.yaml` permanece sin cambios.
- Inventario verificado: exactamente una fila `sdd-scope`.

## // 005. PENDIENTE / RIESGOS
Riesgo residual aceptado: no se ejecutó un smoke test real de hooks Pi, por lo que podría existir una diferencia de runtime no capturada por los contratos estáticos. Seguimiento recomendado: ejecutar un smoke test de solicitud SDD en un proyecto temporal con y sin `openspec/config.yaml` antes de ampliar la automatización. No hay otros pendientes funcionales.
