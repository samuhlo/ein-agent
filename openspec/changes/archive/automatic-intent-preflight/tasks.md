# Tasks — automatic-intent-preflight

status: ready
blocked_by: none

> Postura TDD del cambio: todavía no registrada. Este plan no la infiere desde el default del proyecto; cada cambio de comportamiento mantiene sus pruebas en la misma unidad.
>
> Forecast actual del working tree: **0 líneas de producción**, porque la implementación no ha empezado; no es una estimación del cambio. Repetir el forecast determinista antes de preparar el PR.

## // 001. Core puro de decisión de intención

- [x] 1.1 Crear `ein-pi/agent/lib/sdd-intent-preflight.ts` y `tests/sdd-intent-preflight.test.ts` con la unión cerrada de evidencia/resultado, reason codes estables, los slots `objective`, `boundaries` y `completionCriteria`, normalización canónica y `materialKey` determinista.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: Clasificador, persistencia y runtimes necesitan un contrato fundacional único antes de consumir la intención.
  - learn: Una huella útil representa hechos normalizados, no el texto literal que los expresó.
  - architecture: El módulo es core sin E/S; rechaza slots vacíos, estabiliza listas/espacios y calcula `sha256:<canonical-json>` sin conocer UI, filesystem ni router.
  - avoid: Hashear el prompt crudo, crear tipos paralelos por runtime o mezclar persistencia en este módulo.
  - verify: `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'material|canonical|key'`

- [x] 1.2 Incorporar en esos mismos archivos la activación, precedencia de lane, tabla conservadora normal/pequeña y frontera protegida del bypass.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: Solo evidencia positiva completa puede habilitar el recorrido pequeño; ausencia, incoherencia e incertidumbre deben cerrarse de forma segura.
  - learn: «No vi riesgo» no equivale a «demostré que no hay riesgo» en una clasificación fail-closed.
  - architecture: Una lectura inequívoca devuelve `read-only`; un lane declarado corta la clasificación; sin declaración, solo trabajo acotado, mecánico y no conductual o docs/texto acotado produce `small`; seguridad, datos persistentes, destrucción, comportamiento nuevo o `unknown` producen `normal` y bloquean bypass.
  - avoid: Clasificar solo por palabras clave, convertir lane ausente/corrupto en `micro` o permitir bypass con riesgo verdadero o desconocido.
  - verify: `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'classif|lane|bypass|read-only'`

- [x] 1.3 Añadir en esos mismos archivos el plan declarativo de interacción: dos preguntas base en un turno textual, tercera solo por una decisión material concreta y una única reformulación sin pregunta para `small`.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: El máximo de tres preguntas y la eliminación del cuestionario TDD/lane paralelo deben ser invariantes compartidas.
  - learn: La confirmación final es un gate sobre una intención cerrada, no una cuarta decisión técnica.
  - architecture: TDD o lane solo ocupan la tercera posición cuando alteran materialmente objetivo, límites o terminado y no hay valor persistido ni default aplicable; el core devuelve datos, no presenta UI.
  - avoid: Mantener los selectores antiguos detrás del flujo nuevo, usar modales o preguntar solo porque falta un valor técnico.
  - verify: `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'question|third|small|restatement'`

## // 002. Persistencia compatible y procedencia del lane

- [x] 2.1 Extender `ein-pi/agent/lib/sdd-preflight-record.ts` y `tests/sdd-preflight-record.test.ts` con el bloque opcional versionado `intent`, las resoluciones `confirmed`, `automatic-small` y `bypassed`, y validación independiente de la postura TDD histórica.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: La intención debe compartirse en `preflight.json` sin convertir records legacy, parciales o futuros en confirmaciones falsas.
  - learn: Validar ramas independientes conserva datos válidos aunque una ampliación opcional esté corrupta.
  - architecture: Se preservan `tdd`, `decidedBy` y `decidedAt`; una intención ausente, parcial, desconocida o de versión futura se ignora sin invalidar TDD, mientras cada resolución válida conserva ruta, resumen, materialidad, razón, autoría y fecha exigibles.
  - avoid: Crear `intent.json`, reutilizar `intent.md`, exigir el bloque nuevo a registros históricos o descartar todo el record por una rama inválida.
  - verify: `bun test tests/sdd-preflight-record.test.ts --test-name-pattern 'legacy|intent|partial|future|round-trip'`

- [x] 2.2 Ajustar `ein-pi/agent/lib/sdd-lane.ts`, `ein-pi/agent/lib/sdd-preflight-record.ts`, `tests/sdd-lane.test.ts` y `tests/sdd-preflight-record.test.ts` para distinguir lane declarado de clasificado sin cambiar `SddLane`, el schema de `lane.json` ni `LANE_PHASES`.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: La salida automática debe poder materializar `standard`/`micro` sin adquirir autoridad humana ni sobrescribir una declaración existente.
  - learn: La procedencia forma parte del dato cuando valores iguales tienen distinta precedencia.
  - architecture: Todo `lane.json` legado existente —incluso incoherente o corrupto— se trata como declarado y no se sobrescribe; solo sin declaración se mapea `normal → standard` y `small → micro`, registrando `laneOrigin: classified` dentro de `intent`.
  - avoid: Añadir lanes, cambiar las fases de `micro`, guardar procedencia en `lane.json` o interpretar el fallback `standard` como clasificación segura.
  - verify: `bun test tests/sdd-lane.test.ts tests/sdd-preflight-record.test.ts --test-name-pattern 'declared|classified|corrupt|phase'`

## // 003. Flujo propietario de preflight por cambio

- [x] 3.1 Extender `ein-pi/agent/lib/sdd-preflight.ts` y `tests/sdd-preflight-per-change.test.ts` con la única operación que relee, adopta o persiste resoluciones confirmadas/automáticas/bypass mediante `writePreflightRecord` y, cuando corresponde, materializa el lane clasificado con el writer existente.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Pi y Claude necesitan una autoridad de escritura única y una relectura que cierre la ventana de duplicación antes de tocar disco.
  - learn: Releer justo antes de escribir transforma una decisión resuelta por otro runtime en adopción, no sobrescritura.
  - architecture: `sdd-preflight.ts` conserva la decisión de cuándo escribir; `sdd-preflight-record.ts` sigue siendo codec/primitivo de E/S. Una intención normal pendiente nunca se persiste, y TDD válido se preserva sin inventar postura.
  - avoid: Escribir desde hooks, clasificador o CLI Claude; persistir borradores normales; sobrescribir lane declarado.
  - verify: `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'persist|reread|adopt|pending|lane'`

- [x] 3.2 Implementar en `ein-pi/agent/lib/sdd-preflight.ts` y `tests/sdd-preflight-per-change.test.ts` reutilización por `materialKey`, patch de slots materiales y marca en vuelo por sesión.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: Una intención vigente no debe preguntarse de nuevo, pero un cambio material o equivalencia incierta no puede alcanzar construcción con estado obsoleto.
  - learn: Heredar slots omitidos permite comparar estado semántico sin equiparar silencios con confirmaciones.
  - architecture: Una paráfrasis equivalente reutiliza; añadir, retirar o contradecir objetivo, límites o terminado reabre; evidencia insuficiente reabre por el recorrido normal; la marca en vuelo evita reentradas locales y no se persiste.
  - avoid: Reabrir por cada diferencia textual, mantener borradores en disco o tratar incertidumbre como continuidad.
  - verify: `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'reuse|material|paraphrase|reopen|in-flight'`

- [x] 3.3 Sustituir en `ein-pi/agent/lib/sdd-preflight.ts` la colección TDD/lane por cambio por los recorridos normal, pequeño y bypass, ampliando `tests/sdd-preflight-per-change.test.ts` y `tests/sdd-preflight-tdd-gate.test.ts`.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: El diseño consolida la interacción anterior; sumar el canal nuevo rompería el máximo total y haría que el gate TDD volviera a preguntar.
  - learn: Preferencias de sesión y defaults técnicos pueden conservarse sin formar parte del cuestionario de intención.
  - architecture: Normal presenta juntas dos preguntas numeradas, como máximo una tercera material y confirmación final antes de persistir o construir; small muestra exactamente una línea, no espera respuesta y puede registrarse como automático; bypass se persiste sin fingir confirmación humana. Ejecución/memoria de sesión permanecen separadas y el gate TDD solo consume el valor persistido/default.
  - avoid: Conservar `collectSddChangeStance` como segundo cuestionario, usar selectores/modal, contar confirmación como decisión o inferir aquí una postura TDD para el cambio.
  - verify: `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-tdd-gate.test.ts --test-name-pattern 'normal|small|confirm|third|bypass|TDD'`

## // 004. Activación única y continuidad del adapter Pi

- [x] 4.1 Cablear `ein-pi/agent/extensions/ein-ai.ts` y `ein-pi/agent/extensions/sdd-init.ts` al contrato compartido para que solo el hook de entrada inicie interacción, los hooks secundarios adopten o bloqueen y la continuación vuelva al dispatcher/router existente; ampliar `tests/sdd-preflight-per-change.test.ts`, `tests/sdd-flow-contract.test.ts`, `tests/sdd-next-dispatcher.test.ts` y `tests/sdd-config-bootstrap.test.ts` con las regresiones observables.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Toda petición potencialmente modificadora necesita resolución antes de construir, sin duplicarse en `before_agent_start`, llamadas repetidas a `ensureSddPreflight` o `tool_call`, y sin romper el arranque SDD explícito.
  - learn: Separar «puede preguntar» de «debe bloquear construcción» evita tanto diálogos duplicados como escapes del gate.
  - architecture: Lectura inequívoca omite el canal; modificación o activación incierta arma preflight; después de confirmación, small o bypass permitido se reutilizan `resolveSddNext`/handoff actuales. El bootstrap crea config solo si falta, preserva exactamente bytes existentes y entra en `scope`; clasificador, hooks y adapters no ejecutan fases.
  - avoid: Crear una ruta paralela, preguntar desde hooks secundarios o alterar router, secuencia SDD, `verify`, `close`, delivery y bootstrap OpenSpec.
  - verify: `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-flow-contract.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-config-bootstrap.test.ts`

## // 005. Adapter Claude CLI y paridad entre runtimes

- [x] 5.1 Convertir `ein-cc/sdd-cli/cli.ts` en adapter fino del core y de la escritura de `sdd-preflight.ts`, ampliar `tests/claude-change-stance.test.ts` y crear `tests/sdd-intent-runtime-parity.test.ts` para handoffs Pi↔Claude.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: Claude debe adoptar la resolución escrita por Pi y viceversa, sin clasificador, serializador o escritor de intención propios.
  - learn: La paridad fiable pasa el mismo vector estructurado al mismo core; no replica reglas en prompts.
  - architecture: El CLI conserva lectura de posturas existentes y trata `--lane` explícito como declaración; toda resolución nueva pasa por la API propietaria, conserva `resolvedBy`, relee disco antes de preguntar/escribir y adopta records válidos del otro runtime.
  - avoid: Duplicar clasificación en `ein-cc`, escribir `intent` directamente con el codec, re-preguntar una resolución vigente o romper flags/records legacy.
  - verify: `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts`

- [x] 5.2 Conectar el comando público documentado `ein-cc-sdd preflight` con `runClaudeIntentPreflight` para que el adapter Claude ejecute realmente los recorridos normal, pequeño y bypass antes de consultar o modificar TDD/lane.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: La auditoría Cleaner confirmó que la documentación invoca el comando público, pero su dispatch actual solo alcanza `runPreflightCommand`; el contrato automático queda inaccesible desde Claude.
  - architecture: El dispatch público debe atravesar una única entrada de intención y delegar después en la compatibilidad existente de postura, sin duplicar clasificación ni persistencia.
  - avoid: Crear un segundo comando, invocar ambos recorridos en paralelo o reimplementar el core dentro del CLI.
  - verify: `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts`

## // 006. Política coordinadora, evidencia y verificación final

- [x] 6.1 Actualizar `ein-pi/core/AGENTS.md` y `ein-cc/CLAUDE.adapter.md`, regenerar `ein-cc/CLAUDE.md` y ajustar `tests/core-parity-coordinator.test.ts` para publicar un único preflight automático y retirar la instrucción de preguntar siempre TDD/lane.
  - skills: `ein-discipline`, `intent-channel`, `work-unit-commits`
  - why: La superficie Claude actual ordena el cuestionario que este cambio sustituye y produciría preguntas duplicadas aunque el core fuese correcto.
  - learn: La política común vive en la fuente core; el adapter solo explica cómo la ejecuta su runtime.
  - architecture: La fuente compartida fija activación, adopción, máximo de preguntas, confirmación y retorno al router; el adapter invoca el contrato una vez; `CLAUDE.md` permanece salida generada con procedencia. El flujo automático no invoca ni modifica el canal humano explícito `/ein:intent`.
  - avoid: Editar solo el generado, copiar toda la política al adapter o crear otra superficie interactiva para Claude.
  - verify: `bun test tests/core-parity-coordinator.test.ts tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts`

- [x] 6.2 Durante apply, mantener `openspec/changes/automatic-intent-preflight/apply-progress.md` por unidad y auditar el resultado contra el delta completo `openspec/changes/automatic-intent-preflight/specs/sdd-lifecycle/spec.md` y la selección canónica `openspec/specs/sdd-lifecycle/spec.md:117-123`.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: La evidencia debe demostrar los cinco escenarios añadidos y que el arranque canónico sigue intacto sin depender de la conversación.
  - learn: Un delta describe comportamiento nuevo; no autoriza a reescribir contratos canónicos adyacentes.
  - architecture: Registrar archivos, pruebas focalizadas y resultados de los grupos 001-006; preservar preflight/router/fases/verificación/entrega. Anotar postura TDD solo si aparece declarada en `preflight.json`, nunca desde el default del config.
  - avoid: Marcar trabajo completo sin evidencia, modificar el canonical fuera de la selección aprobada, crear otro artefacto de intención o inventar TDD/líneas futuras.
  - verify: `test -f openspec/changes/automatic-intent-preflight/apply-progress.md && git diff --check`

- [x] 6.3 Reconciliar `tests/sdd-planning-acceptance.test.ts` con el contrato aprobado que retira el selector TDD/lane por cambio y consume la postura persistida o el default técnico, conservando cobertura observable de que el gate no re-pregunta.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: La verificación global confirmó dos expectativas legacy que todavía exigen la superficie interactiva retirada y contradicen las pruebas focalizadas nuevas.
  - architecture: Reutilizar los fallos globales actuales como evidencia RED; actualizar nombres, fixtures y expectativas al contrato aprobado sin debilitar el gate ni cambiar producción.
  - avoid: Borrar cobertura, relajar aserciones de forma genérica, restaurar preguntas TDD/lane o modificar producción para satisfacer expectativas obsoletas.
  - verify: `bun test tests/sdd-planning-acceptance.test.ts`

- Verificación de fase: en `sdd-verify`, ejecutar la matriz focalizada y las puertas globales, y registrar resultados en `openspec/changes/automatic-intent-preflight/verify-report.md`, incluyendo compatibilidad legacy, paridad Pi/Claude y regresiones de router/SDD/verification/delivery.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Los seams focalizados prueban cada contrato, pero la entrega exige también suite completa y ambos typechecks del repositorio.
  - learn: Bun ejecuta TypeScript sin comprobar todos los tipos; test verde no sustituye typecheck.
  - architecture: Verificar sin introducir cambios en secuencia de fases, `LANE_PHASES`, bootstrap, gates TDD/verify/close ni delivery; separar evidencia ejecutada de comprobaciones manuales y repetir el forecast de revisión antes del PR.
  - avoid: Validar solo happy paths, omitir el typecheck de `installer/`, regenerar snapshots sin revisar o afirmar paridad por inspección de prompts.
  - verify: `bun test tests/sdd-intent-preflight.test.ts tests/sdd-preflight-record.test.ts tests/sdd-lane.test.ts tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/sdd-flow-contract.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-config-bootstrap.test.ts tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts tests/core-parity-coordinator.test.ts && bun test && bun run typecheck && (cd installer && bun run typecheck) && git diff --check`
