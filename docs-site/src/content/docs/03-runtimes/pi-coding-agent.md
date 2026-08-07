---
title: "Pi Coding Agent · EIN"
description: "Uso, configuración aislada y migración del adaptador de runtime Pi"
sources: ["pi-ein/README.md", "README.md", "installer/src/core/paths.ts", "installer/src/core/pi-migration.ts", "openspec/specs/installer-runtime/spec.md"]
verified_rev: "2f67c73"
---

# Pi Coding Agent

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije pi-ein como el adaptador aislado de runtime Pi, lanzado con el comando `pi-ein`
fuentes: pi-ein/README.md
lineas: 8-9
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario del runtime Pi) y qué se lleva (lanzamiento, aislamiento, migración)
fuentes: pi-ein/README.md
lineas: 1-4
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para lanzar Ein en Pi de forma aislada
fuentes: pi-ein/README.md
lineas: 8-9
:::

## Detalles

### Lanzar Ein en Pi

:::caution[PENDIENTE-D]
falta: comando `pi-ein` y su instalación directa vía `cp pi-ein/pi-ein.fish`
fuentes: pi-ein/README.md
lineas: 8-9
:::

### Configuración aislada

:::caution[PENDIENTE-D]
falta: PI_CODING_AGENT_DIR, EIN_PI_AGENT_HOME y la resolución de rutas aislado-vs-legacy
fuentes: pi-ein/README.md, installer/src/core/paths.ts
lineas: 16-19
:::

### Migración desde una instalación legacy

:::caution[PENDIENTE-D]
falta: flujo de migración (backup, reescritura de rutas) desde instalación legacy a aislada
fuentes: pi-ein/README.md, installer/src/core/pi-migration.ts
lineas: 21-29
:::

### Simetría con el adaptador de Claude

:::caution[PENDIENTE-D]
falta: tabla comando|config|qué es comparando pi-ein y cc-ein, con enlace a claude-code.md
fuentes: pi-ein/README.md
lineas: 5-12
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (comando de lanzamiento, variable de aislamiento, comando de migración)
fuentes: pi-ein/README.md
lineas: n/a
:::

## Siguiente paso

[Claude Code](./claude-code.md)

## Fuentes

- `pi-ein/README.md` — comando de lanzamiento, aislamiento, migración legacy
- `README.md` — instalación con menú de selección
- `installer/src/core/paths.ts` — resolución de rutas aislado vs legacy
- `installer/src/core/pi-migration.ts` — implementación de migración
- `openspec/specs/installer-runtime/spec.md` — escenario de instalación aislada de Pi
