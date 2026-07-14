## // 000. RESUMEN

`ein update [latest|<version>]` deja de mentir: selector, release canónica, payload verificado, binario+template desplegados, marker y versión mostrada describen una sola identidad. Cuatro resultados observavles (`updated`, `already-current`, `blocked-external-owner`, `failed`) con exit codes estables (0/0/0, 2, 1). Cierre SDD, no publicación de release.

## // 001. QUÉ CAMBIÓ

- 14 módulos nuevos en `installer/src/core/` y `installer/src/cli/` para identidad, resolución, adquisición, transacción y marker v2.
- `installer/src/cli/update.ts` y `installer/src/tui/banner.ts` reescritos: el primero delega en la transacción verificada; el segundo lee `marker.version` committed, nunca `INSTALLER_VERSION` como verdad instalada.
- 7 suites de Bun nuevas en `tests/` (66 tests, ~291 asserts) que ejercitan el camino feliz, todos los puntos de fallo y la matriz de rollback con `caps` falsos — sin red real, sin reemplazo del ejecutable de test, sin publicación.
- Handoff factual en `handoff.md` consumible por `homebrew-install-channel` y `readme-release-ia`.

## // 002. CÓMO FUNCIONA POR DENTRO

Orquestador funcional puro con máquina de estados explícita (`idle → ownership-classified → resolving → resolved → acquiring-metadata → acquired-and-verified → coherence-check → prepare-transaction → binary-replaced → child-reexecuted → template-deployed → marker-committed → validated → complete`) y objeto de capacidades inyectado (`UpdateCaps`: http, hash, fs, child, clock, signals, output). Producción usa defaults Bun/Node; tests pasan fakes.

- **Resolución** (`release-resolver.ts`, `release-record.ts`): `parseSelector` distingue `latest` de `X.Y.Z`/`vX.Y.Z`/`installer-vX.Y.Z`; el endpoint explícito rechaza drafts/prereleases/mismatch sin fallback a `latest`. Última elegibilidad sólo vía `releases/latest`.
- **Adquisición** (`acquisition.ts`, `checksum.ts`, `asset-selector.ts`): HTTPS-only, redirects acotados (≤5, sólo a hosts GitHub), timeout 15s, cap 64MiB, no forward de credenciales. Staging en `mkdtempSync` + `finally rm`. `checksums.txt` se parsea con regex estricto GNU (dos espacios, rechaza `*` BSD); un solo SHA-256 esperado para el asset seleccionado; mismatch = fail-closed.
- **Reemplazo del binario** (`executable.ts`, `binary-probe.ts`, `child-continuation.ts`): sibling staging en el directorio destino (rename atómico mismo-filesystem); `lstatSync` rechaza symlink/cross-fs; chmod 0o755 limpio de setuid/setgid; fsync del directorio. Probe del candidato con `--version` confirma identidad antes del rename. La continuación corre el binario verificado en modo privado con `--ein-continuation=<txId>`; el padre espera, valida, hace rollback o cierra.
- **Plantilla y marker** (`template-transaction.ts`, `marker-v2.ts`): snapshot solo de directorios gestionados (`MANAGED_DIRS`), deploy desde el template embebido del binario verificado, rollback clean-before-restore preservando user state (`auth.json`, `sessions`, `skills/downloaded`). Marker v2 con commit atómico (`writeFileSync(tmp)` + `renameSync`) y read-back JSON-equal; nunca lead sobre el deployed state.
- **Ownership y journal** (`marker-v2.ts`, `transaction.ts`): clasificación sólo desde `marker.owner` (nunca por path). Para `package-manager` con target distinto del binario en ejecución, retorna `blocked-external-owner` sin mutar binario/template/marker. Journal durable en `BACKUP_DIR/.ein-update-journal.json`: persiste intent antes de cada acción irreversible; señales scoped limpian antes de mutar y rollbackean después; recovery-required bloquea nuevos updates hasta coherencia.

## // 003. DECISIONES

- **Atomicidad per-artifact, no whole-tree.** POSIX `rename(2)` sólo atómico mismo filesystem; staging sibling obligatorio. State machine + rollback inverso es la verdad testeable.
- **Re-exec antes de template.** Sólo el binario verificado puede desplegar su template; el padre conserva rollback y cleanup.
- **Provenance = SHA-256 GitHub same-release.** Coincide con el contrato actual del workflow. Firma publisher-independent queda fuera de scope.
- **Marker v2 aditivo sobre v1.** Readers legacy siguen parseando; ownership sólo del campo `owner` v2.
- **Inversión de control por capacidades.** Funciones puras + `UpdateCaps` evitan la jerarquía de clases y el god-object que el diseño rechazaba.
- **Sin Pi/`installDeclaredPackages` dentro de la transacción.** Efectos externos no rollback-safe; siguen en sus flujos.

## // 004. VERIFICACIÓN

`status: pass`, `behavior_coverage: verified` según `verify-report.md`.

- `bun test` (10 archivos, 66 tests, 291 expects, 974 ms) — **PASS** end-to-end sobre filesystem real (mkdtemp, SHA-256, chmod, rename, marker JSON).
- `cd installer && bun run typecheck` — **PASS** (`tsc --noEmit` limpio).
- `git diff --check` — **PASS** (sin whitespace errors).
- `git diff --cached --name-only` — **PASS** (vacío).
- `git status --porcelain` antes/después — untracked preexistentes preservados: `EIN.md`, `openspec/release-experience-roadmap`, `openspec/zero-friction-sdd-start`, `tests/sdd-config-bootstrap.test.ts`.

Matriz observable cubierta (20 escenarios en `verify-report.md`): `latest`/`explicit` success, `already-current`, marker mismatch → repair, external-owner block, checksum mismatch, child failure, interruption recovery, pending journal block, missing checksums, identity mismatch, dry-run, banner agrees, signal handling, v1→v2 migration, marker read-back fail-closed, redirect off-host, asset contract pinned, CLI outcomes/exits, selector normalization/rejection.

## // 005. PENDIENTE / RIESGOS

- **Production budget overrun:** ~1,963 líneas production vs 400 budget → overrun ~1,563. `Review Workload Guard` decidirá topology (single vs chained PR) al delivery; este cierre no preautoriza exceder.
- **Efficiency gap (aceptado, no correctness):** para `package-manager` y para `already-current`, la adquisición ocurre antes de la decisión. Desperdicia bytes/red cuando no mutará. Documentado en `handoff.md`; no rompe R10.
- **Provenance = GitHub + SHA-256.** No hay firma publisher-independent ni attestation reproducible; compromiso del publisher invalida la garantía.
- **Sin validación real de red ni auto-update:** este verify no contacta `api.github.com`, no reemplaza el ejecutable activo, no publica release, no ejecuta `build:all` ni `e2e/docker-test.sh`.
- **Sin delivery:** no commit, no push, no PR, no merge, no release publicado. Cierre = SDD completo, no publicación.
- **Downstream gated:** `homebrew-install-channel` consume `handoff.md` con el contrato de marker v2, inventario de artefactos, resultado bloqueado y regla de reparación safe-same-binary. `readme-release-ia` consume los outcomes, exits y limitación SHA-256 — ambos sólo después de `VERIFIED`.
- **Rollback del cambio:** revertir implementación no invalida marker v2 (aditivo); un rollback que no entienda ownership v2 debe fail-closed antes de mutar el binario externo.