# Map — candidate-receipt-spec-adoption

status: partial_budget_exceeded
scope_status: mapped_with_budget_overrun
change: candidate-receipt-spec-adoption
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget: { max_tokens: 12000, max_reads: 24 }
budget_exceeded: true

## Resultado

La adopción pertenece a `sdd-lifecycle`: el runtime ya fusionado en PR #43 (`b11f4a3`) produce y valida evidencia de bytes dentro del ciclo apply/verify. Este SDD documenta ese contrato presente; no reconstruye ni se atribuye su implementación. El delta debe ser exclusivamente `ADDED` y no debe incluir un gate de entrega ni una vía mecánica de entrega.

El presupuesto de lectura se superó al tener que leer las cuatro entradas obligatorias —en especial el archivo de wiring de 50 KiB— y las costuras mínimas de sync para identificar el comando y la gramática. No se hicieron pruebas, sync, build ni cambios de runtime.

## Contrato observable a adoptar

| Área | Comportamiento ya presente | Costura/evidencia |
|---|---|---|
| Emisión | Rechaza si no es repositorio, no hay `HEAD`, el cambio es inseguro/inexistente, `verify` no es `pass`, está stale o `apply` no es `complete`. No duplica el estado de tareas. | `assessReceiptPrecondition`, `emitCandidateReceipt`; tests «precondición». |
| Manifiesto | `paths` es obligatorio, explícito y de ficheros concretos. Acepta cambios trackeados, untracked, eliminaciones y renombres (en rename se declaran ruta antigua y nueva). Rechaza vacío, duplicado, directorio, pathspec mágico, absoluta, escape `..`, inexistente o fichero sin cambio. | `validateIntendedPaths`, `trackedChanges`, `suggestIntendedPaths`; tests «manifiesto» y «árbol». |
| Aislamiento | Parte de `HEAD` en un `GIT_INDEX_FILE` temporal bajo el git-dir; añade/elimina únicamente el manifiesto, escribe el árbol y elimina siempre el índice temporal. No muta índice ni worktree reales y preserva staging ajeno. | `buildCandidateTree`; tests «aislamiento». |
| Identidad/persistencia | El recibo v1 liga SHA-256 de repo (`git-common-dir`) y worktree (`git-dir`), cambio, `HEAD`, rama, tree SHA, paths ordenadas y su digest, digest del informe vigente, digest de comandos y fecha. Se publica localmente en `<git-dir>/ein/candidate-receipt.json` con temporal en el mismo directorio más `rename` atómico; no es contenido versionado. | `resolveWorktreeIdentity`, `digestPaths`, `receiptPath`, `emitCandidateReceipt`; tests emisión, atomicidad y otro repo/cambio. |
| Validación fail-closed | Ausencia, lectura/JSON/campos/versión inválidos, repo/worktree/cambio ajenos, digest de paths inconsistente, informe ausente o digest distinto, o precondición ya no válida rechazan evidencia. | `parseReceipt`, `validateCandidateReceipt`; tests «validación fail-closed» e «informe VIGENTE». |
| Vigencia y bytes | El informe actual debe conservar exactamente `reportSha256`; un apply posterior también invalida. `candidateTreeMatches` reconstruye con las paths del recibo y compara tree SHA, por lo que cambios posteriores en bytes declarados dan `false`. | `validateCandidateReceipt`, `candidateTreeMatches`; tests de verify posterior/apply posterior y coincidencia. |
| Tool | `ein_candidate_receipt` sin `change` activo responde error. Sin `paths` no emite y devuelve las listas separadas `tracked`/`untracked` para que el usuario elija; con paths llama a emisión, informa rechazo o expone árbol, HEAD/rama y hasta 12 paths. `commands` por defecto es `[]`. | `ein-pi/agent/extensions/ein-ai.ts:1268–1330`. |

## Límites que el delta debe decir o preservar

- El recibo identifica bytes verificadas; por sí solo **no bloquea** commit, push, PR ni otra entrega. El módulo y el tool declaran que ese gate corresponde a un slice posterior.
- No hay selección automática de «todo lo modificado»: las listas sin manifiesto son sugerencias, no una decisión.
- No existe una lane mecánica: la emisión requiere evidencia SDD actual y un manifiesto humano/explícito; no autoriza ni ejecuta entrega.
- La especificación debe fijar resultados observables, no detalles accidentales como PID, nombres aleatorios de temporal o texto literal de errores.

## Delta canónico y sincronización

**Destino único:** `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md`.

**Gramática exacta:**

```md
# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: <id-kebab-case>
title: <título>
requirement: The system MUST <contrato>
Given: <precondición>
When: <acción>
Then: <resultado observable>
```

Solo `## ADDED`; no `MODIFIED` ni `REMOVED`. El sync rechaza un `ADDED` cuyo ID ya exista. IDs canónicos ya ocupados: `canonical-close-readiness`, `canonical-context-budget`, `legacy-sdd-fallback`.

IDs candidatos sin colisión (confirmar en design y mantener una responsabilidad por escenario):

1. `candidate-receipt-emission-preconditions`
2. `candidate-receipt-explicit-path-manifest`
3. `candidate-receipt-isolated-candidate-tree`
4. `candidate-receipt-identity-and-atomic-publication`
5. `candidate-receipt-fail-closed-current-evidence`
6. `candidate-receipt-tree-divergence`
7. `candidate-receipt-tool-manifest-guidance`
8. `candidate-receipt-delivery-limit`

El mecanismo determinista es el tool `ein_openspec_sync` (invoca `synchronizeOpenSpecFilesystem`). Lee deltas bajo `openspec/changes/<change>/specs/<domain>/spec.md`, sincroniza el spec canónico de forma idempotente y publica `sync-report.md`. El reporte v1 incluye `change`, `state`, `delta_sha256`, `base_sha256`, `result_sha256`, dominios, recuento de operaciones y conflictos; para quedar sincronizado se valida identidad del cambio, digest del delta y digest de los bytes canónicos actuales. Un conflicto no altera el spec canónico.

## Verificación posterior focalizada (no ejecutada)

- `bun test tests/candidate-receipt.test.ts`
- `bun test tests/openspec-specs.test.ts`
- Ejecutar `ein_openspec_sync` para `candidate-receipt-spec-adoption`, conservar `sync-report.md`, y comprobar que el spec canónico incorpora únicamente los escenarios ADDED.
- Revisar `ein-pi/agent/extensions/ein-ai.ts` contra el escenario de tool: ausencia de paths guía sin emitir; paths válidas emiten; precondiciones inválidas rechazan.

## Blast radius

Cambios esperados solo en artefactos OpenSpec: nuevo delta, spec canónico tras sync y `sync-report.md`. Runtime, tool wiring, tests, delivery gate, Homebrew y releases están fuera de alcance. Riesgo principal: IDs ya existentes o delta no ADDED-only producirán conflicto/pending; riesgo semántico: convertir límites del slice (sin gate) en una garantía de entrega.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 124, estimated_tokens: 1900 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 47, estimated_tokens: 700 }
    - { path: "openspec/changes/candidate-receipt-spec-adoption/scope.md", lines: 96, estimated_tokens: 1600 }
    - { path: "codegraph explore: candidate receipt emission preconditions…", lines: 630, estimated_tokens: 2600 }
    - { path: "codegraph explore: candidate-receipt.ts emitCandidateReceipt…", lines: 243, estimated_tokens: 1500 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: 22, estimated_tokens: 350 }
    - { path: "ein-pi/agent/lib/candidate-receipt.ts", lines: 335, estimated_tokens: 5000 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 1467, estimated_tokens: 12500 }
    - { path: "tests/candidate-receipt.test.ts", lines: 367, estimated_tokens: 5600 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts:1228-1467", lines: 240, estimated_tokens: 2600 }
    - { path: "grep ein-pi sync/tool references", lines: 4, estimated_tokens: 100 }
    - { path: "ein-pi/agent/lib/openspec-spec-sync.ts", lines: 181, estimated_tokens: 3000 }
    - { path: "ein-pi/agent/lib/openspec-spec-sync-fs.ts", lines: 122, estimated_tokens: 1900 }
    - { path: "grep tests sync/delta grammar", lines: 68, estimated_tokens: 1100 }
  webfetch_used: false
  budget_consumed: { tokens: 40550, reads: 15 }

## Siguiente fase

`sdd-design`: convertir esta matriz en escenarios observables ADDED-only, usando los IDs propuestos o equivalentes no colisionantes, sin atribuir la implementación ad-hoc a este SDD.
