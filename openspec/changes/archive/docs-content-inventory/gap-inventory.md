# Gap Inventory — docs-content-inventory

Artefacto interno de decisiones de hueco y defectos de fuente detectados durante SLICE 1 (`docs-content-inventory`). Compartido con el cambio hermano `docs-content-reference` (SLICE 2), que documenta 03-runtimes, 04-reference, 05-debug.

## Decisiones de hueco

### First Run

```
area: 00-start
cambio_propietario: docs-content-inventory
decision: redactar como página nueva y didáctica usando installer-beta como ejemplo real
fuentes_candidatas: docs/EIN_DOCUMENTATION_BRIEF.md, ein-pi/core/docs/GUIA_PI_WORKFLOW.md, openspec/changes/archive/installer-beta/scope.md
falta: narrativa completa del ciclo scope-map-design-tasks-apply-verify-close aplicada a installer-beta
estado: esqueleto-en-A
```

### Deterministic Boundaries

```
area: 01-concepts
cambio_propietario: docs-content-inventory
decision: incorporar como página crítica que unifica la tabla modelo/herramienta/garantía/observable
fuentes_candidatas: ein-pi/agent/assets/orchestrator.md, openspec/specs/sdd-lifecycle/spec.md
falta: redacción de la tabla de cuatro columnas y de cada uno de sus casos
estado: esqueleto-en-A
```

### Runtime Matrix

```
area: 03-runtimes
cambio_propietario: docs-content-reference
decision: crear tabla visual comparando runtimes pi-ein y cc-ein
fuentes_candidatas: README.md
falta: matriz de comparación por runtime (bootstrap, dependencias, capacidades)
estado: esqueleto-en-A
```

### Real Workflow Example

```
area: 02-workflow
cambio_propietario: docs-content-inventory
decision: usar el cambio archivado installer-beta como walkthrough completo
fuentes_candidatas: openspec/changes/archive/installer-beta/scope.md, openspec/changes/archive/installer-beta/map.md, openspec/changes/archive/installer-beta/design.md, openspec/changes/archive/installer-beta/tasks.md, openspec/changes/archive/installer-beta/apply-progress.md, openspec/changes/archive/installer-beta/verify-report.md, openspec/changes/archive/installer-beta/summary.md
falta: narrativa de las siete fases con evidencia real del cambio
estado: esqueleto-en-A
```

### Known Limitations

```
area: 05-debug
cambio_propietario: docs-content-reference
decision: frenar la redacción hasta que la fuente canónica esté disponible en main
fuentes_candidatas: ninguna (bloqueado)
falta: matriz beta de limitaciones conocidas, actualmente solo existe en una rama no mergeada
estado: bloqueado
desbloqueante: merge de `feat/shared-project-state-contract` en `main`; hasta entonces su matriz beta no es fuente legible
```

## Defectos de fuente detectados

| id | fichero:linea | defecto | evidencia | propietario | accion |
|----|---------------|---------|-----------|-------------|--------|
| D1 | `README.md:121` | declara `EIN v0.40.0` como última release | `installer/package.json` = `0.42.0` | fuera de alcance | cambio de mantenimiento posterior |
| D2 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:9,11` | presenta Pi como único runtime | `README.md:11` declara `pi-ein` y `cc-ein` | fuera de alcance | cambio de mantenimiento posterior |
| D3 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:72,75` | se contradice a sí mismo: la línea 72 dice «5 fases», la 75 enumera siete | mismo fichero, líneas contiguas | fuera de alcance | cambio de mantenimiento posterior |

Estos tres defectos no se corrigen en este cambio: viven en ficheros fuente (`README.md`, `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md`) fuera del alcance de `docs-content-inventory`, que solo produce páginas nuevas bajo `docs-site/src/content/docs/`. Su corrección queda para un cambio de mantenimiento posterior sobre esos ficheros.
