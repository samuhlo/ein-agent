# Scope: terminal-app-rework

budget_allocated: 60000

## Objetivo

Convertir la aplicación de terminal de Ein en algo desde lo que se trabaja: que
muestre y permita cambiar la configuración del proyecto, que diga por dónde va
el trabajo, que liste las sesiones de los dos runtimes y que permita **arrancar
y reanudar** Pi o Claude Code sobre el mismo proyecto — con una estética de
aplicación cuidada, no de volcado de texto.

El diagnóstico de partida está en `docs/estado-app-terminal.md` (v0.50.2,
comprobado contra la instalación real, no contra el roadmap).

## Alcance

### Incluye

1. **Reanudar sesiones (`resume`) de verdad, en los dos runtimes.**
   Hoy `resumeSessionRequest()` devuelve `operation-not-supported` para Pi y
   Claude, y `buildLaunchPlan()` prohíbe argumentos (`argv: readonly []`). Sin
   esto no existe "continuar con un agente el trabajo que dejó otro", que es el
   motivo del launcher.
2. **Listar sesiones de Claude Code.** Hoy `list` está declarado `unsupported`
   para Claude. Sus transcripciones viven en
   `$CLAUDE_CONFIG_DIR/projects/<cwd-codificado>/<uuid>.jsonl` y son legibles
   con el mismo barrido acotado que ya usa Pi.
3. **Una sola vista de sesiones**, con los dos runtimes mezclados y ordenados
   por recencia, mostrando runtime, antigüedad y la última frase del humano.
   Sustituye a las dos listas duplicadas de hoy (`sessions` y `runtime`).
4. **Configuración del proyecto completa**, con los ajustes que el `init`
   escribe: modo de trabajo, idioma del agente, idioma de artefactos, persona,
   TDD estricto, Hypa y CodeGraph. Cada uno sigue escribiéndose a través de su
   dueño actual.
5. **Vista de estado útil**: proyecto, rama, cambios sin confirmar, cambio SDD
   activo, fase y siguiente paso, bloqueos, y los cambios abiertos — con
   `enter` para enfocar uno y recalcular su fase.
6. **Sistema con ejecución real**, no solo impresión: `enter` sobre un
   componente con actualización disponible ejecuta su comando **tras
   confirmación explícita**, desde una lista cerrada de comandos.
7. **Rediseño visual**: dashboard tipo LazyVim (banner grande en amarillo de
   marca, menú centrado con atajo por entrada), vistas con cabecera, jerarquía
   por color e intensidad, selección visible, pie de atajos contextual. Fuera
   las etiquetas `[openspec]` / `[git]` por fila.
8. **Degradación honesta**: sin TTY, sin color (`NO_COLOR`), o en terminal
   estrecha, la aplicación sigue siendo legible y no emite secuencias de escape
   donde nadie las pidió.

### No incluye

- **Retirar `lib/workbench.ts`** y su entrada en los launchers. Es duplicación
  real (`docs/estado-app-terminal.md` §4), pero borrarla toca `pi-ein`, `cc-ein`
  y el installer; sale en un cambio propio una vez esta app lo cubra todo.
- **Estado compartido entre agentes** (§2.5 del roadmap de features). Es un
  diseño en sí mismo, no una tarea de esta app.
- **Ejecución en paralelo de agentes** (§2.3). Diferido al bloque L del roadmap
  canónico.
- **Mover la configuración a `EIN.md`.** Se confirma la desviación deliberada
  del PR #137: los ajustes siguen viviendo en el fichero que ya los posee
  (`.pi/ein/*.json`), y `EIN.md` sigue siendo contexto curado, no configuración.
- **Convertir Engram en un ajuste de proyecto.** No existe un modo persistible:
  hoy se elige por sesión en el preflight de SDD. Engram aparece en la vista de
  sistema como componente instalado/no instalado, que es lo que es.
- Añadir dependencias de TUI (blessed, ink, ratatui-likes). El núcleo sigue
  siendo puro y el driver sigue siendo `stdin`/`stdout` en crudo.

## Dependencias

- **O** (`archive/…` — la app actual): arquitectura núcleo puro + driver, que se
  conserva y se extiende, no se tira.
- **runtime-session-adapters** (archivado): contrato de adaptadores, referencias
  opacas y plan de lanzamiento. Este cambio lo amplía; no lo reescribe.
- **launcher-update-surface** (archivado): probes de actualización que alimentan
  la vista de sistema.

## Criterios de aceptación

1. Desde la app se puede reanudar una sesión concreta de Pi y una de Claude
   Code, y el proceso hereda el proyecto y el home aislado correcto.
2. La lista de sesiones muestra sesiones de los dos runtimes con su última
   frase del humano y su antigüedad.
3. Los siete ajustes del proyecto se leen y se cambian desde la app, y el valor
   mostrado después de cambiar es el que dice el disco.
4. La vista de estado nombra rama, cambios sin confirmar, cambio SDD activo,
   fase y siguiente paso.
5. Ningún `enter` responde "read-only in this view": toda fila o tiene acción o
   no está seleccionable.
6. Un comando de sistema solo se ejecuta tras una confirmación explícita, y solo
   si pertenece a la lista cerrada.
7. Con `NO_COLOR`, sin TTY o con `--once`, la salida no contiene secuencias de
   escape.
8. `bun test` en verde desde la raíz y `cd installer && bun run typecheck` sin
   errores.

## Decisiones ya resueltas

### D1 — La referencia opaca se conserva; el `resume` la resuelve por barrido

La referencia pública seguirá siendo `pi:v1:sha256:<hex>` / `claude:v1:sha256:<hex>`
(hash irreversible del id privado). Para reanudar, el adaptador **vuelve a
barrer** las sesiones del proyecto y busca la que hashea a esa referencia. Así
el id privado nunca cruza la frontera pública y `resume` deja de ser imposible.

### D2 — El plan de lanzamiento admite `argv`, pero solo el que construye el adaptador

`LaunchPlan.argv` deja de ser `readonly []`. La validación pasa a exigir una
**forma exacta** por proveedor y modo (`[]` al crear; `["--session", <id>]` en
Pi y `["--resume", <id>]` en Claude al reanudar), con el id validado contra un
patrón UUID. Ningún dato del llamante se convierte en argumento libre ni en
cadena de shell; `shell: false` se mantiene.

### D3 — La configuración no se muda a `EIN.md`

Se ratifica lo decidido en el PR #137 y se documenta aquí para que no vuelva a
plantearse: dos fuentes de verdad para el mismo ajuste es peor que una
desviación anotada respecto a §2.2 del documento de features.

### D4 — Engram no es un ajuste de proyecto

No hay fichero de modo ni lector/escritor equivalente a `mode.json` o
`hypa.json`; la elección se hace por sesión en `sdd-preflight`. Un interruptor
en la app sería un interruptor que no enciende nada. Engram se muestra en
sistema como componente.

## Decisiones pendientes — se resuelven en map/design

- Cómo se identifica una sesión de Claude Code sin depender de la codificación
  no documentada del nombre de carpeta.
- Qué se hace cuando el ejecutable del runtime no está en el `PATH` en el
  momento de lanzar (hoy: `exitCode 1` mudo).
- Cuánto de la vista de sistema puede ejecutar la app sin volver a absorber
  responsabilidades del installer (frontera del bloque N).
