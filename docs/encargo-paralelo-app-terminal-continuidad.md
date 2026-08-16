# Encargo paralelo: aplicación de terminal para continuidad

## Misión y límites inmediatos

Prepara e implementa la vía de la aplicación de terminal para continuidad sin tocar la vía central de continuidad que avanza en paralelo con WU4 y WU5.

El repositorio objetivo es `<repo-root>`. Usa ese placeholder para identificar el checkout principal y preparar el worktree hermano autorizado; toda escritura de implementación ocurre en el worktree dedicado.

Pi sigue siendo el producto principal. **Resume** conserva la reanudación nativa y exclusiva del proveedor de origen. **Continue in Pi** y **Continue in Claude** son operaciones distintas: cuando la vía central entregue el contrato validado, cada una creará una sesión nativa **nueva** en el proveedor de destino a partir del proyecto y del checkpoint validados. Nunca convierten transcripciones ni reanudan una sesión de otro proveedor.

`docs/estado-app-terminal.md` sirve como referencia histórica y de estado, no como autorización ni como orden de implementación. `docs/plan-continuidad-pi-claude.md` define la semántica canónica de WU6 y continuidad; el código actual prevalece cuando un documento haya envejecido.

Este es trabajo directo de documentación e implementación, no un cambio SDD. Trabaja como único escritor. No delegues.

## Resultado esperado

Entrega dos slices independientes y reversibles:

1. **T1, obligatoria y ejecutable ahora:** cierra el aislamiento del hogar Pi en `cc-ein app`, con pruebas unitarias, de integración y del paquete aislado.
2. **T2, opcional y preparatoria:** separa en modelo/controlador la semántica visible de Resume y Continue solo cuando pueda hacerlo mediante puertos inyectados y sin conocer ni redefinir WU1-WU5. No conectes Continue a producción antes del rendezvous.

T1 no espera a WU4/WU5. T2 se detiene en cuanto necesite su API real.

## Seguridad para trabajar en paralelo

El checkout principal contiene cambios sustanciales sin confirmar, incluidos WU1-WU3. WU4/WU5 seguirán modificándolo mientras trabajas. No abras una vía de escritura en ese checkout.

### Reglas obligatorias

- Usa un worktree hermano dedicado y una rama propia. Nunca edites el checkout principal sucio.
- Parte del `<base-ref>` confirmado por la persona responsable. No copies archivos sin confirmar del checkout principal.
- No hagas `cherry-pick`, no copies y no recrees implementaciones de WU1-WU5.
- No toques `.atl/`.
- Conserva el modo RDD como propiedad de la persona usuaria. Consulta su estado solo si la entrega lo exige; nunca lo habilites.
- No hagas commit, push ni PR sin autorización humana explícita posterior.
- No instales dependencias, no uses red y no ejecutes revisión nativa.
- No cambies paquetes, locks, documentación existente ni estado Git ajeno a la creación autorizada del worktree y su rama.
- No reutilices, copies ni enlaces simbólicamente `.codegraph/` desde el checkout principal. El worktree necesita su propio índice.

### Preparación segura

La persona responsable elige `<base-ref>` y la ruta hermana `<worktree-path>`. No sustituyas esos valores por una suposición. La creación del worktree y de la rama también requiere su autorización porque modifica metadatos Git compartidos.

```bash
# Ejecutar desde el repositorio principal solo tras confirmar ambos placeholders.
git worktree add -b "<branch-name>" "<worktree-path>" "<base-ref>"

# Todo el trabajo posterior ocurre dentro del worktree dedicado.
git -C "<worktree-path>" status --short --branch
git -C "<worktree-path>" rev-parse --show-toplevel
```

Inicializa CodeGraph dentro de ese worktree únicamente si falta su índice:

```bash
test -d "<worktree-path>/.codegraph" || gentle-ai codegraph init --cwd "<worktree-path>"
codegraph status
```

No ejecutes `codegraph init` en el checkout principal y no pongas el worktree en `/tmp` ni en otro directorio temporal. Usa una ruta hermana bajo el mismo directorio de proyectos, por ejemplo `../ein-agent-worktrees/<nombre>`, solo si la persona responsable la aprueba.

## Verdad actual verificada

### Arquitectura y flujo de llamadas

La aplicación mantiene tres capas claras:

| Capa | Archivo | Responsabilidad actual |
|---|---|---|
| Modelo puro | `ein-pi/agent/lib/terminal-app.ts` | Define filas, acciones, vistas, teclas y renderizado. `handleKey()` transforma una tecla en modelo y `AppEffect`. |
| Controlador sin renderer | `ein-pi/agent/lib/terminal-app-controller.ts` | Lee puertos, conserva el snapshot y ejecuta efectos. Cede la terminal antes de lanzar y la recupera si el runtime no está disponible. |
| Driver y costuras | `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | Lee disco, crea el controlador, pinta, descubre sesiones y construye/ejecuta lanzamientos de producción. |
| Entrada ejecutable | `ein-pi/agent/app.ts` | Ejecuta `adoptEinAgentHome()` antes del import dinámico del driver y llama a `runTerminalApp()`. |

El flujo de una fila de sesión es:

```text
buildSessionsView()
  -> RowAction de sesión con provider + referencia opaca
  -> handleKey()
  -> AppEffect { kind: "launch", provider, reference }
  -> createTerminalAppController().executeExternal()
  -> lifecycle.release()
  -> productionLaunch(cwd, provider, reference)
  -> adapter.resume(state, reference)
  -> buildLaunchPlan()
  -> resolveSessionReference() vuelve a barrer el store del mismo proveedor
  -> executeLaunchPlan()
  -> exit con el código, o lifecycle.resume() si el runtime no está disponible
```

Las filas **Start Pi** y **Start Claude Code** recorren el mismo límite sin referencia y llaman a `adapter.create()`. El controlador no depende de TTY, renderer, OpenTUI ni Solid.

El descubrimiento de sesiones de producción sigue este camino:

```text
createTerminalAppControllerFactoryForCwd()
  -> readSessions()
  -> productionSessions()
  -> projectProjectState()
  -> collectRuntimeSessions()
  -> scanProjectSessions() para Pi
  -> scanClaudeProjectSessions() para Claude
```

`collectRuntimeSessions()` mezcla ambos proveedores por recencia, limita la lista y emite referencias opacas. `scanProjectSessions()` resuelve su directorio en cada llamada mediante `EIN_PI_AGENT_HOME ?? AGENT_DIR`. Esa segunda rama es el riesgo de aislamiento.

### Brecha de `cc-ein app`

`cc-ein/sync.ts` compila `ein-pi/agent/app.ts` como el binario aislado `~/.claude-ein/bin/ein-app`. `cc-ein/cc-ein.fish` despacha `cc-ein app` a ese binario y hoy exporta `CLAUDE_CONFIG_DIR` y antepone su `bin/` a `PATH`, pero no exporta `EIN_PI_AGENT_HOME`.

`ein-pi/agent/lib/agent-home.ts` intenta adoptar `~/.pi-ein/agent` cuando existe. Si no existe y el launcher no declaró el hogar, no exporta nada; más tarde el lector Pi puede usar `AGENT_DIR`, que puede representar `~/.pi/agent`. La aplicación empaquetada no debe depender de que el directorio aislado ya exista para evitar leer el hogar convencional.

Los lanzamientos ya tienen un contrato distinto y correcto. `buildLaunchPlan()` fija para Pi `PI_CODING_AGENT_DIR` y `EIN_PI_AGENT_HOME` en `~/.pi-ein/agent`; para Claude fija `CLAUDE_CONFIG_DIR` y `PATH`. Valida una forma cerrada de `argv`, conserva `shell: false` y rechaza una referencia emitida por otro proveedor. No rediseñes ese contrato para corregir el descubrimiento.

### Contratos que no pueden degradarse

- Resume reanuda únicamente la sesión seleccionada en su proveedor de origen.
- La referencia opaca se resuelve con un barrido acotado del store; ningún ID privado pasa a la UI ni se persiste en un mapa reversible.
- Pi usa exactamente `--session <uuid>` y Claude usa exactamente `--resume <uuid>` para Resume.
- Crear una sesión nativa sigue usando `argv: []` hasta que el contrato validado de WU4/WU5 aporte la entrada de Continue.
- Los planes conservan ejecutable confiable, entorno exacto, `cwd` del proyecto y `shell: false`.
- El controlador ejecuta `lifecycle.release()` antes del proceso externo. Si el runtime no existe, ejecuta `lifecycle.resume()`, publica el error y mantiene viva la app.
- Una excepción de lanzamiento o comando termina de forma segura con código 1.
- No-TTY, `--once` y un TTY sin entrada conservan paridad byte a byte; no emiten escapes y mantienen una única nueva línea final.
- La pantalla alterna y el raw mode se toman y liberan una sola vez por transición.

## Semántica: Resume frente a Continue

| Propiedad | Resume | Continue in Pi / Continue in Claude |
|---|---|---|
| Origen de la acción | Una fila de sesión nativa existente. | Estado actual del proyecto y checkpoint validado. |
| Proveedor | El proveedor que emitió la referencia. | El destino elegido explícitamente. |
| Resultado | Reabre la sesión nativa existente. | Crea una sesión nativa nueva en el destino. |
| Referencia de sesión | Usa la referencia opaca de la fila y la resuelve dentro del proveedor. | No reinterpreta ni transporta una referencia de sesión de origen. |
| Transcripción | Permanece en su store nativo. | No se copia, convierte, resume ni inyecta. |
| Entrada de continuidad | Ninguna. | Resume brief acotado entregado por la API validada de la vía central. |
| Disponibilidad ahora | Producción, debe permanecer intacta. | No disponible en producción hasta el rendezvous con WU4/WU5. |
| Fallo del runtime | La app recupera la terminal y muestra el motivo. | Debe conservar el mismo comportamiento cuando exista el puerto real. |

Una etiqueta, fila o tecla nunca debe hacer pasar Resume por continuidad. Una sesión Pi no se reanuda en Claude y una sesión Claude no se reanuda en Pi.

## Slice T1: aislamiento de hogar Pi

T1 es el primer trabajo y puede completarse sin WU4/WU5.

### Resultado obligatorio

Todas las lecturas y resoluciones de sesiones Pi realizadas por la aplicación empaquetada reciben de forma explícita el hogar EIN Pi previsto, mediante `EIN_PI_AGENT_HOME` o la costura canónica existente. `cc-ein app` no cae silenciosamente en `~/.pi/agent`, aunque `~/.pi-ein/agent` no exista al iniciar.

Usa la arquitectura actual y la costura más pequeña. La dirección preferida es que el launcher propietario del entorno declare el hogar antes de ejecutar el binario y que una prueba de producción demuestre la propagación hasta el lector. Si necesitas tocar una capa compartida, justifica por qué una corrección localizada en `cc-ein/cc-ein.fish` más su prueba no basta.

### Requisitos de implementación

1. Declara de forma explícita el hogar Pi aislado para `cc-ein app` antes de arrancar el binario.
2. Demuestra que el descubrimiento inicial, la recarga de la vista de sesiones y la resolución de una referencia Resume leen el mismo hogar inyectado.
3. Conserva el comportamiento actual cuando la variable ya llega declarada por un propietario superior; no sustituyas una decisión explícita por una inferencia.
4. Conserva Resume, forma exacta de los planes, `shell: false`, liberación/recuperación de terminal, errores y paridad de nueva línea.
5. Añade regresiones focalizadas con dos hogares simultáneos: el hogar EIN contiene una sesión permitida y el hogar convencional contiene una sesión señuelo que nunca aparece ni se resuelve.
6. Incluye una regresión del launcher empaquetado/aislado, no solo una prueba directa de `collectRuntimeSessions()` con `process.env` preparado a mano.
7. Mantén T1 por debajo de 400 líneas modificadas de autoría, sumando adiciones y eliminaciones. Si la corrección es pequeña, no la rellenes.

### Fuera de T1

- Rediseñar el launcher o extraer un framework de proveedores.
- Cambiar el renderer o migrar a OpenTUI.
- Añadir un registro genérico de proveedores.
- Construir Continue, el resume brief, readiness, checkpoints o hooks de ciclo de vida.
- Convertir transcripciones, compartir Engram o retirar workbench.
- Cambiar el contrato cerrado de lanzamiento salvo que una regresión demuestre una violación previa directamente causada por el hogar inyectado.

## Slice T2: preparación de UI y controlador

T2 es opcional. Empieza solo después de cerrar T1 y solo si permanece completamente independiente de WU4/WU5.

### Trabajo permitido

Puedes preparar hechos de view-model y un puerto inyectado que distingan **Resume** de **Continue in Pi/Claude**. La capa pura puede representar disponibilidad, destino y motivo de bloqueo sin importar módulos de continuidad. El controlador puede aceptar una capacidad opcional inyectada, siempre que la ausencia del puerto mantenga Continue oculto o deshabilitado de forma no accionable.

No publiques un botón falso, un callback no-op ni un éxito simulado. Una acción Continue accionable exige un puerto real que haya sido abastecido con la API validada de la vía central.

### Límites estrictos

- No importes, copies, adivines ni redefinas contratos WU1-WU5.
- No construyas el resume brief, reglas de readiness, store de checkpoint, hooks de lifecycle ni integración de lanzamiento por proveedor.
- No cambies las filas Resume ni conviertas su referencia en estado portable.
- No conectes producción desde `terminal-app-entrypoint.ts` a módulos futuros por nombre supuesto.
- No uses un booleano optimista para fingir que una operación de continuidad está lista.
- Mantén T2 por debajo de 400 líneas modificadas de autoría y como unidad reversible independiente.

Si un comportamiento de producción necesita la API de WU4/WU5, **detén T2**. Devuelve una solicitud de rendezvous con el tipo, función y comportamiento exactos que necesitas; no inventes una solución provisional.

## Propiedad de archivos

La tabla refleja los archivos actuales verificados. “Condicional” significa que debes registrar la necesidad y el riesgo antes de editar; no concede propiedad automática.

| Nivel | Rutas | Regla |
|---|---|---|
| Permitido, núcleo T1/T2 | `ein-pi/agent/lib/terminal-app.ts` | Solo modelo, filas, acciones y render neutral. T1 probablemente no necesita tocarlo. |
| Permitido, núcleo T1/T2 | `ein-pi/agent/lib/terminal-app-controller.ts` | Solo puertos y efectos de la app. No importar continuidad. |
| Permitido, costura de app | `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` | Descubrimiento/driver y futura inyección neutral; evita tocar producción en T2 antes del rendezvous. |
| Permitido, launcher T1 | `cc-ein/cc-ein.fish` | Punto mínimo probable para declarar `EIN_PI_AGENT_HOME` en `cc-ein app`. |
| Permitido, pruebas focalizadas | `tests/terminal-app.test.ts` | Semántica de filas, teclas y render. |
| Permitido, pruebas focalizadas | `tests/terminal-app-controller.test.ts` | Puertos, efectos, release/resume y ausencia de dependencia de renderer. |
| Permitido, pruebas focalizadas | `tests/terminal-app-driver.test.ts` | Driver, `--once`, nueva línea, errores y handoff de terminal. |
| Permitido, pruebas focalizadas | `tests/terminal-app-pty.test.ts` | Ciclo de vida en PTY real. |
| Permitido, integración T1 | `tests/surface-wiring.test.ts` | Añade la regresión de `cc-ein app` y entorno aislado sin ampliar otras superficies. |
| Permitido, sesiones T1 | `tests/runtime-sessions.test.ts` | Prueba hogares EIN/convencional simultáneos y ausencia de fuga. |
| Condicional | `ein-pi/agent/app.ts` | Ya adopta el hogar antes del import dinámico. Tócalo solo si el launcher no puede garantizar el contrato y demuestra la causa. |
| Condicional | `ein-pi/agent/lib/agent-home.ts` | Costura compartida de adopción. No debilites la precedencia del entorno ni añadas fallback convencional. |
| Condicional | `ein-pi/agent/lib/sessions.ts` | Lector compartido Pi; tiene muchos consumidores. Prefiere no cambiarlo para un defecto del launcher. |
| Condicional | `ein-pi/agent/lib/runtime-sessions.ts` | Lista compartida. Solo cambia inyección explícita si una prueba demuestra que el launcher no puede cerrar el límite. |
| Condicional | `ein-pi/agent/lib/runtime-session-adapters.ts` | Resume, resolución opaca y planes de lanzamiento compartidos. Alto riesgo de colisión; no debería ser necesario para T1. |
| Condicional | `cc-ein/sync.ts` | Compila la app canónica como `ein-app`. Tócalo solo para una prueba/costura de empaquetado imposible desde el launcher. |
| Condicional, regresiones | `tests/sessions.test.ts`, `tests/runtime-session-resume.test.ts`, `tests/runtime-session-adapters.test.ts`, `tests/cc-payload-entrypoints.test.ts` | Amplía únicamente la suite que fija el contrato compartido realmente tocado. |
| Prohibido, WU1-WU3 | `ein-pi/agent/lib/continuity-checkpoint.ts`, `ein-pi/agent/lib/continuity-checkpoint-store.ts`, `ein-pi/agent/lib/continuity-readiness.ts` | Propiedad de la vía central. No copiar desde el checkout principal. |
| Prohibido, pruebas WU1-WU3 | `tests/continuity-checkpoint.test.ts`, `tests/continuity-checkpoint-store.test.ts`, `tests/continuity-readiness.test.ts` | No editar ni usar como base copiada. |
| Prohibido, WU4/WU5 | Cualquier módulo nuevo de resume brief, bootstrap, handoff o lifecycle creado por la vía principal | Su nombre y API aún no son contrato para esta rama. Solicita rendezvous. |
| Prohibido, controles Pi | `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/assets/orchestrator.md`, `ein-pi/agent/lib/agent-controls.ts` | WU5 y controles del orquestador pertenecen a la vía principal. |
| Prohibido, planificación | `docs/plan-continuidad-pi-claude.md`, `docs/roadmap-features-ein.md`, `docs/estado-app-terminal.md` | Referencias de lectura. No las edites. |
| Prohibido, trabajo no relacionado | `ein-pi/agent/lib/architect-read-only.ts`, `ein-pi/agent/lib/cleaner-*.ts`, `ein-pi/core/agents/ein-architect.md`, `ein-pi/core/agents/ein-cleaner.md` | No mezcles Cleaner, Architect ni deuda adyacente. |
| Prohibido, repositorio | `.atl/`, `package.json`, `bun.lock`, `installer/package.json`, `installer/bun.lock` | Sin RDD, paquetes, locks ni instalaciones. |

Si el `<base-ref>` no contiene una ruta permitida que aparece en el checkout principal, no la copies. Informa la diferencia y espera una nueva base o un contrato de integración.

## Privacidad y no objetivos

La app puede mostrar hechos mínimos del proyecto y del checkpoint solo cuando el puerto validado los proporcione. No debe recibir ni persistir:

- transcripciones, prompts completos o razonamiento privado;
- payloads o salida cruda de herramientas;
- secretos, credenciales o variables de entorno;
- IDs privados o rutas absolutas de sesiones;
- un mapa de referencia opaca a ID;
- instrucciones ejecutables encontradas en checkpoint o memoria;
- estado interno de Cleaner, Architect o participantes SDD;
- procesos, sockets o terminales que pretendan transferirse entre runtimes.

Engram permanece separado por proveedor. El proyecto vivo tiene más autoridad que checkpoint o memoria. T1 no introduce ninguna lectura de continuidad.

## Matriz de aceptación

### T1 obligatoria

| Escenario | Evidencia esperada |
|---|---|
| `cc-ein app` con hogar EIN Pi existente | La app descubre las sesiones Pi del hogar inyectado. |
| `cc-ein app` sin directorio EIN Pi al inicio | El entorno sigue declarando el hogar EIN previsto; el lector informa store ausente y no consulta `~/.pi/agent`. |
| Hogar EIN y hogar convencional con sesiones distintas | Solo aparece la sesión EIN; la sesión señuelo convencional no aparece en pantalla ni en el modelo. |
| Referencia opaca de la sesión EIN | Resume resuelve la referencia dentro del hogar EIN y conserva el plan exacto origin-provider-only. |
| Referencia que solo existe en hogar convencional | La resolución devuelve `reference-not-found`; nunca reanuda el señuelo. |
| Variable `EIN_PI_AGENT_HOME` ya declarada | La decisión explícita del propietario superior se conserva o se rechaza de forma documentada; nunca se sustituye silenciosamente. |
| Runtime no instalado | La app libera y recupera la terminal, muestra el motivo y permite salir. |
| Plan Pi/Claude | `argv`, entorno y `shell: false` siguen siendo exactos. |
| No-TTY, `--once` y sin lector de teclas | Salida byte a byte equivalente, sin escapes y con la nueva línea actual. |
| PTY real | Una sola entrada/salida de pantalla alterna por transición y código de salida propagado. |
| Payload compilado aislado | El binario ejecutado mediante `cc-ein app --once` no necesita credenciales ni toca hogares reales. |

### T2 opcional

| Escenario | Evidencia esperada |
|---|---|
| Puerto Continue ausente | No existe acción accionable: permanece oculta o explícitamente deshabilitada, sin no-op. |
| Hechos de capacidad inyectados | La UI distingue Resume de Continue sin importar módulos de continuidad. |
| Selección de Resume | Conserva proveedor y referencia opaca actuales sin pasar por el puerto Continue. |
| Selección de Continue en test | Emite destino y solicitud neutral al puerto falso de test; no construye brief ni plan de runtime. |
| Puerto informa bloqueo/no disponibilidad | La UI muestra el estado sin lanzar, convertir sesión ni mutar checkpoint. |
| Producción sin API WU4/WU5 | No se conecta nada; T2 termina con solicitud de rendezvous. |
| Renderer | El controlador sigue sin depender de TTY, tema, OpenTUI o Solid. |

## Verificación exigida

Ejecuta primero la suite mínima que cubra los archivos tocados. Después ejecuta los contratos compartidos afectados. Estos comandos salen de los scripts actuales (`test: bun test`, `typecheck: tsc --noEmit`) y de las suites existentes.

### Pruebas focalizadas de app

```bash
bun test tests/terminal-app.test.ts tests/terminal-app-controller.test.ts tests/terminal-app-driver.test.ts tests/terminal-app-pty.test.ts
```

### Pruebas de sesiones, Resume y aislamiento empaquetado

```bash
bun test tests/runtime-sessions.test.ts tests/sessions.test.ts tests/runtime-session-resume.test.ts tests/runtime-session-adapters.test.ts
bun test tests/surface-wiring.test.ts tests/cc-payload-entrypoints.test.ts
```

No afirmes un número histórico de pruebas. Registra el conteo exacto que Bun emita en esta rama para cada comando.

Como línea base de esta investigación, el checkout observado el 14 de agosto de 2026 produjo `106 pass` en las cuatro suites de app, `61 pass` en las cuatro suites de sesión/Resume y `34 pass` en las dos suites de wiring/payload, todos con `0 fail`. Estos conteos verifican los comandos actuales; no sustituyen la evidencia que debes recoger en tu base y worktree.

### Typecheck y diff

```bash
bun run typecheck
git diff --check
git diff --stat
git diff --numstat
git status --short
```

Calcula el presupuesto de cada slice como adiciones más eliminaciones de autoría. Mantén T1 y T2 por separado y cada uno por debajo de 400 líneas. No uses un commit para definir la frontera: una unidad sin commit también necesita alcance, evidencia y rollback propios.

### Smoke real sin credenciales

El smoke debe usar un directorio temporal propiedad del harness, nunca el `HOME` real. Debe crear un proyecto, un hogar EIN Pi y un hogar convencional señuelo. No uses sesiones ni credenciales reales.

Verifica, como mínimo:

1. `bun ein-pi/agent/app.ts --once --project "$PROJECT"` con `HOME`, `EIN_PI_AGENT_HOME` y `CLAUDE_CONFIG_DIR` apuntando al harness.
2. La suite `tests/terminal-app-pty.test.ts`, que usa `Bun.Terminal`, para salida normal, runtime no disponible y handoff tras liberar la pantalla.
3. Un binario local compilado desde `ein-pi/agent/app.ts`, ejecutado a través de una copia de `cc-ein/cc-ein.fish` con `cc-ein app --once --project "$PROJECT"`.
4. La salida/modelo incluye solo la sesión EIN y no contiene el texto único de la sesión señuelo convencional.

Una forma segura del harness empaquetado es:

```bash
HARNESS="$(mktemp -d)"
trap 'rm -rf -- "$HARNESS"' EXIT
export HOME="$HARNESS/home"
export PROJECT="$HARNESS/project"
export CC_EIN_LAUNCHER="$PWD/cc-ein/cc-ein.fish"
mkdir -p "$HOME/.claude-ein/bin" "$HOME/.pi-ein/agent" "$HOME/.pi/agent" "$PROJECT"
bun build --compile ein-pi/agent/app.ts --outfile "$HOME/.claude-ein/bin/ein-app"

# El test/harness debe poblar stores sintéticos en ambos hogares antes de invocar.
# Fuentea una copia de cc-ein.fish bajo el HOME temporal; no instales el launcher.
env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 NO_COLOR=1 \
  CC_EIN_LAUNCHER="$CC_EIN_LAUNCHER" PROJECT="$PROJECT" \
  fish -c 'source "$CC_EIN_LAUNCHER"; cc-ein app --once --project "$PROJECT"'
```

No ejecutes literalmente el ejemplo hasta poblar los dos stores sintéticos con textos señuelo distintos. El test automatizado es preferible porque debe limpiar incluso ante fallo. No ejecutes `cc-ein/sync.ts`: además de escribir un destino, configura MCP y puede usar red. Compila directamente el entrypoint con las dependencias ya presentes.

## Condiciones de parada

Detén el trabajo y reporta un bloqueo si ocurre cualquiera de estas condiciones:

- La persona responsable no ha elegido `<base-ref>` o `<worktree-path>`.
- El worktree dedicado contiene cambios ajenos que colisionan con una ruta necesaria.
- El `<base-ref>` carece de una costura requerida que solo existe sin confirmar en el checkout principal.
- T1 exige tocar un módulo de continuidad o recrear WU1-WU5.
- T2 necesita conocer el tipo, función, resultado o lifecycle de WU4/WU5.
- La única forma encontrada expone Continue accionable sin puerto validado.
- Una prueba requiere credenciales, hogares reales, red, instalación o revisión nativa.
- La solución degrada Resume, `shell: false`, resolución opaca, paridad de nueva línea o ciclo de terminal.
- T1 o T2 alcanza 400 líneas modificadas de autoría. Divide por comportamiento antes de continuar; no pidas una excepción por comodidad.
- Necesitas tocar un archivo prohibido o ampliar una ruta condicional sin justificación verificable.

Una solicitud de rendezvous debe tener esta forma:

```text
Rendezvous requerido para T2
- Tipo o función necesaria: <nombre exacto o responsabilidad aún sin nombre>
- Entrada mínima: <hechos validados que la app debe entregar>
- Resultado mínimo: <ready/warned/blocked, destino, error, etc.>
- Semántica requerida: <qué debe ocurrir y qué nunca debe ocurrir>
- Punto de inyección propuesto: <archivo + símbolo actual>
- Razón por la que no puede resolverse con un puerto neutral existente: <evidencia>
- Producción permanece: sin cablear / acción oculta / acción deshabilitada
```

## Rendezvous de coordinación

Antes de integrar, informa:

- la forma exacta del puerto terminal exportado, inyectado o solicitado;
- si T1 está completo y es integrable por separado;
- los archivos exactos modificados;
- los commits exactos solo si la persona autorizó crearlos después;
- cada comando de prueba, conteo exacto y resultado;
- el harness real usado para PTY, `--once` y paquete aislado;
- las líneas modificadas de autoría de T1 y T2 por separado;
- la frontera de rollback de cada slice;
- conflictos esperados con WU4/WU5;
- necesidades de rendezvous pendientes.

La vía principal entregará más adelante la API validada de resume brief y lifecycle. La vía terminal la consume; **nunca la posee, redefine ni duplica**.

No integres, no hagas cherry-pick y no copies cambios al checkout principal hasta que la persona responsable o el agente principal seleccione explícitamente la unidad que debe entrar.

## Plantilla de evidencia

```markdown
# Evidencia de la vía terminal

## Base y aislamiento
- Base ref acordada: `<sha/ref>`
- Worktree: `<ruta hermana>`
- Rama: `<rama>`
- Índice CodeGraph propio: `sí/no` + comando de estado
- Checkout principal editado: `no`

## T1
- Estado: `completo/bloqueado`
- Archivos: `<rutas exactas>`
- Comportamiento: `<antes -> después>`
- Pruebas: `<comando>` -> `<N pass, M fail, K skip, exit>`
- Harness: `<PTY/--once/paquete aislado y hogares sintéticos>`
- Líneas de autoría: `<adiciones + eliminaciones = total>`
- Rollback: `<archivos y comportamiento retirables sin afectar Resume>`

## T2
- Estado: `no iniciado/preparado/bloqueado por rendezvous`
- Puerto usado o solicitado: `<firma exacta>`
- Producción cableada: `no`, salvo autorización tras API validada
- Acción sin puerto: `oculta/deshabilitada`
- Pruebas: `<comando>` -> `<conteo exacto>`
- Líneas de autoría: `<total>`
- Rollback: `<frontera independiente>`

## No regresiones
- Resume origin-provider-only: `<evidencia>`
- Referencias opacas: `<evidencia>`
- Planes exactos y `shell: false`: `<evidencia>`
- Release/resume de terminal: `<evidencia>`
- Error y nueva línea: `<evidencia>`
- Sin fuga desde `~/.pi/agent`: `<evidencia>`

## Coordinación
- Conflictos esperados con WU4/WU5: `<ninguno o lista exacta>`
- Rendezvous pendiente: `<ninguno o solicitud exacta>`
- Commits: `<ninguno / hashes autorizados>`
- Integración al checkout principal: `no realizada`
```

## Definición de terminado

T1 termina cuando:

- `cc-ein app` declara explícitamente el hogar EIN Pi antes de cualquier lectura;
- descubrimiento, resumen de sesión y resolución de Resume no leen el hogar convencional;
- una regresión empaquetada prueba simultáneamente el hogar permitido y el señuelo;
- Resume, planes exactos, `shell: false`, errores, terminal y nueva línea conservan sus pruebas;
- las suites focalizadas y `bun run typecheck` pasan con conteos registrados;
- el smoke PTY, `--once` y compilado aislado usa hogares sintéticos y cero credenciales;
- T1 permanece por debajo de 400 líneas de autoría y tiene rollback independiente;
- no se tocó WU1-WU5, `.atl/`, paquetes, locks, docs existentes ni el checkout principal.

T2 termina cuando cumple una de estas dos salidas válidas:

- prepara una separación renderer-neutral probada, sin dependencia de continuidad y sin acción de producción falsa; o
- se detiene con una solicitud exacta de rendezvous porque necesita la API validada de WU4/WU5.

El encargo completo no autoriza commit, push ni PR. Si la persona responsable autoriza commits después, usa unidades de trabajo independientes, con pruebas junto al comportamiento. Mensajes orientativos:

```text
fix(terminal-app): isolate packaged Pi session discovery
feat(terminal-app): prepare injected continue actions
```

No crees el segundo commit si T2 solo produce una solicitud de rendezvous. La autorización para implementar no equivale a autorización para entregar.
