# Tasks — terminal-app-rework

status: ready
blocked_by: none

> Orden forzado: nada de la app nueva es verificable de verdad hasta que
> `resume` exista. Cada grupo tiene puerta de test propia y es un commit.

## // 001. Reanudación real en los adaptadores

- [x] 1.1 Test RED: `resume` de Pi resuelve una referencia opaca a un plan con `["--session", "<uuid>"]`
  - why: Es el bloqueo raíz (`runtime-session-adapters.ts:789`); sin él la app no puede continuar el trabajo de otro agente
  - verify: `bun test tests/runtime-session-resume.test.ts` falla nombrando `operation-not-supported`

- [x] 1.2 Resolver la referencia opaca por barrido en `lib/sessions.ts`
  - why: El id privado no puede volver por la frontera pública, pero sí se puede reencontrar re-escaneando y comparando `sha256(id)`
  - architecture: La función vive con el lector de sesiones; el adaptador la consume, nunca al revés
  - avoid: Persistir un mapa referencia→id; eso es revertir el hash en disco
  - verify: test unitario con fixture de store falso

- [x] 1.3 Implementar `resumeSessionRequest` para Pi y Claude
  - why: Devolver `LaunchIntent` en modo `resume` con el id resuelto
  - avoid: Filtrar el id en `AdapterResult`; el intent es interno al par resume→launch
  - verify: 1.1 pasa a verde; test de `reference-not-found` con referencia huérfana

- [x] 1.4 Ampliar `LaunchPlan.argv` a la tabla cerrada de cuatro formas
  - why: `argv: readonly []` es lo que impide lanzar un resume (`:196-205`)
  - architecture: Forma exacta por proveedor y modo; uuid validado por patrón; `shell: false` inmutable
  - verify: test de que `["--session", "x; rm -rf /"]` y `[..., "--dangerously"]` dan `invalid-request`

- [x] 1.5 Ampliar `buildLaunchPlan` al modo `resume`
  - why: `:977` corta el modo resume antes de construir nada
  - verify: plan de Pi y de Claude con su `argv` exacto y su env aislado

- [x] 1.6 Actualizar la matriz de capacidades: `resume` soportado en ambos, `list` soportado en Claude
  - why: La matriz es lo que la app consulta para decidir si una fila es reanudable
  - avoid: Declarar soporte antes de que la implementación exista

## // 002. Sesiones de los dos runtimes

- [x] 2.1 Test RED: el barrido de Claude encuentra las sesiones del proyecto por su `cwd`
  - why: El nombre de carpeta de Claude es lossy (`01_Proyectos` y `01-Proyectos` colisionan)
  - verify: `bun test tests/claude-sessions.test.ts` falla por módulo ausente

- [x] 2.2 Crear `lib/claude-sessions.ts`: barrido acotado del store de Claude
  - architecture: Mismo contrato que `scanProjectSessions` de Pi; tope de ficheros y de bytes por fichero
  - avoid: Decidir pertenencia por el nombre de carpeta
  - verify: 2.1 en verde, incluido el caso de colisión

- [x] 2.3 Ampliar `lib/agent-home.ts` con la resolución del home de Claude
  - why: `CLAUDE_CONFIG_DIR` o `~/.claude-ein`; nunca asumir `~/.claude`, que es el Claude vanilla del usuario
  - verify: test de precedencia y de que vanilla no se asume

- [x] 2.4 Ampliar `session-summary.ts` al formato de Claude
  - why: `userText()` solo entiende el array de partes de Pi
  - avoid: Aceptar `tool_result`, turnos de subagente o texto de asistente como frase del humano
  - verify: tests con fixtures de los dos formatos y de los tres casos a descartar

- [x] 2.5 Crear `lib/runtime-sessions.ts`: lista unificada y ordenada por recencia
  - why: R4 — una sola lista; hoy hay dos vistas con la misma información
  - avoid: Presentar un store ilegible como "sin sesiones"
  - verify: test de mezcla, orden y declaración de store ausente

## // 003. Tema y catálogo de ajustes

- [x] 3.1 Test RED: la paleta emite ANSI cuando hay color y nada cuando no
  - verify: `bun test tests/theme.test.ts` falla por módulo ausente

- [x] 3.2 Crear `lib/theme.ts` con la paleta de marca y la medida de ancho visible
  - architecture: Puro; el driver decide si hay color, el tema solo obedece
  - avoid: Leer `brand.json` en runtime; el installer ya duplica la paleta por el mismo motivo
  - verify: 3.1 en verde; test de que `visibleWidth` ignora las secuencias ANSI

- [x] 3.3 Añadir idioma del agente y de artefactos al catálogo de ajustes
  - why: Los lectores y escritores ya existen en `lib/lang.ts`; solo falta cableado
  - verify: test de lectura, de ciclado y de escritura rechazada por cada uno

## // 004. Núcleo de la aplicación

- [x] 4.1 Test RED: el dashboard lista las acciones con su atajo y `esc` vuelve desde cualquier vista
  - verify: `bun test tests/terminal-app.test.ts` falla contra el modelo nuevo

- [x] 4.2 Reescribir el modelo y el manejo de teclas de `lib/terminal-app.ts`
  - architecture: Sigue siendo puro; `handleKey(model, key) → {model, effect}`
  - avoid: Conservar el efecto `status` con texto `read-only`
  - verify: test que recorre las cinco vistas y comprueba que ninguna respuesta contiene `read-only`

- [x] 4.3 Implementar el render: banner centrado, menú, vistas con cabecera y pie contextual
  - avoid: Etiqueta de fuente por fila; la procedencia va en la cabecera o en el detalle
  - verify: tests de centrado, de recorte por anchura y de ausencia de escapes sin color

- [x] 4.4 Confirmación de dos pasos para los comandos de sistema
  - avoid: Ejecutar nada que no esté en la lista cerrada
  - verify: test de que una pulsación pide confirmación y otra tecla cancela

## // 005. Driver y cableado

- [x] 5.1 Reescribir `surfaces/terminal-app-entrypoint.ts` sobre el modelo nuevo
  - architecture: El driver posee modo crudo, repintado, detección de color y anchura
  - verify: tests de driver con IO inyectada, sin TTY real

- [x] 5.2 Cablear reanudación y arranque desde el dashboard y desde la lista
  - avoid: Colapsar `executable-unavailable` a un `exitCode 1` mudo
  - verify: test de que un runtime no instalado se nombra en pantalla y la app sigue viva

- [x] 5.3 Cablear la ejecución de comandos de sistema por el mismo mecanismo de cesión
  - verify: test de que el comando ejecutado es el literal de la lista cerrada

## // 006. Verificación

- [x] 6.1 `bun test` en verde desde la raíz
- [x] 6.2 `cd installer && bun run typecheck` sin errores y `bunx tsc --noEmit` limpio sobre lo tocado
- [x] 6.3 Prueba manual **abriendo la aplicación**, no solo los tests: `ein` en un pty real, recorrer las cinco vistas y ceder la terminal a un runtime
  - nota: la verificación sobre la **instalación empaquetada** (`ein update` y luego `ein`) no cabe aquí — exige una release que contenga este cambio. Queda declarada como paso siguiente en `verify-report.md` §5 y en `docs/estado-app-terminal.md` §7, que es donde nacieron los fallos de 0.50.1 y 0.50.2.
- [x] 6.4 Actualizar `docs/estado-app-terminal.md` con lo que quedó resuelto y lo que sigue abierto
