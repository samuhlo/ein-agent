---
title: "Desinstalar y recuperar"
description: "Recuperación del despliegue sin borrar estado privado."
sources: ["installer/src/cli/uninstall.ts", "installer/src/core/uninstall-recovery.ts", "installer/src/core/backup.ts", "installer/src/cli/restore.ts", "installer/src/core/pi-migration.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Puedes volver a `pi` o `claude` sin desinstalar Ein: esos comandos usan sus entradas vanilla. Esto no convierte automáticamente tus sesiones de Ein en sesiones del otro hogar.

## Desinstalar contenido gestionado

```bash
ein-install uninstall --dry-run
ein-install uninstall
```

El plan identifica activos propiedad de Ein y los mueve a una recuperación privada. Conserva autenticación, sesiones, historial, secretos, memoria y backups. No borra a ciegas el hogar entero ni archivos personales por coincidir sus nombres.

Si encuentra un marcador inválido o una recuperación incompleta, puede bloquear la operación. Conserva la ruta que muestra y revisa su estado antes de reintentar. No sustituyas ese diagnóstico por `rm -rf`.

`--runtime pi`, `--runtime claude` o `--runtime both` acotan **la desinstalación**. Esto no permite una instalación nueva solo de Claude: Pi sigue siendo el núcleo.

## Snapshots y restore

Los snapshots del árbol gestionado viven normalmente en `~/.pi-ein/agent/backups/installer/`, con manifest, metadata y contenido verificable. Se preparan antes de reemplazos gestionados; un dry-run o una operación sin cambios no implica crear otro snapshot.

Se deduplican árboles sin cambios y se podan snapshots no protegidos según la política de retención. `ein-install restore --pin <nombre>` protege uno y `--unpin` lo libera. Al restaurar se comprueban hashes, tamaños y modos antes de reemplazar contenido gestionado. Credenciales y sesiones quedan fuera de lo que se sobrescribe.

```bash
ein-install doctor
ein-install restore
```

Restore permite seleccionar un snapshot. El árbol reemplazado queda en una recuperación privada `.recovery-*`, protegida de poda automática. No se garantiza que restaurar resuelva un problema externo de dependencias, credenciales o red.

Los backups `.tar.gz` legacy se reconocen pero no se extraen con este instalador. Si necesitas uno, conserva el original y prepara una recuperación específica; no lo extraigas directamente sobre tu hogar activo.

## Hogares legacy

La migración solo actúa sobre instalaciones reconocidas como gestionadas por Ein. No reviertas moviendo `~/.pi-ein/agent` encima de `~/.pi/agent`: puede existir un hogar vanilla y estado nuevo en ambos. Diagnostica primero y conserva ambos árboles.

## Estado de tus proyectos

Desinstalar Ein no elimina tu código, `openspec/` ni el historial de decisiones del proyecto. Los ajustes `.pi/ein/` y el contexto `EIN.md` también pertenecen al proyecto. Decide por separado si deseas conservarlos; no es necesario borrarlos para reparar una instalación.

Las claves de `~/.config/opencode-secrets/` pueden seguir siendo útiles para otras herramientas. Borrarlas no forma parte del procedimiento normal de recuperación.
