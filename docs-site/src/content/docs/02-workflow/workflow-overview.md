---
title: "Workflow Overview · EIN"
description: "Flujo SDD completo: scope, map, design, tasks, apply, verify, close. Qué recibe y produce cada fase"
sources: ["ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", "ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md", "ein-pi/core/docs/GUIA_PI_WORKFLOW.md", "README.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
verified_rev: "0ae709d"
---

# Workflow Overview

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que resuma el flujo de siete fases (scope, map, design, tasks, apply, verify, close); autoridad orchestrator.md, no ein-pi/core/docs/EIN_OPERATING_SYSTEM.md
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 88
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página y qué se lleva el lector (objetivo, entrada, salida de cada fase)
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 480-504
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado con las siete fases en orden
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 88
:::

## Detalles

### Siete fases en orden

:::caution[PENDIENTE-D]
falta: enumeración scope, map, design, tasks, apply, verify, close; autoridad orchestrator.md/sdd-lifecycle/spec.md
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 88
:::

### Para cada fase: objetivo

:::caution[PENDIENTE-D]
falta: redacción del objetivo de cada una de las siete fases
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 86-115
:::

### Para cada fase: qué recibe

:::caution[PENDIENTE-D]
falta: redacción de qué estado de disco recibe cada fase
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 90-102
:::

### Para cada fase: qué produce

:::caution[PENDIENTE-D]
falta: redacción del artefacto que produce cada fase
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 17-24
:::

### Para cada fase: qué NO debe hacer

:::caution[PENDIENTE-D]
falta: redacción de los límites de cada fase (scope gate, disciplina de lectura, no redescubrir)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 34-39, 45-66
:::

### Roles en cada fase

:::caution[PENDIENTE-D]
falta: redacción de quién decide, quién lee, quién ejecuta en cada fase
fuentes: ein-pi/core/docs/GUIA_PI_WORKFLOW.md
lineas: 52-61
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (siete fases nombradas, artefacto por fase)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: n/a
:::

## Siguiente paso

[Artifacts](../02-workflow/artifacts.md)

## Fuentes

- `ein-pi/agent/assets/orchestrator.md` — las siete fases, objetivo, entrada y límites de cada una
- `openspec/specs/sdd-lifecycle/spec.md` — autoridad formal de la secuencia de fases
- `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` — qué produce cada fase
- `ein-pi/core/docs/GUIA_PI_WORKFLOW.md` — roles por fase
- `README.md` — mención de OpenSpec y flujo SDD
- `docs/EIN_DOCUMENTATION_BRIEF.md` — brief de qué debe explicar esta página
