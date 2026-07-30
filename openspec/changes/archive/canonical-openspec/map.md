# Map — canonical-openspec

status: partial
scope_status: mapped
change: canonical-openspec
phase: map
skill_resolution: paths-injected
budget_exceeded: true

## Resumen

La implementación SDD vigente está centralizada en `ein-pi/agent/lib/` y expone el flujo mediante `ein-pi/agent/extensions/ein-ai.ts`. OpenSpec ya es la raíz preferida y `openspec/specs/` ya es creado por bootstrap, pero no contiene specs; `.sdd/changes/` sigue siendo una compatibilidad de lectura y archivo. El primer dominio incremental más pequeño es **`sdd-lifecycle`**: contratos de artefactos, routing, lint, cierre y sincronización de especificaciones del propio flujo SDD.

## Mapa actual y rutas de llamada

| Área | Implementación actual | Ruta / contrato afectado |
|---|---|---|
| Raíz y descubrimiento | `resolveChangesDir`, `listActiveChanges`, `resolveSddStatus`, `resolveSddNext` en `ein-pi/agent/lib/sdd-router.ts` | `ein-ai.ts` usa el estado para `ein_sdd_status`, `/ein:sdd-status` y `/ein:sdd-next`; preflight consulta `listActiveChanges`. Prioridad: `openspec/changes/`, fallback: `.sdd/changes/`. Excluye `archive/`. |
| Artefactos y fases | `PHASE_ARTIFACT`, `PHASE_ORDER`, `PHASE_ARTIFACT_ALIASES` en `sdd-router.ts`; `PHASE_BY_FILE` en `ein-ai.ts` | Fases fijas `scope → map → design → tasks → apply → verify → close`; archivos canónicos `scope.md`, `map.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `summary.md`. Alias legacy: `explore.md` cubre scope/map y `apply.md` diseño. |
| Lint | `lintPhaseArtifact`, `lintChange`, `lintDesignArtifact`, `lintTasksArtifact` en `ein-pi/agent/lib/sdd-guardrails.ts` | `ein-ai.ts` formatea `ein_sdd_check`; reconciliación usa el mismo lint. Requeridos hoy: scope/budget en scope; ledger/budget/scope_status en map; estado en apply/verify; estructura rica en design/tasks. |
| Reconciliación | `snapshotPhaseArtifacts`, `reconcilePhaseFailure`, `phaseForAgent`, `resolveDelegationPhase` en `ein-pi/agent/lib/sdd-reconcile.ts` | Una delegación fallida solo se reconcilia si escribió/reemplazó un único artefacto sano de su fase; no reconcilia ausencia, lint inválido, preexistente intacto ni dos cambios ambiguos. |
| Cierre y archive | `assessCloseReadiness` en router; `closeChange`/`closedChangePath` en `ein-pi/agent/lib/sdd-close.ts` | `ein-ai.ts` invoca el cierre determinista. Sin `force`, requiere apply complete, verify pass no obsoleto y summary fresco; mueve por `renameSync`, con fallback copy+delete, a `changes/archive/<change>` y nunca pisa un archivo previo. |
| Bootstrap | `bootstrapOpenSpecConfig` en `ein-pi/agent/lib/openspec-config-bootstrap.ts` | Lo llama `runSddPreflight` en `ein-ai.ts` y el comando `sdd-init`. Crea `openspec/config.yaml`, `openspec/specs/` y `openspec/changes/archive/`, preservando bytes existentes. |

## Plantillas y agentes

- Los assets fuente viven en `ein-pi/core/agents/`; `installSddAssets` en `sdd-preflight.ts` los copia al runtime. Por tanto, cualquier cambio de contrato debe actualizar el agente fuente y respetar el mecanismo de instalación/drift.
- `sdd-scope.md` exige un scope packet con presupuesto concreto; aún no exige declaración `spec_delta` ni lectura de specs de dominio.
- `sdd-design.md` consume scope/map/config y define Proposal, Spec, Decisions y Success Criteria; aún no recibe una selección acotada de `openspec/specs/<domain>/spec.md`.
- `sdd-tasks.md` normaliza el checklist ejecutable y sus metadatos; no es un formato de comportamiento.
- El contrato textual de orquestación está en `ein-pi/agent/assets/orchestrator.md`; `tests/sdd-flow-contract.test.ts` protege que status/check/close y los siete agentes sigan cableados.

## Huecos para esta slice

1. No hay tipo, parser, operación ni ruta para specs vigentes o deltas; `openspec/specs/` está vacío.
2. El router representa solamente fases/artefactos, no estado de `spec_delta`, dominios afectados, `sync-report.md`, conflicto o sincronización pendiente.
3. El lint no conoce declaración `spec_delta: none` ni razón, ni valida deltas bajo `changes/<change>/specs/`.
4. `assessCloseReadiness` es el punto único de guardia determinista antes de mover; debe recibir los motivos de delta pendiente/conflictivo/sin sincronizar sin debilitar las comprobaciones existentes.
5. Scope/design son las costuras adecuadas para introducir selección de specs con presupuesto explícito; la selección debe ser determinista y limitada antes de inyectarla en prompts.

## Restricciones de identidad y determinismo

- `MODIFIED` no puede resolver por título libre ni por posición: la reconciliación actual ya falla ante candidatos múltiples, y el parser/sync debe conservar esa propiedad.
- La identidad estable debe estar declarada dentro de cada escenario vigente y ser única por dominio; la operación MODIFIED/REMOVED debe referir exactamente esa identidad. Duplicado, ausencia o múltiples coincidencias deben producir conflicto, nunca selección implícita.
- La sincronización debe ordenar dominios, operaciones y salida de informe de manera estable; el resultado debe depender únicamente de los bytes de specs/deltas, no de mtimes ni enumeración del filesystem.
- `sync-report.md` debe residir en el cambio para que cierre pueda evaluar evidencia local antes del archive. El contenido de specs ya creadas no debe borrarse durante reversión: se revierten parser/guardas conjuntamente, conforme al límite indicado por scope.

## Superficie mínima prevista (para diseño)

1. Un módulo Node/TypeScript dedicado de contrato+parser+sincronización de specs, sin mezclarlo con `sdd-router.ts` hasta que exista una API pequeña y testeable.
2. Integración estrecha en `sdd-guardrails.ts` para formato/declaración y en `sdd-router.ts`/`assessCloseReadiness` para estado de cierre.
3. Actualización coordinada de `sdd-scope.md`, `sdd-design.md` y, si la declaración pertenece al checklist operativo, `sdd-tasks.md`; además del orquestador si cambia el contrato de entradas.
4. Primera spec/delta únicamente para `sdd-lifecycle`, no migración de los cambios archivados ni de `.sdd`.

## Pruebas existentes y nuevas costuras

| Prueba existente | Seam protegido | Extensión enfocada necesaria |
|---|---|---|
| `tests/sdd-router.test.ts` | estado, orden de fases, budgets, staleness, prioridad OpenSpec y aliases `.sdd` | estado de delta y motivos de bloqueo de cierre/routing; conservar prioridad y aliases. |
| `tests/sdd-close.test.ts` | readiness, mtime de apply/verify/summary, archive seguro y force | rechazo por delta ausente no declarado, pendiente, no sincronizado o conflictivo; aceptación de `spec_delta: none` con razón válida. |
| `tests/sdd-guardrails.test.ts` | señales requeridas y secuencia | validación de declaración, rutas y gramática del delta. |
| `tests/sdd-reconcile.test.ts` | artefacto nuevo+sano, ambigüedad y no-enmascaramiento | reconciliación de un `sync-report.md` nuevo/sano solo si se adopta como artefacto de fase; no inferir sync por archivo preexistente. |
| `tests/sdd-config-bootstrap.test.ts` | creación idempotente de `specs/` y archive, preservación de config | confirmar que no se crean specs de dominio ni se reescribe config durante bootstrap. |
| `tests/sdd-flow-contract.test.ts` | wiring textual de agentes, status/check/close y OpenSpec canónico | contrato de entradas acotadas scope/design y de guardas de sync. |
| Descubiertas: `sdd-status-output`, `sdd-next-dispatcher`, `sdd-scope-packet`, `sdd-scope-budget`, `sdd-phase-runtime-contract`, `sdd-aliases` | UX, packet, runtime y compatibilidad | revisar en diseño/apply para evitar romper mensajes, budgets o rutas legacy. |

Candidatos de verificación posterior: `bun test tests/sdd-close.test.ts`, `bun test tests/sdd-guardrails.test.ts`, `bun test tests/sdd-scope-packet.test.ts`, más pruebas nuevas aisladas de parser/sync y el subconjunto router/reconcile/config/flow afectado. No se ejecutaron pruebas en esta fase.

## Compatibilidad y blast radius

- Mantener `resolveChangesDir` como única resolución de raíz: cambiarlo afecta status, preflight, guardrails, close y comandos de `ein-ai.ts`.
- No usar `.sdd` para nuevas specs: es una ruta de compatibilidad SDD de artefactos, no fuente canónica de comportamiento. La prioridad actual de OpenSpec está protegida por tests.
- `PHASE_ARTIFACT` no debe convertir `sync-report.md` en una octava fase: el alcance excluye fases nuevas. Debe ser evidencia secundaria de la fase/estado de spec.
- El cambio toca módulos transversales pero la primera adopción de contenido debe quedar limitada al dominio `sdd-lifecycle`; otros dominios se incorporan cuando un cambio los modifique.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1500 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 102, estimated_tokens: 1700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 44, estimated_tokens: 650 }
    - { path: "openspec/changes/canonical-openspec/scope.md", lines: 89, estimated_tokens: 1900 }
    - { path: "docs/quality-roadmap/02-canonical-openspec.md", lines: 58, estimated_tokens: 950 }
    - { path: "EIN.md", lines: 42, estimated_tokens: 600 }
    - { path: "codegraph explore: SDD/OpenSpec discovery/routing/lint", lines: 108, estimated_tokens: 2600 }
    - { path: "find: ein-pi/agent/**/*sdd*", lines: 7, estimated_tokens: 100 }
    - { path: "find: tests/**/*sdd*", lines: 20, estimated_tokens: 220 }
    - { path: "find: openspec/**/*", lines: 58, estimated_tokens: 650 }
    - { path: "find: ein-pi/agent/**/*template*", lines: 0, estimated_tokens: 10 }
    - { path: "codegraph explore: close/reconcile", lines: 120, estimated_tokens: 2400 }
    - { path: "codegraph explore: router roots/status/lint", lines: 120, estimated_tokens: 2300 }
    - { path: "codegraph explore: init/assets/ein-ai", lines: 165, estimated_tokens: 3000 }
    - { path: "find: agents/*sdd*", lines: 7, estimated_tokens: 100 }
    - { path: "find: **/.sdd/**", lines: 17, estimated_tokens: 250 }
    - { path: "codegraph explore: router/guardrails exact symbols", lines: 230, estimated_tokens: 3600 }
    - { path: "codegraph explore: router/close/guardrails/reconcile tests", lines: 250, estimated_tokens: 2500 }
    - { path: "codegraph explore: config/flow/scope tests", lines: 150, estimated_tokens: 2100 }
    - { path: "ein-pi/core/agents/sdd-scope.md", lines: 101, estimated_tokens: 1600 }
    - { path: "ein-pi/core/agents/sdd-design.md", lines: 67, estimated_tokens: 1000 }
    - { path: "ein-pi/core/agents/sdd-tasks.md", lines: 68, estimated_tokens: 1100 }
    - { path: "tests/sdd-close.test.ts", lines: 220, estimated_tokens: 3000 }
    - { path: "tests/sdd-guardrails.test.ts", lines: 135, estimated_tokens: 1800 }
    - { path: "tests/sdd-router.test.ts", lines: 230, estimated_tokens: 3200 }
    - { path: "tests/sdd-reconcile.test.ts", lines: 180, estimated_tokens: 2600 }
    - { path: "tests/sdd-config-bootstrap.test.ts", lines: 47, estimated_tokens: 650 }
    - { path: "tests/sdd-flow-contract.test.ts", lines: 145, estimated_tokens: 2100 }
    - { path: "openspec/config.yaml", lines: 38, estimated_tokens: 500 }
  webfetch_used: false
  budget_consumed:
    tokens: 42530
    reads: 29

## Siguiente fase

Recomendada: `sdd-design`. Debe transformar esta superficie en un contrato mínimo de parser/sync y una política explícita de declaración/sincronización, priorizando `sdd-lifecycle` y preservando los contratos de `.sdd` existentes.
