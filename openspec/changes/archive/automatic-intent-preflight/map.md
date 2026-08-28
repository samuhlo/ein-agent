status: complete
scope_status: bounded
change: automatic-intent-preflight
phase: map

# Mapa de implementación

## 1. Alcance y contrato autoritativo

El alcance está acotado al eje de intención previo a la construcción y a la consolidación de la superficie de preguntas del preflight. Deben conservarse el almacén `preflight.json`, el escritor `sdd-preflight.ts`, la precedencia del lane declarado, el router y las fases SDD existentes (`openspec/changes/automatic-intent-preflight/scope.md:1-93`). El delta canónico añade cinco escenarios: persistencia/ruteo, bypass con frontera de riesgo, precedencia y clasificación de lane, preguntas adaptativas y recorrido pequeño (`openspec/changes/automatic-intent-preflight/specs/sdd-lifecycle/spec.md:1-45`).

Decisiones ya cerradas en la intención: clasificación conservadora, máximo de tres preguntas para el recorrido normal, una sola reformulación para el recorrido pequeño, confirmación final antes de persistir, reutilización hasta cambio material, bypass explícito salvo seguridad/datos/acciones destructivas y ningún rediseño de fases, verificación o entrega (`openspec/changes/automatic-intent-preflight/intent.md:9-48`).

## 2. Flujo actual y puntos de entrada

- `ein-pi/agent/extensions/ein-ai.ts:654-662` encapsula `runSddPreflight`: llama a `ensureSddPreflight`, instala assets y hace bootstrap de OpenSpec antes de devolver el control.
- `ein-pi/agent/extensions/ein-ai.ts:784-805` activa el preflight al recibir un trigger SDD y continúa la petición; actualmente el gate TDD se reserva para `tool_call`, no para este hook.
- `ein-pi/agent/extensions/ein-ai.ts:808-900` vuelve a asegurar el preflight al iniciar agentes SDD y renderiza el bloque de preferencias. La inclusión de TDD depende de si el agente escribe código, y la baseline solo se inyecta al parent.
- `ein-pi/agent/extensions/ein-ai.ts:903-973` es el seam de delegación: aplica acceptance, runtime y el gate TDD antes de entregar a subagentes. La nueva decisión de intención debe ocurrir antes de construir, sin duplicar este gate ni convertirlo en otro cuestionario.
- `ein-pi/agent/extensions/sdd-init.ts:1-25` también llama directamente a `ensureSddPreflight`; cualquier API nueva debe conservar este consumidor y su bootstrap de configuración.

## 3. Núcleo existente que debe extenderse o coordinarse

### `ein-pi/agent/lib/sdd-preflight.ts`

Es el centro actual y el propietario de escritura indirecta de la postura. La separación vigente distingue respuestas de sesión de postura de cambio (`SddSessionAnswers`, `SddChangeStanceAnswers`, preferencias, aproximadamente `:74-113`).

- `collectSddSessionAnswers` pregunta una vez por sesión ejecución y memoria, y aplica defaults sin UI (`:517-544`). Estas preferencias no deben mezclarse con las preguntas de intención por cambio.
- `collectSddChangeStance` presenta hoy exactamente dos selectores por cambio, TDD y lane (`:546-575`). Esta es la superficie que el delta exige sustituir/consolidar, no sumar a un cuestionario paralelo.
- `collectSddPreflightPreferences` compone sesión y postura, fija el override TDD y marca procedencia (`:577-604`). Es el punto natural para recibir la intención clasificada/confirmada sin perder defaults ni la semántica headless.
- `persistChangeStance` escribe `preflight.json` mediante `writePreflightRecord` y `lane.json` mediante `writeChangeLane`, sin pisar registros existentes (`:606-624`). El contrato exige que la intención ampliada siga escribiéndose desde este propietario y en el almacén existente.
- `reusePreflightForChange` ata la postura al cambio activo y reabre solo cuando cambia el cambio activo (`:626-644`). Su criterio actual es identidad de cambio, no objetivo/límites/terminado; el diseño debe añadir una identidad material de intención sin romper esta continuidad.
- `renderSddPreflightPrompt` conserva OpenSpec, memoria, TDD, lane y Review Workload Guard (`:669-703`). Debe seguir siendo un bloque de contexto, no la superficie interactiva de preguntas ni una puerta nueva.
- `ensureSddPreflight` adopta una postura ya escrita, cachea por sesión, persiste si corresponde y luego instala assets/config (`:705-782`). El orden actual es relevante: intención confirmada antes de persistir/construir, pero no debe impedir bootstrap ni alterar la continuación.
- `isSddPreflightTrigger` (`:164-187`) solo reconoce entradas explícitamente SDD y excluye preguntas o negaciones. El nuevo canal requiere activación ante cualquier petición modificadora, por lo que el diseño debe decidir dónde se obtiene esa señal sin hacer que las consultas de solo lectura abran preflight.

### `ein-pi/agent/lib/sdd-preflight-record.ts`

- `preflightRecordPath` fija el almacenamiento en `changeDir/preflight.json` (`:83-85`).
- `readPreflightRecord` valida JSON, TDD y autoría de forma fail-closed (`:101-119`); actualmente descarta campos desconocidos desde el tipo de retorno. La ampliación debe ser compatible con registros antiguos, parciales o corruptos.
- `writePreflightRecord` genera `decidedAt`, crea el directorio y escribe el registro (`:121-139`). Sigue siendo el único escritor requerido por el alcance.
- `readChangeStance` combina `preflight.json` con `lane.json`, distinguiendo `laneDeclared` de `standard` por defecto (`:141-163`). Ese bit es la evidencia determinista para la precedencia absoluta del lane declarado.
- `changeStanceDirective` solo emite directiva cuando hay TDD decidido y nombra micro únicamente si salta fases (`:190-225` aproximadamente). No debe reinterpretar una clasificación automática ni introducir un lane nuevo.

### `ein-pi/agent/lib/sdd-lane.ts`

`SddLane` solo admite `micro | standard` y `DEFAULT_LANE` es `standard` (`:31-36`). `readChangeLane` cae a `standard` ante ausencia, JSON roto o valor desconocido (`:62-75`), mientras que `laneConfigPath` y `writeChangeLane` mantienen `lane.json` (`:52-80`). `LANE_PHASES` conserva `scope → design → apply → verify → close` para micro y todas las fases para standard (`:39-45`); `verify` y `close` siguen siendo puertas duras. El clasificador solo debe ejecutarse cuando `laneDeclared` sea falso, no inferir `micro` para un valor ausente o inválido.

### `ein-pi/agent/lib/sdd-router.ts`

El router define las siete fases (`:29-36`), calcula estado únicamente desde filesystem y toma el lane de `readChangeLane` (`:599-624` aproximadamente). `sddNextHandoff` entrega la fase ya calculada al orquestador y prohíbe re-derivarla (`:951-979`). La continuación del nuevo recorrido debe terminar aquí, reutilizando `resolveSddNext`/`sddNextHandoff`, sin saltar `verify`/`close` ni crear una ruta paralela.

## 4. Adaptador Claude y paridad de almacenamiento

`ein-cc/sdd-cli/cli.ts:262-320` implementa `ein-cc-sdd preflight`: lee postura, valida `--tdd`, escribe con `writePreflightRecord(... decidedBy: "claude")`, escribe lane y renderiza la directiva. `CLAUDE.adapter.md:33-43` (y la superficie generada equivalente) documenta que Claude pregunta hoy TDD/lane y registra la respuesta una sola vez. El cambio debe definir si la decisión automática se comparte como estado persistido y cómo se presenta en Claude, pero no introducir un segundo escritor ni un segundo almacén. La sincronización de superficies debe mantener el límite de adaptación runtime, no copiar una implementación paralela.

## 5. Cobertura existente y huecos previsibles

- `tests/sdd-preflight-per-change.test.ts:134-277` cubre selectores TDD/lane, defaults fail-closed, cache por cambio, adopción desde disco, persistencia y que el lane existente no se pisa. Debe preservarse y ampliarse para precedencia declarada, clasificación inequívocamente pequeña frente a incertidumbre/riesgo, reutilización y reapertura material.
- `tests/sdd-preflight-record.test.ts:40-211` cubre lectura/escritura fail-closed, combinación de `preflight.json` + `lane.json`, cambio activo y directivas. Es el lugar para compatibilidad de registros antiguos, campos de intención válidos/parciales y ausencia de corrupción por una intención no confirmada.
- `tests/sdd-preflight-tdd-gate.test.ts:15-48` fija que el bloque renderizado conserva u omite TDD según el consumidor. Debe evitarse que las preguntas de intención reaparezcan por el gate `tool_call`.
- `tests/sdd-lane.test.ts:31-80` fija `micro` como solo `scope/design/apply/verify/close`, y `verify`/`close` como hard gates. Es regresión directa para la precedencia y para no alterar fases.
- `tests/sdd-next-dispatcher.test.ts:133-247` cubre handoff, bloqueos y wiring de `ein:sdd-next`; una prueba nueva debería comprobar que la continuación post-intención llama al handoff existente, no que ejecuta fases por su cuenta.
- No hay, según la evidencia del repositorio y la intención (`intent.md:34-39`), un módulo ni tests de clasificación automática de intención. Es un hueco de diseño, no evidencia para ampliar lanes o rediseñar el router.

## 6. Invariantes para diseño y aplicación

1. Persistencia: `preflight.json` permanece como fuente por cambio; `sdd-preflight.ts` conserva la responsabilidad de escritura. Registros TDD actuales deben seguir leyéndose.
2. Precedencia: `lane.json` válido y declarado gana siempre. La ausencia, corrupción o valor desconocido no puede producir `micro`.
3. Fail-closed: seguridad, datos persistentes, acciones destructivas, evidencia insuficiente y ambigüedad toman recorrido normal; el bypass explícito no rebaja esas categorías.
4. Interacción: recorrido normal = dos preguntas base y, como máximo, una tercera decisión material; no se conserva el cuestionario anterior en paralelo. Recorrido pequeño = exactamente una línea, sin espera.
5. Confirmación: no se escribe la intención ni se construye antes de la confirmación final del recorrido normal. El pequeño continúa sin confirmación adicional.
6. Reutilización: la intención vigente se adopta; solo se reabre con cambio material de objetivo, límites o criterio de terminado, no por reformulación equivalente.
7. Entrega: después de persistir o completar el pequeño, el control vuelve al router existente. No cambian secuencia, verificación, cierre, gates ni entrega.
8. Runtime: Pi y Claude observan el mismo estado en disco; no se crea un escritor paralelo ni se depende de conversación privada.

## 7. Riesgos que debe resolver `sdd-design`

- Determinar una representación persistida compatible para intención cerrada, su fingerprint/materialidad y su estado de confirmación sin hacer que registros viejos parezcan confirmados.
- Elegir el seam de activación para peticiones modificadoras no explícitamente SDD. Debe distinguir lectura, documentación/texto acotado y modificación real sin convertir una heurística incierta en `micro`.
- Definir cómo se detectan categorías protegidas y decisiones materiales de forma determinista y paritaria entre runtimes.
- Encajar la continuación automática en el router sin que `ensureSddPreflight`, `before_agent_start` y `tool_call` disparen preguntas duplicadas.
- Mantener la UX/documentación de Claude sincronizada sin trasladar a `ein-cc` la autoridad de escritura de Pi ni crear una superficie interactiva adicional.

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/automatic-intent-preflight/intent.md", lines: "1-56", estimated_tokens: 1250 }
    - { path: "openspec/changes/automatic-intent-preflight/scope.md", lines: "1-93", estimated_tokens: 1700 }
    - { path: "openspec/changes/automatic-intent-preflight/specs/sdd-lifecycle/spec.md", lines: "1-45", estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: "1-795", estimated_tokens: 5600 }
    - { path: "ein-pi/agent/lib/sdd-preflight-record.ts", lines: "1-225", estimated_tokens: 1900 }
    - { path: "ein-pi/agent/lib/sdd-lane.ts", lines: "1-91", estimated_tokens: 850 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: "1-80, 599-700, 951-979", estimated_tokens: 1250 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: "654-662, 784-973", estimated_tokens: 1150 }
    - { path: "ein-pi/agent/extensions/sdd-init.ts", lines: "1-25", estimated_tokens: 250 }
    - { path: "ein-cc/sdd-cli/cli.ts", lines: "262-324", estimated_tokens: 700 }
    - { path: "CLAUDE.adapter.md", lines: "33-43", estimated_tokens: 250 }
    - { path: "tests/sdd-preflight-per-change.test.ts", lines: "1-277", estimated_tokens: 2350 }
    - { path: "tests/sdd-preflight-record.test.ts", lines: "1-211", estimated_tokens: 1800 }
    - { path: "tests/sdd-preflight-tdd-gate.test.ts", lines: "1-48", estimated_tokens: 450 }
    - { path: "tests/sdd-lane.test.ts", lines: "1-80", estimated_tokens: 650 }
    - { path: "tests/sdd-next-dispatcher.test.ts", lines: "133-247", estimated_tokens: 1000 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: "1-300", estimated_tokens: 4200 }
    - { path: "openspec/config.yaml", lines: "1-45", estimated_tokens: 500 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: "1-180, 300-360", estimated_tokens: 2900 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 25900, reads: 19 }

Nota: los tokens estimados de contexto leído superan el presupuesto nominal de salida por incluir los artefactos autoritativos y pruebas completas necesarias para el mapa; no se ejecutaron tests, builds ni typechecks.
