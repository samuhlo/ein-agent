---
title: "Runtimes"
description: "Pi como núcleo y Claude como relevo opcional."
sources: ["ein-pi/README.md", "ein-cc/README.md"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

Pi Coding Agent es el runtime principal de Ein y se instala siempre. Claude Code es un complemento opcional con una superficie SDD menor. La entrada habitual es `ein`, que permite elegir el runtime disponible para el proyecto.

| Runtime | Acceso avanzado | Hogar de Ein |
| --- | --- | --- |
| Pi | `ein-pi` | `~/.pi-ein/agent` |
| Claude Code | `ein-cc` | `~/.claude-ein` |

Los accesos avanzados son funciones Fish. Los comandos `pi` y `claude` mantienen sus usos vanilla. Compartir proyecto no significa compartir el historial privado de conversación.

## Elegir sin suponer paridad

Usa Pi para el flujo completo: descubrimiento de intención, configuración interactiva, modelos por rol, selección proactiva de skills y extensiones de contexto y evidencia. Claude puede retomar estado SDD y acuerdos confirmados, usando su CLI y sus hooks.

Los acuerdos gestionados nuevos o modificados se resuelven en Pi antes de pasarlos a Claude. Un handoff abre una sesión nueva apoyada en el estado del proyecto; no transfiere la conversación del runtime anterior.

Consulta [Pi](/ein-agent/03-runtimes/pi-coding-agent/), [Claude](/ein-agent/03-runtimes/claude-code/) y la [matriz de capacidades](/ein-agent/03-runtimes/runtime-matrix/).
