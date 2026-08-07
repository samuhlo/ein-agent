---
title: "SDD & OpenSpec · EIN"
description: "Por qué trabajo por fases, por qué estado persistente, artefactos, relación SDD↔OpenSpec"
sources: ["openspec/specs/sdd-lifecycle/spec.md", "ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md", "ein-pi/agent/assets/orchestrator.md", "ein-pi/core/docs/GUIA_PI_WORKFLOW.md", "README.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
verified_rev: "0ae709d"
---

# SDD & OpenSpec

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que resuma por qué EIN trabaja en fases persistidas en disco (SDD) sobre un árbol de estado (OpenSpec)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 86-99
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página y qué se lleva el lector (distinción SDD vs OpenSpec)
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 444-453
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado de las siete fases en orden
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 88
:::

## Detalles

### Por qué fases

:::caution[PENDIENTE-D]
falta: redacción de por qué el flujo se conduce fase a fase, con estado en artefactos
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 86-99
:::

### Las 7 fases SDD

:::caution[PENDIENTE-D]
falta: enumeración de las siete fases (scope, map, design, tasks, apply, verify, close); autoridad orchestrator.md/sdd-lifecycle/spec.md, no EIN_OPERATING_SYSTEM.md
fuentes: ein-pi/agent/assets/orchestrator.md, openspec/specs/sdd-lifecycle/spec.md
lineas: 88
:::

### Qué es OpenSpec

:::caution[PENDIENTE-D]
falta: definición de OpenSpec como árbol de directorios de estado, distinto del ciclo SDD
fuentes: README.md
lineas: 70-80
:::

### Artefactos principales

:::caution[PENDIENTE-D]
falta: lista de artefactos principales (scope.md, map.md, design.md, apply-progress.md, verify-report.md, summary.md)
fuentes: ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
lineas: 11-24
:::

### Por qué estado fuera de la conversación

:::caution[PENDIENTE-D]
falta: razón de que el estado viva en ficheros y no en la conversación
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 89-95
:::

### Cómo permite retomar una tarea

:::caution[PENDIENTE-D]
falta: cómo ein_sdd_status permite reanudar entre sesiones sin costo
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 99
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (distinción SDD/OpenSpec, siete fases, dónde vive el estado)
fuentes: ein-pi/core/docs/GUIA_PI_WORKFLOW.md
lineas: n/a
:::

## Siguiente paso

[Context](../01-concepts/context.md)

## Fuentes

- `openspec/specs/sdd-lifecycle/spec.md` — autoridad de las siete fases
- `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` — artefactos principales
- `ein-pi/agent/assets/orchestrator.md` — por qué fases y por qué estado en disco
- `ein-pi/core/docs/GUIA_PI_WORKFLOW.md` — flujo práctico de trabajo
- `README.md` — qué es OpenSpec como directorio
- `docs/EIN_DOCUMENTATION_BRIEF.md` — brief de qué debe explicar esta página
