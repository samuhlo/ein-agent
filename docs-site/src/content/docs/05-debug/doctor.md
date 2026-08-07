---
title: "Doctor · EIN"
description: "Referencia de la herramienta doctor: grupos, checks y niveles OK, WARN y FAIL"
sources: ["installer/src/cli/doctor.ts", "installer/src/core/verify.ts"]
verified_rev: "2f67c73"
---

# Doctor

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije doctor como la herramienta de diagnóstico que renderiza grupos de checks con tres niveles
fuentes: installer/src/cli/doctor.ts
lineas: 22-44
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario interpretando el resultado de `ein doctor`) y qué se lleva (semántica de los tres niveles)
fuentes: installer/src/cli/doctor.ts
lineas: 12-20
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para ejecutar doctor y leer la decisión final
fuentes: installer/src/cli/doctor.ts
lineas: 36-42
:::

## Detalles

### Qué comprueba

:::caution[PENDIENTE-D]
falta: enumeración de grupos y checks de `DoctorReport` (`renderReport`)
fuentes: installer/src/cli/doctor.ts, installer/src/core/verify.ts
lineas: 22-44
:::

### Niveles OK, WARN y FAIL

:::caution[PENDIENTE-D]
falta: semántica de los tres niveles y su mapeo de glifo y color
fuentes: installer/src/cli/doctor.ts
lineas: 12-20
:::

### Cómo interpretar la decisión final

:::caution[PENDIENTE-D]
falta: texto de decisión (FAIL bloqueante, WARN recomendado revisar, OK listo)
fuentes: installer/src/cli/doctor.ts
lineas: 36-42
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (tres niveles exactos, sin reenumerar síntomas de troubleshooting)
fuentes: installer/src/cli/doctor.ts
lineas: n/a
:::

## Siguiente paso

[Troubleshooting](./troubleshooting.md)

## Fuentes

- `installer/src/cli/doctor.ts` — `renderReport`, glifos, niveles, decisión final
- `installer/src/core/verify.ts` — `DoctorReport`, grupos de comprobaciones
