---
title: "Uninstall & Recovery · EIN"
description: "Desinstalación, backup, restauración y reversión de migración de Pi"
sources: ["installer/src/cli/uninstall.ts", "installer/src/cli/restore.ts", "installer/src/core/backup.ts", "pi-ein/README.md"]
verified_rev: "2f67c73"
---

# Uninstall & Recovery

## En una frase

:::caution[PENDIENTE-D]
falta: una frase que fije el flujo reversible de desinstalación, backup y restauración
fuentes: installer/src/core/backup.ts
lineas: 1-6
:::

## Para quién y qué aprenderás

:::caution[PENDIENTE-D]
falta: para quién es esta página (usuario desinstalando o recuperando) y qué se lleva (qué se elimina, qué se conserva, cómo restaurar)
fuentes: installer/src/cli/uninstall.ts
lineas: n/a
:::

## Ruta rápida

:::caution[PENDIENTE-D]
falta: happy path numerado para ejecutar `ein uninstall` y, si hace falta, `ein restore`
fuentes: installer/src/cli/uninstall.ts, installer/src/cli/restore.ts
lineas: n/a
:::

## Detalles

### Desinstalación

:::caution[PENDIENTE-D]
falta: qué elimina `ein uninstall` y qué conserva (auth, secrets, sesiones)
fuentes: installer/src/cli/uninstall.ts
lineas: n/a
:::

### Backup y restauración

:::caution[PENDIENTE-D]
falta: snapshot, `BACKUP_EXCLUDE`, `KEEP_COUNT = 5` y `restoreBackup()`
fuentes: installer/src/core/backup.ts, installer/src/cli/restore.ts
lineas: 29-46
:::

### Reversión de la migración de Pi

:::caution[PENDIENTE-D]
falta: reversión de migración (mv de vuelta o restauración desde `.tar.gz`)
fuentes: pi-ein/README.md, installer/src/core/backup.ts
lineas: 28-29
:::

## Checklist

:::caution[PENDIENTE-D]
falta: lista de afirmaciones confirmables (qué se conserva, valor de KEEP_COUNT, comando de reversión)
fuentes: installer/src/core/backup.ts
lineas: n/a
:::

## Siguiente paso

Esta es la última página de la cadena de lectura de referencia y debug; no enlaza a una página siguiente.

## Fuentes

- `installer/src/cli/uninstall.ts` — qué elimina la desinstalación
- `installer/src/cli/restore.ts` — restauración de backup
- `installer/src/core/backup.ts` — snapshot, exclusiones, KEEP_COUNT
- `pi-ein/README.md` — reversión de migración legacy
