# Diseño: decisión automática de intención en preflight

## A. Proposal

### Intent

Añadir un único eje previo a la construcción que determine, de forma conservadora, si una petición modificadora sigue el recorrido normal o el pequeño, cierre la intención con la mínima interacción necesaria y devuelva el control al router SDD existente. Pi y Claude compartirán la decisión y su estado mediante los contratos de core y `preflight.json`, no mediante sus conversaciones privadas.

### Scope

**Incluye:** activación para peticiones que puedan modificar código, configuración o datos persistentes; clasificación normal/pequeña; precedencia del lane declarado; preguntas adaptativas; reformulación pequeña; bypass acotado; persistencia compatible; detección de cambio material; deduplicación entre superficies; y continuación por el router actual.

**No incluye:** nuevos lanes, nuevas fases, cambios en la secuencia SDD, en `verify`, `close`, entrega o sincronización OpenSpec; un nuevo almacén; persistencia de conversación; una interfaz modal; ni cambios al canal humano explícito `/ein:intent`.

### Affected areas

- `ein-pi/agent/lib/sdd-preflight.ts`: propietario del flujo y de toda escritura de intención.
- `ein-pi/agent/lib/sdd-preflight-record.ts`: codec compatible de `preflight.json`; conserva el primitivo de E/S, sin decidir cuándo escribir.
- Un módulo core pequeño y sin E/S junto al preflight, con su espejo en `tests/`, para clasificación, planificación de preguntas, bypass y materialidad.
- `ein-pi/agent/lib/sdd-lane.ts`: lectura/escritura del lane existente y procedencia declarada frente a clasificada, sin cambiar `SddLane` ni `LANE_PHASES`.
- `ein-pi/agent/extensions/ein-ai.ts`: activación y gate de continuación en Pi; los hooks posteriores adoptan o bloquean, pero nunca vuelven a preguntar.
- `ein-cc/sdd-cli/cli.ts` y la superficie Claude generada desde el core: adaptador fino al mismo contrato, sin serialización o clasificador paralelo.
- Pruebas de preflight por cambio, record, TDD gate, lane, dispatcher y paridad core/Claude.

### Contexto canónico acotado

La selección autorizada no carga ni trunca el dominio completo:

- `openspec/specs/sdd-lifecycle/spec.md`, selección semántica exacta `117-123`, escenario `explicit-sdd-startup-bootstraps-config-and-enters-scope`; SHA-256 del fichero: `c04494657c35051d522ab21668a6a42be622e71e3f7827624419c5fc4a7ec3d3`; bytes del fichero: `51,689`.
- El delta completo del cambio se leyó desde `openspec/changes/automatic-intent-preflight/specs/sdd-lifecycle/spec.md`: cinco operaciones `ADDED`; ninguna modifica un escenario canónico existente.

El arranque explícito seguirá creando o preservando la configuración OpenSpec y entrando en `scope`; el nuevo preflight ocurre antes de construir y no añade inicializaciones ni rutas alternativas.

Se aplicaron `ein-discipline`, `intent-channel` y `architecture`. `nuxt-ui` y `readme-style` no aplican porque no se diseña UI Nuxt ni un README.

### Risks

- Una clasificación semántica demasiado permisiva podría rebajar trabajo ambiguo a pequeño.
- Un fingerprint basado en el texto crudo reabriría por paráfrasis; uno demasiado laxo ocultaría cambios reales.
- Los hooks de Pi o la superficie Claude podrían preguntar de nuevo si cada uno interpreta el estado por su cuenta.
- Una ampliación monolítica del decoder podría inutilizar la postura TDD válida por un bloque de intención parcial.
- Un lane generado automáticamente podría confundirse con una declaración humana y adquirir precedencia indebida.
- Dos runtimes que confirmen simultáneamente conservan una ventana de carrera; el diseño reduce la ventana mediante relectura antes de escribir, pero no crea locks ni otro almacén.

### Rollback

Retirar la activación automática y el bloque opcional `intent` de los consumidores, restaurar la colección TDD/lane anterior y regenerar la superficie Claude. Los registros actuales seguirán siendo legibles porque los campos históricos de `preflight.json` y el formato de `lane.json` no se sustituyen; los campos de intención desconocidos pueden ignorarse durante el rollback.

### Success criteria

- Solo peticiones modificadoras entran en el eje; la duda sobre una posible modificación o sobre su tamaño nunca produce el recorrido pequeño.
- Un lane declarado decide el recorrido sin ser sobrescrito.
- El recorrido normal tiene dos preguntas base, una tercera solo cuando procede y confirmación final antes de persistir o construir.
- El recorrido pequeño emite exactamente una línea, no espera respuesta y continúa.
- Pi y Claude adoptan la misma intención vigente desde disco y no mantienen cuestionarios duplicados.
- Registros antiguos, parciales o con un bloque de intención desconocido conservan su postura histórica válida.
- Router, fases, gates y entrega no cambian.

## B. Spec

### Requisito 1 — Activación acotada

El sistema **MUST** activar la decisión de intención antes de cualquier construcción para una petición que modifique o pueda modificar código, configuración o datos persistentes, y **MUST NOT** activarla para una consulta inequívocamente de solo lectura.

**Given** una petición de inspección pura o una petición potencialmente modificadora,  
**When** se evalúa la activación,  
**Then** la inspección continúa sin canal y la petición modificadora o incierta no puede alcanzar construcción sin una resolución de preflight.

### Requisito 2 — Precedencia y clasificación fail-closed

El sistema **MUST** tratar un lane existente y declarado como autoritativo y **MUST** clasificar solo cuando no exista tal declaración. Sin declaración, **MUST** elegir pequeño únicamente para trabajo inequívocamente mecánico, acotado y no conductual, o documentación/texto exclusivamente acotado; cualquier riesgo protegido, comportamiento nuevo, evidencia incompleta o incertidumbre **MUST** resultar normal.

**Given** una petición con lane declarado, sin lane y evidencia completa de pequeñez, o sin lane y evidencia incierta o de riesgo,  
**When** se decide el recorrido,  
**Then** el lane declarado gana, solo la evidencia positiva completa produce pequeño y el resto produce normal.

### Requisito 3 — Preguntas normales adaptativas

El sistema **MUST** sustituir las preguntas TDD/lane por cambio por un único turno textual con dos preguntas numeradas que, en conjunto, cierren resultado, límites y criterio de terminado. **MAY** emitir una tercera pregunta únicamente cuando una decisión material concreta siga abierta y no exista valor persistido o default aplicable; el total de preguntas de decisión **MUST NOT** superar tres.

**Given** un cambio normal con sus preferencias técnicas disponibles o ausentes,  
**When** se planifica la interacción,  
**Then** aparecen dos preguntas base, solo aparece una tercera por una decisión material identificada, y no aparece el cuestionario anterior ni una UI modal paralela.

### Requisito 4 — Confirmación, persistencia y materialidad

El sistema **MUST NOT** persistir la intención normal ni permitir construcción antes de una confirmación final explícita. Tras confirmarla, **MUST** guardarla en `preflight.json` mediante `sdd-preflight.ts`, reutilizarla mientras no cambien materialmente objetivo, límites o criterio de terminado, y reabrirla cuando cambie alguno de esos tres elementos.

**Given** una intención normal pendiente, confirmada o ya vigente,  
**When** el usuario confirma, reformula de modo equivalente o altera un elemento material,  
**Then** solo la confirmación habilita la escritura inicial, la paráfrasis reutiliza el registro y la alteración material reabre el recorrido antes de construir.

### Requisito 5 — Recorrido pequeño

El sistema **MUST** emitir exactamente una línea en lenguaje llano que reformule lo entendido para un cambio inequívocamente pequeño, **MUST NOT** solicitar respuesta y **MUST** continuar por el router existente. La resolución automática **MAY** quedar registrada después de emitir la línea para impedir repeticiones entre runtimes.

**Given** una petición clasificada de forma segura como pequeña,  
**When** se ejecuta su preflight,  
**Then** se muestra una sola línea sin pregunta, se registra la resolución sin fingir confirmación humana y el router recibe la continuación.

### Requisito 6 — Bypass protegido

El sistema **MUST** respetar una orden explícita de omitir preguntas solo fuera de seguridad, datos persistentes y acciones destructivas; en esas categorías protegidas **MUST** conservar el recorrido normal.

**Given** una petición modificadora con bypass explícito,  
**When** se evalúan sus señales de riesgo,  
**Then** el bypass continúa únicamente si ninguna categoría protegida está presente o desconocida; de lo contrario se ejecuta el recorrido normal.

### Requisito 7 — Compatibilidad y paridad entre runtimes

El sistema **MUST** leer registros históricos sin bloque `intent`, **MUST** validar la postura TDD y la intención de forma independiente, y **MUST** hacer que Pi y Claude adopten el mismo registro confirmado o automático antes de presentar preguntas. Ningún hook secundario ni adaptador **MUST** mantener otro cuestionario o escritor de intención.

**Given** un registro legacy, parcial, desconocido o escrito por el otro runtime,  
**When** Pi o Claude abre el mismo cambio,  
**Then** se conserva toda postura histórica válida, una intención inválida se trata como ausente, una intención válida se adopta y no se pregunta de nuevo.

### Requisito 8 — Continuidad SDD

El sistema **MUST** devolver el control a la resolución y handoff del router existentes y **MUST NOT** alterar `scope → map → design → tasks → apply → verify → close`, las omisiones actuales de cada lane, los gates de `verify`/`close`, la entrega ni el bootstrap OpenSpec existente.

**Given** un preflight confirmado, automático pequeño o bypass permitido,  
**When** termina la decisión previa,  
**Then** el mismo router calcula la siguiente fase, el arranque explícito conserva o crea config y entra en `scope`, y ninguna fase o gate se ejecuta desde el clasificador.

## C. Decisions

### 1. Core de decisión puro; adapters finos

Se añadirá una función de dominio sin E/S que reciba evidencia estructurada y devuelva una unión cerrada: `read-only`, `normal`, `small` o `blocked/unresolved`, con reason codes estables. Para producir `small` exigirá afirmaciones positivas de alcance acotado, ausencia de comportamiento nuevo, ausencia de las tres categorías protegidas y evidencia suficiente; cualquier campo ausente o `unknown` produce `normal`.

La extracción semántica de objetivo y señales puede ocurrir en la superficie coordinadora, pero no decide el resultado: el core valida el objeto y aplica la tabla. Así Pi y Claude comparten la política y solo difieren en cómo reciben y muestran texto.

**Rechazado:** un conjunto de palabras clave como clasificador completo. Es determinista, pero no puede demostrar ausencia de riesgo o comportamiento nuevo y convertiría falsos negativos en `micro`.

### 2. Un solo propietario interactivo por petición

En Pi, el hook de entrada es el único punto que puede iniciar la interacción. `before_agent_start`, `ensureSddPreflight` invocado de nuevo y el gate de `tool_call` solo adoptan una resolución vigente/en vuelo o impiden construir si sigue sin resolver; nunca preguntan. En Claude, el coordinador generado invoca el mismo contrato una vez y el CLI actúa como adaptador, no como segundo cuestionario.

El recorrido normal presenta las dos preguntas base juntas en texto numerado y respondible de una vez. Tras procesar las respuestas, puede presentar una única pregunta material y después una acción de confirmación sobre la intención cerrada; la confirmación es un gate, no otra decisión técnica. El recorrido pequeño usa una única notificación textual, no `select` ni modal.

Una marca en vuelo por sesión evita reentradas locales. La deduplicación duradera ocurre al leer `preflight.json` antes de planificar preguntas y al releerlo inmediatamente antes de escribir; una resolución válida del otro runtime se adopta. No se persiste estado normal pendiente, porque eso violaría la confirmación previa y convertiría conversación privada en estado compartido.

### 3. Forma compatible de `preflight.json`

Los campos actuales `tdd`, `decidedBy` y `decidedAt` se mantienen con su significado. Se añade un bloque opcional y versionado, conceptualmente:

```json
{
  "tdd": "off | strict",
  "decidedBy": "pi | claude",
  "decidedAt": "ISO-8601",
  "intent": {
    "version": 1,
    "resolution": "confirmed | automatic-small | bypassed",
    "route": "normal | small",
    "summary": "formulación cerrada",
    "objective": "resultado esperado",
    "boundaries": { "in": [], "out": [] },
    "completionCriteria": [],
    "materialKey": "sha256:<canonical-json>",
    "laneOrigin": "declared | classified",
    "reason": "reason-code",
    "resolvedBy": "pi | claude",
    "resolvedAt": "ISO-8601"
  }
}
```

`confirmed` exige los tres campos materiales y confirmación humana. `automatic-small` conserva resumen y forma material suficiente, pero nunca se presenta como confirmado por el usuario. `bypassed` conserva la razón explícita y el resultado de frontera de riesgo sin inventar respuestas.

El decoder valida por ramas: un bloque `intent` ausente, de versión futura o malformado se ignora sin descartar un `tdd` válido. Los registros legacy no se consideran intenciones confirmadas y por tanto pasan una vez por el nuevo canal, pero sus valores TDD y lane se reutilizan y no ocupan preguntas.

**Rechazado:** crear `intent.json` o reutilizar `intent.md`. Sería un segundo almacén y rompería la propiedad pedida del preflight.

### 4. Materialidad por estado canónico, no por texto crudo

La intención cerrada se representa como tres slots: objetivo, límites (`in`/`out`) y criterios de terminado. Se normalizan como JSON canónico —espacios irrelevantes eliminados, listas con orden estable y valores vacíos rechazados— y su digest forma `materialKey`.

Una petición posterior se interpreta como un patch sobre esos slots: lo omitido se hereda; una paráfrasis que conserva los mismos hechos produce el mismo estado; añadir, retirar o contradecir un hecho produce otro digest y reabre. Si no puede establecerse equivalencia con evidencia suficiente, se reabre de forma normal en vez de asumir continuidad.

**Rechazado:** hashear el mensaje del usuario. Cambiaría ante cualquier reformulación y causaría preguntas repetidas.

### 5. Lane declarado frente a lane clasificado

La precedencia se decide antes del clasificador. Todo `lane.json` legado existente se considera declarado. Para nuevas decisiones, `intent.laneOrigin` distingue una declaración explícita de una salida automática y debe concordar con el lane leído; ante ausencia, incoherencia o corrupción, un fichero de lane existente se trata como declarado y nunca se sobrescribe.

Cuando no hay declaración, `normal` se traduce a `standard` y `small` a `micro` usando los valores existentes. Si el router necesita durabilidad, `sdd-preflight.ts` materializa la salida con el escritor actual de `lane.json` y registra `laneOrigin: classified`; no se cambia el schema del lane ni se añade autoridad al router. Una orden explícita posterior de lane marca la procedencia como `declared` antes de continuar. El router sigue leyendo el lane por su seam actual.

Las categorías protegidas fuerzan normal en la clasificación y bloquean bypass cuando no existe lane declarado. Un lane previamente declarado no se reinterpreta: esa es la precedencia explícita exigida por el delta, no una inferencia automática.

### 6. Orden de datos y continuación

1. La superficie determina si la petición es inequívocamente de lectura; si podría modificar, arma preflight.
2. Se resuelve el cambio de forma segura mediante la selección/naming ya existente y se leen `preflight.json`, lane y defaults TDD.
3. Una intención vigente y materialmente equivalente se adopta. En otro caso, un lane declarado fija la ruta; solo sin declaración se ejecuta el clasificador.
4. `small` emite una línea; `normal` recoge dos respuestas, opcionalmente una tercera decisión material, compone la intención y espera confirmación; el bypass se valida antes de omitir preguntas.
5. `sdd-preflight.ts` relee el registro, persiste la resolución y, si procede, el lane clasificado. Si el directorio aún no estaba enlazado al iniciar `scope`, la resolución confirmada queda solo en memoria de esa sesión hasta que exista un nombre seguro, y debe persistirse antes de cualquier fase de construcción; nunca se entrega `apply` con intención pendiente de escritura.
6. Se invoca el handoff existente. Bootstrap, selección de fase, verificación y entrega permanecen fuera del clasificador.

### 7. TDD y tercera pregunta

El valor TDD persistido se adopta; en su ausencia se usa el default vigente del proyecto. TDD o lane solo pueden ser la tercera pregunta si el core recibe una razón material concreta por la que las alternativas cambiarían el resultado, los límites o el criterio de terminado. No basta con que el valor esté ausente. El gate TDD de `tool_call` consume la decisión resultante y no vuelve a preguntar.

**Rechazado:** mantener los dos selectores actuales detrás del nuevo canal. Superaría la superficie máxima y recrearía el doble ask.

### 8. Estrategia de pruebas

- **Core:** tabla de clasificación para lane declarado, mecánico, docs/texto, comportamiento nuevo, riesgos, señales ausentes, incertidumbre y bypass; planificación de dos/tercera preguntas; normalización y materialKey.
- **Persistencia:** round-trip de cada resolución; lectura de registros legacy; TDD válido con intención parcial/futura; incoherencia de lane; autoría Pi/Claude; ninguna escritura normal antes de confirmar.
- **Pi:** una sola activación desde input, hooks secundarios sin preguntas, small de una línea, normal adaptativo, adopción en la misma sesión y tras cambio material.
- **Claude/paridad:** mismo vector de evidencia produce la misma decisión; adopta lo escrito por Pi y viceversa; CLI no implementa otra clasificación ni escribe intención fuera del propietario compartido.
- **Router/regresión:** la continuación usa el dispatcher actual; `micro` conserva `scope/design/apply/verify/close`; `standard` conserva siete fases; bootstrap mantiene bytes de config; gates TDD, verify, close y delivery no cambian.

## D. Success Criteria

Son aceptables únicamente resultados observables en los que:

- una consulta inequívocamente de solo lectura no muestra intención ni crea preflight;
- una petición modificadora no llega a construcción sin resolución;
- `lane: standard` y `lane: micro` declarados deciden sus recorridos y permanecen intactos;
- sin lane, solo evidencia completa de trabajo mecánico/no conductual o docs/texto acotado produce pequeño;
- riesgo, comportamiento nuevo, datos persistentes, acción destructiva o incertidumbre producen normal;
- normal muestra dos preguntas de decisión, como máximo una tercera material, y no escribe antes de confirmación;
- pequeño muestra exactamente una línea, no espera respuesta y continúa;
- una reformulación equivalente adopta el mismo `materialKey`; un cambio de objetivo, límites o terminado reabre;
- Pi y Claude leen la misma resolución y ninguno repite las preguntas ya cerradas;
- un `preflight.json` histórico sigue exponiendo TDD/autoría y un bloque `intent` inválido no los invalida;
- el handoff, las fases y las puertas existentes conservan sus resultados.

Verificación prevista para las fases posteriores, sin ejecutarla en diseño:

- Pruebas focalizadas de los módulos y seams anteriores mediante `bun test <tests-relevantes>`.
- Puerta global: `bun test` desde la raíz.
- Typecheck compartido: `bun run typecheck` desde la raíz.
- Typecheck del instalador: `cd installer && bun run typecheck`.
- Comprobación de paridad core/Claude mediante la prueba determinista ya existente para superficies generadas.
