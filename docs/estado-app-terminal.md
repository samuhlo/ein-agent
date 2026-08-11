# Estado de la aplicación de terminal de Ein

> Documento vivo. Nació como diagnóstico de la aplicación entregada en el
> bloque O (v0.50.2) y ahora recoge qué se corrigió en el cambio SDD
> `terminal-app-rework`, qué sigue abierto y qué se decidió no hacer.
>
> Contrasta lo que pide `docs/ein_futuras_features.md` §2 (`feat/launcher-tui`)
> con lo que hay construido.

**Última revisión:** 2026-08-11 · **Cambio SDD:** `terminal-app-rework`

---

## 1. Veredicto en una frase

La aplicación pasó de **mostrar estado sin hacer casi nada** a ser una
aplicación desde la que se trabaja: reanuda sesiones de los dos runtimes,
cambia la configuración del proyecto, dice por dónde va el trabajo y ejecuta las
actualizaciones tras confirmación.

Sigue abierto lo que no era de la app: la superficie duplicada (`workbench`) y
el estándar de estado compartido entre agentes.

---

## 2. Lo que se corrigió

### 2.1. `enter` hace algo en todas las vistas

El marcador `"<fila> — read-only in this view"` desapareció. Cada fila declara la
acción que ejecuta (`RowAction`), y hay un test que recorre las cinco vistas
pulsando `enter` en cada fila y comprueba que ninguna responde "solo lectura".

| Vista | Qué hace `enter` |
| :--- | :--- |
| dashboard | abre la vista o arranca el runtime de esa entrada |
| sesiones | **reanuda** esa sesión en su runtime |
| estado | muestra el valor completo, o **enfoca** el cambio SDD |
| configuración | rota el valor y lo escribe por su dueño |
| sistema | pide confirmación y luego ejecuta el comando |

### 2.2. Reanudar sesiones existe

`resumeSessionRequest()` ya no devuelve `operation-not-supported`. La referencia
opaca (`pi:v1:sha256:…`) se resuelve **volviendo a barrer** el store del
proyecto y comparando hashes: el id privado nunca cruza la frontera pública, y
no se guarda ningún mapa referencia→id en disco (que sería el hash revertido y
escrito).

Comprobado contra los stores reales de esta máquina:

```
pi     -> ~/.bun/bin/pi        ["--session", "019fec0d-…"]   PI_CODING_AGENT_DIR, EIN_PI_AGENT_HOME
claude -> ~/.local/bin/claude  ["--resume",  "da1dae27-…"]   CLAUDE_CONFIG_DIR, PATH
```

`LaunchPlan.argv` dejó de ser `readonly []`. La validación no pregunta "¿este
argumento es seguro?" sino "¿este plan es uno de los cuatro que el adaptador
sabe construir?": comparación estructural contra una tabla cerrada, con el
único hueco variable —el uuid— validado por patrón, y `shell: false` intacto.

### 2.3. Las sesiones de Claude Code se leen

`lib/claude-sessions.ts` barre `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl` con el
mismo tope que el lector de Pi. La pertenencia al proyecto se decide por el
campo `cwd` **dentro del transcript**, no por el nombre de la carpeta: esa
codificación es lossy (`01_Proyectos` y `01-Proyectos` colisionan en
`01-Proyectos`).

### 2.4. Una sola lista de sesiones

Las vistas `sessions` y `runtime` eran la misma lista con dos formatos. Ahora
hay una, ordenada por recencia, con los dos runtimes mezclados. El runtime dejó
de ser un modo de la app: es una propiedad de cada fila. Desaparecieron
`nextRuntime()`, el ciclo de proveedor y la fila "Runtime".

Un runtime cuyo store no se puede leer **se declara**; nunca se presenta como
"sin sesiones".

### 2.5. Dos fallos que solo aparecen usando la aplicación

Ambos salieron al abrirla en un pty real, no de los tests:

- **Teclas en bloque.** Un `read` del terminal puede traer varias teclas
  (pegado, tubería, teclear rápido) y se trataban como una sola: la app parecía
  colgada. `splitKeys()` las separa conservando enteras las secuencias de
  escape.
- **Terminal que informa 0 columnas** (`script`, algunos pty de CI): el ancho 0
  recortaba cada línea a nada y la pantalla salía en blanco, que se lee como una
  caída. Hay suelo de anchura y valor por defecto.

Y un tercero de higiene: la salida de pantalla alterna se emitía dos veces al
ceder la terminal.

### 2.6. La frase de cada sesión se lee en los dos formatos

`userText()` solo entendía el array de partes de Pi. Ahora acepta también el
string de Claude Code y descarta lo que no escribió el humano: `tool_result`,
turnos de subagente (`isSidechain`), meta del harness y envoltorios
`<local-command-stdout>` / `<bash-input>`.

Además, un registro más grande que un trozo de lectura (una imagen pegada, un
resultado de herramienta enorme) era ilegible en **todos** los trozos que
ocupaba, así que la frase del humano desaparecía. El barrido ahora acarrea el
fragmento colgante de un trozo al siguiente. Medido sobre los transcripts
reales de esta máquina: 11 ms para once sesiones de hasta 5,8 MB.

### 2.7. La configuración cubre lo que escribe el `init`

| Ajuste | Antes | Ahora |
| :--- | :--- | :--- |
| modo individual / equipo | sí | sí |
| idioma del agente | **no** | sí |
| idioma de PR y commits | **no** | sí |
| persona | sí | sí |
| TDD estricto | sí | sí |
| Hypa | sí | sí |
| CodeGraph | sí | sí |

Los valores se muestran con nombre humano (`individual`, `Español`) pero en
disco sigue escribiéndose el token canónico, para que el fichero no dependa del
idioma de la interfaz. La fila seleccionada enseña el ciclo completo de valores,
porque si no la única forma de descubrirlos es pulsar `enter` hasta que se
repitan.

### 2.8. Estética

- **Color de marca.** Amarillo `#FFCA40` para acento y atajos, concrete para
  texto, structure para lo atenuado — la paleta de `brand.json`.
- **Dashboard** con banner grande centrado y menú con atajo por entrada, al
  estilo de la referencia pedida.
- **Pantalla alterna y cursor oculto**: al salir, la terminal queda como estaba.
- **`[openspec]`, `[git]`, `[session]` por fila** sustituidos por una sola
  declaración de fuente en la cabecera de cada vista.
- **Degradación honesta**: con `NO_COLOR`, sin TTY o con `--once` no se emite ni
  una secuencia de escape.

### 2.9. El updater ejecuta

`enter` sobre un componente con actualización disponible pide confirmación
nombrando el comando literal y, con la segunda pulsación, lo ejecuta cediendo la
terminal. Los comandos salen de una **lista cerrada** escrita en el código de la
app; nunca se construyen a partir de lo que dijo una sonda.

La app termina con el comando en vez de volver a sí misma: el updater puede
reemplazar los ficheros desde los que corre este proceso.

---

## 3. Lo que sigue abierto

### 3.1. La superficie duplicada `workbench` (deuda real)

`ein-pi/agent/lib/workbench.ts` (~450 líneas) sigue existiendo y se llega por
`pi-ein workbench`. Ahora la app cubre su función. Retirarla toca `pi-ein`,
`cc-ein` y el installer, así que merece un cambio propio.

### 3.2. Estado compartido entre agentes (§2.5 del documento de features)

No existe. La app lee OpenSpec para fase y siguiente paso, que es una parte
pequeña. Es un diseño en sí mismo, no una tarea.

### 3.3. Ejecución en paralelo (§2.3)

Diferida al bloque L del roadmap canónico. No es deuda de la app.

### 3.4. Detalles menores

- La sesión **en curso** aparece en su propia lista. Reanudarla es legítimo pero
  confuso; no hay forma fiable de detectar "viva" sin inventarse un marcador.
- Las sondas de actualización resuelven después del primer pintado. `r` recarga
  la vista sin perder el cursor; no hay repintado automático al resolverse.

---

## 4. Decisiones tomadas, para que no se replanteen

| Decisión | Razón |
| :--- | :--- |
| La configuración **no** se muda a `EIN.md` | Dos fuentes de verdad para el mismo ajuste es peor que una desviación anotada respecto a §2.2. Ratifica el PR #137. |
| **Engram no es un ajuste de proyecto** | No hay modo persistible: se elige por sesión en el preflight de SDD. Un interruptor en la app no encendería nada. Aparece en *sistema* como componente instalado/no instalado. |
| La referencia opaca se resuelve **por barrido** | Guardar un mapa referencia→id sería el hash revertido y escrito en disco. El barrido está acotado y cuesta microsegundos. |
| `argv` con **forma exacta**, no saneado | Sanear es juicio, y el juicio se equivoca. Una tabla cerrada no. |
| Glifos geométricos, **no nerd font** | Los iconos de nerd font miden dos columnas en unas terminales y una en otras, lo que rompe en silencio cada línea centrada. |

---

## 5. Inventario de código

| Fichero | Qué es | Líneas |
| :--- | :--- | ---: |
| `ein-pi/agent/lib/terminal-app.ts` | núcleo puro: modelo, vistas, teclas, render | ~870 |
| `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | driver y costuras de producción | ~520 |
| `ein-pi/agent/lib/theme.ts` | paleta de marca y aritmética de anchura visible | ~140 |
| `ein-pi/agent/lib/claude-sessions.ts` | barrido acotado del store de Claude | ~185 |
| `ein-pi/agent/lib/runtime-sessions.ts` | lista unificada de los dos runtimes | ~105 |
| `ein-pi/agent/lib/runtime-session-adapters.ts` | adaptadores, resume, plan de lanzamiento | ~1330 |
| `ein-pi/agent/lib/banner.ts` | fotogramas del banner | ~74 |
| `ein-pi/agent/lib/project-settings.ts` | catálogo de ajustes | ~215 |
| `ein-pi/agent/lib/session-summary.ts` | frase de cada sesión, dos dialectos | ~190 |
| `ein-pi/agent/app.ts` | ejecutable | ~16 |

**Pruebas de la aplicación: 173.**

| Suite | Tests |
| :--- | ---: |
| `tests/terminal-app.test.ts` | 63 |
| `tests/terminal-app-driver.test.ts` | 28 |
| `tests/theme.test.ts` | 18 |
| `tests/runtime-session-resume.test.ts` | 15 |
| `tests/session-summary.test.ts` | 15 |
| `tests/project-settings.test.ts` | 14 |
| `tests/claude-sessions.test.ts` | 12 |
| `tests/runtime-sessions.test.ts` | 8 |

---

## 6. Cómo se ejecuta

```bash
ein                  # la aplicación
ein --once           # pinta una vez y sale
ein --no-intro       # sin banner animado
ein --project <dir>  # sobre otro proyecto
ein-install          # el instalador (menú)
pi-ein app           # equivalente a `ein`, vía launcher de Pi
pi-ein workbench     # la superficie vieja, duplicada (pendiente de retirar)
```

**Teclas:** `s` sesiones · `p` Pi · `c` Claude Code · `e` estado · `o`
configuración · `u` sistema · `q` salir · `j/k` y flechas mover · `enter`
actuar · `f` o `/` buscar · `r` recargar · `esc` volver · `tab` rotar vistas.

---

## 7. Lección de proceso

Las seis slices del bloque O se entregaron **probando desde el repositorio**, y
79 tests en verde convivieron con una aplicación en la que `enter` no hacía
nada: verificaban que el código hacía lo que el código decía, no que la
aplicación sirviera para algo.

Este cambio se verificó abriendo la aplicación en un pty real y usándola, y eso
—no los tests— es lo que destapó las teclas en bloque, el ancho 0 y la doble
salida de pantalla alterna. **Abrir la aplicación y usarla** antes de dar por
buena cualquier slice.

Queda pendiente la verificación sobre la **instalación empaquetada** (`ein
update` y luego `ein`), que es donde aparecieron los tres fallos corregidos en
0.50.1 y 0.50.2.
