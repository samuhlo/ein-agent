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
  No lanza los runtimes: eso lo hacen `ein-pi`, `ein-cc` y la propia app.

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

### Panel vivo de Pi

En Pi, el panel vivo se abre con `ctrl+shift+e`. Muestra el cambio activo, el carril, la fase actual y las tareas proyectadas desde `tasks.md` del cambio. Es una superficie de Pi: no representa una vista de Claude Code.

## El instalador

### `ein-install install`

Instala o repara EIN: comprueba dependencias, instala las que falten, despliega
las superficies, configura secrets y ejecuta el doctor al terminar.

Sobre un árbol existente crea un backup antes de tocar nada.

```bash
ein-install install --runtime pi|claude|both
```

### `ein-install update`

Actualiza EIN y su plantilla desde el canal guardado. Verifica el payload antes
de aplicar, y crea backup con posibilidad de rollback.

```bash
ein-install update --channel alpha   # actualiza y deja alpha como preferencia
ein-install update --channel stable  # actualiza y vuelve a dejar stable
ein-install update --dry-run --channel alpha  # previsualiza alpha sin cambiar la preferencia
```

`--channel` acepta `alpha` o `stable` con el valor separado. Si se omite, se usa
la preferencia persistida —o `stable` cuando todavía no existe—. El cambio se
guarda de forma atómica solo después de una actualización correcta, también si
la versión ya estaba al día. Un dry-run, un bloqueo o un fallo no lo guarda.

**No actualiza el runtime.** Para Pi, eso es `ein-pi update --all`. Para Claude
Code, actualiza Claude por su canal normal. La actualización de EIN sí renueva
sus launchers y el payload Claude con los nombres actuales.

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
| `--channel alpha\|stable` | elige y, tras un update correcto, persiste el canal |
| `--no-engram` | omite la capacidad opcional de memoria persistente (Engram) |
| `--no-secrets` | omite la configuración de secrets |
| `--no-linear` | omite la integración con Linear |
| `--no-hypa` | omite Hypa |
| `--no-codegraph` | omite el bootstrap asistido opcional del grafo de código |

:::tip[LA PRIMERA VEZ]
`ein-install install --dry-run` enseña exactamente qué va a hacer sin tocar nada. Vale
la pena antes de la primera instalación.
:::

### Capacidades opcionales

**Codegraph** es un bootstrap asistido opcional cuando falta el índice. Su modo es `on` por defecto, pero no convierte el índice en una dependencia: puedes desactivarlo con `--no-codegraph`.

**Engram** aporta memoria persistente como capacidad opcional. La instalación puede omitirla con `--no-engram`; su ausencia o configuración no cambia la validez del flujo principal.

## Comandos del flujo SDD

Estos no vienen del instalador: pertenecen al runtime.

**En Claude Code**, un binario:

```bash
ein-cc-sdd status [cambio]     # fase actual y qué falta
ein-cc-sdd check  [cambio]     # valida los artefactos
ein-cc-sdd close  <cambio>     # archiva un cambio verificado
```

**En Pi**, comandos del agente: `/ein:status`, `/ein:sdd-next <cambio>`,
`/ein:doctor-output`, `/ein:init`. El panel vivo de Pi está documentado arriba.

**En Claude Code**, las superficies slash de Ein son:

```text
/ein:status [cambio]     # muestra el cambio activo, la fase y lo pendiente
/ein:settings            # consulta y ajusta la configuración de Ein
```

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
