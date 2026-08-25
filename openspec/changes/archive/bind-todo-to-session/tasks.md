# Tasks — bind-todo-to-session

status: ready
blocked_by: none

skill_notes: `ein-discipline` y `architecture` aplican a la secuencia SDD, TDD y límites de autoridad. `next-best-practices` y `pinia` no aplican porque no hay Next.js, Vue ni stores en el diseño. `vitest` no aplica directamente porque esta suite usa Bun; se conserva su disciplina de pruebas aisladas sin introducir APIs de Vitest.

## // 001. Contrato versionado de session binding

- [x] 1.1 Crear el contrato puro y exacto de binding, eventos y metadata de lanzamiento en `ein-pi/agent/lib/sdd-session-binding.ts`, probado por `tests/sdd-session-binding.test.ts`: `SessionBinding`, `SessionBindingEntryV1`, `SessionBindingEventV1`, `SDD_SESSION_BINDING_CUSTOM_TYPE`, `SDD_SESSION_BINDING_EVENT_CHANNEL`, `EIN_SDD_SESSION_BINDING_ENV_KEY` y parsers/serializadores exact-key V1.
  - skills: `ein-discipline`, `architecture`
  - why: Todos los productores y consumidores necesitan un único contrato fail-closed antes de integrar I/O.
  - learn: Un payload versionado y de claves cerradas convierte datos de sesión no confiables en un límite explícito.
  - architecture: Este módulo es `[CORE]`: funciones deterministas, sin leer entorno, filesystem, sesiones ni event bus.
  - avoid: No aceptar claves extra, coerciones, versiones desconocidas ni nombres inseguros; no añadir estado global o una selección generalista.
  - red: `bun test tests/sdd-session-binding.test.ts` debe fallar primero por contratos/parsers ausentes y cubrir válidos, malformed, extra keys, unknown version y serialización canónica.
  - green: `bun test tests/sdd-session-binding.test.ts` debe pasar con la implementación mínima del contrato.
  - triangulate: Añadir al menos un caso válido y uno adversarial por cada unión (entry, event, launch metadata), volver a ejecutar `bun test tests/sdd-session-binding.test.ts` y registrar el resultado.
  - refactor: Simplificar guards duplicados sin ampliar la superficie pública; registrar RED → GREEN → TRIANGULATE → REFACTOR en `apply-progress.md`.
  - acceptance: Evidencia de que solo `{version:1,state:"bound",change}`, `{version:1,state:"unbound"}`, los tres eventos exactos y `{version:1,change,projectCwd}` canónico son aceptados.
  - review_dependency: none; contrato fundacional que debe revisarse antes de cualquier consumidor.
  - verify: `bun test tests/sdd-session-binding.test.ts`

## // 002. Restauración pura con autoridad del newest entry

- [x] 2.1 Añadir en `ein-pi/agent/lib/sdd-session-binding.ts` las transiciones puras de restauración/revalidación usadas por la overlay y ampliar `tests/sdd-session-binding.test.ts` para newest-entry authority, clear precedence, launch intent solo sin entry, y clear único tras invalidación.
  - skills: `ein-discipline`, `architecture`
  - why: La decisión de restaurar, limpiar o consumir intent debe ser comprobable sin Pi ni filesystem.
  - learn: En un log append-only, el último evento relevante es autoridad; retroceder al último parseable resucita estado obsoleto.
  - architecture: La función recibe evidencia ya obtenida (entries, resultado de validación e intent capturado) y devuelve transición/efecto solicitado; no ejecuta `appendEntry` ni inspección OpenSpec.
  - avoid: No escanear hacia atrás después de hallar un newest matching entry inválido y no usar sole-change fallback.
  - red: `bun test tests/sdd-session-binding.test.ts -t "restore"` debe fallar primero para malformed newest, clear newest, no matching entry con intent y revalidación repetida.
  - green: `bun test tests/sdd-session-binding.test.ts -t "restore"` debe pasar con la transición mínima fail-closed.
  - triangulate: Probar un older valid seguido por malformed newest y dos revalidaciones de un binding ausente; ejecutar el archivo completo.
  - refactor: Consolidar estados sin ocultar la diferencia entre “sin entry” y “newest inválido”; registrar las cuatro fases TDD.
  - acceptance: La evidencia muestra que nunca revive un entry antiguo y que una invalidación solicita como máximo un V1 clear.
  - review_dependency: `001` aprobado; revisarlo antes de la integración de overlay.
  - verify: `bun test tests/sdd-session-binding.test.ts`

## // 003. Startup, resume e aislamiento de la overlay

- [x] 3.1 Integrar restauración session-local en `ein-pi/agent/extensions/ein-sdd-overlay.ts` (`session_start`, closure `SessionBinding`, `ctx.sessionManager.getEntries()`, captura/borrado de `EIN_SDD_SESSION_BINDING_V1`, `refresh()` y caché `painted`) y demostrarla en `tests/sdd-overlay-repaint.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Una sesión fresca debe quedar vacía y una resume debe recuperar exclusivamente su propio newest entry.
  - learn: El filesystem aporta hechos del cambio, pero la identidad de foco pertenece al log de la sesión activa.
  - architecture: La extensión posee estado por instancia/sesión; consulta OpenSpec solo para validar explícitamente el nombre y renderizar hechos, nunca para elegir por fallback.
  - avoid: No llamar `resolveActiveSelection()` para foco UI, no usar `getBranch()`, y no conservar metadata de entorno tras el primer startup.
  - red: `bun test tests/sdd-overlay-repaint.test.ts -t "session"` debe fallar primero para fresh con un único cambio, restore válido, dos session managers del mismo cwd, clear/malformed newest e intent startup one-shot.
  - green: `bun test tests/sdd-overlay-repaint.test.ts -t "session"` debe pasar con restauración, validación exacta, persistencia del intent y widget vacío fail-closed.
  - triangulate: Añadir missing, archived, unsafe y unavailable inspection; ejecutar `bun test tests/sdd-overlay-repaint.test.ts`.
  - refactor: Mantener una única ruta `refresh()` y eliminar duplicación sin mover estado fuera de la closure; registrar las cuatro fases TDD.
  - acceptance: Evidencia de fresh vacío sin bind implícito, resume aislado, intent consumido/borrado una vez y clear único para binding inválido.
  - review_dependency: `002` aprobado; esta integración debe quedar verde antes de conectar eventos.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts`

## // 004. Listener síncrono, repaint inmediato y limpieza de lifecycle

- [x] 4.1 Conectar en `ein-pi/agent/extensions/ein-sdd-overlay.ts` un único listener de `pi.events` para `ein:sdd-session-binding:v1`, con validación, `pi.appendEntry()`, invalidación de `painted`, `refresh()` same-stack y teardown/rebind sin contexto obsoleto; ampliar `tests/sdd-overlay-repaint.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: El bind explícito debe persistir y pintar antes de que `emit()` retorne, sin listeners supervivientes tras reload o cambio de sesión.
  - learn: La sincronía del EventEmitter solo es útil si toda la cadena crítica evita `await` y el listener no comparte estado global.
  - architecture: El listener muta únicamente la closure de la instancia activa; `bind`, `clear` e `invalidate(change)` pasan de nuevo por validación explícita antes de escribir o pintar.
  - avoid: No usar un singleton, cola async, debounce ni listener que capture para siempre un `ExtensionContext` antiguo.
  - red: `bun test tests/sdd-overlay-repaint.test.ts -t "event"` debe fallar primero para repaint antes del retorno de `emit`, append V1, invalidate solo del foco actual, dedup y reload/listener cleanup.
  - green: `bun test tests/sdd-overlay-repaint.test.ts -t "event"` debe pasar con listener síncrono y lifecycle acotado.
  - triangulate: Probar evento inválido, invalidate de otro cambio, dos refresh y reemplazo de contexto; ejecutar el archivo completo.
  - refactor: Extraer solo helpers locales que reduzcan duplicación entre startup y evento; registrar las cuatro fases TDD.
  - acceptance: Un spy confirma `appendEntry` y `setWidget("ein-sdd", ...)` antes de volver de `emit`; el contexto retirado no vuelve a pintar.
  - review_dependency: `003` aprobado; listener consumidor antes de productores reales.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts`

## // 005. Bind explícito de `/ein:sdd-next <change>`

- [x] 5.1 Modificar `ein-pi/agent/extensions/ein-ai.ts` en el handler de `/ein:sdd-next <change>` y su helper local `publishSessionBinding` para emitir `bind` solo después de resolver con éxito un cambio activo nombrado; cubrir la integración same-stack en `tests/sdd-overlay-repaint.test.ts` sin alterar el router no UI.
  - skills: `ein-discipline`, `architecture`
  - why: Esta interacción aprobada es la fuente explícita de foco dentro de una sesión.
  - learn: Aceptar un argumento `change` no vuelve automáticamente a una herramienta productora de selección; el bind sigue al éxito explícito.
  - architecture: `ein-ai` publica intención validada, pero no persiste entries ni renderiza; la overlay sigue siendo dueña de ambos efectos.
  - avoid: No emitir desde herramientas genéricas/model-callable, intentos fallidos, argumentos ausentes o la selección sole/ambiguous existente.
  - red: `bun test tests/sdd-overlay-repaint.test.ts -t "sdd-next"` debe fallar primero para success named, failure, unnamed y same-stack repaint.
  - green: `bun test tests/sdd-overlay-repaint.test.ts -t "sdd-next"` debe pasar con una única emisión post-éxito.
  - triangulate: Probar nombres unsafe/inactivos y verificar que no hay entry ni repaint; ejecutar también `bun test tests/sdd-router.test.ts`.
  - refactor: Mantener el publisher pequeño y compartible sin convertirlo en servicio global; registrar las cuatro fases TDD.
  - acceptance: Evidencia de un único evento exacto tras éxito y de resultados idénticos en selección explícita, sole y ambiguous del router.
  - review_dependency: `004` aprobado; no publicar hasta que el consumidor síncrono esté probado.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts tests/sdd-router.test.ts`

## // 006. Invalidación inmediata al cerrar el cambio enfocado

- [x] 6.1 Extender en `ein-pi/agent/extensions/ein-ai.ts` el resultado exitoso del cierre SDD para llamar `publishSessionBinding({action:"invalidate", change})`, y cubrir en `tests/sdd-overlay-repaint.test.ts` cierre enfocado, cierre de otro cambio y cierre fallido.
  - skills: `ein-discipline`, `architecture`
  - why: Un cambio cerrado no debe permanecer visible hasta el próximo lifecycle refresh.
  - learn: Un evento `invalidate(change)` conserva aislamiento porque el consumidor decide si coincide con su foco actual.
  - architecture: El productor anuncia el hecho tras éxito; la overlay valida, persiste clear y repinta solo si ese cambio estaba bound.
  - avoid: No emitir `clear` indiscriminado ni invalidar antes de confirmar el cierre canónico.
  - red: `bun test tests/sdd-overlay-repaint.test.ts -t "close"` debe fallar primero para los tres resultados de cierre.
  - green: `bun test tests/sdd-overlay-repaint.test.ts -t "close"` debe pasar con invalidación post-éxito mínima.
  - triangulate: Combinar cierre de A con sesión enfocada en B y repetir lifecycle refresh para confirmar un solo clear.
  - refactor: Reutilizar el publisher sin mezclar lógica de cierre y rendering; registrar las cuatro fases TDD.
  - acceptance: La sesión enfocada en el cambio cerrado queda vacía inmediatamente; otras sesiones/focos no cambian y no hay clears duplicados.
  - review_dependency: `005` aprobado; reutiliza el publisher ya acotado.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts`

## // 007. Metadata validada en planes Pi create

- [x] 7.1 Extender `ein-pi/agent/lib/runtime-session-adapters.ts` en `buildLaunchPlan`, el intent tipado de Pi create y la construcción de `LaunchPlan` para derivar `EIN_SDD_SESSION_BINDING_V1` solo tras safe-name, projectCwd exacto y active-change validation; probarlo en `tests/runtime-session-adapters.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Continue-as-new necesita transportar foco antes del brief sin abrir argv ni filtrar metadata a otros providers.
  - learn: El borde confiable debe derivar metadata desde un intent tipado, no aceptar un valor de entorno preparado por el caller.
  - architecture: El adapter posee validación/serialización del plan; el controller solo entrega intención y la overlay consume el contrato.
  - avoid: No aceptar el JSON reservado como input libre, no poner el cambio en argv o brief, y no permitir intent en resume/Claude.
  - red: `bun test tests/runtime-session-adapters.test.ts -t "binding"` debe fallar primero para Pi create válido, no-focus, invalid name, project mismatch, inactive/unavailable, resume y Claude.
  - green: `bun test tests/runtime-session-adapters.test.ts -t "binding"` debe pasar con la clave condicional exacta.
  - triangulate: Probar JSON canónico estable y ausencia total de la clave en todas las ramas no create; ejecutar el archivo completo.
  - refactor: Mantener derivación en una función determinista y no crear un builder generalista; registrar las cuatro fases TDD.
  - acceptance: El único plan que contiene metadata es Pi create validado y su argv sigue siendo `[]`.
  - review_dependency: `001` aprobado; puede implementarse tras estabilizar el contrato, independientemente de `003`–`006`.
  - verify: `bun test tests/runtime-session-adapters.test.ts`

## // 008. Guard cerrado de argv, entorno y tamper

- [x] 8.1 Endurecer en `ein-pi/agent/lib/runtime-session-adapters.ts` la validación exacta de `LaunchPlan`, el snapshot WeakMap y las superficies `launchArgvFor()`/`isDeclaredLaunchArgv()` para reconocer la clave reservada solo en el Pi create propietario; ampliar `tests/runtime-session-adapters.test.ts` y `tests/runtime-session-resume.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Añadir una clave condicional no puede debilitar la defensa existente contra planes copiados o mutados.
  - learn: Una excepción segura a un allowlist debe estar ligada a procedencia y shape completo, no solo al nombre de la clave.
  - architecture: El snapshot exacto continúa siendo la autoridad del executor; argv conserva su contrato independiente del binding.
  - avoid: No ampliar allowlists globales, reconstruir confianza por igualdad parcial ni permitir metadata en `--session`.
  - red: `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts` debe fallar primero para entorno mutado/copiado, metadata alterada, argumento extra y provider/intent mismatch.
  - green: `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts` debe pasar preservando create `[]`, resume `["--session", validatedUuid]` y `shell:false`.
  - triangulate: Mutar por separado argv, key, value, cwd y provider después de construir el plan; confirmar rechazo sin spawn.
  - refactor: Centralizar comparación exacta sin relajar ownership; registrar las cuatro fases TDD.
  - acceptance: Evidencia de rechazo pre-spawn para toda copia/mutación y de shapes byte-for-byte intactos en create/resume.
  - review_dependency: `007` aprobado; revisión conjunta del nuevo carrier y del guard cerrado.
  - verify: `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`

## // 009. Captura temprana del foco en el controller

- [x] 9.1 Modificar `ein-pi/agent/lib/terminal-app-controller.ts` para capturar `focusedChange` antes de la preparación async y extender únicamente `continueLaunch(provider, brief, focusedChange?)`; actualizar `tests/terminal-app-controller.test.ts` sin cambiar `launch(provider, reference?)` ni picked resume.
  - skills: `ein-discipline`, `architecture`
  - why: El foco que el usuario confirma puede cambiar mientras se prepara el continuity brief.
  - learn: Capturar intención en el action boundary evita una carrera sin convertir el controller en almacén persistente.
  - architecture: El controller enruta un snapshot opcional; no valida OpenSpec, no serializa metadata y no modifica las firmas ordinarias.
  - avoid: No leer el foco después del `await`, añadir binding a `launch`, o adjuntarlo a resume.
  - red: `bun test tests/terminal-app-controller.test.ts -t "continue"` debe fallar primero con una prueba diferida que cambie foco durante prepare, además de no-focus y provider Claude.
  - green: `bun test tests/terminal-app-controller.test.ts -t "continue"` debe pasar entregando exactamente el snapshot capturado.
  - triangulate: Confirmar con spies que ordinary create y picked resume conservan argumentos previos; ejecutar el archivo completo.
  - refactor: Mantener el cambio de firma limitado a `continueLaunch`; registrar las cuatro fases TDD.
  - acceptance: El spy recibe el foco previo al async o `undefined`; ninguna ruta ordinaria gana un argumento nuevo.
  - review_dependency: `008` aprobado para que el consumidor posterior tenga contrato de plan cerrado.
  - verify: `bun test tests/terminal-app-controller.test.ts`

## // 010. Continue-as-new hasta el child Pi

- [x] 10.1 En `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`, propagar `focusedChange` por `productionContinue` hacia el Pi-create intent, revalidarlo al lanzar y pasar el entorno del plan sin cambios por `runContinueInPty`; probar orden, provider isolation y transporte separado en `tests/terminal-app-pty.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: El nuevo proceso debe recibir binding antes de la continuidad por bracketed paste y fallar unavailable si un foco solicitado ya no es válido.
  - learn: La metadata de UI y el contexto del modelo tienen canales y tiempos distintos; mezclarlos hace imposible una garantía pre-turn.
  - architecture: Entrypoint coordina I/O y revalidación al borde; adapter construye el plan, PTY ejecuta su entorno exacto y el brief sigue solo por paste.
  - avoid: No lanzar silenciosamente un foco explícito inválido como bound/unbound, no inyectar JSON en el brief y no transportar intent a Claude.
  - red: `bun test tests/terminal-app-pty.test.ts -t "binding"` debe fallar primero para focus válido, foco stale/unavailable, no-focus, Claude y orden child-metadata-before-brief.
  - green: `bun test tests/terminal-app-pty.test.ts -t "binding"` debe pasar con Pi create `[]` y entorno intacto.
  - triangulate: Probar que picked resume nunca entra en esta ruta y que el contenido del brief no contiene nombre/JSON de binding.
  - refactor: Mantener `runContinueInPty` agnóstico del significado de la clave y registrar las cuatro fases TDD.
  - acceptance: El child Pi recibe la metadata validada separada del brief; invalid focus no spawnea y no-focus/Claude mantienen conducta previa.
  - review_dependency: `009` y `008` aprobados; integra captura del controller con plan confiable.
  - verify: `bun test tests/terminal-app-pty.test.ts tests/terminal-app-controller.test.ts`

## // 011. Sanitización de metadata heredada en Fish

- [x] 11.1 Actualizar `pi-ein/pi-ein.fish` para borrar `EIN_SDD_SESSION_BINDING_V1` antes de delegación ordinaria/default y antes de arrancar terminal app; ampliar `tests/surface-wiring.test.ts` preservando homes aislados, dispatch/installer, `app` forwarding y `command pi $argv` exacto.
  - skills: `ein-discipline`, `architecture`
  - why: Una variable exportada por un shell padre no debe enlazar accidentalmente una sesión fresca directa o Fish.
  - learn: Un carrier one-shot también necesita saneamiento en todos los entrypoints no autorizados, no solo consumo en destino.
  - architecture: Fish elimina input no confiable; únicamente el adapter confiable del child Pi puede volver a añadir la clave.
  - avoid: No filtrar argumentos, cambiar dispatch existente ni borrar variables ajenas.
  - red: `bun test tests/surface-wiring.test.ts -t "EIN_SDD_SESSION_BINDING_V1"` debe fallar primero para default delegation y `app` con metadata heredada.
  - green: `bun test tests/surface-wiring.test.ts` debe pasar con erase focalizado y forwarding intacto.
  - triangulate: Cubrir invocación directa con argumentos arbitrarios y terminal app; confirmar que las dos rutas observan la clave ausente.
  - refactor: Mantener un único erase temprano sin reestructurar el script; registrar las cuatro fases TDD.
  - acceptance: Evidencia de fresh direct/Fish vacío y snapshots previos de argv, homes y dispatch sin cambios.
  - review_dependency: `010` aprobado; cierra el carrier end-to-end sin alterar su inserción confiable.
  - verify: `bun test tests/surface-wiring.test.ts`

## // 012. Regresión focalizada y puertas amplias

- [x] 12.1 Ejecutar y documentar en `apply-progress.md` la suite contractual completa, seguida de la suite y typecheck raíz, corrigiendo únicamente regresiones dentro de las superficies aprobadas y repitiendo el grupo RED/GREEN afectado si aparece un defecto.
  - skills: `ein-discipline`
  - why: El cambio cruza sesión, extensión, launcher, PTY y Fish, y debe preservar selección no UI, renderer puro y contratos globales.
  - learn: Los tests focalizados prueban causalidad; la suite amplia detecta acoplamientos accidentales y el typecheck cubre lo que Bun no comprueba.
  - architecture: La verificación no amplía scope; `project-state.ts`, `sdd-router.ts` y el renderer puro permanecen behaviorally unchanged.
  - avoid: No “arreglar” tests cambiando semántica sole/ambiguous, no introducir typecheck de installer al no tocar producción allí, y no ocultar fallos no relacionados.
  - red: No se fabrica un RED nuevo en esta tarea de verificación; cualquier fallo real se registra y vuelve al grupo propietario para un ciclo RED → GREEN → TRIANGULATE → REFACTOR.
  - green: `bun test tests/sdd-session-binding.test.ts tests/sdd-overlay-repaint.test.ts tests/terminal-app-controller.test.ts tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts tests/terminal-app-pty.test.ts tests/surface-wiring.test.ts tests/sdd-router.test.ts tests/sdd-overlay.test.ts`
  - triangulate: `bun test` debe confirmar aislamiento y compatibilidad fuera de los archivos focalizados.
  - refactor: `bun run typecheck` debe pasar tras cualquier cleanup final; registrar comandos y resultados, no solo una afirmación.
  - acceptance: Los tres comandos conocidos terminan en verde y `apply-progress.md` enlaza cada evidencia con su grupo/review dependency.
  - review_dependency: `001`–`011` aprobados; puerta final antes de verify.
  - verify: `bun test tests/sdd-session-binding.test.ts tests/sdd-overlay-repaint.test.ts tests/terminal-app-controller.test.ts tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts tests/terminal-app-pty.test.ts tests/surface-wiring.test.ts tests/sdd-router.test.ts tests/sdd-overlay.test.ts && bun test && bun run typecheck`
