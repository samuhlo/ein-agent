---
title: "CLI"
description: "La aplicación de terminal, los comandos del instalador y sus flags."
sources: ["README.md", "installer/README.md", "ein-pi/agent/app.ts", "ein-pi/agent/surfaces/terminal-app-entrypoint.ts", "installer/src/cli/install.ts", "installer/src/cli/doctor.ts", "installer/src/cli/update.ts", "installer/src/cli/restore.ts", "installer/src/cli/uninstall.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Hay dos binarios y hacen cosas distintas:

- **`ein`** abre la aplicación de terminal. Es desde donde se ve y se controla
  el proyecto.
- **`ein-install`** gestiona la instalación, la actualización y el diagnóstico.
  No lanza los runtimes: eso lo hacen `ein-pi`, `ein-cc` y la propia app.

La aplicación delega `install`, `update`, `doctor`, `restore` y `uninstall` en
`ein-install`. No se limita a imprimir una redirección. Conserva el comando
`ein-install` como vía de reparación si la aplicación falla.

## La aplicación

### `ein`

Abre la aplicación de terminal. Cinco vistas que rotan con `tab`:

| Vista | Qué muestra |
| :--- | :--- |
| Estado | Proyecto, fase de OpenSpec, verificación y git |
| Configuración | Modo de trabajo, TDD, CodeGraph y persona |
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

Antes de reemplazar un árbol gestionado existente prepara su snapshot.

```bash
ein-install install --runtime pi
# Alternativa con Claude:
ein-install install --runtime both
```

### `ein-install update`

Actualiza EIN y su plantilla desde el canal guardado. Verifica el payload antes
de aplicar, crea backup con posibilidad de rollback y, fuera de `--dry-run`,
actualiza también el host Pi y los paquetes declarados del runtime aislado.

```bash
ein-install update --channel alpha   # actualiza y deja alpha como preferencia
ein-install update --channel stable  # actualiza y vuelve a dejar stable
ein-install update --dry-run --channel alpha  # previsualiza alpha sin cambiar la preferencia
```

`--channel` acepta `alpha` o `stable` con el valor separado. Si se omite, se usa
la preferencia persistida —o `stable` cuando todavía no existe—. El cambio se
guarda de forma atómica solo después de una actualización correcta, también si
la versión ya estaba al día. Un dry-run, un bloqueo o un fallo no lo guarda.

El host Pi solo se considera `latest` cuando su versión observada coincide con
la evidencia fresca de npm. Las herramientas externas opcionales conservan su
confirmación aparte. Claude Code sigue actualizándose por su canal normal.

Al elegir Pi desde la aplicación `ein`, esta ejecuta una vez por proceso
`pi update --all --no-approve` antes del primer handoff. `PI_OFFLINE=1` omite
ese paso; el acceso manual equivalente sigue siendo `ein-pi update --all`.

### `ein-install doctor`

Diagnostica el despliegue sin lanzar ningún runtime. Es el primer comando al que
volver cuando algo va raro.

Sale con código 0 si el resultado es OK o WARN, y 1 si hay algún FAIL.

### `ein-install uninstall`

Retira activos reconocidos de Ein a recuperación privada **conservando** autenticación, secrets y sesiones. Consulta el plan antes.

### `ein-install restore`

Restaura desde un backup previo.

## Flags

Estas opciones pertenecen a los subcomandos que las usan: `--channel` es de
`update` y `--no-*` omiten pasos de instalación/configuración. No desactivan
automáticamente integraciones ya configuradas. En `uninstall`, `--runtime`
también acepta `claude` para retirar solo ese complemento.

| Flag | Qué hace |
| :--- | :--- |
| `--runtime pi\|both` | instalar Ein o Ein + Claude Code |
| `--yes` | no interactivo, acepta los valores por defecto |
| `--dry-run` | enseña el plan sin ejecutar nada |
| `--channel alpha\|stable` | elige y, tras un update correcto, persiste el canal |
| `--no-engram` | omite el paso opcional de instalación de Engram |
| `--no-secrets` | omite la configuración de secrets |
| `--no-linear` | omite la configuración opcional de Linear |
| `--no-codegraph` | omite el paso opcional de instalación de Codegraph |

:::tip[LA PRIMERA VEZ]
`ein-install install --dry-run` enseña exactamente qué va a hacer sin tocar nada. Vale
la pena antes de la primera instalación.
:::

### Capacidades opcionales

**Codegraph** es un bootstrap asistido opcional cuando falta el índice. Su modo es `on` por defecto, pero no convierte el índice en una dependencia: `--no-codegraph` omite su instalación; para desactivarlo en el proyecto usa su ajuste en Pi o en la aplicación.

**Engram** aporta memoria persistente como capacidad opcional. La instalación puede omitirla con `--no-engram`; su ausencia o configuración no cambia la validez del flujo principal.

## Comandos del flujo SDD

En Pi, `/ein:intent` abre el acuerdo de trabajo; `/ein:models` configura modelos
y esfuerzo por rol, y `/ein:skills` muestra las skills.

Estos no vienen del instalador: pertenecen al runtime.

**En Claude Code**, un binario:

```bash
ein-cc-sdd status [cambio]     # fase actual y qué falta
ein-cc-sdd check  [cambio]     # valida los artefactos
ein-cc-sdd close  <cambio>     # archiva un cambio verificado
```

**En Pi**, comandos del agente: `/ein:status`, `/ein:focus <cambio>`,
`/ein:sdd-next <cambio>`, `/ein:doctor-output`, `/ein:init`. El panel vivo de Pi
está documentado arriba.

**En Claude Code**, las superficies slash de Ein son:

```text
/ein:status [cambio]     # muestra el cambio activo, la fase y lo pendiente
/ein:settings            # consulta la configuración; los selectores están en Pi o en la aplicación
```

## Actualización y conservación

**`ein-install update` puede cambiar la plantilla.** Crea backup y permite rollback,
pero si tienes modificaciones a mano en la casa de EIN, revísalas antes.

**`ein-install uninstall` conserva credenciales y estado privado**. No hace falta
borrarlos para reparar el despliegue.

**El despliegue tiene hogares propios.** Una instalación legacy solo se migra
si se reconoce como gestionada por Ein. La actualización del ejecutable Pi
puede afectar a quienes usen ese mismo binario; aislamiento de configuración
no significa tener una versión independiente del host.

## Siguiente

[Filesystem](/ein-agent/04-reference/filesystem/) — qué directorios usa y cuáles
no.
