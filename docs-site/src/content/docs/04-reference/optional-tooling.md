---
title: "Optional Tooling · EIN"
description: "Integraciones opcionales del instalador: Engram, Linear, Context7, Codegraph y Hypa"
sources: ["installer/src/core/deps.ts", "installer/src/core/engram.ts", "installer/src/core/secrets.ts", "installer/src/core/launcher.ts", "ein-pi/agent/mcp.json", "cc-ein/README.md"]
verified_rev: "2f67c73"
---

# Optional Tooling

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije las cinco integraciones opcionales (Engram, Linear, Context7, Codegraph, Hypa) y su naturaleza desactivable
fuentes: installer/src/core/deps.ts
lineas: n/a
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario decidiendo qué integraciones activar) y qué se lleva (qué es cada una, dónde vive su clave, qué pasa si falta)
fuentes: installer/src/core/secrets.ts
lineas: n/a
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para revisar qué integraciones están activas, remitiendo a cli.md para el flag de exclusión
fuentes: installer/src/core/deps.ts
lineas: n/a
:::

## Detalles

### Cómo se activan y se desactivan

:::caution[PENDIENTE-D]
falta: mecanismo general de activación/desactivación de integraciones opcionales, con remisión a [CLI](../04-reference/cli.md) para la sintaxis de flags
fuentes: installer/src/core/deps.ts
lineas: n/a
:::

### Engram

:::caution[PENDIENTE-D]
falta: qué es Engram, dónde vive su directorio, qué pasa si falta
fuentes: installer/src/core/engram.ts
lineas: n/a
:::

### Linear

:::caution[PENDIENTE-D]
falta: qué es Linear, dónde vive su clave, qué pasa si falta
fuentes: installer/src/core/secrets.ts
lineas: n/a
:::

### Context7

:::caution[PENDIENTE-D]
falta: qué es Context7, dónde vive su clave, exportación en el launcher
fuentes: installer/src/core/secrets.ts, installer/src/core/launcher.ts
lineas: n/a
:::

### Codegraph y Hypa

:::caution[PENDIENTE-D]
falta: qué son Codegraph y Hypa, cómo se instalan de forma opcional
fuentes: installer/src/core/deps.ts
lineas: n/a
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (cinco integraciones, ninguna con literal de flag)
fuentes: installer/src/core/deps.ts
lineas: n/a
:::

## Siguiente paso

[Doctor](../05-debug/doctor.md)

## Fuentes

- `installer/src/core/deps.ts` — instalación opcional de Codegraph y Hypa
- `installer/src/core/engram.ts` — integración Engram
- `installer/src/core/secrets.ts` — claves de Linear y Context7
- `installer/src/core/launcher.ts` — exportación de variables para Context7
- `ein-pi/agent/mcp.json` — configuración MCP local
- `cc-ein/README.md` — Context7 y Engram en `.claude.json` a scope user
