---
title: "Runtime Matrix · EIN"
description: "Comparación defendible entre los runtimes Pi y Claude Code, solo capacidades con evidencia de código o spec"
sources: ["openspec/specs/installer-runtime/spec.md", "pi-ein/README.md", "cc-ein/README.md", "installer/src/core/paths.ts", "openspec/changes/archive/core-parity/verify-report.md"]
verified_rev: "2f67c73"
---

# Runtime Matrix

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije la matriz como comparación de seis capacidades con evidencia de código o spec, no de marketing. Excluidas de esta matriz por falta de evidencia reproducible: paridad MCP externo (Context7, Engram, Linear, Codegraph, Hypa), rendimiento e inyección proactiva de skills [BETA-EXCLUDED]
fuentes: openspec/changes/archive/core-parity/verify-report.md
lineas: 163
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario decidiendo entre runtimes) y qué se lleva (seis filas defendibles, ninguna paridad implícita)
fuentes: openspec/specs/installer-runtime/spec.md
lineas: n/a
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para leer la tabla sin asumir paridad no verificada
fuentes: openspec/changes/archive/core-parity/verify-report.md
lineas: 163
:::

## Detalles

### Instalación interactiva

:::caution[PENDIENTE-D]
falta: comparación de instalación interactiva vía menú entre Pi y Claude Code
fuentes: openspec/specs/installer-runtime/spec.md
lineas: n/a
:::

### Instalación no interactiva

:::caution[PENDIENTE-D]
falta: comparación de instalación no interactiva vía flag `--runtime`
fuentes: openspec/specs/installer-runtime/spec.md
lineas: n/a
:::

### Launcher y aislamiento de configuración

:::caution[PENDIENTE-D]
falta: comparación de launchers (`pi-ein`, `cc-ein`) y variables de aislamiento (PI_CODING_AGENT_DIR, CLAUDE_CONFIG_DIR)
fuentes: pi-ein/README.md, cc-ein/README.md, installer/src/core/paths.ts
lineas: n/a
:::

### Despliegue del cerebro

:::caution[PENDIENTE-D]
falta: comparación de despliegue del harness (agent/assets) en ambos runtimes
fuentes: openspec/specs/installer-runtime/spec.md, cc-ein/README.md
lineas: n/a
:::

### Ciclo SDD determinista

:::caution[PENDIENTE-D]
falta: comparación del ciclo SDD (fases, gates) disponible en ambos runtimes
fuentes: cc-ein/README.md
lineas: n/a
:::

### Migración de instalación legacy

:::caution[PENDIENTE-D]
falta: comparación de soporte de migración legacy (existente en Pi, evidencia de spec)
fuentes: openspec/specs/installer-runtime/spec.md, pi-ein/README.md
lineas: n/a
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables limitada a las seis filas del roster cerrado
fuentes: openspec/changes/archive/core-parity/verify-report.md
lineas: 163
:::

## Siguiente paso

[CLI](../04-reference/cli.md)

## Fuentes

- `openspec/specs/installer-runtime/spec.md` — escenarios de instalación interactiva, no interactiva, aislada y de migración
- `pi-ein/README.md` — launcher y aislamiento de Pi
- `cc-ein/README.md` — launcher, aislamiento y ciclo SDD de Claude Code
- `installer/src/core/paths.ts` — mecanismo de resolución de rutas aisladas
- `openspec/changes/archive/core-parity/verify-report.md` — razón de exclusión de la línea `falta:` de `## En una frase` (línea 163)
