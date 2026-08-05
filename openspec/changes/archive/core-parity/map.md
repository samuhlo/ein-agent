status: partial
scope_status: bounded
change: core-parity
phase: map
budget_exceeded: true
budget_exceeded_reason: "The allocated max_reads (30) was reached; mapping stops here with the bounded surfaces already identified."

# Map — core-parity

## Resultado ejecutivo

La implementación tiene dos seams principales: `cc-ein/sync.ts` compila agentes y superficies de Claude, mientras `cc-ein/sdd-cli/cli.ts` expone el flujo SDD pero todavía no `sync`. El sincronizador determinista ya existe en `ein-pi/agent/lib/openspec-spec-sync-fs.ts` y se consume desde el tool Pi `ein_openspec_sync` en `ein-pi/agent/extensions/ein-ai.ts`.

El cambio debe conservar la separación Pi/Claude: `ein-pi/core/AGENTS.md` y `ein-pi/core/agents/*.md` son las entradas canónicas; `cc-ein/CLAUDE.md`, los agentes desplegados y el CLI son superficies adaptadas/generadas. No se ejecutaron tests, build ni typecheck en esta fase.

## Scope y límites

- SCOPE PACKET: `openspec/changes/core-parity/scope.md`; ejecución `interactive`; `strict_tdd: true`.
- Delta único de comportamiento: `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md`, seis escenarios ADDED; el delta ya generado no se modifica.
- Incluye generación/adaptación de Claude, validación fail-closed de tools/tokens/routing, CLI `sync`, parity tests deterministas y tracking de `EIN.md`/`docs/roadmap-beta.md`.
- Excluye `installer/`, release/Docker/E2E, fusión de runtimes, refactor no relacionado, sincronización implícita desde status/close/guard, y reescritura amplia de documentación.

## Superficies existentes

### 1. Compilador core → Claude

| Superficie | Símbolos/seams actuales | Papel y estado |
|---|---|---|
| `cc-ein/sync.ts` | `translateTools` (30), `CC_NOTE` (47), `translateBody` (55), `AGENT_MODELS` (70), `translateAgent` (88), `SyncResult` (117), `runSync` (132) | Compilador actual. Lee `ein-pi/core/agents`, transforma frontmatter y cuerpos y escribe en `DEST` (`CC_EIN_HOME` o `~/.claude-ein`). |
| `cc-ein/sync.ts:154-156` | `readFileSync(join(CC, "CLAUDE.md"))` + `write(join(DEST, "CLAUDE.md"))` | Copia el coordinador Claude tal cual; hoy no hay proveniencia ni generación desde `ein-pi/core/AGENTS.md`. |
| `cc-ein/sync.ts:176-178` | `readdirSync(join(CORE, "agents"))`, `readFileSync`, `translateAgent` | Recorre todos los `.md` canónicos sin ordenar explícitamente el resultado. |
| `cc-ein/sync.ts:161-171` | lectura de `cc-ein/settings.json`; hook `PreToolUse` | Produce settings Claude y fija ruta absoluta a `DEST/bin/cc-ein-sdd`. |
| `cc-ein/sync.ts:207` | `execFileSync("bun", ["build", "--compile", ...sdd-cli/cli.ts])` | Compila el CLI standalone durante sync. |
| `cc-ein/CLAUDE.md` | documento completo, 103 líneas observadas; `<!-- ein:harness-discipline:start/end -->` en 83/101 | Documento actualmente autoritativo de facto para el coordinador Claude. El bloque de hardening debe seguir siendo localizable/preservable; el archivo debe pasar a output generado, no a fuente independiente. |
| `ein-pi/core/AGENTS.md` | `## Core Rules`, `## Linear`, `## GitHub`, `## Delivery Gate`, `## Pi Notes`, `## Output` | Guía canónica compartida de 46 líneas según el roadmap. Contiene diferencias legítimas de runtime y política; no es un reemplazo literal de toda la adaptación Claude. |

#### Traducción actual

`translateTools` permite:

- `read → Read`, `grep → Grep`, `find → Glob`, `edit → Edit`, `write → Write`, `bash → Bash`.
- `linear_* → mcp__linear__<nombre>`.
- Cualquier otro token cae en `else out.push(raw)`: el nombre desconocido llega literalmente a Claude.

`translateAgent` extrae solo `name`, `description` y `tools`, añade el routing de `AGENT_MODELS`, descarta campos Pi (`budget`, `turnBudget`, `completionGuard`, `extensions`, `defaultContext`, `inheritSkills`, `timeoutMs`, `toolBudget`, etc.), antepone `CC_NOTE` y aplica `translateBody`. Si el texto no tiene frontmatter, devuelve el source sin adaptar.

`translateBody` solo sustituye `ein_sdd_status`, `ein_sdd_check`, `ein_sdd_close`, las dos formas de `ein_review_forecast`; no valida que queden tokens `ein_*` ni conceptos Pi no traducidos. `CC_NOTE` enumera manualmente `intercom`, asks al supervisor, `acceptance-report`, `pi-subagents`, `.pi/ein/*`, `completionGuard` y `turnBudget` como inertes.

#### Inventario canónico y routing actual

Los diez archivos bajo `ein-pi/core/agents/` son:

| Archivo/agente | `tools:` canónicas observadas |
|---|---|
| `sdd-scope.md` | `read, grep, find, write, bash` |
| `sdd-map.md` | `read, grep, find, write, bash` |
| `sdd-design.md` | `read, grep, find, write, edit` |
| `sdd-tasks.md` | `read, grep, find, write, edit` |
| `sdd-apply.md` | `read, grep, find, edit, write, bash` |
| `sdd-verify.md` | `read, grep, find, bash, write, edit` |
| `sdd-close.md` | `read, grep, find, write` |
| `ein-scout.md` | `read, grep, find` |
| `ein-git.md` | `read, write, edit, bash` |
| `ein-linear.md` | herramientas `linear_*` enumeradas en frontmatter |

`AGENT_MODELS` contiene hoy esas mismas diez identidades: siete fases SDD (`haiku/low`, `haiku/medium`, `opus/high`, `haiku/low`, `sonnet/low`, `haiku/medium`, `haiku/low`) y `ein-scout`, `ein-git`, `ein-linear` en `haiku`. El problema de paridad es que la tabla está hardcoded y no existe una comprobación de conjunto canónico ↔ routing: falta de routing y entradas obsoletas no se detectan.

Los cuerpos de agentes ya contienen referencias Pi/runtime que afectan la traducción: `ein_sdd_*`, `ein_openspec_delta_write`, `intercom`, `completionGuard`, `acceptance-report`, `pi-subagents`, `.pi/ein/*`, además de los campos de frontmatter que `translateAgent` descarta. `tests/agent-frontmatter-json.test.ts` y `tests/agent-tools-contract.test.ts` son precedentes directos para inspección estática y diagnósticos con archivo/agente identificado.

### 2. Claude SDD CLI

`cc-ein/sdd-cli/cli.ts` importa:

- `resolveSddStatus`, `resolveSddPlanPreview`, `formatSddPlanPreview`, `sddStatusBlockers`, `formatBudget`, `listActiveChanges` desde `ein-pi/agent/lib/sdd-router.ts`.
- `lintChange`/`ChangeLintReport` desde `ein-pi/agent/lib/sdd-guardrails.ts`.
- `closeChange` desde `ein-pi/agent/lib/sdd-close.ts`.
- allowlist/denylist desde `ein-pi/agent/lib/guardrails.ts`.
- baseline Git y filesystem (`git-baseline.ts`, `node:child_process`, `node:fs`, `node:path`).

Símbolos y líneas de entrada observadas:

- `formatStatus` 40 y `formatCheck` 76: formatean status/check.
- `resolveGuardDecision` 135 y `guardCmd` (stdin): decisión deny/ask/allow del hook.
- `buildStatusOutput` 204 → `bootstrapRepoIfNeeded` 189 → `resolveSddStatus`/baseline.
- `statusCmd` 228, `checkCmd` 232, `closeCmd` 243.
- Dispatch `if (import.meta.main)` y `switch (cmd)` en 264.

El dispatch actual solo acepta `status`, `check`, `close` y `guard`; el help también enumera solo esos comandos. No importa `synchronizeOpenSpecFilesystem`. `status`, `check`, `close` no deben cambiar su conducta ni comenzar a sincronizar implícitamente.

### 3. Sincronizador OpenSpec compartido

`ein-pi/agent/lib/openspec-spec-sync-fs.ts` es el seam reusable:

- `readIfPresent` 10, `deltaInputs` 17: lee `openspec/changes/<change>/specs/*/spec.md` en orden de dominio.
- `replaceWithTemporary` 33 y `restore` 44: escritura atómica temporal y rollback.
- `FilesystemSyncResult` 49 y `SyncFsSeam` 57: resultado y costura de tests.
- `synchronizeOpenSpecFilesystem` 62: valida `isSafeChangeName`, exige que exista el cambio, carga deltas y bases en `openspec/specs/<domain>/spec.md`, usa `digestManifest` para idempotencia y delega el plan a `planOpenSpecSync`.
- Resultado `conflict`: publica `sync-report.md` y no sustituye bytes canónicos.
- Resultado no conflictivo: serializa cada dominio canónico y publica el report al final.
- Error operativo durante sustituciones: restaura snapshots previos y adjunta rutas no restauradas si el rollback también falla.

Dependencias internas del filesystem sync: `sdd-router` (`isSafeChangeName`), `openspec-spec-sync` (`parseSyncReport`, `planOpenSpecSync`, `serializeSyncReport`, `OpenSpecSyncPlan`, `SyncBaseInput`, `SyncDeltaInput`) y `openspec-spec-contract` (`digestManifest`, `serializeOpenSpec`).

El motor de planificación (`ein-pi/agent/lib/openspec-spec-sync.ts`) expone `planOpenSpecSync` (48), `serializeSyncReport` (109), `evaluateOpenSpecState` (136), `parseSyncReport` (177) y los tipos `OpenSpecSyncPlan`, `SyncDeltaInput`, `SyncBaseInput`. Es la fuente de estados `synchronized`, `conflict`, `pending`/`unresolved` que lee el router.

#### Caller actual y call path

Pi ya registra `ein_openspec_sync` en `ein-pi/agent/extensions/ein-ai.ts:1244-1280`; importa el filesystem sync en la línea 111. Su ruta es:

`ein_openspec_sync` → cambio explícito o `resolveSddStatus(ctx.cwd).change` → `synchronizeOpenSpecFilesystem` → `deltaInputs`/bases → `planOpenSpecSync` → serialización/escrituras/report/rollback → respuesta con `details.ok`, `state`, `changed`, `domains`.

El conflicto devuelve `ok: false`; errores de nombre inexistente, cambio inexistente, parseo o filesystem se devuelven como `FALLÓ` con `reason`. Este comportamiento es el precedente de contrato que el CLI Claude debe exponer, sin bridge script ni segundo algoritmo.

La ruta de cierre Pi (`closeChange`, caller `ein-ai.ts:1163`/`handleSddClose:1177`) consulta el estado OpenSpec por el router y no sincroniza. Los tests existentes confirman que pending/conflict bloquean close incluso con `--force`.

### 4. Tests existentes y precedentes

| Archivo | Superficie reutilizable/alcance actual |
|---|---|
| `tests/i18n-parity.test.ts` | Precedente solicitado: `readFileSync` de fuente, extracción de bloques, invariantes de conjunto, duplicados y determinismo sin importar dependencias externas. |
| `tests/agent-frontmatter-json.test.ts` | Reimplementa los parsers de frontmatter de pi-subagents, recorre cada agente canónico y verifica campos JSON/lista. |
| `tests/agent-tools-contract.test.ts` | Deriva inventario, builtin Pi (`pi-contract.ts`), tools de extensiones y compara tabla del orchestrator; diagnostica archivo/tool. |
| `tests/openspec-specs.test.ts` | Cubre parser/serializer, `planOpenSpecSync`, conflicto sin pisar bytes, éxito, idempotencia, `evaluateOpenSpecState`, rollback multidominio, nombres inseguros y reportes. |
| `tests/sdd-close.test.ts` | Integra sync fs con close; cubre pending/conflict, rollback/readiness y que close no puede saltar incoherencias. |
| `tests/harness-discipline.test.ts` | Precedente de tests CLI sin subproceso: importa `resolveGuardDecision`/`buildStatusOutput`, usa fixtures temporales y preserva el contrato de dispatch indirecto. |

La nueva parity suite debe ser fixture-based y Bun-native; no requiere Claude account ni API. Debe cubrir provenance/generación de `CLAUDE.md`, límite `harness-discipline`, mappings válidos, unknown tool, token/runtime no traducido, routing missing/stale, bytes repetibles/idempotencia y `cc-ein-sdd sync` success/conflict/malformed/operational failure.

### 5. Tracking/configuración

- `EIN.md`: archivo raíz existente, con zona curada intacta y zona AUTO gestionada. `ein-pi/agent/lib/project-context.ts` define `einMdPath`, `readEinMd`, `writeEinMd` y `syncEinMdIndex`; el tracking de este cambio no debe confundirse con rellenar los placeholders.
- `docs/roadmap-beta.md`: sección `01. core-parity` describe el problema, seams y límites; sección `02. installer-beta` permanece fuera. Solo debe recibir estado/evidencia de core-parity cuando esas fases la produzcan.
- `openspec/config.yaml`: `strict_tdd: true`; comandos de test están vacíos/stale aunque el repo usa Bun. El typecheck configurado es `cd installer && bun run typecheck`, fuera del comportamiento de este slice.
- `bunfig.toml`: `[test] preload = ["./tests/preload-env.ts"]`; los tests deben ejecutarse desde la raíz con `bun test`.
- `cc-ein/settings.json`: settings Claude actuales (`model: opus`, `effortLevel: high`, allow git status/diff/log, deny destructivos); `sync.ts` añade el hook PreToolUse al output desplegado.
- `openspec/specs/sdd-lifecycle/spec.md`: destino canónico de la sincronización del delta; el delta activo es `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md`.

## Call paths y dependencias

### Sync core actual

`bun cc-ein/sync.ts` → `import.meta.main` → `runSync` → credenciales/symlink → copia literal `cc-ein/CLAUDE.md` → genera settings/hook → `readdirSync(ein-pi/core/agents)` → `translateAgent` → `translateTools`/`translateBody`/`AGENT_MODELS` → `DEST/agents/*` → copia skills → compila `cc-ein/sdd-cli/cli.ts` → MCP Context7/Engram best-effort.

`SyncResult.ok` solo refleja `requiredFailures` de la operación general. Las fallas opcionales de MCP quedan en `optionalWarnings`. Hoy los fallos de traducción unknown/untranslated/routing no entran en `requiredFailures` porque no hay validación.

### CLI sync esperado por el delta

El seam bounded es:

`cc-ein-sdd sync <existing-change>` → dispatch explícito → `synchronizeOpenSpecFilesystem(cwd, change)` → `planOpenSpecSync`/serialización → output y exit status deterministas.

El map no fija una solución ni nuevos códigos; el design debe concretar el contrato exacto de salida/exit para synchronized, conflict, malformed y operational failure. El call path no puede pasar por `ein-ai.ts`, bridge script ni algoritmo paralelo.

### No-implicit-sync invariant

`statusCmd` → `buildStatusOutput` → `resolveSddStatus`; `checkCmd` → `lintChange`; `closeCmd` → `closeChange` → router/OpenSpec state. Ninguna de estas rutas debe invocar el filesystem synchronizer como efecto lateral.

## Blast radius

1. **Generación desplegada:** cambios en source/adaptation alteran `~/.claude-ein/CLAUDE.md`, los diez agentes bajo `~/.claude-ein/agents`, `settings.json` y el binario CLI; una validación fallida no debe escribir/aceptar un resultado parcial como parity exitosa.
2. **Frontmatter:** `translateTools` afecta cada agente; un tool canónico nuevo, typo o mapping ausente alcanza frontmatter Claude salvo validación fail-closed. `AGENT_MODELS` afecta `model`/`effort` de los diez agentes y debe detectar ambos sentidos del drift.
3. **Coordinator:** `cc-ein/CLAUDE.md` es consumido por el coordinador Claude y conserva el bloque `ein:harness-discipline`; no se debe hacer que Pi y Claude compartan un documento sin frontera de adaptación.
4. **CLI/lifecycle:** añadir solo el comando explícito `sync` toca help/dispatch y su output/exit; `status`, `check`, `close`, `guard`, `resolveGuardDecision` y `buildStatusOutput` quedan como regresión protegida.
5. **OpenSpec:** el sync válido escribe `openspec/specs/<domain>/spec.md` y `openspec/changes/<change>/sync-report.md`; conflictos no pisan canonical bytes y errores operativos ejercitan rollback.
6. **Tracking:** solo `EIN.md` y la evidencia acotada en `docs/roadmap-beta.md`; no incluir `installer/` aunque el typecheck sea un comando configurado.

## Verificación necesaria para apply/verify

No ejecutar en map. En apply, strict TDD debe seguir RED → GREEN → TRIANGULATE → REFACTOR y registrar evidencia en `apply-progress.md`.

1. **Focused parity tests (nuevo fixture test):** `bun test tests/core-parity.test.ts` (nombre de archivo a confirmar en design/tasks), con `bunfig.toml` y `tests/preload-env.ts` activos.
2. **Regresiones de seams:** `bun test tests/agent-frontmatter-json.test.ts tests/agent-tools-contract.test.ts tests/openspec-specs.test.ts tests/sdd-close.test.ts tests/harness-discipline.test.ts`.
3. **Suite raíz:** `bun test`.
4. **Sync determinista:** ejecutar `bun cc-ein/sync.ts --dry` y, con un `CC_EIN_HOME` temporal, dos sincronizaciones válidas; comparar output generado y comprobar que la segunda no cambia bytes. La prueba debe incluir una fuente modificada y una fixture desconocida/mal traducida que falle sin reclamar éxito.
5. **CLI:** ejecutar `bun cc-ein/sdd-cli/cli.ts sync <change>` o el binario compilado equivalente sobre fixtures de change existente: synchronized, segundo run idempotente, conflict sin overwrite, malformed y operational failure; comprobar stdout/stderr y exit code definidos en design. También comprobar status/check/close sin sync implícito.
6. **Compilación del CLI:** el mismo camino de `sync.ts` usa `bun build --compile cc-ein/sdd-cli/cli.ts --outfile <tmp>/cc-ein-sdd`; debe seguir compilando.
7. **Typecheck opcional/regresión:** solo si la implementación modifica payloads/types compartidos, `cd installer && bun run typecheck`; no es trabajo installer-beta.
8. **Tracking diff:** inspeccionar que `EIN.md` conserva contenido curado y que `docs/roadmap-beta.md` solo registra estado/evidencia de core-parity.

## Riesgos y preguntas para design

- Definir la forma mínima de fuente común + bloque de adaptación sin duplicar el brain ni fusionar runtimes.
- Reemplazar la permisividad de `CC_NOTE`/`translateBody` por validación explícita sin falsos positivos en prosa ordinaria.
- Elegir la fuente autoritativa del inventario y del routing de modelos para que missing/stale sean ambos observables.
- Precisar códigos/exit y texto de `sync` para conflict frente a malformed/operational; el sync fs ya distingue resultado de conflicto y excepción operativa.
- Mantener atomicidad: validación de parity debe ocurrir antes de presentar una superficie generada como correcta y el filesystem sync conserva su rollback actual.
- `EIN.md` está descrito por el scope como actualmente no trackeado; verificar en apply/verify sin reemplazar su contenido.

## No implementado en esta fase

No se escribió source, test, config de runtime, delta OpenSpec, `apply-progress.md`, `verify-report.md` ni `summary.md`. No se ejecutaron `bun test`, build, sync real ni typecheck.

next_recommended: sdd-design

ledger:
  reads:
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 900 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/work-unit-commits/SKILL.md", lines: 82, estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/architecture/SKILL.md", lines: 88, estimated_tokens: 1100 }
    - { path: "/home/samuhlo/.pi-ein/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 61, estimated_tokens: 650 }
    - { path: "openspec/changes/core-parity/scope.md", lines: 200, estimated_tokens: 2200 }
    - { path: "openspec/changes/core-parity/specs/sdd-lifecycle/spec.md", lines: 48, estimated_tokens: 550 }
    - { path: "EIN.md", lines: 36, estimated_tokens: 450 }
    - { path: "docs/roadmap-beta.md", lines: 124, estimated_tokens: 1500 }
    - { path: "<repository-tree via find>", lines: 1000, estimated_tokens: 300 }
    - { path: "<codegraph status/explore: indexed source inventory>", lines: 300, estimated_tokens: 1700 }
    - { path: "cc-ein/sync.ts", lines: 260, estimated_tokens: 2300 }
    - { path: "cc-ein/sdd-cli/cli.ts", lines: 276, estimated_tokens: 2300 }
    - { path: "ein-pi/agent/lib/openspec-spec-sync-fs.ts", lines: 125, estimated_tokens: 1150 }
    - { path: "ein-pi/core/AGENTS.md", lines: 46, estimated_tokens: 700 }
    - { path: "cc-ein/CLAUDE.md", lines: 103, estimated_tokens: 1250 }
    - { path: "tests/i18n-parity.test.ts", lines: 58, estimated_tokens: 650 }
    - { path: "openspec/config.yaml", lines: 49, estimated_tokens: 650 }
    - { path: "bunfig.toml", lines: 5, estimated_tokens: 120 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts#1240-1280", lines: 41, estimated_tokens: 600 }
    - { path: "tests/openspec-specs.test.ts", lines: 430, estimated_tokens: 5000 }
    - { path: "tests/sdd-close.test.ts", lines: 430, estimated_tokens: 4700 }
    - { path: "tests/agent-frontmatter-json.test.ts", lines: 150, estimated_tokens: 1800 }
    - { path: "tests/agent-tools-contract.test.ts", lines: 160, estimated_tokens: 2000 }
    - { path: "tests/harness-discipline.test.ts#1-240", lines: 240, estimated_tokens: 2700 }
    - { path: "ein-pi/agent/lib/openspec-spec-sync.ts#symbols/grep", lines: 190, estimated_tokens: 900 }
    - { path: "ein-pi/core/agents/*.md#frontmatter/token-grep", lines: 30, estimated_tokens: 650 }
    - { path: "cc-ein/settings.json", lines: 19, estimated_tokens: 220 }
    - { path: "codegraph callers: resolveSddStatus/closeChange", lines: 20, estimated_tokens: 250 }
    - { path: "relevant grep queries: sync/CLI/syncfs/ein-ai/tests", lines: 220, estimated_tokens: 1700 }
    - { path: "<parallel read/query operations stopped at allocated cap>", lines: 0, estimated_tokens: 0 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 18000, reads: 30 }
