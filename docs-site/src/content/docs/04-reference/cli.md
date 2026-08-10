---
title: "CLI"
description: "La aplicación de terminal, los comandos del instalador y sus flags."
sources: ["README.md", "installer/README.md", "ein-pi/agent/app.ts", "ein-pi/agent/surfaces/terminal-app-entrypoint.ts", "installer/src/cli/install.ts", "installer/src/cli/menu.ts", "installer/src/cli/doctor.ts", "installer/src/cli/update.ts", "installer/src/cli/restore.ts", "installer/src/cli/uninstall.ts"]
verified_rev: "eeceb7c"
---

Hay dos binarios y hacen cosas distintas:

- **`ein`** abre la aplicación de terminal. Es desde donde se ve y se controla
  el proyecto.
- **`ein-install`** gestiona la instalación, la actualización y el diagnóstico.
  No lanza los runtimes: eso lo hacen `pi-ein`, `cc-ein` y la propia app.

Si vienes de una versión anterior, `ein` era el instalador. Los verbos viejos
siguen reconocidos y te dicen dónde han ido:

```bash
$ ein update
`ein update` ahora es `ein-install update`.
`ein` sin argumentos abre la aplicación.
```

## La aplicación

### `ein`

Abre la aplicación de terminal. Cinco vistas que rotan con `tab`:

| Vista | Qué muestra |
| :--- | :--- |
| Estado | Proyecto, fase de OpenSpec, verificación y git |
| Configuración | Modo de trabajo, TDD, Hypa, CodeGraph y persona |
| Sesiones | Las recientes, con la última cosa que pediste en cada una |
| Sistema | Actualizaciones por componente y diagnóstico |
| Runtime | Elegir Pi o Claude Code, ver sus sesiones y lanzar |

Atajos: `j`/`k` o flechas para moverte, `g`/`G` a los extremos, `f` o `/` para
buscar, `enter` para actuar sobre la fila, `q` para salir.

Cada fila declara su fuente entre corchetes, y **un dato desconocido se
distingue de uno vacío**: `unknown` no es lo mismo que `—`. La aplicación
presenta estado; no lo inventa.

```bash
ein                      # abre la aplicación
ein --project <ruta>     # sobre otro proyecto
ein --once               # pinta una vez y sale (útil en scripts)
ein --no-intro           # sin animación de arranque
```

Sin terminal interactiva —una tubería, un terminal sin capacidades— pinta la
vista una vez, lo declara y sale con 0. No finge ser interactiva.

## El instalador

### `ein-install install`

Instala o repara EIN: comprueba dependencias, instala las que falten, despliega
las superficies, configura secrets y ejecuta el doctor al terminar.

Sobre un árbol existente crea un backup antes de tocar nada.

```bash
ein-install install --runtime pi|claude|both
```

### `ein-install update`

Actualiza EIN y su plantilla desde la release estable de GitHub. Verifica el
payload antes de aplicar, y crea backup con posibilidad de rollback.

**No actualiza el runtime.** Para Pi, eso es `pi-ein update --all`. Para Claude
Code, `bun cc-ein/sync.ts` desde un checkout del repositorio.

### `ein-install doctor`

Diagnostica el despliegue sin lanzar ningún runtime. Es el primer comando al que
volver cuando algo va raro.

Sale con código 0 si el resultado es OK o WARN, y 1 si hay algún FAIL.

### `ein-install uninstall`

Elimina EIN **conservando** `auth.json`, secrets y sesiones. Crea backup antes.

### `ein-install restore`

Restaura desde un backup previo.

## Flags

| Flag | Qué hace |
| :--- | :--- |
| `--runtime pi\|claude\|both` | qué superficie desplegar |
| `--yes` | no interactivo, acepta los valores por defecto |
| `--dry-run` | enseña el plan sin ejecutar nada |
| `--no-engram` | omite la memoria persistente |
| `--no-secrets` | omite la configuración de secrets |
| `--no-linear` | omite la integración con Linear |
| `--no-hypa` | omite Hypa |
| `--no-codegraph` | omite el grafo de código |

:::tip[LA PRIMERA VEZ]
`ein-install install --dry-run` enseña exactamente qué va a hacer sin tocar nada. Vale
la pena antes de la primera instalación.
:::

## Comandos del flujo SDD

Estos no vienen del instalador: pertenecen al runtime.

**En Claude Code**, un binario:

```bash
cc-ein-sdd status [cambio]     # fase actual y qué falta
cc-ein-sdd check  [cambio]     # valida los artefactos
cc-ein-sdd close  <cambio>     # archiva un cambio verificado
```

**En Pi**, comandos del agente: `/ein:status`, `/ein:sdd-next <cambio>`,
`/ein:doctor-output`, `/ein:init`.

## Riesgos que conviene conocer

**`ein-install update` puede cambiar la plantilla.** Crea backup y permite rollback,
pero si tienes modificaciones a mano en la casa de EIN, revísalas antes.

**`ein-install uninstall` no borra tus credenciales** a propósito. Si quieres una
limpieza total, hay que borrarlas aparte.

**Ningún comando toca tus runtimes vanilla.** `~/.pi/agent` y `~/.claude` no
están en el alcance de este binario, salvo la migración explícita de una
instalación legacy de EIN.

## Siguiente

[Filesystem](/ein-agent/04-reference/filesystem/) — qué directorios usa y cuáles
no.
