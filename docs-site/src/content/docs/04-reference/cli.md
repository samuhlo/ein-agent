---
title: "CLI · EIN"
description: "Referencia de comandos y flags del instalador de EIN"
sources: ["README.md", "installer/src/cli/install.ts", "installer/src/cli/menu.ts", "installer/src/cli/update.ts", "installer/src/cli/doctor.ts", "installer/src/cli/restore.ts", "installer/src/cli/uninstall.ts", "openspec/specs/installer-runtime/spec.md"]
verified_rev: "2f67c73"
---

# CLI

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije el conjunto de comandos del instalador (`ein`, `install`, `update`, `doctor`, `restore`, `uninstall`)
fuentes: README.md
lineas: 106-118
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario ejecutando el instalador) y qué se lleva (verbos y flags exactos)
fuentes: installer/src/cli/install.ts
lineas: 54-63
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para ejecutar `ein install` con flags comunes
fuentes: installer/src/cli/install.ts
lineas: 1-10
:::

## Detalles

### Comandos y flags

:::caution[PENDIENTE-D]
falta: enumeración de comandos (`ein`, `ein install`, `ein update`, `ein doctor`, `ein uninstall`, `ein restore`) y de `InstallFlags` (`--yes`, `--dry-run`, `--runtime`, `--no-*`)
fuentes: README.md, installer/src/cli/install.ts
lineas: 54-63
:::

### `install` paso a paso

:::caution[PENDIENTE-D]
falta: flujo de `ein install` (detectar, comprobar dependencias, instalar faltantes, desplegar, secrets, context7, marker, doctor) y menú de tres opciones
fuentes: installer/src/cli/install.ts, installer/src/cli/menu.ts, openspec/specs/installer-runtime/spec.md
lineas: 1-10
:::

### `update`, `doctor`, `restore` y `uninstall`

:::caution[PENDIENTE-D]
falta: descripción de `ein update` (updaters separados Pi/Ein), `ein doctor`, `ein restore` y `ein uninstall`
fuentes: README.md, installer/src/cli/update.ts, installer/src/cli/doctor.ts, installer/src/cli/restore.ts, installer/src/cli/uninstall.ts
lineas: 56-68
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (comandos existentes, flags exactos, sin constantes de directorio)
fuentes: installer/src/cli/install.ts
lineas: n/a
:::

## Siguiente paso

[Filesystem](./filesystem.md)

## Fuentes

- `README.md` — listado de comandos del instalador
- `installer/src/cli/install.ts` — `InstallFlags`, flujo de `install`
- `installer/src/cli/menu.ts` — menú interactivo de tres opciones
- `installer/src/cli/update.ts` — comando `update`
- `installer/src/cli/doctor.ts` — comando `doctor`
- `installer/src/cli/restore.ts` — comando `restore`
- `installer/src/cli/uninstall.ts` — comando `uninstall`
- `openspec/specs/installer-runtime/spec.md` — contrato de selección de runtime en `install`
