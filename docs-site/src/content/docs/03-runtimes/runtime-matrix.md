---
title: "Matriz de runtimes"
description: "Comparación Pi vs Claude Code con las capacidades que se pueden comprobar."
sources: ["README.md", "cc-ein/README.md", "openspec/specs/installer-runtime/spec.md", "openspec/changes/archive/core-parity/verify-report.md"]
verified_rev: "eeceb7c"
---

Esta tabla solo incluye filas **comprobables contra código o especificación**.
Lo que no tiene evidencia no aparece como paridad: aparece más abajo, en lo que
no se puede afirmar.

## Lo comprobable

| Capacidad | Pi Coding Agent | Claude Code |
| :--- | :--- | :--- |
| Instalación interactiva (menú) | sí | sí |
| Instalación no interactiva (`--runtime`) | sí | sí |
| Superficie aislada del runtime vanilla | `~/.pi-ein/agent` | `~/.claude-ein` |
| Despliegue del núcleo compartido | sí | sí, traducido por `sync.ts` |
| Ciclo SDD determinista | comandos `/ein:*` | binario `cc-ein-sdd` |
| Migración de instalación legacy | sí, con backup | no aplica |

Los dos runtimes se instalan, se aíslan y ejecutan el mismo ciclo SDD. Esa es la
parte sólida.

## Lo que NO se puede afirmar

:::caution[SIN EVIDENCIA REPRODUCIBLE]
Estas capacidades **no** están verificadas contra servicios reales, así que no
figuran como paridad. Que existan no significa que estén demostradas.
:::

**Paridad de MCP externo.** Las integraciones opcionales (Context7, Engram,
Linear, Codegraph, Hypa) se configuran en ambos, pero la evidencia archivada de
la paridad entre runtimes registra que el MCP externo de Claude **no se ejercitó
contra servicios en vivo**. Está soportado, no comprobado.

**Rendimiento.** No hay medición comparada. Cualquier afirmación sobre cuál va
más rápido sería inventada.

**Inyección proactiva de skills.** El mecanismo difiere entre runtimes y la
traducción es aproximada por diseño. No hay equivalencia 1:1 que demostrar.

## Diferencias que no son huecos

Algunas cosas son distintas sin que ninguna sea peor:

| | Pi | Claude Code |
| :--- | :--- | :--- |
| Cómo se consulta el estado SDD | comandos del runtime | binario compilado |
| Cómo se actualiza | `ein-install update` + `pi-ein update --all` | `ein-install update` + `bun cc-ein/sync.ts` |
| Gate de comandos | política del coordinador | hook sobre shell |

## Cómo elegir

Si ya usas uno de los dos, usa ese. La diferencia de capacidades no justifica
cambiar de agente.

Si usas los dos, instala `both`: cada uno mantiene su casa y puedes abrir el
mismo proyecto con cualquiera. El estado del cambio está en `openspec/`, así que
viaja; los historiales de conversación no.

## Por qué esta página es tan corta

Porque una matriz de runtimes larga sería, en su mayoría, marketing.

Las filas que se podrían añadir —integraciones, extensiones, comportamiento del
modelo— no tienen medición detrás. Ponerlas con un ✓ en ambas columnas daría una
impresión de equivalencia que nadie ha comprobado.

## Siguiente

[CLI](/ein-agent/04-reference/cli/) — la referencia de comandos.
