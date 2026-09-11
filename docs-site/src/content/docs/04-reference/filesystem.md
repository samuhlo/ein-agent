---
title: "Archivos y hogares"
description: "Qué pertenece al proyecto, al runtime y al instalador."
sources: ["installer/src/core/paths.ts", "installer/src/core/uninstall-plan.ts", "ein-pi/README.md", "ein-cc/README.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Ein separa estado del proyecto, hogares de runtimes y herramientas de instalación. La ubicación exacta del binario depende del directorio elegido por el bootstrap.

| Ruta habitual | Contenido |
| --- | --- |
| `~/.local/bin/ein` | Aplicación de terminal. |
| `~/.local/bin/ein-install` | Instalador y vía de reparación. |
| `~/.pi-ein/agent/` | Runtime Pi de Ein: instrucciones, agentes, extensiones, ajustes y estado privado. |
| `~/.claude-ein/` | Adaptación Claude, agentes, skills y estado privado. |
| `~/.claude-ein/bin/ein-cc-sdd` | CLI SDD compilado de Claude. |
| `~/.config/fish/functions/` | Funciones avanzadas `ein-pi` y `ein-cc`. |
| `~/.config/opencode-secrets/` | Claves de integraciones configuradas por el instalador. |
| `~/.engram-ein/` | Datos de Engram cuando está habilitado. |
| `openspec/` dentro del proyecto | Specs, cambios activos y resúmenes archivados. |
| `.pi/ein/` dentro del proyecto | Ajustes y estado de Ein compartidos por los adaptadores. |
| `EIN.md` dentro del proyecto | Contexto del proyecto para los agentes. |

El bootstrap puede elegir `/usr/local/bin` cuando es escribible. El instalador también configura superficies de shell y puede añadir el export de Context7; el aislamiento no significa que nunca ajuste el PATH o el archivo de inicio del shell.

## Hogares vanilla

`pi` usa normalmente `~/.pi/agent`; `claude`, `~/.claude`. Ein entra por sus launchers y hogares propios. Una instalación legacy solo se migra cuando se reconoce un marcador válido de propiedad de Ein. Un directorio con el mismo nombre no basta para autorizar borrarlo.

## Recuperación

Los snapshots gestionados viven normalmente en `~/.pi-ein/agent/backups/installer/`. Credenciales y sesiones no se incluyen como contenido a sobrescribir al restaurar. Un uninstall mueve activos reconocidos de Ein a recuperación privada y conserva estado del usuario; no elimina a ciegas todo el hogar.

No borres directorios completos ni credenciales para reparar un archivo desplegado. Usa [doctor](/ein-agent/05-debug/doctor/) y el [procedimiento de recuperación](/ein-agent/05-debug/uninstall-recovery/).
