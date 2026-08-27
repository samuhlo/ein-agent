---
title: "Pi Coding Agent"
description: "Cómo usar EIN con Pi: superficie, migración y particularidades."
sources: ["README.md", "ein-pi/README.md"]
verified_rev: "eeceb7c"
---

Pi es el runtime para el que nació EIN, y donde la superficie está más completa.

## Instalar y abrir

```bash
ein-install install --runtime pi
ein                         # entrada normal
ein-pi                      # acceso directo avanzado
```

`ein-pi` es una función de shell que exporta `PI_CODING_AGENT_DIR` y
`EIN_PI_AGENT_HOME` **solo para esa invocación**, y arranca Pi apuntando a
`~/.pi-ein/agent`.

Tu `pi` de siempre sigue usando `~/.pi/agent` y no se entera de nada.

## Dónde vive

```text
~/.pi-ein/agent/          la casa de EIN para Pi
├── agents/               ejecutores de fase
├── skills/               local/ y downloaded/
├── extensions/           extensiones del runtime
├── backups/installer/    snapshots del instalador
└── auth.json             tu autenticación
```

## Migrar desde una instalación antigua

Si tienes una instalación previa de EIN dentro de `~/.pi/agent`, el instalador
la mueve a la casa aislada. Pero solo si encuentra un marcador válido de EIN:
**un directorio vanilla de Pi no se toca**.

La migración crea un backup `.tar.gz`, mueve el árbol y reescribe las rutas
absolutas de la plantilla. Conserva login, sesiones e historial.

Desde un checkout del repositorio puedes inspeccionarla antes:

```bash
bun ein-pi/migrate.ts --dry     # enseña qué haría
bun ein-pi/migrate.ts           # la ejecuta
```

Revertir es mover `~/.pi-ein/agent` de vuelta a `~/.pi/agent`, o restaurar el
backup.

## Dos actualizaciones que no se mezclan

Esto confunde al principio, y la separación es deliberada:

```bash
ein-pi update --all    # actualiza Pi: binario, extensiones, paquetes
ein-install update             # actualiza EIN: instalador y plantilla
```

`ein-install update` usa la release estable de GitHub, verifica el payload y actualiza
con backup y rollback. No es un actualizador de Pi.

## Particularidades

**Los subagentes van por la herramienta visible de delegación.** Los subagentes
integrados del runtime están desactivados a propósito: toda la delegación pasa
por la superficie de EIN, que es la que aplica los contratos de fase.

**El enrutado de modelos viene de la configuración de EIN**, no de decisiones
sobre la marcha. Cada agente tiene su modelo declarado.

**Comandos del flujo:** `/ein:status`, `/ein:sdd-next`, `/ein:doctor-output`,
`/ein:init`. Los `/skill:*` nativos siguen disponibles como escape.

## Siguiente

[Claude Code](/ein-agent/03-runtimes/claude-code/) — el otro adaptador y en qué
cambia.
