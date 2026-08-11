status: complete

# Apply progress — terminal-app-rework

Los seis grupos / 25 tareas ejecutados en una sesión. El orden es el forzado por
el diseño: nada de la aplicación es verificable de verdad hasta que `resume`
existe, así que el bloqueo raíz va primero y la estética al final.

## Ficheros

### Grupo 001 — reanudación real

- **AMPLIADO** `ein-pi/agent/lib/runtime-session-adapters.ts` (~+190 líneas):
  - `RUNTIME_CAPABILITY_MATRIX`: `pi.resume`, `claude.resume` y `claude.list`
    pasan a `supported`.
  - `sessionReferenceFor(provider, id)`: única definición del formato público de
    referencia, exportada para que el lector que lista y el adaptador que
    reanuda no diverjan.
  - `resolveSessionReference()`: vuelve a barrer el store del proyecto y compara
    `sha256(id)`. No invierte el hash ni persiste mapa alguno.
  - `resumeSessionRequest()`: valida proveedor y formato, prueba que la
    referencia respalda una sesión viva (`reference-not-found` si no) y devuelve
    el `LaunchIntent` con la **referencia pública**, no con el id.
  - `LaunchPlan.argv`: de `readonly []` a `readonly string[]`, con
    `launchArgvFor()` (constructor) e `isDeclaredLaunchArgv()` (validador) sobre
    una tabla cerrada de cuatro formas. `SESSION_ID_PATTERN` valida el único
    hueco variable. `shell: false` intacto.
  - `buildLaunchPlan()` acepta `mode: "resume"` y resuelve la referencia al id
    justo donde hace falta: para deletrear la bandera del runtime.
  - `executeLaunchPlan()` pasa `plan.argv` en vez de `[]` literal.
  - `listProjectSessions()` unifica Pi y Claude y distingue **store ausente**
    (`session-source-unavailable`) de store vacío.

- **AMPLIADO** `ein-pi/agent/lib/sessions.ts`: resolución perezosa del directorio
  de sesiones (el `EIN_PI_AGENT_HOME` se adopta después de que el módulo esté en
  memoria); `store: "present" | "absent"` en el barrido; `matchesProjectScope`,
  `isWithin`, `ProjectSessionRecord`, `PROJECT_SCAN_LIMIT` y
  `MAX_PROJECT_SESSIONS` exportados para el lector de Claude.

### Grupo 002 — sesiones de los dos runtimes

- **CREADO** `ein-pi/agent/lib/claude-sessions.ts` (~185 líneas): `resolveClaudeHome`
  (nunca asume `~/.claude` vanilla), `encodeClaudeProjectDir`,
  `readClaudeSessionMeta` (lectura de cabecera acotada, extracción por patrón en
  vez de `JSON.parse` de registros de cientos de KB) y `scanClaudeProjectSessions`.
- **CREADO** `ein-pi/agent/lib/runtime-sessions.ts` (~105 líneas):
  `collectRuntimeSessions()` mezcla los dos runtimes por recencia y devuelve
  aparte los que no se pudieron mirar.
- **AMPLIADO** `ein-pi/agent/lib/session-summary.ts`: `userText()` entiende el
  string de Claude además del array de Pi, y descarta `tool_result`,
  `isSidechain`, `isMeta` y los envoltorios sintéticos del harness. El barrido
  hacia atrás **acarrea** el fragmento colgante de un trozo al siguiente.

### Grupo 003 — tema y ajustes

- **CREADO** `ein-pi/agent/lib/theme.ts` (~140 líneas): paleta de marca como ANSI,
  `shouldUseColor`, y la aritmética de anchura visible (`stripAnsi`,
  `visibleWidth`, `padVisible`, `center`, `fit`) que un diseño centrado necesita.
- **AMPLIADO** `ein-pi/agent/lib/project-settings.ts`: idioma del agente e idioma
  de artefactos; `hint` por ajuste; `VALUE_LABELS` + `settingLabelFor()` para
  mostrar nombres humanos sin cambiar el token que se escribe en disco.

### Grupos 004–005 — aplicación y driver

- **REESCRITO** `ein-pi/agent/lib/terminal-app.ts` (~870 líneas): modelo con
  `RowAction` por fila, dashboard con atajos, cuatro vistas, confirmación de dos
  pasos, `splitKeys()`, y un render con banner centrado, cabecera por vista, pie
  contextual y degradación sin color.
- **REESCRITO** `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` (~520 líneas):
  pantalla alterna, cursor oculto, detección de color y anchura, `onResize`,
  cesión de terminal única para runtime y comando de sistema, `systemComponentsFrom`
  con lista cerrada de comandos, y distinción entre "el runtime salió" y "el
  runtime no está instalado".

### Pruebas

| Fichero | Acción | Tests |
| :--- | :--- | ---: |
| `tests/runtime-session-resume.test.ts` | CREADO | 15 |
| `tests/claude-sessions.test.ts` | CREADO | 12 |
| `tests/runtime-sessions.test.ts` | CREADO | 8 |
| `tests/theme.test.ts` | CREADO | 18 |
| `tests/session-summary.test.ts` | CREADO (espejo que faltaba) | 15 |
| `tests/project-settings.test.ts` | CREADO (espejo que faltaba) | 14 |
| `tests/terminal-app.test.ts` | REESCRITO | 63 |
| `tests/terminal-app-driver.test.ts` | CREADO | 28 |

**173 tests de la aplicación.** Suite completa: **1705 pass / 0 fail**.

## Evidencia TDD (strict_tdd: true)

Cada grupo empezó por un test en rojo verificado antes de escribir la
implementación:

| Seam | RED observado | Verde |
| :--- | :--- | :--- |
| `resume` de Pi y Claude | `11 fail` — `operation-not-supported`, `resume=unsupported` | `bun test tests/runtime-session-resume.test.ts` |
| Store de Claude | `Cannot find module '../ein-pi/agent/lib/claude-sessions.ts'` | `bun test tests/claude-sessions.test.ts` |
| Lista unificada | `Cannot find module '../ein-pi/agent/lib/runtime-sessions.ts'` | `bun test tests/runtime-sessions.test.ts` |
| Formato de Claude en el resumen | `7 fail` — contenido string no reconocido | `bun test tests/session-summary.test.ts` |
| Paleta y anchura visible | módulo ausente | `bun test tests/theme.test.ts` |
| Catálogo de ajustes | `0 pass / 1 fail` — `settingLabelFor` ausente | `bun test tests/project-settings.test.ts` |
| Modelo y render nuevos | `Export named 'buildConfigView' not found` | `bun test tests/terminal-app.test.ts` |
| Driver | costuras nuevas ausentes | `bun test tests/terminal-app-driver.test.ts` |

## Tests existentes que este cambio invalidó a propósito

Cinco aserciones afirmaban el contrato fail-closed que este cambio sustituye.
Se reescribieron para afirmar el nuevo, no se borraron:

- `tests/runtime-session-adapters.test.ts`: matriz de capacidades; `list` de
  Claude pasa de `unsupported` a `unavailable/session-source-unavailable` cuando
  no hay store; `resume` pasa de `unsupported` a `reference-not-found`.
- `tests/beta-launcher-e2e-hardening.test.ts`: mismo contrato, más el guion del
  pty, porque el menú del workbench ya no es asimétrico entre runtimes.
- `tests/minimal-workbench-launcher.test.ts`: numeración del menú de acciones,
  ahora idéntica para los dos runtimes.

## Fuga de aislamiento corregida en el fixture

`tests/fixtures/runtime-test-fixture.ts` aislaba `EIN_PI_AGENT_HOME` pero no
`CLAUDE_CONFIG_DIR`. En cuanto el store de Claude pasó a ser legible, un test
empezó a leer las sesiones reales de la máquina de quien ejecutaba la suite. El
owner ahora posee también un `claudeHome`.

## Fallos encontrados usando la aplicación, no los tests

Los tres salieron al abrirla en un pty real:

1. **Teclas en bloque.** Un `read` con varias teclas se trataba como una sola.
   `splitKeys()` las separa conservando enteras las secuencias de escape.
2. **Ancho 0.** `script` informa 0 columnas; el recorte a 0 dejaba la pantalla en
   blanco. Suelo `MIN_COLUMNS` y valor por defecto en el driver.
3. **Doble salida de pantalla alterna** al ceder la terminal. La propiedad de la
   terminal es idempotente ahora.

Los tres tienen test de regresión.

## Desviaciones respecto al diseño

**R1 decía "con el id privado ya resuelto" y a la vez "MUST NOT exponer el id en
ningún campo de un `AdapterResult`".** Las dos cosas no pueden ser ciertas: el
intent viaja dentro de `AdapterResult.data`. Se resolvió por la vía estricta: el
intent lleva la **referencia pública** y `buildLaunchPlan` resuelve el id justo
donde es inevitable, al deletrear `--session <uuid>`. `resume` sigue probando que
la referencia respalda una sesión viva, así que el error llega en el paso
correcto. Coste: un barrido acotado extra por reanudación.

**El tope de barrido de transcript subió de 512 KB a 4 MB.** El comentario
original medía sesiones de Pi. Una sesión agéntica invierte la forma: el humano
habla una vez y siguen megabytes de resultados de herramienta. Medido aquí: 2,3
MB entre el turno del humano y el final. El barrido sigue parando en la primera
coincidencia, así que el caso común lee un trozo; once sesiones reales de hasta
5,8 MB tardan 11 ms en total.
