status: complete
scope_status: ok
phase: sdd-map
change: terminal-app-rework

# Map: terminal-app-rework

---

## Ledger

```
ledger:
  reads:
    - path: docs/estado-app-terminal.md
      lines: 258
      estimated_tokens: 3400
    - path: docs/ein_futuras_features.md
      lines: 459
      estimated_tokens: 5600
    - path: ein-pi/agent/lib/terminal-app.ts
      lines: 444
      estimated_tokens: 4800
    - path: ein-pi/agent/surfaces/terminal-app-entrypoint.ts
      lines: 351
      estimated_tokens: 3900
    - path: ein-pi/agent/lib/runtime-session-adapters.ts
      lines: 1222
      estimated_tokens: 12000
    - path: ein-pi/agent/lib/sessions.ts
      lines: 191
      estimated_tokens: 2000
    - path: ein-pi/agent/lib/session-summary.ts
      lines: 146
      estimated_tokens: 1700
    - path: ein-pi/agent/lib/project-settings.ts
      lines: 124
      estimated_tokens: 1300
    - path: ein-pi/agent/lib/project-state.ts
      lines: 190
      estimated_tokens: 2100
    - path: ein-pi/agent/lib/lang.ts
      lines: 200
      estimated_tokens: 2200
    - path: ein-pi/agent/lib/onboarding.ts
      lines: 140
      estimated_tokens: 1500
    - path: ein-pi/agent/lib/banner.ts
      lines: 74
      estimated_tokens: 800
    - path: tests/terminal-app.test.ts
      lines: 882
      estimated_tokens: 400
  probes:
    - "pi --help"
    - "claude --help"
    - "ls ~/.claude-ein/projects/**"
    - "head ~/.pi-ein/agent/sessions/**/*.jsonl"
  webfetch_used: false
  budget_consumed:
    tokens: 41700
    reads: 13
```

---

## Resumen ejecutivo

Las tres piezas que faltan son **cableables con lo que ya hay**, no requieren
rediseñar contratos:

1. Los dos runtimes **sí** saben reanudar por línea de comandos
   (`pi --session <id>`, `claude --resume <id>`); lo que bloquea no es el
   runtime, es que `buildLaunchPlan()` prohíbe `argv` no vacío.
2. Las sesiones de Claude **sí** son legibles con el mismo barrido acotado que
   Pi, y llevan el `cwd` dentro del propio fichero, así que no hace falta
   depender de la codificación del nombre de carpeta.
3. La referencia opaca es un hash del id, irreversible — pero **reversible por
   barrido**: se re-escanea y se compara el hash. El id privado nunca sale.

El riesgo real no está en la funcionalidad sino en el **tamaño de la revisión**:
la app se reescribe casi entera (núcleo + driver + tests). Se mitiga cortando en
cinco grupos de tareas con puertas de test independientes.

---

## 1. Evidencia de runtimes

### 1.1 Pi sabe reanudar

`pi --help` (v0.84.1, comprobado en esta máquina):

```
  --continue, -c                 Continue previous session
  --resume, -r                   Select a session to resume
  --session <path|id>            Use specific session file or partial UUID
  --session-dir <dir>            Directory for session storage and lookup
```

`--resume` abre un **selector interactivo** — inútil para nosotros, porque el
selector es precisamente lo que la app ya hace. La forma determinista es
`--session <id>`.

Formato del id (primera línea de un transcript real):

```json
{"type":"session","version":3,"id":"019fec0d-6ee0-7c8c-b791-032d7d0fa40c",
 "timestamp":"2026-08-10T14:22:11.168Z","cwd":"/Users/samu/Documents/01_Proyectos/ein-agent"}
```

UUID canónico. El `PI_CODING_AGENT_DIR` que ya inyecta `buildLaunchPlan()`
apunta al home aislado, así que la búsqueda del id ocurre en el store correcto
sin pasar `--session-dir`.

### 1.2 Claude Code sabe reanudar

`claude --help`:

```
  -r, --resume [value]   Resume a conversation by session ID, or open
                         interactive picker with optional search term
  --session-id <uuid>    Use a specific session ID for the conversation
```

`--resume <uuid>` con valor es determinista. `CLAUDE_CONFIG_DIR` ya lo inyecta
`buildLaunchPlan()` (`~/.claude-ein`).

### 1.3 Las sesiones de Claude son legibles

```
~/.claude-ein/projects/-Users-samu-Documents-01-Proyectos-ein-agent/
  630a92c6-b2fe-493d-8f99-dddf10f92f99.jsonl
  7eb94cd0-eb94-4d85-8d78-c67face9e94d.jsonl
  ...
```

El nombre de carpeta es el `cwd` con **todo lo no alfanumérico convertido en
`-`**, lo que es **lossy**: `01_Proyectos` y `01-Proyectos` colisionan. Por eso
la pertenencia al proyecto **no se decide por el nombre de carpeta**, sino
leyendo el campo `cwd` que los propios registros llevan:

```json
{"parentUuid":null,"type":"user","cwd":"/Users/samu/Documents/01_Proyectos/ein-agent",
 "gitBranch":"main","sessionId":"b1efcc53-…","message":{"role":"user","content":"…"}}
```

**Resuelve la decisión pendiente 1 del scope.** El nombre de carpeta se usa, como
mucho, para acotar el barrido; la verdad la da el contenido.

### 1.4 El formato de mensaje de usuario difiere entre runtimes

| | Pi | Claude Code |
|---|---|---|
| `message.content` | array de partes `{type:"text"}` | **string** en el turno real; array de `tool_result` en los sintéticos |
| marca de turno real | — | `promptId` + `promptSource` presentes |
| turnos de subagente | — | `isSidechain: true` |

`lastActionFromSessionText()` (`session-summary.ts:39-51`) solo entiende el
array de Pi. Sobre un transcript de Claude devolvería `undefined` siempre, o —
peor — texto de `tool_result` si se relajara mal. Hay que ampliar `userText()`
con: contenido string aceptado, `isSidechain` descartado, `tool_result`
descartado.

---

## 2. Qué bloquea hoy, con línea exacta

| # | Bloqueo | Sitio |
|---|---|---|
| B1 | `resume` devuelve `operation-not-supported` para ambos | `runtime-session-adapters.ts:789` |
| B2 | `launch` en modo `resume` devuelve `operation-not-supported` | `runtime-session-adapters.ts:977` |
| B3 | `LaunchPlan.argv` es `readonly []` y el validador rechaza cualquier argumento | `runtime-session-adapters.ts:196-205`, `:1026` |
| B4 | La matriz declara `resume: unsupported` en los dos, y `list: unsupported` en Claude | `runtime-session-adapters.ts:126-173` |
| B5 | El id privado se descarta al construir la referencia | `runtime-session-adapters.ts:531-546` |
| B6 | `enter` responde "read-only in this view" en estado, sesiones y sistema | `terminal-app.ts:379-382` |
| B7 | Render sin color, sin paneles, con `[fuente]` por fila | `terminal-app.ts:411-444` |
| B8 | Faltan idioma de chat y de artefactos en el catálogo de ajustes | `project-settings.ts:34-85` |
| B9 | El driver no ejecuta nada de la vista de sistema | `terminal-app-entrypoint.ts:294` |

B5 es el interesante: `listPiProjectSessions()` recibe de `scanProjectSessions()`
un registro con `id`, `cwd`, `path` y `mtimeMs`, y **tira todo menos el hash**.
El id no puede volver a salir (eso es el contrato), pero sí puede volver a
*entrar*: al reanudar se repite el barrido y se compara `sha256(id)` con la
referencia. Coste: un barrido acotado extra por reanudación, una vez.

---

## 3. Superficie de escritura estimada

| Fichero | Acción | Líneas productivas aprox. |
|---|---|---:|
| `ein-pi/agent/lib/theme.ts` | CREAR — paleta ANSI y medida de ancho visible | ~120 |
| `ein-pi/agent/lib/claude-sessions.ts` | CREAR — barrido acotado del store de Claude | ~150 |
| `ein-pi/agent/lib/runtime-sessions.ts` | CREAR — lista unificada de los dos runtimes | ~120 |
| `ein-pi/agent/lib/terminal-app.ts` | REESCRIBIR — modelo, teclas y render | ~640 |
| `ein-pi/agent/lib/runtime-session-adapters.ts` | AMPLIAR — resume, argv, matriz, list de Claude | ~180 |
| `ein-pi/agent/lib/session-summary.ts` | AMPLIAR — parseo del formato de Claude | ~35 |
| `ein-pi/agent/lib/project-settings.ts` | AMPLIAR — idiomas | ~45 |
| `ein-pi/agent/lib/agent-home.ts` | AMPLIAR — home de Claude | ~20 |
| `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | REESCRIBIR — driver | ~380 |
| **Total productivo** | | **~1690** |
| `tests/*.test.ts` | CREAR/AMPLIAR (espejo obligatorio, EIN.md) | ~900 |

**Supera con mucho el límite de 400 líneas por revisión.** Mitigación: cinco
grupos de tareas con puerta de test propia, entregables como commits separados
y, en entrega, como PRs encadenados (`chained-pr`). El orden es forzado: nada
de la app nueva se puede probar de verdad hasta que `resume` exista.

---

## 4. Riesgos

1. **Ampliar `argv` es la superficie sensible del cambio.** El validador actual
   es la única barrera entre "plan del adaptador" y "cadena que viene del
   llamante". Si se relaja a `argv: string[]` sin forma exacta, se abre inyección
   de argumentos. Mitigación en diseño: forma exacta por proveedor y modo, id
   validado contra patrón UUID, `shell: false` inmutable, y test explícito de
   que un argv arbitrario se rechaza.
2. **La app corre desde la copia instalada, no desde el repo**
   (`memory: ein-runs-installed-copy`). Un arreglo aquí no se ve hasta
   `ein update`. La verificación manual debe hacerse **sobre la instalación**,
   no sobre el checkout — es exactamente el fallo de proceso que documenta
   `docs/estado-app-terminal.md` §7.
3. **79 tests existentes asumen el render antiguo** (texto plano, `[fuente]` por
   fila, `KEY_HINTS`). El rediseño los rompe a propósito. Reescribirlos es parte
   del trabajo, no un daño colateral: los actuales verifican que el código hace
   lo que el código dice, no que la app sirva.
4. **Sin puerta de tipos sobre `ein-pi/`**: `bun test` no comprueba tipos y el
   `typecheck` solo cubre `installer/`. Mitigación: comprobación manual con
   `bunx tsc --noEmit` sobre los ficheros tocados en la fase de verificación.
5. **Anchura de glifos.** Centrar exige medir ancho visible; los emoji y los
   glifos de nerd font miden dos celdas en unas terminales y una en otras.
   Mitigación: paleta de glifos restringida a formas geométricas de ancho fijo,
   y medida que ignora secuencias ANSI.

---

## 5. Decisiones pendientes, resueltas

- **Identificación de sesión de Claude** → por el campo `cwd` de los registros,
  no por el nombre de carpeta (§1.3).
- **Ejecutable ausente del `PATH`** → el adaptador ya devuelve
  `executable-unavailable`/`unavailable`; hoy el driver lo colapsa a `exitCode 1`
  mudo. Pasa a mostrarse como mensaje nombrando el runtime, sin cerrar la app.
- **Frontera con el installer** → la app ejecuta únicamente comandos de una
  **lista cerrada** definida en su propio código, tras confirmación explícita, y
  cediendo la terminal igual que a un runtime. No implementa lógica de
  actualización: sigue siendo del installer.
