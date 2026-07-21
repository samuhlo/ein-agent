# Diseño: adopción canónica de candidate receipt

## A. Proposal

### Intent

Adoptar en el dominio canónico `sdd-lifecycle` el comportamiento observable de `candidate-receipt` ya fusionado mediante la PR #43 (`b11f4a3`). Este SDD es una adopción de especificación: documenta el comportamiento actual y no afirma haber producido ni reconstruido esa implementación.

### Scope

En alcance:

- Crear un delta OpenSpec exclusivamente `ADDED` para `sdd-lifecycle`.
- Especificar emisión, manifiesto exacto, aislamiento del índice, árbol candidato determinista, identidad y vigencia del recibo, validación fail-closed, `candidateTreeMatches` y orientación del tool sin `paths`.
- Sincronizar posteriormente el delta con la especificación canónica y conservar evidencia determinista del sync.

Fuera de alcance:

- Modificar runtime, wiring, tests o la implementación fusionada por la PR #43.
- Bloquear commit, push, PR u otra entrega mediante el recibo.
- Añadir una lane mecánica o no-SDD para emitir o consumir recibos.
- Reconstruir retrospectivamente la historia de implementación de la PR #43.
- Realizar cambios de release, Homebrew o historial git.

### Affected areas

- `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md`: delta `ADDED` previsto.
- `openspec/specs/sdd-lifecycle/spec.md`: proyección canónica posterior mediante sync determinista.
- `openspec/changes/candidate-receipt-spec-adoption/sync-report.md`: evidencia posterior de sincronización.
- `ein-pi/agent/lib/candidate-receipt.ts`, `ein-pi/agent/extensions/ein-ai.ts` y `tests/candidate-receipt.test.ts`: fuentes de contraste, sin cambios de producción ni test previstos.

### Risks

- Especificar detalles internos accidentales en vez de resultados observables puede rigidizar el contrato innecesariamente.
- Omitir una dimensión de identidad o vigencia puede hacer que la especificación acepte evidencia que el runtime rechaza.
- Un delta no exclusivamente `ADDED`, un ID duplicado o una sincronización conflictiva puede alterar o dejar pendiente el contrato canónico.
- Confundir el recibo con un gate de entrega atribuiría a la PR #43 comportamiento de slices posteriores.

### Rollback

Revertir el delta, su proyección canónica y el reporte de sync como un único cambio documental. No se requiere rollback de producción porque esta adopción no modifica la implementación existente.

### Success criteria

- El delta pertenece a `sdd-lifecycle`, contiene solo `ADDED` y no reemplaza escenarios canónicos existentes.
- Cada comportamiento descrito coincide con el runtime, wiring y tests ya fusionados por la PR #43.
- El sync determinista termina sin conflictos y liga el delta con los bytes canónicos resultantes.
- No existen ediciones de producción y el texto no atribuye la implementación a este SDD.

## B. Spec

El delta previsto añadirá los siguientes escenarios, sin secciones `MODIFIED` ni `REMOVED`.

### Scenario: candidate-receipt-emission-preconditions

**Requirement:** The system MUST emit a candidate receipt only inside a repository with a resolvable HEAD, for a safe existing SDD change whose apply phase is complete and whose current verify evidence is fresh and passing.

**Given:** existe un cambio SDD y se solicita emitir su recibo candidato.

**When:** el sistema evalúa el repositorio, `HEAD`, la seguridad y existencia del cambio, el estado de apply y la evidencia verify vigente.

**Then:** emite solo si todas las precondiciones se cumplen; cualquier ausencia, estado incompleto, verify no aprobado o evidencia obsoleta produce rechazo sin recibo.

### Scenario: candidate-receipt-explicit-path-manifest

**Requirement:** The system MUST require an explicit, duplicate-free manifest of exact changed file paths, support added, modified, deleted, and renamed files, and reject broad or non-exact path selection.

**Given:** el solicitante declara las rutas cuyos bytes compondrán el candidato.

**When:** el sistema valida el manifiesto contra los cambios trackeados y untracked actuales.

**Then:** acepta ficheros concretos añadidos, modificados o eliminados y renombres que declaren tanto la ruta antigua como la nueva; rechaza manifiestos vacíos, duplicados, directorios, rutas absolutas, escapes `..`, pathspecs mágicos, rutas inexistentes o ficheros sin cambios.

### Scenario: candidate-receipt-isolated-candidate-tree

**Requirement:** The system MUST build a deterministic candidate tree from HEAD and only the explicit manifest through an isolated temporary Git index, without mutating the real index or worktree.

**Given:** existe un manifiesto exacto ya validado y puede haber staging ajeno al candidato.

**When:** el sistema incorpora en un índice temporal las adiciones, modificaciones, eliminaciones y renombres declarados y escribe el árbol candidato.

**Then:** el tree SHA representa únicamente `HEAD` más los bytes declarados, el staging y worktree reales permanecen intactos y el índice temporal se elimina tanto en éxito como en error.

### Scenario: candidate-receipt-identity-and-atomic-publication

**Requirement:** The system MUST atomically publish a local versioned receipt bound to the repository, worktree, change, HEAD, candidate tree, ordered paths, current verify report, and declared verification commands.

**Given:** las precondiciones de emisión y el árbol candidato son válidos.

**When:** el sistema crea el recibo.

**Then:** el recibo liga identidades de repositorio y worktree, cambio, `HEAD`, rama, tree SHA, rutas ordenadas y su digest, digest del informe verify vigente, comandos declarados y su digest, y fecha; se publica mediante reemplazo atómico bajo el git-dir y no como contenido versionado.

### Scenario: candidate-receipt-fail-closed-current-evidence

**Requirement:** The system MUST fail closed when a candidate receipt is missing, corrupt, unsupported, internally inconsistent, mismatched to its repository, worktree, change, HEAD, paths, report, or commands, or stale relative to current apply and verify evidence.

**Given:** un consumidor intenta validar evidencia de candidate receipt para un cambio.

**When:** el sistema carga y contrasta el recibo con su estructura, versión, digests, identidad y evidencia SDD actuales.

**Then:** solo acepta una coincidencia completa; ausencia, error de lectura o JSON, campos inválidos, versión no soportada, digest inconsistente, identidad distinta, informe verify ausente o cambiado, apply posterior o precondición ya inválida producen rechazo.

### Scenario: candidate-receipt-tree-divergence

**Requirement:** The system MUST define `candidateTreeMatches` as true only when deterministic reconstruction from the receipt's exact manifest and current declared bytes yields the receipt's candidate tree SHA.

**Given:** existe un recibo estructuralmente utilizable con un manifiesto exacto y tree SHA registrado.

**When:** `candidateTreeMatches` reconstruye el árbol candidato desde el estado actual usando esas rutas.

**Then:** devuelve `true` si y solo si el tree SHA reconstruido coincide; devuelve `false` cuando cambios posteriores en los bytes declarados producen otro árbol.

### Scenario: candidate-receipt-tool-manifest-guidance

**Requirement:** The system MUST treat paths discovered by the candidate-receipt tool as suggestions and MUST NOT emit a receipt until the caller supplies an explicit path manifest.

**Given:** se invoca `ein_candidate_receipt` para un cambio activo sin `paths`.

**When:** el tool inspecciona los cambios disponibles.

**Then:** devuelve sugerencias separadas de rutas trackeadas y untracked para selección explícita, sin emitir; con manifiesto explícito delega la emisión y comunica su aceptación o rechazo.

### Scenario: candidate-receipt-delivery-limit

**Requirement:** The system MUST NOT treat a candidate receipt as authorization or enforcement for commit, push, pull request, or any other delivery action, and MUST NOT provide a mechanical or non-SDD emission lane in this adoption.

**Given:** existe un candidate receipt válido o una solicitud fuera del ciclo SDD.

**When:** se evalúa si el recibo habilita entrega o si puede emitirse sin evidencia SDD actual.

**Then:** el recibo solo acredita el candidato verificado; no bloquea ni autoriza entrega y no habilita una lane mecánica o no-SDD.

## C. Decisions

### 1. Adoptar el contrato donde ya vive el ciclo

`candidate-receipt` se incorpora a `sdd-lifecycle` porque enlaza apply, verify y los bytes candidatos. Crear otro dominio separaría una garantía que depende del mismo ciclo y aumentaría el coste de comprensión.

### 2. Delta exclusivamente ADDED

Los ocho escenarios son nuevos para el contrato canónico y usarán IDs propios. Los escenarios canónicos existentes no se reinterpretan, modifican ni eliminan. El sincronizador OpenSpec es el único responsable de proyectar el delta al spec canónico y de producir su evidencia.

### 3. Especificar resultados, no accidentes internos

El contrato fija aislamiento, determinismo, identidad, atomicidad y rechazo observable. No fija PID, nombres aleatorios de temporales ni texto literal de errores. La implementación fusionada por la PR #43 sigue siendo la fuente de contraste, pero no es propiedad de este SDD y no se editará.

### 4. Separar sugerencia de intención

La detección de rutas del tool solo ayuda al usuario a reconocer cambios; el manifiesto explícito conserva la decisión sobre qué bytes forman el candidato. Se rechaza seleccionar automáticamente “todo lo modificado” porque rompería la exactitud y podría incluir cambios ajenos.

### 5. Mantener fuera el gate de entrega y la lane mecánica

El recibo prueba una relación entre evidencia SDD y bytes, no concede permisos ni ejecuta entrega. Se rechaza ampliar este slice con enforcement de delivery o soporte no-SDD porque no forman parte del comportamiento fusionado que se adopta.

### Boundaries

- El delta del cambio es dueño de los nuevos requisitos observables.
- `ein_openspec_sync` es dueño de la proyección idempotente al spec canónico y de `sync-report.md`.
- El runtime actual es dueño de producir y validar recibos, pero queda inalterado.
- La fase verify será dueña de contrastar especificación, sync, runtime, wiring y tests; design no ejecuta esas comprobaciones.

### Alternatives rejected

- **Nuevo dominio `candidate-receipt`:** fragmentaría el ciclo apply/verify sin una frontera funcional real.
- **Modificar escenarios canónicos existentes:** falsearía su alcance histórico y no es necesario para añadir el contrato.
- **Cambiar producción durante la adopción:** presentaría erróneamente este SDD como implementación de comportamiento ya fusionado.
- **Manifestación automática o paths amplios:** no identifica de forma exacta los bytes pretendidos.
- **Gate de entrega o lane no-SDD:** pertenecen a trabajo posterior y exceden la PR #43.

## D. Success Criteria

La adopción será aceptable cuando se observe que:

- El delta válido está en `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md`, declara `domain: sdd-lifecycle` y contiene únicamente los ocho escenarios `ADDED` diseñados.
- `ein_openspec_sync` para `candidate-receipt-spec-adoption` finaliza sin conflictos, produce `sync-report.md` vigente y la segunda sincronización no cambia el resultado.
- `openspec/specs/sdd-lifecycle/spec.md` conserva los escenarios anteriores e incorpora los nuevos sin operaciones retrospectivas.
- `bun test tests/openspec-specs.test.ts` valida la gramática y sincronización OpenSpec.
- `bun test tests/candidate-receipt.test.ts` confirma emisión, manifiesto, aislamiento, persistencia, validación fail-closed, vigencia y comparación del árbol.
- La revisión enfocada del wiring de `ein_candidate_receipt` confirma que una llamada sin `paths` sugiere pero no emite, y que una llamada con manifiesto explícito comunica aceptación o rechazo.
- El diff no contiene cambios en runtime, wiring, tests, release ni Homebrew.
- Todos los artefactos declaran de forma coherente que la implementación procede de la PR #43 (`b11f4a3`) y que este SDD solo adopta su comportamiento en la especificación canónica.
