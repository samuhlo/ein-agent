# 11 · Una postura TDD para el ejecutor y su presupuesto

Estado: diseño para implementar. Base inspeccionada: `3b9fa42`.
Principios: MANIFIESTO §§001, 002 y 005. Depende de 05 para items completos.

## A. Proposal

Reanudar un cambio estricto no debe requerir recordar una frase para recibir el presupuesto correcto.
Hoy el prompt hijo recibe `readChangeStance`, mientras `ensureApplyTurnBudget` decide por `tdd`
de la delegación o por `STRICT TDD MODE IS ACTIVE`. El mismo trabajo puede recibir TDD estricto
y el cap 60+3 que el propio código excluye de los applies estrictos.
El probe `/private/tmp/ein-manifest-delegation-probe.ts` muestra el cap dependiente del marcador.

Resolver una postura efectiva por child antes de presupuestar, transportar ese resultado como
contrato generado y usarlo al construir el prompt. El disco gana para un cambio identificado.
No cambiar el modo TDD elegido, sus ciclos ni los valores de runtime en este trabajo.
Compatibilidad observada: `pi-subagents@0.68.0` conserva `TurnBudgetState` en resultados,
pero no declara `turnBudget` como entrada pública. El probe acredita la decisión de Ein,
no que ese runner ejecute el cap. No presentar una opción inyectada como límite comprobado.

## B. Spec · Given / When / Then

- Dado un cambio persistido `strict`, al delegar apply sin marcador, no se añade el cap estándar
  y el hijo recibe la postura estricta del mismo contrato.
- Dado un cambio persistido `off` y una tarea que contiene el marcador estricto, gana `off`;
  el prompt explica la postura vigente y el cap estándar se conserva.
- Dado un cambio que cambia de postura entre preparación y comienzo, el hijo bloquea herramientas
  y pide al padre regenerar la delegación; no ejecuta con presupuesto y postura incoherentes.
- Dada una tarea ad-hoc sin change dir, el hint estructurado explícito sigue funcionando;
  en ausencia del hint se admite la compatibilidad textual legacy, solo para esa tarea.
- Dado un workflow estático con dos applies de cambios distintos, cada uno recibe su postura;
  no tomar el primer `strict` como modo del workflow completo.
- Dado `turnBudget` explícito menor en un apply estricto, conservarlo: la postura impide la
  inyección automática estándar, no elimina restricciones deliberadas del usuario.

## C. Decisions

### ResolvedApplyTdd

Crear `ein-pi/agent/lib/apply-tdd-contract.ts` con resultado discriminado
`resolved | needs-decision | invalid` y resolución pura sobre entradas leídas por su adaptador.
Resolved contiene `{version:1, change:null|string, mode:"off"|"strict", source, stanceFingerprint,
configEvidence?:{state:"present"|"absent",sha256?:string},testCommand?:string}`.
`source` es `change`, `delegation-field`, `legacy-text`, `project-setting` o `project-auto`.
Para source=change, fingerprint usa solo campos relevantes (`change`, `tdd`, `decidedBy`, `decidedAt`),
no todo el preflight ni fecha de lectura. Para project-auto incluye configEvidence y comando resuelto.
No es una prueba criptográfica de autorización.

Precedencia cerrada:

1. Si la delegación identifica un cambio, leer `readChangeStance(cwd, change)`.
   Su `tdd` decidido gana a todos los hints. No usar el cambio activo de otro trabajo como fallback.
2. Cambio identificado sin decisión: usar el gate de preflight existente para resolver lo que falta;
   no inventar `off`, no persistir un hint de una tarea distinta.
3. Ad-hoc: hint estructurado válido; después marcador legacy de esa tarea; después
   el ajuste de proyecto `.pi/ein/tdd.json` cuando declara `strict` u `off`.
4. Ad-hoc con modo global `ask` sin hint: `needs-decision`, una pregunta concreta si hay UI;
   sin UI, bloqueado con causa. No crear OpenSpec para guardar una tarea ad-hoc.
5. `auto`, tanto como hint estructurado ad-hoc como ajuste persistido del PROYECTO, resuelve
   `openspec/config.yaml` una vez: `strict_tdd:true` ⇒ strict; `false` o clave/archivo ausente ⇒ off.
   El hint ad-hoc `auto` gana al marcador legacy y al ajuste global: no saltárselo por no ser off/strict.
   El contrato transporta siempre el resultado off/strict, `source:project-auto` y digest de config
   (o marcador de ausencia); el hijo exige que esa fuente siga igual antes de ejecutar.

La postura persistida POR CAMBIO (`TddStance`) solo admite off/strict: un preflight con `tdd:auto`,
`ask` u otro valor es invalid y no se convierte en «sin decisión» ni consulta config como fallback.
Si el archivo de preflight está ausente o no declara tdd, se aplica el paso2, no el default ad-hoc.
El ajuste global ausente da off, como hoy; ajuste presente con JSON roto, modo inválido o lectura
fallida da invalid. No usar `readTddMode` sin inspección previa: hoy oculta esos errores devolviendo off.

Cerrar el lector de auto dentro de `apply-tdd-contract.ts`: aceptar exclusivamente una declaración
raíz `strict_tdd: true|false`, comentario final opcional y CRLF; no leer coincidencias indentadas,
comentarios o strings multilinea como clave raíz. Clave repetida, alias, escalar no booleano o
forma de clave no soportada ⇒ invalid explícito, nunca default. No incorporar un parser YAML nuevo.
Para strict por auto, obtener `rules.apply.test_command` con `parseConfigRules` existente;
si falta comando útil, conservar la intención strict y devolver needs-decision con la laguna,
sin ejecutar ni rebajar a off. Incluir el comando resuelto en el contrato para que el hijo no lo redescubra.

No cambiar `readChangeStance` para ocultar ausencia/corrupción. Validar entrada antes de usarla;
un `tdd` imposible es error, no un alias de off. `readDelegationTddHint` queda como compatibilidad
del paso 3, no autoridad para un cambio persistido.

### Productor y consumidores

En `registerToolCallGate`, admitir 05, resolver las decisiones pendientes y SOLO DESPUÉS llamar
a `ensureApplyTurnBudget` con el contrato efectivo de cada apply. Reordenar el gate actual,
que hoy inyecta presupuesto antes de `gateTddForDelegation`.
Para workflow, opciones por child mediante el serializador admitido; no un cap global mezclado.
`strict`: no añadir presupuesto de turnos automático; `off`: 60+3, salvo restricción explícita.
Aplicar esa opción al runner solo si el ensayo de transporte demuestra soporte; en 0.68.0,
omitir la clave no soportada y comunicar «límite de turnos no disponible; timeout activo».
No reemplazar un límite de turnos por `toolBudget`: miden unidades distintas.
Conservar `maxRuntimeMs` actual como límite distinto; este plan no lo hace infinito.

Adjuntar una sola línea de transporte `ein_effective_tdd: <JSON>` a la tarea del child.
La produce el gateway, que elimina/rechaza duplicados suministrados por el caller y la regenera;
no es una frase semántica que el modelo deba recordar. 05 serializa la tarea resultante.
En el hijo, `registerAgentPromptHook` parsea el contrato y revalida la postura persistida si
`source=change`; si el fingerprint difiere, usa su `handoffError` existente para bloquear tools.
El prompt se renderiza desde ese contrato, sin otra elección independiente por regex.
Lanzamientos legacy directos al hijo sin contrato resuelven postura para el prompt y declaran
que el padre no aportó prueba de presupuesto; no simular que el cap fue coordinado.

El padre lee y decide una vez por preparación. El hijo hace una comprobación de frescura,
no una segunda elección. No reutilizar contratos entre cambios ni tras modificar la postura.

## D. Acceptance

- Matriz persisted strict/off × hint strict/off/ausente da postura y cap coherentes.
- Proyecto auto e hint auto × strict_tdd true/false/ausente prueban resultado y cap; true sin
  `rules.apply.test_command` queda needs-decision. Config ilegible, duplicada o no booleana no da off.
- Preflight de cambio con auto/ask inválido se rechaza; tdd ausente usa preflight; JSON global roto
  no hereda el default de readTddMode. Cambio persistido off sigue ganando a config strict_tdd:true.
- Modificar config entre resolución auto y arranque bloquea por fingerprint, igual que la postura.
- Reinicio con la misma postura persistida no necesita marcador ni nueva pregunta.
- Preflight que decide strict en esta misma llamada influye en el cap antes del lanzamiento.
- Workflow mixto de applies no comparte accidentalmente la postura del primer item.
- Cap explícito estricto se conserva; ningún test confunde ausencia de cap con ausencia de timeout.
- Cap no soportado produce estado de capacidad no disponible, nunca «60+3 aplicado»;
  las restricciones explícitas que no puedan garantizarse bloquean antes del lanzamiento.
- Cambio de postura durante la preparación bloquea al hijo antes de escribir.
- Ad-hoc no crea directorios, registros ni fases SDD para resolver su hint.

## E. Paquetes cerrados de ejecución

### 11.1 · Resolución única y pruebas de precedencia

Leer: `ein-pi/agent/lib/sdd-preflight-record.ts`, `ein-pi/agent/lib/sdd-preflight.ts`,
`ein-pi/agent/lib/tdd.ts`, `ein-pi/agent/extensions/internal/ein-pi-event-contracts.ts`,
`shared/sdd/openspec-config-rules.ts` y `ein-pi/agent/lib/openspec-config-bootstrap.ts`.
Crear producción: `ein-pi/agent/lib/apply-tdd-contract.ts`.
Editar producción: `ein-pi/agent/lib/sdd-preflight.ts` (presupuesto recibe contrato resuelto).
Pasos: tipos/validadores; resolver precedencia por item; serialización/fingerprint;
mantener wrappers legacy donde existan consumidores hasta cablear 11.2.
Crear `tests/apply-tdd-contract.test.ts`; ampliar `tests/tdd-apply-delegation-gate.test.ts`.
Comando: `bun test tests/apply-tdd-contract.test.ts tests/tdd-apply-delegation-gate.test.ts tests/sdd-preflight-per-change.test.ts`.
Parar si una tarea identifica varios cambios sin binding único; pedir al padre dividirla.

### 11.2 · Gate antes del lanzamiento y consumo en el hijo

Leer: salida 11.1, gateway/serializador de 05, `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`
y `ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts`.
Editar producción: esos dos hooks y `ein-pi/agent/lib/sdd-preflight.ts` (tres archivos).
Pasos: resolver preflight antes de cap; insertar contrato por child; validar duplicados;
consumir y comprobar frescura en hijo; no aceptar marker textual sobre `source=change`.
Crear `tests/apply-tdd-budget-handoff.test.ts`, invocando ambos hooks con filesystem temporal.
Comando: `bun test tests/apply-tdd-budget-handoff.test.ts tests/apply-tdd-contract.test.ts tests/sdd-preflight-per-change.test.ts`.
Parar si el transporte real elimina la línea: no sustituir prueba por un substring del prompt;
actualizar el serializador admitido de 05 dentro de su contrato, sin inventar fields del runner.

### 11.3 · Retirar el marcador como obligación y demostrar reanudación

Leer: `runtime/assets/orchestrator.md`, `runtime/agents/sdd-apply.md` y contratos nuevos.
Editar producción/política: esos dos documentos; sustituir obligación de repetir frase por
postura persistida y transferencia mecánica. Conservar reglas TDD de comportamiento.
Ampliar `tests/apply-tdd-budget-handoff.test.ts` con sesión nueva, cambio de postura y ad-hoc.
Comando: `bun test tests/apply-tdd-budget-handoff.test.ts tests/adhoc-apply-handoff.test.ts`.
No relanzar un apply productivo para demostrar esta corrección; usar hooks y capturador de launch.

### Compatibilidad y reversión

No migrar `preflight.json`. Marcadores antiguos siguen admitidos únicamente en ad-hoc sin postura.
No revertir solo el parser del hijo dejando al padre emitiendo un contrato que nadie consume.
Entrega conjunta de 11.1/11.2/11.3 después de 05; no añadir una fase SDD por este protocolo.
