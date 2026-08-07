---
title: "Runtime Overview · EIN"
description: "Introducción comparativa a los dos adaptadores de runtime de EIN: Pi y Claude Code"
sources: ["README.md", "pi-ein/README.md", "cc-ein/README.md", "openspec/specs/installer-runtime/spec.md"]
verified_rev: "2f67c73"
---

# Runtime Overview

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije EIN como harness con dos adaptadores de runtime (Pi, Claude Code) y remita a README.md:11 como autoridad del término
fuentes: README.md
lineas: 11
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario eligiendo runtime) y qué se lleva (criterio de selección, no exhaustividad técnica)
fuentes: README.md
lineas: 21-26
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para decidir entre Pi, Claude Code o ambos
fuentes: README.md
lineas: 21-26
:::

## Detalles

### Qué es cada runtime

:::caution[PENDIENTE-D]
falta: definición de pi-ein (config aislado) y cc-ein (config aislado) como adaptadores del mismo harness
fuentes: pi-ein/README.md, cc-ein/README.md
lineas: 1-4
:::

### Instalación y selección de runtime

:::caution[PENDIENTE-D]
falta: descripción del menú de selección (Pi, Claude, Both) y de la selección no interactiva
fuentes: README.md, openspec/specs/installer-runtime/spec.md
lineas: 21-26
:::

### Mecanismos de aislamiento

:::caution[PENDIENTE-D]
falta: mención de PI_CODING_AGENT_DIR y CLAUDE_CONFIG_DIR como mecanismos de aislamiento por variable de entorno
fuentes: pi-ein/README.md, cc-ein/README.md
lineas: 14-19
:::

### Estado de los runtimes

:::caution[PENDIENTE-D]
falta: estado beta de ambos runtimes según los escenarios verificables del spec
fuentes: openspec/specs/installer-runtime/spec.md
lineas: n/a
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (dos runtimes, aislamiento por variable, selección interactiva y no interactiva)
fuentes: README.md
lineas: n/a
:::

## Siguiente paso

[Pi Coding Agent](./pi-coding-agent.md)

## Fuentes

- `README.md` — definición de EIN como harness con dos adaptadores, menú de selección
- `pi-ein/README.md` — qué es pi-ein, aislamiento por PI_CODING_AGENT_DIR
- `cc-ein/README.md` — qué es cc-ein, aislamiento por CLAUDE_CONFIG_DIR
- `openspec/specs/installer-runtime/spec.md` — escenarios verificables de instalación de runtime
