# Design — terminal-app-rework

## A. Proposal

### Intent

Que `ein` sea la aplicación desde la que se abre el trabajo: ver y cambiar la
configuración del proyecto, ver por dónde va, ver las sesiones de los dos
runtimes y **continuar** cualquiera de ellas — con el aspecto de un programa
cuidado y no de un volcado de estado.

### Problema

La aplicación entregada en el bloque O muestra estado y casi no actúa. Con
evidencia (`docs/estado-app-terminal.md`, comprobado sobre la instalación
v0.50.2):

- `enter` responde `"<fila> — read-only in this view"` en tres de las cinco
  vistas (`terminal-app.ts:379-382`). Es un marcador de posición de la primera
  slice que se publicó tres veces.
- `resume` devuelve `operation-not-supported` para los dos runtimes
  (`runtime-session-adapters.ts:789`), así que las sesiones que lista no se
  pueden reanudar. Eso vacía §2.3 y §2.4 del documento de features.
- Las vistas `sessions` y `runtime` son la misma lista de Pi con dos formatos.
- La app no usa ni un color de `brand.json`, no tiene paneles ni orientación, y
  expone `[openspec]`, `[git]`, `[session]` en cada fila.
- Faltan del catálogo de ajustes los dos idiomas, cuyos lectores y escritores
  ya existen en `lib/lang.ts`.

### Scope

Lo declarado en `scope.md`. Resumen operativo: `resume` real en los dos
runtimes, `list` de Claude Code, vista única de sesiones, configuración
completa, estado accionable, sistema ejecutable con confirmación y rediseño
visual completo — conservando el núcleo puro y el driver en el borde.

### Affected areas

| Fichero | Cambio | Productivo aprox. |
|---|---|---:|
| `ein-pi/agent/lib/theme.ts` | CREAR | ~120 |
| `ein-pi/agent/lib/claude-sessions.ts` | CREAR | ~150 |
| `ein-pi/agent/lib/runtime-sessions.ts` | CREAR | ~120 |
| `ein-pi/agent/lib/terminal-app.ts` | REESCRIBIR | ~640 |
| `ein-pi/agent/lib/runtime-session-adapters.ts` | AMPLIAR | ~180 |
| `ein-pi/agent/lib/session-summary.ts` | AMPLIAR | ~35 |
| `ein-pi/agent/lib/project-settings.ts` | AMPLIAR | ~45 |
| `ein-pi/agent/lib/agent-home.ts` | AMPLIAR | ~20 |
| `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | REESCRIBIR | ~380 |
| `tests/*` | CREAR/AMPLIAR | ~900 |

### Risks

Los cinco de `map.md` §4. El que gobierna el diseño es el primero: **ampliar
`argv` es la superficie sensible**, y la mitigación (forma exacta por proveedor
y modo) está especificada en R3 y decidida en C-2.

### Rollback

Cada grupo de tareas es un commit reversible por separado salvo el par
`terminal-app.ts` + `terminal-app-entrypoint.ts`, que se revierten juntos
(núcleo y driver comparten tipos). Nada de lo que se toca persiste estado nuevo:
la app no crea ficheros propios; escribe únicamente a través de los dueños de
cada ajuste, que ya existían. Revertir la ampliación del adaptador devuelve
`resume` a `unsupported` y la app a lanzar solo sesiones nuevas.

### Success criteria

Ver sección D.

---

## B. Spec

### R1. Reanudar una sesión de Pi o de Claude Code

El adaptador **MUST** aceptar una referencia opaca propia, resolverla contra el
store del runtime correspondiente y devolver un `LaunchIntent` en modo `resume`
con el id privado ya resuelto. **MUST NOT** exponer el id privado en ningún
campo de un `AdapterResult`.

Cuando la referencia no corresponda a ninguna sesión viva del proyecto, el
resultado **MUST** ser `reference-not-found`, nunca un lanzamiento en blanco.

**Escenario — reanudar una sesión de Pi**

- **Dado** un proyecto con una sesión de Pi cuya referencia pública es
  `pi:v1:sha256:<h>`,
- **Cuando** se pide `resume` con esa referencia,
- **Entonces** el resultado es `success` con `mode: "resume"`, y el plan
  derivado invoca `pi` con `["--session", "<uuid>"]`.

**Escenario — referencia de un proyecto ajeno**

- **Dado** una referencia con formato válido que no hashea a ninguna sesión del
  proyecto,
- **Cuando** se pide `resume`,
- **Entonces** el resultado es `error` con `reference-not-found` y no se
  construye ningún plan.

**Escenario — referencia de otro proveedor**

- **Dado** una referencia `claude:v1:sha256:<h>`,
- **Cuando** se pide `resume` al adaptador de Pi,
- **Entonces** el resultado es `provider-mismatch`.

### R2. Listar las sesiones de Claude Code del proyecto

El adaptador de Claude **MUST** listar las sesiones cuyo `cwd` pertenece al
proyecto, leyendo ese dato **del contenido del transcript** y no del nombre de
la carpeta. El barrido **MUST** estar acotado en número de ficheros y en bytes
leídos por fichero.

**Escenario — pertenencia por contenido, no por nombre**

- **Dado** dos carpetas de proyecto que colisionan al codificar (`01_Proyectos`
  y `01-Proyectos` producen el mismo nombre),
- **Cuando** se listan las sesiones del primero,
- **Entonces** solo aparecen las sesiones cuyo `cwd` es exactamente ese
  proyecto.

### R3. El plan de lanzamiento admite argumentos, pero solo los suyos

`LaunchPlan.argv` **MUST** ser una de estas formas exactas, y ninguna otra:

| proveedor | modo | argv |
|---|---|---|
| `pi` | `create` | `[]` |
| `pi` | `resume` | `["--session", <uuid>]` |
| `claude` | `create` | `[]` |
| `claude` | `resume` | `["--resume", <uuid>]` |

`<uuid>` **MUST** validar contra `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
`shell` **MUST** seguir siendo `false`. El ejecutor **MUST** rechazar cualquier
plan cuyo `argv` no encaje en la tabla.

**Escenario — un argv fabricado es rechazado**

- **Dado** un plan por lo demás válido cuyo `argv` es
  `["--session", "x; rm -rf /"]`,
- **Cuando** se ejecuta,
- **Entonces** el resultado es `invalid-request` y no se lanza ningún proceso.

**Escenario — una bandera extra es rechazada**

- **Dado** un plan con `argv: ["--session", "<uuid>", "--dangerously"]`,
- **Cuando** se ejecuta,
- **Entonces** el resultado es `invalid-request`.

### R4. Una sola lista de sesiones, con los dos runtimes

La vista de sesiones **MUST** mostrar las sesiones de Pi y de Claude Code del
proyecto en una sola lista ordenada por recencia, cada una con su runtime, su
antigüedad y la última frase del humano cuando se pueda leer. **MUST NOT**
existir una segunda vista que liste lo mismo.

Un runtime cuyo store no se pueda leer **MUST** declararse como tal en la vista;
**MUST NOT** presentarse como "sin sesiones".

**Escenario — un store ilegible no se confunde con vacío**

- **Dado** que el store de Claude no existe en la máquina,
- **Cuando** se abre la vista de sesiones,
- **Entonces** se listan las de Pi y se declara que Claude no tiene store
  legible.

### R5. El último turno del humano se lee en los dos formatos

El resumen de sesión **MUST** reconocer el turno de usuario tanto con contenido
en array de partes (Pi) como con contenido en string (Claude Code). **MUST NOT**
tomar como frase del humano un `tool_result`, un turno de subagente
(`isSidechain: true`) ni texto de asistente.

**Escenario — un tool_result no es una frase del humano**

- **Dado** un transcript cuyo último registro `type:"user"` contiene solo un
  `tool_result`,
- **Cuando** se resume,
- **Entonces** se devuelve el turno de usuario anterior con texto real, o
  `undefined` si no lo hay.

### R6. Configuración completa del proyecto

La vista de configuración **MUST** exponer, como mínimo: modo de trabajo, idioma
del agente, idioma de artefactos, persona, TDD estricto, Hypa y CodeGraph. Cada
cambio **MUST** escribirse a través del módulo que ya posee ese ajuste y el
valor mostrado tras el cambio **MUST** proceder de una relectura, no de la
intención de la tecla.

**Escenario — el disco manda sobre la tecla**

- **Dado** un ajuste cuyo escritor falla,
- **Cuando** se intenta ciclarlo,
- **Entonces** la app declara el rechazo y sigue mostrando el valor anterior.

### R7. Ninguna fila responde "solo lectura"

**MUST NOT** existir ninguna respuesta a `enter` de la forma
`"… — read-only in this view"`. Toda fila seleccionable **MUST** tener una
acción declarada; una fila sin acción **MUST NOT** ser seleccionable.

**Escenario — un hecho largo se puede leer entero**

- **Dado** una fila de estado cuyo valor está recortado por la anchura,
- **Cuando** se pulsa `enter`,
- **Entonces** el valor completo aparece en la línea de estado.

### R8. La app ejecuta comandos de sistema solo tras confirmación y solo de una lista cerrada

Un comando **MUST** pertenecer a una lista cerrada declarada en el código de la
app. La primera pulsación **MUST** pedir confirmación nombrando el comando
literal; solo la segunda pulsación de confirmación lo ejecuta. Cualquier otra
tecla **MUST** cancelar. **MUST NOT** ejecutarse nada construido a partir de
texto leído de disco o de red.

**Escenario — una pulsación no basta**

- **Dado** el cursor sobre un componente con actualización disponible,
- **Cuando** se pulsa `enter` una vez,
- **Entonces** se pide confirmación nombrando el comando y no se lanza ningún
  proceso.

**Escenario — cancelar**

- **Dado** una confirmación pendiente,
- **Cuando** se pulsa cualquier tecla distinta de la de confirmación,
- **Entonces** la confirmación se descarta y no se lanza ningún proceso.

### R9. Estética con degradación honesta

El render **MUST** producir color y adornos solo cuando el destino es una
terminal interactiva con color. Con `NO_COLOR`, sin TTY o con `--once`, la
salida **MUST NOT** contener secuencias de escape.

El render **MUST** adaptarse a la anchura: una terminal estrecha recibe el logo
estrecho y los valores recortados con marca de recorte, nunca líneas que se
parten solas.

**Escenario — sin color no hay escapes**

- **Dado** `NO_COLOR` en el entorno,
- **Cuando** se pinta cualquier vista,
- **Entonces** ninguna línea contiene `[`.

### R10. Orientación permanente

Toda vista distinta del dashboard **MUST** mostrar dónde está el usuario y
**MUST** ofrecer volver al dashboard con `esc`. El pie **MUST** enumerar los
atajos válidos **de esa vista**, no un texto fijo.

---

## C. Decisiones

### C-1. La referencia opaca se resuelve por barrido, no se invierte

`sha256(id)` es irreversible por diseño (contrato de `runtime-session-adapters`).
Para reanudar, el adaptador vuelve a barrer el store del proyecto y compara
hashes.

**Alternativa descartada:** guardar un mapa referencia→id en disco. Crearía
estado persistente nuevo, con su invalidación y su fuga (el mapa *es* la
reversión del hash). El barrido cuesta un `readdir` + N lecturas de 1 KB, ya
acotadas a `PROJECT_SCAN_LIMIT`.

**Consecuencia aceptada:** si la sesión desaparece entre listar y reanudar, el
resultado es `reference-not-found`. Es el comportamiento correcto.

### C-2. `argv` con forma exacta, no con lista de permitidos por token

La validación no pregunta "¿este argumento es seguro?" sino "¿este plan es uno
de los cuatro planes que el adaptador sabe construir?". Es una comparación
estructural contra una tabla cerrada, con el único hueco variable — el uuid —
validado por patrón.

**Alternativa descartada:** permitir `argv: string[]` con saneado. Saneado
significa juicio, y el juicio se equivoca. La tabla no.

### C-3. Una vista de sesiones, no dos

`sessions` y `runtime` se funden. La elección de runtime deja de ser un modo
persistente de la app: cada fila **ya sabe** de qué runtime es, y el dashboard
ofrece "arrancar Pi" y "arrancar Claude Code" como dos entradas separadas.
Desaparecen `nextRuntime()`, el ciclo de proveedor y la fila "Runtime".

### C-4. La app no recuerda nada entre ejecuciones

No hay fichero de estado de la app. Todo se deriva del proyecto en cada
arranque. Un `ein` recién abierto y otro tras diez minutos muestran lo mismo si
el proyecto no cambió.

### C-5. Idioma de la interfaz

Los textos de la app pasan por `pick(es, en)` de `lib/lang.ts`, el mismo dial
que el resto de Ein. La app deja de ser la única superficie en inglés fijo.

### C-6. El dashboard es la vista inicial y el centro

`tab` deja de ser navegación a ciegas. El dashboard lista las acciones con su
atajo; cada vista vuelve con `esc`. `tab` se conserva como "siguiente vista"
para quien ya tenga el dedo hecho, pero ya no es la única forma de llegar.

### C-7. Ceder la terminal: un solo mecanismo

Lanzar un runtime y ejecutar un comando de sistema comparten mecanismo: salir
del modo crudo, dejar de escuchar teclas, ceder `stdin`/`stdout` al proceso hijo
y terminar la app con su código de salida. No hay ejecución "en segundo plano"
dentro de la app.

---

## D. Criterios de éxito

1. `bun test` en verde desde la raíz, incluida la suite reescrita de la app.
2. `cd installer && bun run typecheck` sin errores, y `bunx tsc --noEmit` limpio
   sobre los ficheros tocados de `ein-pi/agent/`.
3. Existe un test que reanuda una sesión de Pi y otro que reanuda una de Claude,
   comprobando el `argv` exacto del plan.
4. Existe un test que rechaza un `argv` fabricado.
5. Existe un test que demuestra que la vista de sesiones mezcla los dos runtimes
   y que un store ausente se declara, no se calla.
6. Existe un test que recorre las cinco vistas y comprueba que **ninguna**
   respuesta a `enter` contiene `read-only`.
7. Existe un test que comprueba que con `NO_COLOR` no hay `[` en la
   salida, y otro que comprueba que con color sí lo hay.
8. Los siete ajustes están presentes en el catálogo y cada uno tiene su test de
   lectura y de escritura rechazada.
9. Verificación manual **sobre la instalación** (`ein update` y luego `ein`),
   no sobre el checkout.
