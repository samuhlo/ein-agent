# // 000. RESUMEN
Un cambio acotado en el dominio `sdd-lifecycle` que introduce una única operación explícita `ein_candidate_receipt_retire` para desactivar un recibo de candidato activo solo después de que GitHub demuestre que la cabeza de entrega validada completa un pull request mergeado en el mismo repositorio. Los bytes exactos del recibo activo se archivan por fingerprint antes de quitar el slot activo; la operación es idempotente, fail-closed, y no altera ningún grant, declaración, ni los cuatro gates existentes.

// 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/candidate-receipt.ts` — ruta de archivo de archivo de receipts desactivados, bloqueo de ciclo de vida, lectura de evidencia activa en bytes exactos, publicación atómica, `RetirementMetadata`, tipos `RetireCandidateReceiptInput`/`Result`, `retireCandidateReceipt`, `archivedReceiptMatches`, `metadataFromDecision`.
- `ein-pi/agent/lib/delivery-receipt.ts` — `CandidateReceiptRetirementIdentity`, `NormalizedMergedPullRequestObservation`, `CandidateReceiptRetirementInput`, `CandidateReceiptRetirementDecision`, `evaluateCandidateReceiptRetirement`.
- `ein-pi/agent/extensions/ein-ai.ts` — `RetirementToolParams`, `normalizeGitHubRepository`, `explicitRemoteRepository`, `observeMergedPullRequest`, `pi.registerTool("ein_candidate_receipt_retire", ...)` con limpieza de intento tras `retired`.
- `tests/candidate-receipt.test.ts` — contrato fingerprint/ruta, publicación de archivo, conflicto, bloqueo de ciclo de vida, divergencia de revalidación, publicación atómica, adaptación de identidades, validación de vigencia.
- `tests/delivery-gate.test.ts` — casos unitarios de decisión de retiro, test de ciclo de vida de solape mecánico.
- `openspec/specs/sdd-lifecycle/spec.md` — delta sincronizado: SHA-256 `37fc78cb…` → `da70679a…`, 11 operaciones añadidas, 0 modificadas, 0 eliminadas.

// 002. CÓMO FUNCIONA POR DENTRO
El flujo en un solo paso: la herramienta `ein_candidate_receipt_retire` recibe `change`, `receiptFingerprint`, `remote`, `baseRef`, `headRef` y `prNumber`. Adquiere el bloqueo exclusivo de ciclo de vida del receipt (`withReceiptLifecycleLock`). Lee el slot activo en bytes exactos, hashea SHA-256 y lo iguala contra el fingerprint explícito y el fingerprint del intento en memoria. Valida el receipt con `validateFreshCandidateReceipt` (repo, worktree, change, versión, campos obligatorios) y exige `validatedDeliveryHead` no vacío. Normaliza la URL remota a `owner/repository` (rechaza forks y remotos no-GitHub). Ejecuta `gh pr view --repo <repository> --json state,mergedAt,mergeCommit,headRepository,headRef,baseRef,url <prNumber>` y parsea la respuesta; si falta algún campo Typed o el estado no es `MERGED`, falla cerrado. Iguala el `headRefOid` del PR contra `validatedDeliveryHead`. Pubblica los bytes exactos del receipt activo en `<gitDir>/ein/retired-candidate-receipts/<fingerprint>/candidate-receipt.json` (temp → rename → readback). Si el archivo ya existe, lo compara byte a byte; un conflicto conserva el slot activo. Publica `retirement.json` con fingerprint, `validatedDeliveryHead`, IDs de repo/worktree, remote normalizado, refs, PR y merge OIDs. Realiza una segunda observación fresca de `gh` y exige identidad idéntica. Vuelve a leer el slot activo y el intento; si coinciden, elimina el slot activo con `unlinkSync`. Solo tras éxito limpia `deliveryAttemptBySession`. Si el slot activo ya no existe, el camino idempotente verifica los bytes archivados y metadatos y retorna `already-retired` sin I/O de red ni reescritura.

Todo fallo (lock ocupado, receipt corrupto, intento ausente, observación divergente, archivo conflictivo, error de `unlink`) conserva el slot activo y retorna `{ ok: false, reason }`.

// 003. DECISIONES
- **Límite terminal único**: merge de PR del mismo repositorio con `headRefOid === validatedDeliveryHead`. Commit, push o PR create/update NO son terminales.
- **Trigger explícito**: herramienta `ein_candidate_receipt_retire`. No hay inferencia por edad, nombre de rama, prosa ni `HEAD` local.
- **Red fresca dos veces**: `gh pr view` ejecuta dos veces dentro de la operación; no se acepta JSON del llamador ni caché.
- **Archivo antes de desactivar**: los bytes exactos se publican, se leen de vuelta, se comparan; solo entonces se elimina el slot activo.
- **Idempotencia por fingerprint**: archivar el mismo receipt con los mismos bytes retorna `already-retired`; bytes distintos en un archivo existente falla cerrado.
- **Bloqueo de ciclo de vida**: `withReceiptLifecycleLock` serializa emisión y retiro; lock ocupado bloquea, nunca se ignora.
- **Orden de limpieza de intento**: se conserva durante todas las comprobaciones de archivo y red; se limpia solo tras `unlink` exitoso.
- **No se weakened**: grants, declaraciones, cuatro gates, `RECEIPT_VERSION = 1`, formato de receipt, ni dependencias.

// 004. VERIFICACIÓN
| Verificación | Resultado |
|---|---|
| `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` | 104 passed, 229 assertions, 0 failures |
| `bun test` | 927 passed, 2 530 assertions, 0 failures, 81 archivos |
| `git diff --check HEAD` | clean |
| Cobertura de escenarios | Todos los 11 escenarios de `specs/sdd-lifecycle/spec.md` tienen test focalizado con aserciones observables |
| Delta canónico | `sdd-lifecycle`: SHA-256 `37fc78cb…` → `da70679a…`, sync OK, 0 conflictos |

Limitaciones honestas:
- La ruta feliz real de GitHub (`gh pr view` contra un PR mergeado, autenticación, timeout, respuesta CLI malformada, detección de fork, resolución de OID de merge) no fue ejercida; el adapter se prueba solo con respuesta malformada; los tests de integración inyectan observación sintética.
- Fork-PR y direct-push no son soportados; se rechazan en `normalizeGitHubRepository` y `evaluateCandidateReceiptRetirement`.
- Concurrencia real (dos procesos escribiendo a la vez) no fue probada; el retry de `unlink` se prueba con secuencia sintética.
- No se realizó entrega real (commit, push ni PR).

// 005. PENDIENTE / RIESGOS
- **Decisión obligatoria antes de entrega**: el diff de producción suma 435 líneas (425 inserciones + 10 eliminaciones) y supera el presupuesto de revisión de 400 líneas por 35. El usuario debe elegir estrategia de PR (PR único con excepción vs. PR encadenados) antes de abrir.
- **Sin test de GitHub real**: la implementación rechaza campos ausentes y retorna `null`, pero no hay evidencia runtime de CLI real.
- **Ruta de reintento no probada con concurrencia real**: el retry de `unlink` tras publicación parcial se prueba con secuencia sintética.
- Ningún otro cambio, grant ni declaración fue modificado.
