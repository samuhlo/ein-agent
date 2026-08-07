---
title: "Context · EIN"
description: "Contexto como recurso limitado, budgets, tokens, lecturas, horizonte de decisión"
sources: ["ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
verified_rev: "0ae709d"
---

# Context

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije el contexto como el recurso más limitado de EIN, incluyendo `fork`, `fresh`, `max_tokens`, `max_reads` como términos definidos únicamente aquí
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 67
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página y qué se lleva el lector (presupuesto como brújula de decisiones)
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 455-464
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para entender fork vs fresh y los presupuestos
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 67
:::

## Detalles

### Por qué contexto es limitado

:::caution[PENDIENTE-D]
falta: redacción de por qué EIN trata el contexto como recurso limitado
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 455-464
:::

### Ventana de contexto del agente

:::caution[PENDIENTE-D]
falta: definición de ventana de contexto y su relación con `context: "fork"`
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 67
:::

### Fresh vs fork

:::caution[PENDIENTE-D]
falta: definición de `fresh` (contexto limpio, ~2000 tokens) vs `fork` (hereda conversación completa)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 67
:::

### Presupuestos de lectura

:::caution[PENDIENTE-D]
falta: definición de `max_reads` y `max_tokens` como presupuestos explícitos
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 45-46
:::

### Budget en fases

:::caution[PENDIENTE-D]
falta: cómo cada fase recibe un RESEARCH PACKET con límites de lecturas y bytes de salida
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: 45-46
:::

### Horizonte de decisión

:::caution[PENDIENTE-D]
falta: definición de horizonte de decisión como sinónimo de presupuesto de contexto
fuentes: docs/EIN_DOCUMENTATION_BRIEF.md
lineas: 455-464
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (distinción fork/fresh, qué es max_tokens, qué es max_reads)
fuentes: ein-pi/agent/assets/orchestrator.md
lineas: n/a
:::

## Siguiente paso

[Deterministic Boundaries](../01-concepts/deterministic-boundaries.md)

## Fuentes

- `ein-pi/agent/assets/orchestrator.md` — fork/fresh, presupuestos de lectura y tokens
- `openspec/specs/sdd-lifecycle/spec.md` — límites explícitos en escenarios de fase
- `docs/EIN_DOCUMENTATION_BRIEF.md` — brief de por qué el contexto es limitado
