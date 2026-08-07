---
title: "Filesystem · EIN"
description: "Estructura de directorios y constantes de ruta del instalador de EIN"
sources: ["installer/src/core/paths.ts", "README.md", "pi-ein/README.md"]
verified_rev: "2f67c73"
---

# Filesystem

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije las constantes de ruta exportadas por `paths.ts` como la autoridad de dónde vive cada cosa
fuentes: installer/src/core/paths.ts
lineas: 113-136
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario o agente localizando ficheros) y qué se lleva (nombre y propósito de cada constante)
fuentes: installer/src/core/paths.ts
lineas: 14-56
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para localizar AGENT_DIR según instalación aislada o legacy
fuentes: installer/src/core/paths.ts
lineas: 44-56
:::

## Detalles

### Estructura de directorios

:::caution[PENDIENTE-D]
falta: mapa general de directorios que gestiona el instalador
fuentes: installer/src/core/paths.ts
lineas: 14-56
:::

### Constantes de ruta y su destino

:::caution[PENDIENTE-D]
falta: tabla de AGENT_DIR, SECRETS_DIR, ENGRAM_DIR, LOCAL_SKILLS_DIR, DOWNLOADED_SKILLS_DIR, BACKUP_DIR, BUN_BIN_DIR, LOCAL_BIN_DIR, MISE_SHIM_DIR con su destino
fuentes: installer/src/core/paths.ts
lineas: 113-136
:::

### Aislamiento de Pi: aislado frente a legacy

:::caution[PENDIENTE-D]
falta: comparación de resolución de rutas aislada (PI_CODING_AGENT_DIR) frente a legacy, con reescritura de rutas en migración
fuentes: installer/src/core/paths.ts, pi-ein/README.md
lineas: 44-56
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (nombre exacto de cada constante, sin literales de flag)
fuentes: installer/src/core/paths.ts
lineas: n/a
:::

## Siguiente paso

[Optional Tooling](./optional-tooling.md)

## Fuentes

- `installer/src/core/paths.ts` — tipos, funciones de resolución, constantes exportadas
- `README.md` — tabla de elección, launcher, hogar, runtime
- `pi-ein/README.md` — PI_CODING_AGENT_DIR y rutas reescritas en migración
