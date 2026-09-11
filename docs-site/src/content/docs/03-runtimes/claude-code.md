---
title: "Claude Code"
description: "Relevo SDD con límites explícitos."
sources: ["ein-cc/README.md", "ein-cc/sync.ts", "ein-cc/sdd-cli/cli.ts"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

Añade Claude con `ein-install install --runtime both`. La aplicación `ein` permite arrancarlo; `ein-cc` es el acceso avanzado en Fish. Su hogar de configuración es `~/.claude-ein`.

## Estado compartido, sesiones separadas

Claude consume los artefactos en `openspec/` y los ajustes de `.pi/ein/`. Puede retomar un acuerdo ya confirmado. La captura de respuestas para acuerdos gestionados nuevos o modificados corresponde a Pi: resuelve esa parte antes del handoff.

`/ein:handoff status`, `/ein:handoff to pi` y `/ein:handoff to claude` permiten consultar o cambiar de runtime. El destino empieza una sesión nueva; no se transfieren historiales privados.

## Herramientas y modelos

Los agentes acceden por Bash a `ein-cc-sdd`: estado, validación, progreso, resumen y cierre usan el núcleo compartido. El sincronizador traduce una lista concreta de herramientas Pi; no existe equivalencia automática para toda extensión nueva.

El adaptador declara Opus con esfuerzo alto en scope, design y tasks; Sonnet con esfuerzo bajo en apply; Haiku en map, verify, close y auxiliares. La selección se genera al sincronizar, no mediante `/ein:models` en Claude.

`/ein:status` y `/ein:settings` muestran el estado y los ajustes. Los selectores interactivos se cambian en Pi o en la aplicación. Las directivas no soportadas o inactivas se identifican; no se presentan como aplicadas.

## Qué cambia respecto a Pi

La inyección proactiva de skills de Pi no tiene equivalente completo: Claude usa descubrimiento nativo y rutas explícitas. Sus hooks tampoco sustituyen todas las capacidades Pi de contexto, evidencia y reejecución de acceptance.

El hook de Bash aplica patrones compartidos de denegación y confirmación. No intercepta todas las escrituras ni constituye un sandbox de shell. Cleaner y Architect automáticos no se ejecutan en Claude.

Context7 se configura cuando está disponible. Hay smokes históricos de conexión; no certifican disponibilidad permanente ni paridad de todos los servicios. El login compartido puede dar acceso a conectores de la misma cuenta aunque los hogares locales estén separados.

El sync retira la entrada MCP antigua de Engram solo si conserva la firma gestionada por Ein. Las configuraciones personalizadas y los datos se preservan; consulta [la retirada de Engram](/ein-agent/04-reference/optional-tooling/#engram-retirado).

## Desarrollo

`bun ein-cc/sync.ts`, desde la raíz del repositorio, reconstruye y despliega el adaptador. `CLAUDE.md` es generado: edita `CLAUDE.adapter.md` o la fuente compartida. Reinicia la sesión tras sincronizar. Consulta la [matriz](/ein-agent/03-runtimes/runtime-matrix/).
