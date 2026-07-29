# Tasks — zero-friction-sdd-start

status: ready
blocked_by: none

## // 001. Extraer el bootstrap reutilizable de OpenSpec

- [x] 1.1 Crear `ein-pi/agent/lib/openspec-config-bootstrap.ts` con la detección, renderizado, preparación de directorios y API create-if-absent extraídos de `sdd-init.ts`; devolver un resultado discriminado `created`/`preserved` y usar creación exclusiva para evitar sobrescrituras concurrentes.
  - skills: `architecture`, `ein-discipline`
  - why: Centraliza la única frontera de configuración sin introducir el ciclo `sdd-init.ts` ↔ `sdd-preflight.ts`, y garantiza preservación byte a byte.
  - learn: Una API de bootstrap debe distinguir creación de no-op para que cada consumidor conserve su propia presentación.
  - architecture: El módulo bajo `ein-pi/agent/lib/` es neutral; no importa extensiones ni preflight, y mantiene detector/renderizador existentes.
  - avoid: Duplicar el detector o importar helpers desde la extensión de comando.
  - verify: `bun test tests/sdd-config-bootstrap.test.ts` — RED para creación/preservación, GREEN tras implementar, TRIANGULATE con bytes arbitrarios y llamadas repetidas/concurrentes, REFACTOR sin alterar el YAML generado.

- [x] 1.2 Añadir `tests/sdd-config-bootstrap.test.ts` con fixtures temporales que prueben config ausente (directorios y archivo creados), config existente (comparación de bytes crudos) y llamada repetida/competida (el primer contenido permanece).
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Fija los invariantes de seguridad del bootstrap antes de reutilizarlo desde dos rutas.
  - learn: Comparar el contenido binario, no el YAML parseado, detecta normalización accidental de comentarios o finales de línea.
  - architecture: Las pruebas aíslan el boundary de filesystem; no dependen del registro de extensiones ni del flujo completo.
  - avoid: Probar únicamente equivalencia semántica o fixtures que no puedan revelar una sobrescritura.
  - verify: `bun test tests/sdd-config-bootstrap.test.ts` con evidencia RED → GREEN → TRIANGULATE → REFACTOR registrada en el commit del work unit.

## // 002. Continuar el SDD solicitado hasta `sdd-scope`

- [x] 2.1 Integrar el bootstrap compartido en `runSddPreflight` y en los caminos `input`/`before_agent_start` de `ein-pi/agent/extensions/ein-ai.ts`, después del preflight existente, manteniendo caché/deduplicación y devolviendo la solicitud original para que el primer delegado sea `sdd-scope`.
  - skills: `architecture`, `ein-discipline`
  - why: Elimina el segundo comando `/sdd-init` sin convertir el bootstrap en ejecución automática de fases posteriores.
  - learn: Preparar infraestructura y continuar la intención original no es lo mismo que saltarse los gates de fase.
  - architecture: `ein-ai.ts` compone preflight + bootstrap; `sdd-preflight.ts` sigue siendo dueño de preferencias, snapshot y caché.
  - avoid: Terminar la solicitud tras crear config o autoejecutar map/design/tasks/apply/verify.
  - verify: `bun test tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts` — RED sobre continuidad y ausencia de doble bootstrap, GREEN al integrar, TRIANGULATE cubriendo input más fallback lazy, REFACTOR preservando gates.

- [x] 2.2 Extender los contratos de flujo en `tests/sdd-flow-contract.test.ts` (y la cobertura de preflight estable en `tests/sdd-preflight-tdd-gate.test.ts` si aplica) para demostrar startup con config ausente/presente, continuación de la intención original y entrada inicial en `sdd-scope` sin reconfirmar bootstrap.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Verifica el comportamiento observable del arranque, incluido el caso sin configuración que motivó el cambio.
  - learn: Un test de contrato puede proteger el orden del flujo sin acoplarse a detalles de implementación privados.
  - architecture: La prueba separa preparación inicial de las confirmaciones interactivas entre fases reales.
  - avoid: Convertir la prueba en una autorización para encadenar fases automáticamente.
  - verify: `bun test tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts` con RED/GREEN/TRIANGULATE/REFACTOR y aserciones explícitas sobre `sdd-scope`.

## // 003. Hacer los diagnósticos relativos a la fase

- [x] 3.1 Ajustar `readTasksStatus`, `resolveSddStatus` y `resolveSddNext` en `ein-pi/agent/lib/sdd-router.ts` para filtrar únicamente `tasks.md ausente.` cuando scope, map o design son la fase actual/recomendada, conservando ausencia ilegible/malformada/bloqueada de tasks y todos los bloqueos apply/verify accionables.
  - skills: `architecture`, `ein-discipline`
  - why: Evita reportar artefactos futuros como blockers sin ocultar fallos reales cuando la fase sea accionable.
  - learn: La acciónabilidad se decide con la fase resuelta, no con la mera ausencia global de un archivo.
  - architecture: El router es la fuente determinista compartida por status, next y consumidores de herramientas; el inventario de artefactos no cambia.
  - avoid: Borrar globalmente `tasks.problems` o arreglar solo el formateador visual.
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts` — RED con la expectativa antigua, GREEN con filtrado phase-aware, TRIANGULATE en scope/map/design y tasks/apply/verify, REFACTOR sin cambiar orden de fases.

- [x] 3.2 Actualizar `tests/sdd-router.test.ts` y `tests/sdd-status-output.test.ts` para cubrir recomendación de scope/map/design sin blocker de tasks ausente y retención de diagnostics de tasks accionables, apply incompleto/bloqueado y verify fallido/desconocido.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Protege tanto el objeto determinista como el texto visible de `/ein:sdd-status` y `/ein:sdd-next`.
  - learn: Cubrir la misma regla en resolución y presentación evita que una capa reintroduzca el falso bloqueo.
  - architecture: Las pruebas mantienen fixtures existentes y añaden estados mínimos por fase, sin rediseñar el router.
  - avoid: Aceptar solo snapshots de salida que no prueben los bloqueos posteriores.
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts` con evidencia RED → GREEN → TRIANGULATE → REFACTOR.

## // 004. Mantener compatibilidad manual y documentación de flujo

- [x] 4.1 Cambiar `ein-pi/agent/extensions/sdd-init.ts` para delegar exclusivamente en el bootstrap compartido, conservando registro `/sdd-init`, resumen de detección al crear y aviso de config existente al preservar.
  - skills: `architecture`, `work-unit-commits`
  - why: Mantiene el contrato manual mientras ambas rutas usan exactamente la misma semántica create-if-absent.
  - learn: La compatibilidad de un comando incluye sus mensajes observables, no solo el archivo final.
  - architecture: La extensión posee UI/notificaciones; el módulo neutral posee filesystem y detección.
  - avoid: Mantener una segunda implementación privada o cambiar la semántica existente de detección.
  - verify: `bun test tests/sdd-config-bootstrap.test.ts tests/sdd-flow-contract.test.ts` y `cd installer && bun run typecheck`; ejecutar RED/GREEN/TRIANGULATE/REFACTOR para la delegación y salida manual.

- [x] 4.2 Alinear `ein-pi/agent/assets/orchestrator.md` con bootstrap automático y entrada inmediata a `sdd-scope`, conservando literalmente la fila de inventario `sdd-scope`, una sola ocurrencia y las confirmaciones interactivas entre fases.
  - skills: `architecture`, `ein-discipline`
  - why: La guía autoritativa debe describir el flujo real sin reescribir el baseline ya aplicado ni debilitar gates.
  - learn: La documentación de orquestación es un contrato operativo: el primer paso puede ser automático, las transiciones posteriores no.
  - architecture: Solo se ajusta la frontera de startup y se preserva el inventario/orden de fases existente.
  - avoid: Añadir otra fila `sdd-scope`, pedir `/sdd-init` de nuevo o documentar autoavance completo.
  - verify: `bun test tests/sdd-flow-contract.test.ts` con comprobaciones de una fila `sdd-scope`, scope primero y gate interactivo; evidencia RED/GREEN/TRIANGULATE/REFACTOR.

## // 005. Verificación integrada del work unit

- [x] 5.1 Ejecutar la batería enfocada Bun y el typecheck configurado, revisar diff contra el diseño y confirmar que no se modificó `openspec/config.yaml` ni se creó ningún artefacto de fases posteriores.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Cierra la integración de bootstrap, continuidad, diagnósticos y compatibilidad con los comandos disponibles del proyecto.
  - learn: Cuando la configuración no declara runner, la evidencia debe usar la convención Bun descubierta y dejar explícito el alcance.
  - architecture: La verificación cruza seams existentes sin añadir scripts, dependencias ni cambios de package manager.
  - avoid: Inventar un comando de test en `openspec/config.yaml` o exigir una suite completa no definida por el diseño.
  - verify: `bun test tests/sdd-config-bootstrap.test.ts tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts && (cd installer && bun run typecheck)`; registrar TRIANGULATE final y revisar que la fila baseline `sdd-scope` no se duplique.
