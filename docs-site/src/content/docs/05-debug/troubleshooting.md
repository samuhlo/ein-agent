---
title: "Troubleshooting · EIN"
description: "Catálogo síntoma-causa-acción de fallos frecuentes del instalador"
sources: ["installer/src/core/verify.ts", "installer/src/cli/doctor.ts", "docs/roadmap-beta.md"]
verified_rev: "2f67c73"
---

# Troubleshooting

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije esta página como catálogo síntoma → causa → acción, complementario de [Doctor](./doctor.md)
fuentes: installer/src/core/verify.ts
lineas: n/a
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario con un fallo concreto) y qué se lleva (categoría de fallo y acción, sin reexplicar niveles de doctor)
fuentes: installer/src/core/verify.ts
lineas: n/a
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para identificar la categoría de un fallo y remitir a doctor.md si aplica
fuentes: installer/src/core/verify.ts
lineas: n/a
:::

## Detalles

### Categorías de fallo

:::caution[PENDIENTE-D]
falta: enumeración de categorías de fallo (plataforma, dependencias, paths, markers, despliegues)
fuentes: installer/src/core/verify.ts
lineas: n/a
:::

### Del síntoma al diagnóstico

:::caution[PENDIENTE-D]
falta: remisión a [Doctor](./doctor.md) para interpretar niveles y grupos de checks, sin reenumerarlos aquí
fuentes: installer/src/cli/doctor.ts
lineas: 22-44
:::

### Patrones de error frecuentes

:::caution[PENDIENTE-D]
falta: patrones concretos (falta Bun, falta binario Pi, paths inválidas, marker dañado) y su causa
fuentes: installer/src/core/verify.ts, docs/roadmap-beta.md
lineas: n/a
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (categorías de fallo, enlace a doctor, sin reexplicar sus niveles)
fuentes: installer/src/core/verify.ts
lineas: n/a
:::

## Siguiente paso

[Uninstall & Recovery](./uninstall-recovery.md)

## Fuentes

- `installer/src/core/verify.ts` — grupos de checks y qué falla
- `installer/src/cli/doctor.ts` — referencia de niveles (remitida, no reexplicada)
- `docs/roadmap-beta.md` — estado beta general
