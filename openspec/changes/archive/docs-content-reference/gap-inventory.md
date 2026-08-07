# Gap Inventory — docs-content-reference

Artefacto interno de decisiones de hueco y defectos de fuente detectados durante SLICE 2 (`docs-content-reference`). Extiende el vocabulario de `estado:` de SLICE 1 (`openspec/changes/archive/docs-content-inventory/gap-inventory.md`), que es evidencia archivada e inmutable: se referencia como precedente, nunca se edita.

## Decisiones de hueco

### First Run

```
area: 00-start
cambio_propietario: docs-content-inventory
decision: redactar como página nueva y didáctica usando installer-beta como ejemplo real
fuentes_candidatas: docs/EIN_DOCUMENTATION_BRIEF.md, ein-pi/core/docs/GUIA_PI_WORKFLOW.md, openspec/changes/archive/installer-beta/scope.md
falta: narrativa completa del ciclo scope-map-design-tasks-apply-verify-close aplicada a installer-beta
estado: cerrado-en-cambio-anterior
cerrado_en: docs-content-inventory
```

### Deterministic Boundaries

```
area: 01-concepts
cambio_propietario: docs-content-inventory
decision: incorporar como página crítica que unifica la tabla modelo/herramienta/garantía/observable
fuentes_candidatas: ein-pi/agent/assets/orchestrator.md, openspec/specs/sdd-lifecycle/spec.md
falta: redacción de la tabla de cuatro columnas y de cada uno de sus casos
estado: cerrado-en-cambio-anterior
cerrado_en: docs-content-inventory
```

### Real Workflow Example

```
area: 02-workflow
cambio_propietario: docs-content-inventory
decision: usar el cambio archivado installer-beta como walkthrough completo
fuentes_candidatas: openspec/changes/archive/installer-beta/scope.md, openspec/changes/archive/installer-beta/map.md, openspec/changes/archive/installer-beta/design.md, openspec/changes/archive/installer-beta/tasks.md, openspec/changes/archive/installer-beta/apply-progress.md, openspec/changes/archive/installer-beta/verify-report.md, openspec/changes/archive/installer-beta/summary.md
falta: narrativa de las siete fases con evidencia real del cambio
estado: cerrado-en-cambio-anterior
cerrado_en: docs-content-inventory
```

### Runtime Matrix

```
area: 03-runtimes
cambio_propietario: docs-content-reference
decision: crear tabla de seis filas defendibles (RM-1), cada una con evidencia de código o spec; MCP externo excluido explícitamente (RM-2)
fuentes_candidatas: openspec/specs/installer-runtime/spec.md, pi-ein/README.md, cc-ein/README.md, installer/src/core/paths.ts, openspec/changes/archive/core-parity/verify-report.md
falta: prosa de las seis filas del roster cerrado (instalación interactiva, instalación no interactiva, launcher y aislamiento, despliegue del cerebro, ciclo SDD determinista, migración de instalación legacy)
estado: esqueleto-en-A
```

### Known Limitations

```
area: 05-debug
cambio_propietario: docs-content-reference
decision: frenar la redacción hasta que la fuente canónica esté disponible en main
fuentes_candidatas: ninguna (bloqueado)
falta: matriz beta de limitaciones conocidas, actualmente solo existe en una rama no mergeada
estado: bloqueado-por-merge
desbloqueante: merge de `feat/shared-project-state-contract` en `main`; hasta entonces su matriz beta no es fuente legible
```

### MCP Parity

```
area: 03-runtimes
cambio_propietario: docs-content-reference
decision: no incluir MCP externo (Context7, Engram, Linear, Codegraph, Hypa) como fila de la Runtime Matrix; declarar la exclusión con `[BETA-EXCLUDED]` en `runtime-matrix.md`
fuentes_candidatas: openspec/changes/archive/core-parity/verify-report.md
falta: verificación reproducible de la integración MCP contra servicios en vivo, en ambos runtimes
estado: bloqueado-por-evidencia
evidencia_faltante: openspec/changes/archive/core-parity/verify-report.md:163
```

## Defectos de fuente detectados

| id | fichero:linea | defecto | evidencia | propietario | accion |
|----|---------------|---------|-----------|-------------|--------|
| D1 | `README.md:121` | declara `EIN v0.40.0` como última release; sigue sin corregir desde SLICE 1 | `installer/package.json:3` = `0.42.0` | fuera de alcance | cambio de mantenimiento posterior; ninguna página de este cambio fija versión (CT-8) |
| D4 | `README.md:117` | la lista de flags del instalador omite `--runtime` | `installer/src/cli/install.ts:108-124` implementa `--runtime pi\|claude\|both`; `openspec/specs/installer-runtime/spec.md` scenario `noninteractive-runtime-flag-selection` lo exige | fuera de alcance | `cli.md` toma la lista de flags del código, no de `README.md:117` |
| D5 | `openspec/changes/docs-content-reference/map.md:275` | atribuye a `docs/roadmap-beta.md:51-60` la declaración del desbloqueante de Known Limitations | esas líneas tratan «Las tres fugas silenciosas del sync»; el desbloqueante consta en `openspec/changes/archive/docs-content-inventory/gap-inventory.md:60` | este cambio | corregido en `design.md` §B.HN-2; `known-limitations.md` no cita `roadmap-beta.md` como fuente del desbloqueante |
| D6 | `cc-ein/README.md:30` | presenta la integración MCP como verificada, por observación manual | `openspec/changes/archive/core-parity/verify-report.md:163`: «Optional external Claude MCP setup was not exercised against live services» | fuera de alcance | no es corrección de fuente: es la razón de RM-2 y del estado `bloqueado-por-evidencia` de MCP Parity |

Los defectos con propietario «fuera de alcance» (D1, D4, D6) no se corrigen aquí: viven en ficheros fuente fuera del alcance de `docs-content-reference`, que solo produce páginas nuevas bajo `docs-site/src/content/docs/` más este inventario. Su corrección queda para un cambio de mantenimiento posterior sobre esos ficheros. El `gap-inventory.md` de SLICE 1 (`openspec/changes/archive/docs-content-inventory/gap-inventory.md`) no se modifica por ser evidencia archivada; SLICE 1 permanece intacto.
