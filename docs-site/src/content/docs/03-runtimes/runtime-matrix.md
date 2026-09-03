---
title: "Matriz de runtimes"
description: "Comparación Pi vs Claude Code con las capacidades que se pueden comprobar."
sources: ["README.md", "ein-cc/README.md", "openspec/specs/installer-runtime/spec.md", "openspec/changes/archive/core-parity/summary.md"]
verified_rev: "405a6c1"
---

Esta matriz separa la continuidad del estado de las superficies propias de cada
runtime y de la paridad que no está verificada o no existe. Pi es el runtime de
referencia; Claude Code funciona como relevo sobre el mismo proyecto, no como
una sesión equivalente.

## Continuidad de estado compartida

Ambos runtimes pueden leer las decisiones persistidas del cambio y continuar el
trabajo en ambos sentidos mediante el proyecto y su checkpoint en disco. Esta
continuidad comparte estado auditable, no conversaciones, sesiones ni todas las
capacidades del runtime.

| Estado compartido comprobable | Pi Coding Agent | Claude Code |
| :--- | :--- | :--- |
| Proyecto y cambio en `openspec/` | lee y actualiza el estado | lee y actualiza el estado |
| Carril y postura TDD del cambio | consume la declaración persistida | consume la declaración persistida |
| Checkpoint para el relevo | escribe y retoma desde disco | escribe y retoma desde disco |
| Continuidad Pi ↔ Claude | sí, por proyecto/checkpoint | sí, por proyecto/checkpoint |

La continuidad del proyecto es la capacidad compartida comprobada. No demuestra
que las sesiones, las herramientas o la interfaz sean iguales.

## Superficies específicas del runtime

| Superficie | Pi Coding Agent | Claude Code |
| :--- | :--- | :--- |
| Papel operativo | runtime de referencia | runtime de relevo |
| Consulta del estado activo | panel vivo y comandos `/ein:*`; atajo `ctrl+shift+e` | `/ein:status` |
| Configuración | superficies propias de Pi | `/ein:settings` |
| Ejecución del flujo | comandos del runtime y coordinador | binario `ein-cc-sdd` y hook sobre shell |
| Cleaner y Architect automáticos | `Pi-only`; disponibles | ausentes o desactivados; no aplicable/no soportado |
| Casa aislada | `~/.pi-ein/agent` | `~/.claude-ein` |

Cleaner y Architect permanecen deliberadamente en la superficie Pi-only. Claude
no los ejecuta automáticamente ni convierte su ausencia en una capacidad
compartida.

## Límites de paridad

:::caution[SIN PARIDAD DEMOSTRADA]
La continuidad por checkpoint no autoriza a inferir paridad 1:1. Las filas
siguientes marcan capacidades diferentes, ausentes o no verificadas.
:::

| Dimensión | Límite observable |
| :--- | :--- |
| Skills | No hay paridad 1:1; la traducción entre runtimes es aproximada por diseño. |
| Herramientas | Las superficies y la disponibilidad difieren; no se afirma equivalencia. |
| Sesiones e historiales | Los historiales de conversación permanecen privados; no se comparte la sesión. |
| MCP externo | El MCP externo de Claude no está verificado contra servicios en vivo; no se presenta como paridad. |
| Cleaner y Architect | La participación automática está ausente en Claude; su estado es no aplicable/no soportado. |

Que una integración o una capacidad esté configurada no significa que su
paridad esté verificada. El estado desconocido permanece visible y no se
redacta como éxito silencioso.

## Cómo elegir

Si ya usas uno de los dos, usa ese. Si usas ambos, instala `both`: cada runtime
mantiene su casa y puede abrir el mismo proyecto con el estado persistido en
disco. Cambiar de runtime conserva el checkpoint, pero no recupera el historial
privado ni añade las superficies ausentes.

## Siguiente

[CLI](/ein-agent/04-reference/cli/) — la referencia de comandos.
