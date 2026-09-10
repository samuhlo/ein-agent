---
title: "SDD y OpenSpec"
description: "Estado del cambio en disco, desde el acuerdo hasta el archivo."
sources: ["runtime/assets/orchestrator-core.md", "shared/sdd/sdd-routing-core.ts", "shared/sdd/sdd-close-compaction.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

SDD organiza el trabajo por fases; OpenSpec mantiene los artefactos del cambio y las especificaciones del proyecto. En Ein el estado puede retomarse desde disco sin reconstruir toda la conversación.

```text
openspec/
  config.yaml
  specs/
  changes/
    nombre-del-cambio/
      intent.md
      scope.md
      map.md
      design.md
      tasks.md
      apply-progress.md
      verify-report.md
      summary.md
    archive/
```

Es el recorrido standard. Los archivos aparecen según avanza el trabajo; no se crean todos al empezar. Los cambios históricos y el carril micro pueden tener otro conjunto de artefactos.

## Intención y contrato

`intent.md` recoge el acuerdo gestionado: objetivo, límites y criterios de terminación. Si una decisión material cambia, se reabre y se detectan los artefactos que ya no corresponden al acuerdo vigente. No se actualizan claves de archivos antiguos para aparentar vigencia.

Scope acota; map localiza; design decide; tasks concreta el trabajo. Verify contrasta implementación, criterios y evidencias con ese contrato, incluida la intención vigente. No basta cumplir una interpretación antigua del diseño.

## Especificaciones y cierre

Las specs describen comportamiento mantenido; los deltas del cambio expresan su modificación. La sincronización valida y aplica esos deltas con herramientas. El cierre exige resolver los bloqueos correspondientes antes de archivar.

En el cierre normal, el archivo se reduce a `summary.md`, incorporando los informes de apply y verify como evidencia conservada. Las referencias a esos informes se ajustan dentro del resumen. Las rutas a logs externos siguen dependiendo de que sus archivos originales se conserven; el resumen no copia automáticamente cualquier log del sistema.

No toda edición necesita este expediente. Consulta [cuándo usar cada ruta](/ein-agent/02-workflow/workflow-overview/) y la [referencia de artefactos](/ein-agent/02-workflow/artifacts/).
