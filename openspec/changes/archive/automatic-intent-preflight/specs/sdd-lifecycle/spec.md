# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: intent-confirmation-persistence-routing
title: La intención confirmada se persiste y continúa por el router existente
requirement: The system MUST require final confirmation before persisting a closed intent, store that intent in `preflight.json` through the existing `sdd-preflight.ts` writer, reuse it until objective, boundaries, or completion criteria change materially, and then continue through the existing SDD router.
Given: un cambio ha completado su recorrido de intención y existe una formulación cerrada pendiente de confirmación
When: el usuario confirma la intención final o cambia materialmente el objetivo, los límites o el criterio de terminado
Then: la intención confirmada se guarda mediante el escritor y almacén existentes y el router actual recibe la continuación; una intención vigente se reutiliza, mientras que un cambio material la reabre y una mera reformulación no

### Scenario: intent-explicit-bypass-risk-boundary
title: La omisión explícita no rebaja cambios de riesgo
requirement: The system MUST allow an explicit user instruction to bypass the intent questions only for changes outside security, persistent-data, and destructive-action categories, and MUST keep those categories on the normal intent path.
Given: el usuario pide explícitamente omitir el canal de intención antes de un cambio modificador
When: el sistema evalúa la omisión y la categoría de riesgo del cambio
Then: la omisión continúa solo para cambios sin seguridad, datos persistentes ni acciones destructivas; las categorías protegidas conservan el recorrido normal

### Scenario: intent-lane-precedence-and-classification
title: El lane declarado precede a la clasificación automática
requirement: The system MUST preserve any declared SDD lane as authoritative and classify a change only when no lane is declared, choosing the small path only for bounded mechanical non-behavioral or bounded documentation/text work and choosing the normal path for security, persistent-data, destructive, uncertain, or otherwise non-small work.
Given: una petición modificadora entra en preflight con un lane declarado, sin lane, o con evidencia de clasificación incierta
When: el sistema decide el recorrido de intención previo a la construcción
Then: un lane declarado no se sobrescribe; sin declaración, solo el trabajo inequívocamente pequeño toma el recorrido pequeño y todo riesgo, incertidumbre o trabajo restante toma el normal

### Scenario: intent-normal-adaptive-questions
title: Los cambios normales reciben dos preguntas base y una tercera adaptativa
requirement: The system MUST replace and consolidate the existing per-change preflight question surface for a normal change into two questions covering expected outcome, boundaries, and completion criteria plus a third question only when a material decision remains open, with three total questions as the maximum.
Given: un cambio se resuelve por el recorrido normal y las preferencias técnicas existentes pueden estar declaradas o provenir de defaults del proyecto
When: el preflight construye la superficie de preguntas anterior a la construcción
Then: presenta dos preguntas base, añade una tercera solo por una decisión material aún abierta, reutiliza TDD y lane ya conocidos salvo impacto material y no conserva preguntas paralelas del preflight anterior

### Scenario: intent-small-restatement-continues
title: Los cambios pequeños continúan tras una sola reformulación
requirement: The system MUST emit exactly one plain-language restatement line without requesting a response for a bounded mechanical non-behavioral or bounded documentation/text change, and then continue to the existing router.
Given: un cambio sin lane declarado se clasifica de forma inequívoca como pequeño, mecánico y no conductual, o como documentación o texto acotado
When: el preflight ejecuta el recorrido pequeño
Then: muestra una única línea que reformula lo entendido, no espera respuesta y entrega la continuación al router existente
