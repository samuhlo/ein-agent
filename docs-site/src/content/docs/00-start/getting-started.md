---
title: "Getting Started"
description: "Instalar EIN, añadir Claude opcionalmente y comprobar que el despliegue está sano."
sources: ["README.md", "installer/README.md"]
verified_rev: "eeceb7c"
---

De cero a EIN funcionando. Al terminar tendrás `ein`, su núcleo Pi desplegado
en una casa aislada y el diagnóstico en verde. Claude Code es opcional.

## Requisitos

- **macOS o Linux.** No hay soporte de Windows.
- **Pi Coding Agent.** Es el runtime principal de EIN; el instalador lo prepara.
- **Claude Code es opcional.** Puedes añadirlo como relevo durante la instalación.
- Un shell con `curl`.

El instalador comprueba y prepara sus propias dependencias durante `install`.

## 1. Instalar el binario

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bootstrap detecta tu plataforma, descarga el binario de la última release y lo
deja en `~/.local/bin/ein`, o en `/usr/local/bin` si es escribible.

:::note
Si `ein` no aparece tras instalarlo, `~/.local/bin` no está en tu `PATH`. Añádelo
y reabre la terminal.
:::

## 2. Instalar Ein y decidir si añadir Claude

```bash
ein
```

Se abre el menú con dos opciones: **Ein** y **Ein + Claude Code**. Pi se instala
siempre; Claude solo se prepara después como complemento aislado.

Si prefieres no pasar por el menú:

```bash
ein-install install --runtime pi        # solo Pi
ein-install install --runtime both      # Pi + complemento Claude Code
```

Con `--yes` no pregunta nada, y con `--dry-run` enseña el plan sin tocar nada —
útil la primera vez, para ver qué va a hacer antes de dejarle hacerlo.

## 3. Comprobar

```bash
ein-install doctor
```

Diagnostica el despliegue sin lanzar ningún runtime: rutas, dependencias,
superficies instaladas y configuración. Es el comando al que volver siempre que
algo se comporte raro.

Si algo sale en rojo, [Troubleshooting](/ein-agent/05-debug/troubleshooting/)
cubre los fallos más frecuentes.

## 4. Abrir EIN

Empieza por la aplicación:

```bash
ein
```

Abre la aplicación de terminal: estado del proyecto, configuración, sesiones
recientes, actualizaciones pendientes, y desde ahí eliges Pi o Claude Code y
lanzas. `tab` rota entre las vistas, `q` sale.

También puedes ir directo al runtime:

```bash
ein-pi      # Pi con EIN
ein-cc      # Claude Code con EIN
```

Son comandos distintos de `pi` y `claude` a propósito. Tus runtimes originales
siguen intactos y sin tocar; EIN vive en `~/.pi-ein/agent` y `~/.claude-ein`.

## Qué acabas de instalar

| Comando | Qué hace |
| :--- | :--- |
| `ein` | abre la aplicación de terminal |
| `ein-install` | menú interactivo del instalador |
| `ein-install install` | instala o repara |
| `ein-install update` | actualiza EIN y su plantilla, con backup previo |
| `ein-install doctor` | diagnostica sin lanzar runtimes |
| `ein-install uninstall` | elimina EIN y conserva auth, secrets y sesiones |
| `ein-install restore` | restaura desde un backup |

Cada `install` sobre un árbol existente, cada `update`, `uninstall` y `restore`
crea antes un directorio `.snapshot` respaldado por manifest. El restore valida
hashes y permisos, conserva el estado de usuario excluido y deja el árbol anterior
como `.recovery-*` pineado para reparación o limpieza explícita. Los `.tar.gz`
legacy requieren un instalador antiguo compatible o recuperación manual. Consulta
[Uninstall & Recovery](/ein-agent/05-debug/uninstall-recovery/).

La referencia completa de comandos y flags está en
[CLI](/ein-agent/04-reference/cli/).

## Siguiente

[First Run](/ein-agent/00-start/first-run/) — un cambio real de principio a fin,
para ver cómo se siente usar EIN.
