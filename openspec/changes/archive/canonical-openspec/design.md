# Diseño — OpenSpec canónico

## A. Proposal

- **Intent:** convertir `openspec/specs/` en la fuente verificable del comportamiento vigente y representar cada cambio de comportamiento mediante deltas estrictos, sincronizables y auditables antes del cierre.
- **Scope:** incluye gramática canónica, identidad estable de escenarios, deltas `ADDED`/`MODIFIED`/`REMOVED`, declaración explícita sin delta, sincronización e informe deterministas, estados de cierre, contexto acotado para scope/design y adopción inicial de `sdd-lifecycle`. No incluye una fase de IA nueva, un parser Markdown general, migración histórica masiva, specs nuevas bajo `.sdd` ni sincronización implícita durante close.
- **Affected areas:** un módulo TypeScript/ESM pequeño y puro para contrato, parseo, estado y planificación de sync; un adaptador de filesystem para aplicar el plan; `sdd-guardrails.ts`, `sdd-router.ts`, `sdd-close.ts` y el wiring de `ein-ai.ts`; contratos fuente de `sdd-scope.md`, `sdd-design.md` y orquestación; `openspec/specs/sdd-lifecycle/spec.md`, el delta de este cambio y pruebas enfocadas.
- **Risks:** colisión o renombrado accidental de IDs; specs parciales tras un fallo de I/O entre reemplazos; informes obsoletos aceptados por error; bloqueo de cambios activos sin declaración; y selección de contexto demasiado amplia o incompleta.
- **Rollback:** parser, sincronizador y guardas de cierre forman una sola frontera de reversión y se revierten juntos. Las specs y los informes ya escritos se conservan como evidencia; una sincronización incorrecta se revierte restaurando desde control de versiones los specs tocados, no mediante mutación durante close.
- **Success criteria:** una entrada válida produce bytes canónicos e informe repetibles; entradas ambiguas fallan cerradas sin elegir escenarios; close acepta solo `synchronized` o un `spec_delta: none` válido; y `sdd-lifecycle` puede adoptarse sin migrar otros dominios ni romper la lectura legacy.

## B. Spec

### B.1 Gramática canónica e identidad

**Requirement C1.** El sistema MUST almacenar cada dominio adoptado en `openspec/specs/<domain>/spec.md`, donde `<domain>` y cada `<scenario-id>` cumplen `[a-z0-9]+(?:-[a-z0-9]+)*`. El archivo MUST usar esta gramática `openspec-spec/v1`:

```text
# OpenSpec Specification
format: openspec-spec/v1
domain: <domain>

## Scenario: <scenario-id>
title: <texto no vacío en una línea>
requirement: The system MUST|SHOULD|MAY <texto no vacío en una línea>
Given: <texto no vacío en una línea>
When: <texto no vacío en una línea>
Then: <texto no vacío en una línea>
```

Cada bloque contiene exactamente esos seis campos, cada ID es único dentro del dominio y el `domain` declarado coincide con el nombre del directorio. El serializador MUST emitir UTF-8 sin BOM, LF, un bloque por escenario ordenado byte a byte por ID y una única nueva línea final. El parser MAY aceptar CRLF, pero no encabezados estructurales ni campos adicionales.

- **Given** un spec cuyo path es `openspec/specs/sdd-lifecycle/spec.md` y cuyos escenarios tienen IDs únicos,
- **When** se parsea y vuelve a serializar,
- **Then** el dominio es `sdd-lifecycle`, los registros quedan ordenados por ID y la salida usa exactamente `openspec-spec/v1`.

**Requirement C2.** La identidad estable de un escenario MUST ser `<domain>/<scenario-id>` y no su título, requisito, posición ni contenido. `MODIFIED` MUST reemplazar el registro completo conservando esa identidad; cambiar un ID MUST expresarse como `REMOVED` del ID anterior más `ADDED` del nuevo.

- **Given** un escenario `sdd-lifecycle/close-readiness` cuyo título cambió,
- **When** un delta `MODIFIED` referencia `close-readiness`,
- **Then** se reemplaza exactamente ese registro aunque su título o posición previos sean distintos.

### B.2 Gramática del delta y ausencia explícita

**Requirement D1.** Un cambio con comportamiento MUST declarar uno o más deltas en `openspec/changes/<change>/specs/<domain>/spec.md`. Cada archivo MUST usar exclusivamente esta gramática `openspec-delta/v1`, omitiendo secciones vacías y manteniendo las secciones presentes en orden `ADDED`, `MODIFIED`, `REMOVED`:

```text
# OpenSpec Delta
format: openspec-delta/v1
domain: <domain>

## ADDED
### Scenario: <scenario-id>
title: <texto no vacío en una línea>
requirement: The system MUST|SHOULD|MAY <texto no vacío en una línea>
Given: <texto no vacío en una línea>
When: <texto no vacío en una línea>
Then: <texto no vacío en una línea>

## MODIFIED
### Scenario: <scenario-id>
title: <texto no vacío en una línea>
requirement: The system MUST|SHOULD|MAY <texto no vacío en una línea>
Given: <texto no vacío en una línea>
When: <texto no vacío en una línea>
Then: <texto no vacío en una línea>

## REMOVED
### Scenario: <scenario-id>
reason: <texto no vacío en una línea>
```

Debe existir al menos una operación. Cualquier otro encabezado de operación, bloque incompleto, ID repetido o una misma identidad presente en más de una operación MUST ser rechazado; no hay `RENAMED`, `DEPRECATED`, alias ni operación implícita.

- **Given** un delta con secciones `ADDED` y `REMOVED` válidas,
- **When** se valida su gramática,
- **Then** se aceptan sus operaciones; si aparece `CHANGED` o el mismo ID en dos operaciones, se rechaza el delta.

**Requirement D2.** Un cambio mecánico o no SDD sin delta MUST declarar exactamente una vez en `scope.md` este bloque, con ambas líneas consecutivas:

```text
## Spec delta declaration
spec_delta: none
spec_delta_reason: <razón de 1 a 200 caracteres tras trim>
```

La razón MUST ser de una sola línea y no puede ser `none`, `n/a`, `na`, `tbd`, `unknown` ni `-`, sin distinguir mayúsculas. La presencia simultánea del bloque y de cualquier delta MUST ser inválida. La existencia de uno o más delta files válidos es la declaración del modo delta; no se añade un token redundante `spec_delta: present`.

- **Given** un cambio mecánico sin archivos bajo `specs/`,
- **When** `scope.md` contiene el bloque exacto con una razón no vacía y no centinela,
- **Then** la ausencia de delta queda resuelta; una razón vacía o la mezcla con un delta queda sin resolver.

### B.3 Estados y sincronización

**Requirement S1.** El sistema MUST exponer un único estado de spec por cambio con esta precedencia:

1. `unresolved`: falta una declaración válida, se mezclan modos o la declaración/delta no cumple la gramática.
2. `conflict`: un informe vigente registra que un delta válido no puede aplicarse sin ambigüedad o pérdida.
3. `synchronized`: existe un `spec_delta: none` válido, o un informe vigente `synchronized` cuyos digests coinciden con los delta files y specs actuales.
4. `pending`: el delta es válido pero falta el informe, su versión/formato no se reconoce o sus digests ya no coinciden.

Un spec canónico con IDs duplicados, un `ADDED` ya existente o un target de `MODIFIED`/`REMOVED` inexistente o ambiguo MUST producir conflicto durante sync, nunca selección implícita.

- **Given** un delta válido cuyo `sync-report.md` fue eliminado o quedó obsoleto tras editar el delta,
- **When** se evalúa su estado,
- **Then** el resultado es `pending`, no `synchronized` ni una inferencia basada en mtimes.

**Requirement S2.** La sincronización MUST seguir este algoritmo determinista:

1. Resolver solo `openspec/changes/<change>/specs/*/spec.md`, ordenar paths byte a byte y validar paths, versión y gramática.
2. Leer en memoria el snapshot de los specs canónicos de esos dominios; un dominio ausente puede nacer únicamente de operaciones `ADDED`.
3. Calcular `delta_sha256` sobre un manifiesto de pares `relative-path + raw-bytes`, y `base_sha256` sobre los specs tocados, ambos ordenados y con longitudes prefijadas antes de SHA-256.
4. Evaluar todas las operaciones contra el snapshot original, no contra resultados intermedios. Ordenar diagnósticos por dominio, ID y código. Ante cualquier conflicto, no mutar specs y escribir solo el informe conflictivo.
5. Si no hay conflictos, construir todos los resultados en memoria: `ADDED` inserta una identidad ausente, `MODIFIED` reemplaza exactamente una existente y `REMOVED` elimina exactamente una existente. Serializar con `openspec-spec/v1`.
6. Escribir temporales en los mismos directorios, reemplazar los specs tocados y escribir `sync-report.md` al final. Ante un error capturable, restaurar el snapshot y no dejar un informe `synchronized` vigente.
7. Si un informe `synchronized` ya coincide con `delta_sha256` y con el digest actual de resultado, retornar sin reescribir archivos.

Close MUST limitarse a validar este resultado; nunca ejecuta los pasos de sincronización.

- **Given** los mismos bytes de delta y el mismo snapshot canónico,
- **When** se ejecuta sync dos veces,
- **Then** la segunda ejecución es un no-op y los specs y el informe conservan exactamente los mismos bytes.

**Requirement S3.** `openspec/changes/<change>/sync-report.md` MUST usar el siguiente contrato versionado. No contiene timestamps, mtimes, paths absolutos ni orden del filesystem:

```text
# OpenSpec Sync Report
sync_report_version: 1
change: <change>
state: synchronized|conflict
delta_sha256: <sha256 hexadecimal minúsculo>
base_sha256: <sha256 hexadecimal minúsculo>
result_sha256: <sha256 hexadecimal minúsculo>
domains: <domains ordenados y separados por coma>
operations: added=<n> modified=<n> removed=<n>
conflicts: <n>

## Domain Results
- domain=<domain>; before=<sha256|absent>; after=<sha256|absent>; added=<n>; modified=<n>; removed=<n>

## Conflicts
- none
```

Para `state: conflict`, `result_sha256` MUST ser igual a `base_sha256`, cada `after` MUST ser igual a `before`, y `## Conflicts` contiene una o más líneas `- identity=<domain>/<scenario-id|none>; code=<código-estable>; detail=<mensaje-estable>`. Las filas se ordenan por dominio y los conflictos por identidad y código. Para `state: synchronized`, `conflicts` es `0` y la única línea es `- none`.

- **Given** dos enumeraciones del filesystem en distinto orden que contienen los mismos bytes,
- **When** se genera el informe,
- **Then** ambas producen el mismo `sync-report.md` byte por byte.

### B.4 Close, contexto y adopción

**Requirement L1.** La readiness de close MUST invocar el evaluador determinista dentro de `assessCloseReadiness`, sin agente ni fase adicional. El cierre normal solo procede con estado `synchronized`; un informe conflictivo, pendiente, sin resolver, malformado o de versión desconocida lo bloquea con una razón estable. El flag legacy `force` MAY seguir sorteando las guardas históricas de apply/verify, pero MUST NOT sortear la guarda canónica de specs. Close MUST NOT crear, reparar, sincronizar ni reescribir specs o informes.

- **Given** apply/verify/summary frescos pero un reporte cuyo `result_sha256` no coincide con el spec actual,
- **When** se solicita close incluso con `force`,
- **Then** close rechaza el cambio como `pending` y no muta el spec ni el informe.

**Requirement L2.** Scope y design MUST recibir contexto de specs mediante referencias explícitas de dominio, no mediante búsqueda del contenido completo. El selector acepta hints de dominio de la tarea para scope y del map para design, resuelve únicamente paths exactos `openspec/specs/<domain>/spec.md`, ordena por dominio y aplica un límite duro de 3 archivos y 32 KiB UTF-8 agregados por fase. Cada artefacto registra path, SHA-256 y bytes leídos; si excede el límite, la fase MUST bloquear y pedir una selección más estrecha, nunca truncar silenciosamente ni cargar el resto de specs. Design reutiliza las referencias de scope y solo añade hints del map dentro del mismo límite.

- **Given** cinco dominios adoptados pero hints explícitos para `sdd-lifecycle`,
- **When** scope o design construye su contexto,
- **Then** lee solo `openspec/specs/sdd-lifecycle/spec.md` y registra su referencia y digest.

**Requirement L3.** La adopción inicial MUST limitarse a `sdd-lifecycle`, el dominio más pequeño identificado por el map, y MUST describir solo comportamiento confirmado o introducido por este cambio. Los demás dominios MAY adoptarse en cambios posteriores; no se reconstruyen specs desde archivos históricos ni desde cambios archivados.

- **Given** un repositorio sin specs canónicos y un delta inicial de `sdd-lifecycle` compuesto solo por `ADDED`,
- **When** se sincroniza correctamente,
- **Then** nace únicamente `openspec/specs/sdd-lifecycle/spec.md` y ningún otro dominio es creado.

**Requirement L4.** OpenSpec MUST conservar prioridad sobre cualquier memoria opcional. Los cambios activos existentes bajo `openspec/changes/` siguen enrutando con sus artefactos y aliases actuales, pero quedan `unresolved` para close hasta añadir un delta o el bloque `none`; no se reescriben automáticamente. Cuando `resolveChangesDir` use el fallback `.sdd/changes/`, el comportamiento histórico de status/check/close MUST permanecer sin esta exigencia y no se escribirán specs, deltas ni informes bajo `.sdd`.

- **Given** un proyecto que solo tiene `.sdd/changes/fix-legacy` y sus artefactos legacy válidos,
- **When** se evalúa o cierra el cambio,
- **Then** se conserva el flujo previo sin exigir ni crear archivos OpenSpec.

**Requirement L5.** El contrato MUST ofrecer costuras puras para parsear spec, parsear delta, serializar, calcular digests, planificar sync, parsear informe y evaluar estado; el adaptador de filesystem MUST limitarse a lectura, temporales, reemplazo/restauración e informe. Las pruebas MUST cubrir entradas válidas, encabezados inválidos, IDs duplicados, targets ausentes, orden estable, reporte obsoleto, fallo de escritura, close y fallback legacy.

- **Given** un adaptador que falla al reemplazar el segundo spec de un plan multidominio,
- **When** se aplica la sincronización,
- **Then** se intenta restaurar el snapshot, no se emite evidencia `synchronized` vigente y close permanece bloqueado.

## C. Decisions

### C.1 Unidad de comportamiento: escenario autocontenido

La unidad canónica es un escenario con su requisito RFC 2119, no un árbol Markdown arbitrario. Esto hace que la identidad, el reemplazo y el diff sean inequívocos y permite un parser lineal pequeño. Se rechaza un framework Markdown general porque añadiría tolerancia, AST y casos de normalización no necesarios para esta slice.

### C.2 Identidad explícita y reemplazo completo

`<domain>/<scenario-id>` es la única clave. `MODIFIED` reemplaza todo el registro y `REMOVED` conserva una razón auditable. Se rechazan títulos, posición y hashes de contenido como identidad: cambian precisamente cuando cambia el comportamiento. También se rechaza el rename implícito; `REMOVED` + `ADDED` deja la intención visible.

### C.3 Plan puro, mutación explícita, informe al final

Parseo, validación y planificación ocurren en memoria antes de escribir. La operación de sync es una utilidad determinista cableada al flujo existente, no una octava fase; apply puede invocarla explícitamente y verify puede inspeccionar su evidencia. Close solo valida digests. Se rechaza sincronizar durante close porque ocultaría una mutación irreversible detrás de una comprobación.

### C.4 Estado calculado, no almacenado por heurísticas

`unresolved`, `pending`, `conflict` y `synchronized` se derivan de declaración, gramática, versión y SHA-256. No se usan mtimes para specs. El report guarda únicamente evidencia reproducible; `pending` y `unresolved` pueden existir sin fabricar un reporte que parezca una sincronización ejecutada.

### C.5 Responsabilidades y fronteras

| Dueño | Responsabilidad |
|---|---|
| `openspec/specs/<domain>/spec.md` | comportamiento vigente canónico del dominio |
| `changes/<change>/specs/<domain>/spec.md` | intención conductual del cambio |
| `sync-report.md` | evidencia local, versionada y reproducible del intento de sync |
| módulo puro de specs | gramática, identidad, digests, planificación, report y estado |
| adaptador filesystem | aplicación explícita y restauración ante errores capturables |
| guardrails | declaración `none`, paths y gramática de artefactos presentes |
| router/close readiness | exponer estado y bloquear close sin mutar |
| scope | seleccionar y registrar referencias según hints de tarea |
| map | confirmar o refinar dominios afectados |
| design | consumir solo referencias registradas/hints mapeados dentro del límite |
| tasks/apply/verify | dividir, ejecutar y verificar la sync; no redefinir la gramática |

### C.6 Compatibilidad e incremento antes que migración

La primera slice adopta solo `sdd-lifecycle`. Los cambios OpenSpec activos no se alteran en silencio: pueden continuar su ciclo y resolver la nueva guarda antes de close. `.sdd` sigue siendo fallback de artefactos, nunca segunda fuente de comportamiento. Se rechaza inferir specs desde historial, porque convertiría datos incompletos en verdad canónica.

### C.7 Límite de fallo y reversión

El informe se escribe después de los specs para que nunca certifique anticipadamente un resultado. La restauración cubre errores capturables; ante terminación abrupta, los digests hacen visible cualquier estado parcial y bloquean close. Añadir un journal transaccional se rechaza en esta slice por complejidad; el repositorio y el snapshot de proceso son la frontera de recuperación.

## D. Success Criteria

- La gramática acepta `openspec-spec/v1` y deltas válidos, y rechaza campos, operaciones, IDs o escenarios ambiguos fuera del contrato.
- `MODIFIED` y `REMOVED` resuelven solo por `<domain>/<scenario-id>`; cero o múltiples targets producen conflicto sin mutar specs.
- `spec_delta: none` solo se acepta con el bloque exacto y una razón válida; la mezcla con delta queda `unresolved`.
- Dos ejecuciones equivalentes producen specs e informe idénticos; un reporte ausente, alterado o con digest/version incorrectos resulta `pending`.
- Un conflicto deja los specs intactos y un reporte ordenado; un fallo de I/O no deja evidencia sincronizada aceptable.
- `assessCloseReadiness` acepta un delta sincronizado o `none` válido y rechaza `unresolved`, `pending` y `conflict` sin lanzar IA ni ejecutar sync.
- La adopción crea únicamente el dominio `sdd-lifecycle`; no toca históricos, otros dominios ni `.sdd`.
- Scope/design leen como máximo 3 specs y 32 KiB por fase, registran path/digest/bytes y fallan explícitamente si el contexto no cabe.
- Se conserva la prioridad de OpenSpec, los aliases activos y el fallback de cierre legacy.
- Verificación enfocada prevista, sin ejecución en esta fase: `bun test tests/openspec-specs.test.ts`, `bun test tests/sdd-close.test.ts`, `bun test tests/sdd-guardrails.test.ts`, `bun test tests/sdd-router.test.ts`, `bun test tests/sdd-scope-packet.test.ts`, `bun test tests/sdd-flow-contract.test.ts` y las pruebas afectadas de reconcile/config bootstrap.
