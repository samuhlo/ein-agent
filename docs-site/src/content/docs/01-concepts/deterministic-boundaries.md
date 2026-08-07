---
title: "Deterministic Boundaries · EIN"
description: "Diferencia entre decisión de modelo, comprobación de herramienta, garantía EIN, límites explícitos"
sources: ["ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
verified_rev: "0ae709d"
---

# Deterministic Boundaries

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije la única tabla de cuatro columnas modelo/herramienta/garantía/observable de todo el sitio
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 468-476
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página y qué se lleva el lector (evitar promesas falsas)
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 476
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para distinguir decisión de modelo, comprobación de herramienta, garantía y observación
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 90
:::

## Detalles

### Qué decide un modelo

:::caution[PENDIENTE-D]
falta: redacción de qué tipo de decisiones son probabilísticas y requieren IA
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 468-476
:::

### Qué puede comprobar una herramienta

:::caution[PENDIENTE-D]
falta: redacción de las herramientas deterministas (ein_sdd_status, ein_sdd_check), cero IA
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 90
:::

### Qué puede garantizar EIN

:::caution[PENDIENTE-D]
falta: redacción de contratos explícitos (Plan Gate, Guard decisions, Acceptance gates)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 69-115
:::

### Qué únicamente puede observar o pedir verificación

:::caution[PENDIENTE-D]
falta: redacción de comportamiento observado pero no garantizado, relayado honestamente
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 113
:::

### Límites explícitos

:::caution[PENDIENTE-D]
falta: redacción de límites formales (guard-allowlist, canonical-close-readiness, core-parity-check)
fuentes: openspec/specs/sdd-lifecycle/spec.md
lineas: n/a
:::

### Importancia: evitar promesas falsas

:::caution[PENDIENTE-D]
falta: redacción de por qué distinguir estos cuatro tipos evita afirmar como garantizado lo que solo se observó
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 476
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (modelo vs herramienta vs garantía vs observable)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: n/a
:::

## Siguiente paso

[Workflow Overview](../02-workflow/workflow-overview.md)

## Fuentes

- `ein-pi/agent/assets/orchestrator.md` — herramientas deterministas, garantías, límites de observación
- `openspec/specs/sdd-lifecycle/spec.md` — escenarios de límites explícitos
- `docs/EIN_DOCUMENTATION_BRIEF.md` — brief de la tabla modelo/herramienta/garantía/observable
