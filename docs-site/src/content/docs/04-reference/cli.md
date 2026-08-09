---
title: "CLI"
description: "Los comandos del instalador y los flags disponibles."
sources: ["README.md", "installer/README.md", "installer/src/cli/install.ts", "installer/src/cli/menu.ts", "installer/src/cli/doctor.ts", "installer/src/cli/update.ts", "installer/src/cli/restore.ts", "installer/src/cli/uninstall.ts"]
verified_rev: "29861f5"
---

El binario `ein` gestiona la instalación, la actualización y el diagnóstico. No
lanza los runtimes: eso lo hacen `pi-ein` y `cc-ein`.

## Comandos

### `ein`

Abre el menú interactivo. Es el punto de entrada si no tienes claro qué quieres
hacer.

### `ein install`

Instala o repara EIN: comprueba dependencias, instala las que falten, despliega
las superficies, configura secrets y ejecuta el doctor al terminar.

Sobre un árbol existente crea un backup antes de tocar nada.

```bash
ein install --runtime pi|claude|both
```

### `ein update`

Actualiza EIN y su plantilla desde la release estable de GitHub. Verifica el
payload antes de aplicar, y crea backup con posibilidad de rollback.

**No actualiza el runtime.** Para Pi, eso es `pi-ein update --all`. Para Claude
Code, `bun cc-ein/sync.ts` desde un checkout del repositorio.

### `ein doctor`

Diagnostica el despliegue sin lanzar ningún runtime. Es el primer comando al que
volver cuando algo va raro.

Sale con código 0 si el resultado es OK o WARN, y 1 si hay algún FAIL.

### `ein uninstall`

Elimina EIN **conservando** `auth.json`, secrets y sesiones. Crea backup antes.

### `ein restore`

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
`ein install --dry-run` enseña exactamente qué va a hacer sin tocar nada. Vale
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

**`ein update` puede cambiar la plantilla.** Crea backup y permite rollback,
pero si tienes modificaciones a mano en la casa de EIN, revísalas antes.

**`ein uninstall` no borra tus credenciales** a propósito. Si quieres una
limpieza total, hay que borrarlas aparte.

**Ningún comando toca tus runtimes vanilla.** `~/.pi/agent` y `~/.claude` no
están en el alcance de este binario, salvo la migración explícita de una
instalación legacy de EIN.

## Siguiente

[Filesystem](/ein-agent/04-reference/filesystem/) — qué directorios usa y cuáles
no.
