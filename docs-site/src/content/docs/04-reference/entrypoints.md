---
title: "Entry points"
description: "Quién posee cada comando y qué código ejecuta realmente."
sources: ["installer/src/core/command-names.ts", "installer/scripts/build-terminal-app.ts", "ein-pi/agent/app.ts", "ein-pi/launchers/ein-pi.fish", "ein-cc/launchers/ein-cc.fish"]
verified_rev: "5251cab"
---

Ein expone una puerta pública y conserva dos accesos avanzados a los runtimes.
Sus nombres se parecen, pero no tienen el mismo dueño.

| Comando | Dueño en el repo | Destino instalado | Responsabilidad |
| :--- | :--- | :--- | :--- |
| `ein` | `ein-pi/agent/app.ts` | `~/.local/bin/ein` | aplicación terminal, proyecto, sesiones y selección de runtime |
| `ein-install` | `installer/src/main.ts` | `~/.local/bin/ein-install` | install, update, doctor, restore y uninstall |
| `ein-pi` | `ein-pi/launchers/ein-pi.fish` | función Fish | arrancar Pi con el hogar aislado de Ein |
| `ein-cc` | `ein-cc/launchers/ein-cc.fish` | función Fish | supervisar Claude Code con el hogar aislado de Ein |

## Recorrido de `ein`

`installer/scripts/build-terminal-app.ts` compila `ein-pi/agent/app.ts` para la
plataforma objetivo. Durante install o update, el instalador conserva una copia
de sí mismo como `ein-install` y promociona esa aplicación compilada como `ein`.

La aplicación delega los verbos de ciclo de vida en `ein-install`. Así se puede
reparar o actualizar una instalación aunque la interfaz principal esté dañada.

## Accesos avanzados

Los launchers de `ein-pi` y `ein-cc` no son la aplicación pública. Son funciones
Fish pequeñas que fijan el hogar aislado y arrancan el runtime correspondiente.
El instalador copia esos ficheros fuente a `~/.config/fish/functions/`.
