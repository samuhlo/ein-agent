---
title: "Artifacts · EIN"
description: "Artefactos generados en un cambio SDD: qué es cada uno, qué problema resuelve, relación entre ellos"
sources: ["ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md", "ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", "README.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
verified_rev: "0ae709d"
---

# Artifacts

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que resuma que cada fase SDD produce un artefacto en `openspec/changes/<cambio>/`, sin saltos de fase
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 11-24
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página y qué se lleva el lector (qué es cada artefacto, qué problema resuelve)
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 506-527
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado del diagrama scope → map → design → tasks → apply → verify → summary
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 506-527
:::

## Detalles

### scope.md

:::caution[PENDIENTE-D]
falta: qué fija scope.md (alcance, presupuesto) y dónde vive
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md, ein-pi/agent/assets/orchestrator.md, README.md
lineas: 19
:::

### map.md

:::caution[PENDIENTE-D]
falta: qué contiene map.md (notas de exploración, riesgos, dependencias, prior art, sin implementación)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 41-43
:::

### design.md

:::caution[PENDIENTE-D]
falta: qué contiene design.md (propuesta, spec en RFC 2119, tareas)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 45-59
:::

### tasks.md

:::caution[PENDIENTE-D]
falta: qué contiene tasks.md (checklist ejecutable que alimenta apply)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 57-58
:::

### apply-progress.md

:::caution[PENDIENTE-D]
falta: qué contiene apply-progress.md (secciones por lote, ciclos TDD, decisiones técnicas)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 61-72
:::

### verify-report.md

:::caution[PENDIENTE-D]
falta: qué contiene verify-report.md (estado global, checks individuales, criterios revisados)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 74-80
:::

### summary.md

:::caution[PENDIENTE-D]
falta: qué contiene summary.md y quién lo escribe (sdd-close)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 88
:::

### Canonical openspec config

:::caution[PENDIENTE-D]
falta: qué es openspec/config.yaml (stack, runtime, comandos)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 29-39
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (un artefacto por fase, sin saltos de fase)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: n/a
:::

## Siguiente paso

[Real Workflow Example](../02-workflow/real-workflow-example.md)

## Fuentes

- `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` — definición de cada artefacto
- `ein-pi/agent/assets/orchestrator.md` — quién escribe summary.md y cuándo
- `openspec/specs/sdd-lifecycle/spec.md` — autoridad formal de artefactos por fase
- `README.md` — ubicación de artefactos en `openspec/changes/<cambio>/`
- `docs/EIN_DOCUMENTATION_BRIEF.md` — brief del diagrama de relación entre artefactos
