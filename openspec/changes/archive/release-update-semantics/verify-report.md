# Verify report — release-update-semantics

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Executive summary

La implementación cumple el contrato observable del diseño y satisface los requisitos MUST de R1–R12. La batería enfocada de Bun (66 tests, 291 assertions, 10 archivos) pasa en verde; `cd installer && bun run typecheck` está limpio; `git diff --check` no reporta errores; `git diff --cached --quiet` confirma cero archivos staged. Los archivos untracked previos a la fase apply (`EIN.md`, `openspec/` con `release-experience-roadmap` y `zero-friction-sdd-start`, `tests/sdd-config-bootstrap.test.ts`) se preservan intactos. La desviación respecto al modelo de transiciones del diseño (ownership package-manager se decide después de `acquireRelease`) no es una falla de correctness — no muta estado, satisface R10 ("fail before mutation"), y está declarada explícitamente como limitación aceptada en `handoff.md` ("Adquisición antes de coherencia"). Las otras MUST del diseño se cumplen o se prueban con cobertura observable directa.

## Acceptance-criteria coverage (alcance R1–R12)

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Selector: `latest` y versiones explícitas se normalizan a `installer-vX.Y.Z`, sin fallback a `latest` | cubierto | `tests/release-update-contract.test.ts`: "normalizes no selector, latest, and equivalent stable spellings", "rejects malformed selectors without a latest fallback", "requires an explicit selector to match its exact release tag" |
| Selector inválido / draft / prerelease / unpublished falla antes de mutación | cubierto | `release-resolver.ts:23-37` (`normalizeTag`), `tests/release-update-contract.test.ts:31-37`, `tests/release-update-acquisition.test.ts:keeps latest and explicit endpoints distinct and rejects unavailable or ineligible records` |
| Plataforma: `darwin`/`linux` × `arm64`/`x64`, WSL → linux-x64, asset único por release | cubierto | `installer/src/core/asset-selector.ts:25-49`, `tests/release-update-acquisition.test.ts:selects all published platform names deterministically, including WSL`, `tests/release-asset-contract.test.ts:selectAsset accepts only the documented platform names` |
| Checksum estricto: SHA-256 GNU `<sha256>  <asset>`, rechaza `*` BSD, duplicados, malformed, miss | cubierto | `installer/src/core/checksum.ts:11-29`, `tests/release-update-acquisition.test.ts:parses checksums strictly`, `tests/release-asset-contract.test.ts:parses the GNU sha256sum line shape`, `rejects BSD-style binary marker`, `rejects duplicate entries, malformed hashes, and unrelated targets` |
| HTTPS-only + redirects acotados + hosts confiables + sin forward de credenciales | cubierto | `installer/src/core/update-caps.ts:25-126` (`isTrustedReleaseUrl`, `MAX_REDIRECTS=5`, `MAX_RESPONSE_BYTES=64MiB`, `REQUEST_TIMEOUT_MS=15_000`, manual redirect handling). `acquisition.ts:51-58` rechaza redirect off-host. `tests/release-update-acquisition.test.ts:rejects an injected redirect response that leaves trusted GitHub hosts`. `tests/release-update-cli.test.ts:returns a staged acquisition failure without mutation` filtra `secret-token-ignored` en `result.ts:safeMessage`. |
| Probe del binario staged: `binaryVersion` y `templateVersion` deben coincidir con la release seleccionada | cubierto | `installer/src/core/binary-probe.ts:23-37`, `tests/release-update-exec.test.ts:probes both identities and rejects a selected-release mismatch before commit`, `tests/release-update-integration.test.ts:identity mismatch between staged bytes and selected release fails before any replacement` |
| Bytes staged en directorio destino (mismo filesystem, `EXDEV` falla cerrada) | cubierto | `installer/src/core/executable.ts:42-60` (inspect kind/dev/uid/mode), `tests/release-update-exec.test.ts:stages beside a regular owned destination`, `rejects a symlink destination without changing its target`, `rejects a candidate on another filesystem and cleans it` |
| `already-current` exige coherencia de marker, binary probe, deployed manifest, asset digest | cubierto | `installer/src/core/transaction.ts:currentIsCoherent`, `tests/release-update-cli.test.ts:reports already-current only after marker, binary, template, and digest agree`, `tests/release-update-integration.test.ts:already-current returns without mutating when marker, binary, template and digest already agree` |
| Transaction: prepared → binary-replaced → child-reexecuted → template-deployed → marker-committed → validated → complete | cubierto | `installer/src/core/transaction.ts:createTransaction` (state machine, journal persistido antes de cada transición irreversible, rollback en orden inverso, rollback failed retiene journal). `tests/release-update-transaction.test.ts:persists intent before each boundary and rolls committed steps back in reverse order`, `cleans managed paths before restoring the snapshot`, `migrates a legacy marker only after executable and deployed template coherence`, `fails closed when atomic marker read-back cannot prove the committed identity`, `cleans a committed journal and only completes after validation` |
| Re-execución: solo el binario verificado se ejecuta, el proceso activo nunca se reemplaza | cubierto | `installer/src/core/child-continuation.ts:spawnContinuation`, `tests/release-update-exec.test.ts:spawns only the candidate in private continuation mode`, `rolls back a failed continuation without replacing the active test executable`. Tests verifican `process.execPath`/`process.argv0` antes/después. |
| Template deployment desde el binario verificado, rollback clean-before-restore, user state intacto | cubierto | `installer/src/core/template-transaction.ts:snapshotTemplate`, `deployEmbeddedTemplate`, `restoreTemplate`, `validateDeployedManifest`. `tests/release-update-transaction.test.ts:cleans managed paths before restoring the snapshot and preserves user state` (auth.json, sessions, downloaded skills sobreviven) |
| Marker commit atómico + read-back; nunca lead sobre deployed state | cubierto | `installer/src/core/marker-v2.ts:commitMarkerV2` (sibling temp + rename + read-back JSON equality). `tests/release-update-transaction.test.ts:fails closed when atomic marker read-back cannot prove the committed identity`. Marker rollback (`transaction.ts:marker-committed` rollback) restaura el `markerBackup` previo o elimina el marker si no existía. |
| Banner muestra `marker.version` de marker committed; `recovery required` si journal pendiente; `legacy v<ver> (unverified)` o `unverified` sin marker | cubierto | `installer/src/tui/banner.ts:bannerVersionLabel`, `readBannerState`. `tests/release-update-cli.test.ts:renders committed, recovery-required, and unverified banner labels`. `banner.ts:65` ya no usa `INSTALLER_VERSION` para el label de estado instalado. |
| Ownership metadata-based (no path guessing); package-manager bloquea antes de mutar binario | cubierto | `installer/src/core/release-types.ts:classifyOwnership`, `marker-v2.ts:isOwner`. `tests/release-update-contract.test.ts:classifies ownership from metadata instead of install paths`. `tests/release-update-cli.test.ts:blocks an externally managed installation before binary replacement` (no muta binary, dice manager). `tests/release-update-integration.test.ts:external-owner installation blocks the transaction and leaves binary, template and marker untouched`. |
| Resultados: `updated`/`already-current`/`dry-run` exit 0, `blocked-external-owner` exit 2, `failed` exit 1 | cubierto | `installer/src/cli/result.ts:5-9`. `tests/release-update-cli.test.ts:formats every outcome with stable exit codes` (5 casos, líneas + exit code). |
| Dry-run sin mutación, usa misma lógica de selector/resolver/ownership | cubierto | `installer/src/core/transaction.ts:runUpdateTransaction` (rama `dryRun` antes de acquisition + misma `resolveForDryRun`). `tests/release-update-cli.test.ts:dry-run resolves the requested release without acquiring or mutating`, `tests/release-update-integration.test.ts:dry-run returns without mutating any artifact even when release and binary already agree` |
| Versión explícita no sustituida por `latest` | cubierto | `release-resolver.ts:resolveRecord` (`exact-tag-mismatch` → error). `tests/release-update-contract.test.ts:requires an explicit selector to match its exact release tag`. `tests/release-update-integration.test.ts:explicit selector resolves to the same release identity as latest and reaches agreement` |
| Network/HTTP/timeout/truncación/missing-asset/missing-checksum/mismatch fallan antes de mutación | cubierto | `acquisition.ts:51-79` (`unsafe-redirect`, `asset-http`, `checksums-http`, `missing-checksums`, `network`). `tests/release-update-acquisition.test.ts:cleans temporary staging after missing integrity metadata, mismatch, and network failure` (3 fixtures), `tests/release-update-integration.test.ts:acquisition failure with missing checksums preserves prior identity`, `checksum mismatch preserves prior identity across binary, template and marker` |
| Failure en executable replacement / child / template / marker / read-back → rollback, sin éxito reportado | cubierto | Cada transición tiene `rollback` registrado antes de la action. `tests/release-update-transaction.test.ts:persists intent before each boundary and rolls committed steps back in reverse order` y `retains the journal when rollback fails and refuses a second ambiguous update`. `tests/release-update-integration.test.ts:transaction failure during child continuation rolls back and preserves prior identity` |
| Interrupción / señales durante transacción → rollback o `recovery-required` en próximo invocación | cubierto | `installer/src/core/transaction.ts:installSignalHandlers`, `recoverPendingTransaction`. `tests/release-update-transaction.test.ts:scoped signal handlers clean a prepared transaction before mutation`, `scoped signal handlers roll back after mutation and are removed on cleanup`. `tests/release-update-integration.test.ts:interruption during a prepared transaction is detected as recovery-required on the next invocation`, `pending journal present at start blocks any new update attempt with recovery-required` |
| Sin forward de credenciales en salida | cubierto | `installer/src/cli/result.ts:safeMessage` redacta `token|authorization|bearer|password|secret`. `tests/release-update-cli.test.ts:returns a staged acquisition failure without mutation` (`secret-token-ignored` debe NO aparecer en output). |
| Asset names / checksum shape coinciden con workflow + build script (sin debilitar parser) | cubierto | `tests/release-asset-contract.test.ts` (lee `.github/workflows/installer-release.yml` + `installer/scripts/build-all.ts` como texto y verifica `ein-installer-{darwin,linux}-{arm64,x64}`, `sha256sum ein-installer-*`, `bunTarget:"bun-{darwin,linux}-{arm64|x64}"`). `parseChecksums` rechaza BSD `*`. |

## Spec and task coverage

- Diseño §B (R1–R12): todos los MUST cubiertos. Las desviaciones se limitan a la rama package-manager (decidida tras adquisición) y al orden acquire-vs-coherence para `already-current`, ambos documentados en `handoff.md` como limitaciones aceptadas que no rompen la invariante R10.
- Diseño §C (transiciones, límites de responsabilidad, work units): la state machine se implementa en `installer/src/core/transaction.ts:createTransaction`; los work units `// 001`–`// 005` aterrizan en archivos separados; `// 006` añade 0 production lines y 314 test lines (cumulative 2,047 production lines confirmado por `apply-progress.md`).
- Diseño §D (success criteria observable): `tests/release-update-integration.test.ts:verifyAgreement` confirma selector = resolved = asset digest = installed binary = deployed template manifest = marker = banner version en los escenarios `latest.successAgreement`, `explicit.successAgreement`, `markerMismatch → successAgreement`, `alreadyCurrent.successAgreement`.
- Tasks 1.1–6.4: 26 tareas, todas marcadas `[x]` en `tasks.md`; ledger en `apply-progress.md` consistente con `wc -l` actual.
- `openspec/config.yaml`: `strict_tdd: false`; no aplica gate estricto (no se exige tabla TDD Cycle Evidence). El cambio usa implementación + regression tests enfocados.

## Commands and outcomes

- `timeout 300 bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-exec.test.ts tests/release-update-transaction.test.ts tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/release-asset-contract.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts` — **PASS**: 66 tests, 0 failures, 291 expect() calls, 974 ms. Distribución: release-update-contract 6, release-update-acquisition 6, release-update-exec 6, release-update-transaction 8, release-update-cli 8, release-update-integration 12, release-asset-contract 6, installer-backup 8, deploy-clean-managed 3, deploy-settings 3.
- `cd installer && timeout 180 bun run typecheck` — **PASS**: `tsc --noEmit` sin errores.
- `git diff --check` — **PASS** (exit 0, sin whitespace errors en tracked changes).
- `git diff --cached --name-only` — **PASS** (exit 0, vacío, sin archivos staged).
- `wc -l installer/src/core/release-*.ts installer/src/core/update-caps.ts installer/src/core/asset-selector.ts installer/src/core/checksum.ts installer/src/core/acquisition.ts installer/src/core/executable.ts installer/src/core/binary-probe.ts installer/src/core/child-continuation.ts installer/src/core/transaction.ts installer/src/core/template-transaction.ts installer/src/core/marker-v2.ts installer/src/cli/result.ts installer/src/cli/update.ts installer/src/tui/banner.ts` — production tally 1,641 (untracked new) + tracked modifications 121/132 ins/del en `update.ts` y 48/21 en `banner.ts`. Total bruto ~1,963 líneas production; budget 400 líneas → overrun ~1,563 líneas (consistente con `apply-progress.md`: 2,047 production lines acumuladas, 1,647 sobre budget).
- `wc -l tests/release-*.test.ts` — 1,518 líneas test nuevas (7 archivos); suites legacy verdes (`installer-backup` 165, `deploy-clean-managed` 65, `deploy-settings` 79 = 309 preservadas).
- `git status --porcelain` pre/post — archivos untracked previos preservados: `EIN.md`, `openspec/`, `tests/sdd-config-bootstrap.test.ts` (todos sin cambios en esta fase).

## Design-conformance review

### Q1. ¿Ownership externo se chequea antes de la adquisición de red?

`runUpdateTransaction` (`installer/src/core/transaction.ts`) clasifica ownership al inicio (`readMarkerV2` + `classifyOwnership`) y falla **antes** de red si es `ownership-ambiguous` (línea ~258: `if (owner.type === "ownership-ambiguous") return failure(...)`). Para `package-manager`, sin embargo, la decisión se toma **después** de `acquireRelease` (líneas ~265-271). No es correctness failure — la rama `package-manager` no muta binario, template ni marker, satisface R10 ("fail before mutation"). Es una **efficiency gap**: desperdicia bytes de red y tiempo de checksum para bloquear inmediatamente después. El `handoff.md` lo documenta explícitamente como limitación aceptada ("Adquisición antes de coherencia"), y los tests cubren el comportamiento end-to-end con `tests/release-update-cli.test.ts:blocks an externally managed installation before binary replacement`. Comparado con la transición modelo del diseño (`idle → ownership-classified → resolving → ...`), el contrato observable cumple; el orden interno de decisión es subóptimo pero no se contradice ningún MUST.

### Q2. ¿`already-current` evita adquisición innecesaria, o solo mutación posterior?

El path acquires-then-checks. La transacción actual:
1. `acquireRelease(...)` (descarga bytes, parsea `checksums.txt`, verifica SHA-256)
2. THEN: `if (marker && schemaVersion === 2 && await currentIsCoherent(...)) return already-current`

Para una instalación ya al día, esto descarga y verifica el binario entero para concluir que no hace falta reemplazar. Es una **efficiency gap**, no correctness failure: no muta estado, reporta `EXIT_ALREADY_CURRENT=0`, `lines: ["Ya esta actualizado."]`. Documentado en `handoff.md` ("Adquisición antes de coerencia … un punto de eficiencia conocido, no un fallo de seguridad"). Cubierto por `tests/release-update-integration.test.ts:already-current returns without mutating when marker, binary, template and digest already agree` (con comentario `// [NOTE]` que documenta la limitación). Veredicto: **accepted limitation** por diseño y por handoff; no es regresión.

### Q3. ¿Selector = resolved release = asset = probed executable = deployed template = committed marker = banner en éxito?

**Sí.** El helper `verifyAgreement` en `tests/release-update-integration.test.ts:124-138` lee marker + manifest + bytes de destination y compara contra `TARGET_VERSION = "0.20.0"` / `TARGET_TAG = "installer-v0.20.0"` / `assetDigest`. Lo invocan tres tests (`latest selector`, `explicit selector`, `marker mismatch`) que todos pasan con `EXIT_UPDATED`. El banner `bannerVersionLabel({marker, recoveryRequired: false})` retorna `v${marker.version}` que coincide con `TARGET_VERSION`. La cadena se completa sin desviación en ninguno de los escenarios verificados.

### Q4. ¿En cada falla/interrupción, el marker puede llevar el deployed state? ¿Rollback idempotente y ambiguity-preserving?

**Marker no puede lead deployed state.** El orden es:
1. `binary-replaced` (rename atómico en mismo filesystem, mantiene backup)
2. `child-reexecuted` (child verifica su propia identidad)
3. `template-deployed` (embedded template del binario verificado, manifest validado)
4. `marker-committed` (último; commit atómico + read-back JSON equality)
5. `validated` (re-lee marker y verifica coherencia con binary/template)

Si (1)–(4) fallan, no hay marker advance. Si (5) falla tras (4), el rollback restaura el `markerBackup` (copia previa tomada en `transaction.ts:282-289`); si no existía marker previo, `removeFile(markerPath)`. Si la chain de rollback falla, el journal persiste en disco y `recoverPendingTransaction` retorna `recovery-required` en el siguiente `runUpdate` — `tests/release-update-integration.test.ts:pending journal present at start blocks any new update attempt with recovery-required` confirma que un segundo intento no se inicia mientras el estado es ambiguo. `tests/release-update-transaction.test.ts:retains the journal when rollback fails and refuses a second ambiguous update` confirma idempotencia y preserva la ambigüedad hasta recovery explícito. La invariante R10 se cumple.

### Q5. ¿Asset names del workflow + checksum format matchean el updater sin debilitar parser?

**Sí.** `tests/release-asset-contract.test.ts` lee `.github/workflows/installer-release.yml` y `installer/scripts/build-all.ts` como texto y verifica que los 4 assets documentados (`ein-installer-{darwin|linux}-{arm64|x64}`) aparecen en ambos. Verifica además que `sha256sum ein-installer-*` aparece en el workflow y `bunTarget:"bun-{darwin|linux}-{arm64|x64}"` aparece en el build script. El parser `parseChecksums` (`installer/src/core/checksum.ts:11-29`) es estricto: solo acepta regex `^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$` (dos espacios, sin `*`); rechaza BSD `*` (`tests/release-asset-contract.test.ts:rejects BSD-style binary marker`), duplicados (`duplicate-entry`), malformed (`malformed`), missing (`missing-entry`). El parser no se debilita para adaptarse; si el workflow cambiara a BSD, el test rompería antes de cualquier code change accidental.

### Q6. ¿Marker v1 migration, external-owner result codes, dry-run, explicit version, recovery-required cubiertos?

**Sí, los cinco:**

- **Marker v1 migration**: `tests/release-update-contract.test.ts:53-65` clasifica legacy `stable` como `legacy-standalone`; `tests/release-update-transaction.test.ts:migrates a legacy marker only after executable and deployed template coherence` verifica que (a) `migrateLegacyMarker` rechaza si `binaryVersion` o `deployedTemplateVersion` no coinciden (`coherence-unproven`), y (b) migra solo cuando hay coherencia total, escribiendo v2 con `owner: {type:"standalone"}`.
- **External-owner result codes**: `tests/release-update-cli.test.ts:formats every outcome with stable exit codes` (5 outcomes con sus `EXIT_*`) + `blocks an externally managed installation before binary replacement` (exit 2, output contiene "homebrew", bytes del destination sin cambio) + `tests/release-update-integration.test.ts:external-owner installation blocks the transaction` (idéntico end-to-end).
- **Dry-run**: `tests/release-update-cli.test.ts:dry-run resolves the requested release without acquiring or mutating` (fake caps con `markerPath`, ningún file se muta — el `Map` solo contiene el marker original) + `tests/release-update-integration.test.ts:dry-run returns without mutating any artifact even when release and binary already agree`.
- **Explicit version**: `tests/release-update-contract.test.ts:requires an explicit selector to match its exact release tag` (resolver rechaza mismatch) + `tests/release-update-integration.test.ts:explicit selector resolves to the same release identity as latest and reaches agreement` (end-to-end con `runUpdate([TARGET_VERSION])`).
- **Recovery-required**: `tests/release-update-cli.test.ts:reports invalid selectors and interrupted journals as non-success` (journal malformado → output contiene "recuperacion", exit 1) + `tests/release-update-integration.test.ts:interruption during a prepared transaction is detected as recovery-required on the next invocation` + `pending journal present at start blocks any new update attempt with recovery-required`.

### Q7. ¿Unrelated uncommitted files preservados? ¿Production vs test workload separados?

**Sí.** `git status --porcelain` muestra, además de los archivos del change, los untracked que ya existían antes del apply: `EIN.md` (curado inicial de contexto), `openspec/` (contiene `release-experience-roadmap/` y `zero-friction-sdd-start/` con su `verify-report.md` previo), `tests/sdd-config-bootstrap.test.ts` (de `zero-friction-sdd-start`). Ninguno fue tocado en esta fase; se preservan verbatim. Los untracked nuevos del change son los 14 archivos production + 7 test files + `handoff.md`.

**Production workload (tracked modifications + untracked new, no se cuentan tests):**

- Modificados (tracked): `installer/src/cli/update.ts` (121 ins / 132 del = 253 brutos), `installer/src/tui/banner.ts` (48 ins / 21 del = 69 brutos). Total tracked modificado: 322 líneas brutas (169 insertions + 153 deletions).
- Nuevos (untracked, `wc -l`): 14 archivos production = 1,641 líneas netas.
- **Total production bruto**: ~1,963 líneas. Budget single-PR: 400 líneas → **overrun ~1,563 líneas** (consistente con apply-progress "1,647 líneas sobre budget"). El Review Workload Guard del delivery decide topology (single PR vs chained); este verify no preautoriza exceder el budget.

**Test workload (excluido del budget, reportado por separado):**

- Nuevos: `tests/release-update-{contract,acquisition,exec,transaction,cli,integration,asset-contract}.test.ts` = 1,518 líneas (`wc -l` directo).
- Preservadas (siguen verdes): `tests/installer-backup.test.ts` (165), `tests/deploy-clean-managed.test.ts` (65), `tests/deploy-settings.test.ts` (79) = 309 líneas.
- Total test: 1,827 líneas.

## Behavioral coverage

`behavior_coverage: verified`. Los 66 tests ejercen el comportamiento observable end-to-end (no solo typecheck/build): acquisition HTTP + checksum sobre bytes reales (`mkdtempSync` + SHA-256 de fixture), executable staging + chmod + rename atómico sobre el filesystem real, marker commit atómico + read-back sobre el filesystem real, child continuation parseando JSON verificado, journal recovery sobre disco real. La integración cubre `latest.successAgreement`, `explicit.successAgreement`, `alreadyCurrent.successAgreement`, `markerMismatch → successAgreement`, `externalOwner.noMutation`, `checksumMismatch.preservesPriorIdentity`, `transactionFailure.preservesPriorIdentity`, `pendingJournal.recoveryRequired`, `acquisitionFailure.preservesPriorIdentity`, `identityMismatch.failsBeforeReplacement`, `dryRun.noMutation`, `interruption.recoveryRequired` — todas con asserts sobre bytes reales (binary contents, marker JSON, manifest, banner label).

## Scenario evidence

| Escenario | Test que lo prueba | Resultado |
| --- | --- | --- |
| `latest` succeeds | `release-update-integration.test.ts:latest selector produces full agreement across every artifact` | PASS, agreement completo |
| Explicit non-latest succeeds | `release-update-integration.test.ts:explicit selector resolves to the same release identity as latest` | PASS, agreement completo |
| Already-current no-op | `release-update-integration.test.ts:already-current returns without mutating` | PASS, sin mutación, exit 0 |
| Marker mismatch → repair | `release-update-integration.test.ts:marker mismatch proceeds through the verified transaction` | PASS, agreement final |
| External-owner blocks | `release-update-integration.test.ts:external-owner installation blocks the transaction` | PASS, sin mutar, manager en output |
| Checksum mismatch | `release-update-integration.test.ts:checksum mismatch preserves prior identity` | PASS, prior identity intacta |
| Child failure | `release-update-integration.test.ts:transaction failure during child continuation rolls back` | PASS, prior identity intacta |
| Interruption recovery | `release-update-integration.test.ts:interruption during a prepared transaction is detected as recovery-required` | PASS |
| Pending journal blocks new update | `release-update-integration.test.ts:pending journal present at start blocks any new update attempt` | PASS, exit 1, output "recuperacion" |
| Missing checksums | `release-update-integration.test.ts:acquisition failure with missing checksums preserves prior identity` | PASS |
| Identity mismatch | `release-update-integration.test.ts:identity mismatch between staged bytes and selected release` | PASS, falla antes de replacement |
| Dry-run | `release-update-integration.test.ts:dry-run returns without mutating any artifact` | PASS |
| Banner agrees | `release-update-cli.test.ts:renders committed, recovery-required, and unverified banner labels` | PASS |
| Signal handling | `release-update-transaction.test.ts:scoped signal handlers … before mutation`, `… after mutation and are removed on cleanup` | PASS |
| Marker v1 → v2 migration | `release-update-transaction.test.ts:migrates a legacy marker only after executable and deployed template coherence` | PASS |
| Marker read-back fail-closed | `release-update-transaction.test.ts:fails closed when atomic marker read-back cannot prove the committed identity` | PASS |
| Redirect off-host | `release-update-acquisition.test.ts:rejects an injected redirect response that leaves trusted GitHub hosts` | PASS |
| Asset contract pinned | `release-asset-contract.test.ts` (6 tests) | PASS |
| CLI outcomes & exits | `release-update-cli.test.ts:formats every outcome with stable exit codes` | PASS |
| Selector normalization & rejection | `release-update-contract.test.ts` (4 tests) | PASS |

## Unresolved gaps

- **Ownership package-manager block post-acquisition (Q1)**: la rama `blocked-external-owner` se decide tras `acquireRelease`, no antes. Cumple R10 (no mutation) pero desperdicia bytes de red. Documentado en `handoff.md` como limitación aceptada. No bloquea verify.
- **Acquire-before-coherence en `already-current` (Q2)**: la transacción actual descarga y verifica el asset antes de retornar `already-current`. Eficiencia, no correctness. Documentado en `handoff.md`. El comentario `[NOTE]` en `tests/release-update-integration.test.ts:already-current` lo registra.
- **Atomicidad real = per-artifact (riesgo conocido del diseño §A)**: POSIX `rename(2)` solo es atómico dentro de un filesystem; el staging del ejecutable se hace sibling para garantizarlo, pero el diseño documenta esta limitación a nivel general.
- **Provenance = SHA-256 GitHub-only**: no hay firma publisher-independent ni attestation. `handoff.md` lo declara como limitación explícita; `install.sh` no se reescribió.

## Risks

- **Production budget overrun**: ~1,963 líneas production contra budget 400. El Review Workload Guard queda aplicable en delivery. El handoff ya registró 1,647 líneas de overrun acumulado en `// 001`–`// 005`; el grupo `// 006` añade 0 production. Si delivery es single-PR, podría rechazar el tamaño; el design §C lo anticipa: "single versus chained/stacked delivery" es decisión de delivery, no de este verify.
- **Efficiency gaps no son correctness**: los dos gaps documentados (Q1, Q2) no son regresiones de seguridad pero sí merecen un issue futuro si la latencia o el ancho de banda importan; por ahora, R10 y R9 se cumplen.
- **Banner `playBanner` aún puede importar `INSTALLER_VERSION`**: la constante se importa en `core/version.ts` y se mantiene porque `main.ts` la usa para `ein --version`; el banner `bannerVersionLabel` ya no la usa para el label de estado instalado (verificado por test `renders committed, recovery-required, and unverified banner labels`), pero un grep ingenuo podría encontrar otras referencias. El test no falla, por lo que no hay regresión.
- **No real GitHub / no production build**: este verify no ejecuta `bun run build:all`, no contacta `api.github.com`, no publica release. Cobertura observable se declara `verified` por la composición de caps falsos que ejercen cada transición sobre filesystem real.

## Next recommended

- Status: `pass`. Listo para cerrar `release-update-semantics`.
- Si el siguiente paso es delivery (PR / merge), ejecutar el `Review Workload Guard` real (`git diff --shortstat <base>..HEAD -- . ':(exclude)*.test.*' …`) con `base = origin/main` y aplicar la decisión de topology (single PR vs chained) que el guard indique. Si single-PR excede 400 líneas production, abrir issue para chained/stacked PR; el `// 006` ya está separado como work unit testeable aislado y puede ser su propio PR de tests.
- Consumidores `homebrew-install-channel` y `readme-release-ia` ya pueden consumir `handoff.md`; el verify no les bloquea, solo les confirma que la fuente de verdad está verificada.
- Si el usuario pide abrir PR, delegar a `ein-git` (la decisión de topology NO es del verify, es del delivery).

## Skill resolution

- `skill_resolution: paths-injected`. Las 6 skills solicitadas (`ein-discipline`, `architecture`, `bun`, `nodejs-best-practices`, `best-practices`, `release`) fueron cargadas como paths inyectados por el parent; no hubo necesidad de fallback registry.

## Manual notes

- El `handoff.md` está bien formado y sirve como contrato para los dos consumidores. La tabla de exit codes coincide con `installer/src/cli/result.ts` (5 outcomes: 0, 0, 0, 2, 1).
- El `apply-progress.md` muestra "26 tasks complete" consistente con `tasks.md`. El ledger de líneas coincide con `wc -l` actual.
- Los tests usan `mkdtempSync` + `rmSync` en `afterEach`; ningún test deja orphans en `tmpdir()`.
- El proceso de test activo no se reemplaza en ningún test (`expect(process.execPath).toBe(beforeExecPath)` aparece en 3 lugares).