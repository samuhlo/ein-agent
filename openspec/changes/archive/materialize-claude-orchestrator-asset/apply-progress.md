status: complete

## Group 001 — Manifest-required completeness and fail-closed staging

Completed tasks 1.1–1.4. The staging boundary now requires manifest v1, validates confined unique paths, regular-file entries, exact regular-file coverage (excluding the manifest and local archive copy), required file/directory kinds, SHA-256 digests, and cleanup on every rejection. The focused fixture now emits a valid v1 manifest and covers malformed, incomplete, duplicate, invalid-path, missing, type, extra-member, checksum, and cleanup cases.

## Group 002 — Hand-off existente hasta el home aislado

Tareas 2.1–2.3 completadas en `tests/installer-runtime-menu.test.ts`, sin tocar producción del instalador.

- `packaged payload reaches the isolated Claude home with canonical orchestrator bytes`: produce un payload real con `bundleCcEinPayload({ outputPath })`, lo stagea con el `stageCcEinPayload()` real y lo entrega a `runClaudeInstall({ home, stagePayload })` con home temporal. Comprueba que `<home>/.claude-ein/assets/orchestrator.md` es fichero regular, byte-idéntico al miembro staged y al canónico `ein-pi/agent/assets/orchestrator.md`, y que el root staged y su parent quedan vacíos.
- `a real staged payload whose sync fails installs no launcher, asset, or leftover stage`: mismo payload real, `bunPath` inexistente. El resultado es `ok: false` con `La sincronizacion de Claude fallo`, cero llamadas al launcher, sin asset instalado y sin stage residual.

## Group 003 — Smoke BunFS compilado end-to-end

Tareas 3.1–3.3 completadas en `installer/scripts/cc-payload-smoke.ts`. El smoke pasó de comprobar solo extracción a componer el hand-off real: resolver BunFS sin argumento, captura de bytes staged, `runClaudeInstall()` contra un home temporal, destino regular con paridad de bytes y cleanup de archive y root. El workflow de release no se tocó.

### Defecto de distribución encontrado por el smoke

El primer RED compilado falló con `No se encontro el payload cc-ein: /$bunfs/root/cc-ein-runtime.tar-*.gz`. Causa: `validateCcEinPayloadArchive()` probaba la existencia con `realpathSync`, y las rutas BunFS responden a `stat` pero no tienen ruta real. Sonda compilada: `existsSync` OK, `statSync` OK, `Bun.file().size` OK, `realpathSync` ENOENT. Corrección mínima en `installer/src/core/cc-payload.ts`: la existencia se prueba con `statSync`. Los mensajes de error y el rechazo sin fallback a cwd se conservan.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Complete manifest admission and required kinds | `bun test tests/installer-runtime-menu.test.ts` — 32 pass, 1 fail | Same command — 33 pass, 0 fail | `bun test tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts` — 37 pass, 0 fail | `cd installer && bun run typecheck` — pass; final focused: `bun test tests/installer-runtime-menu.test.ts` — 33 pass, 0 fail |
| Staged SHA-256 and exact regular-member coverage | Same RED command — new rejection assertion failed before production change | Same GREEN command — pass | Bundler plus runtime command — 37 pass, 0 fail | Same typecheck — pass; final focused: `bun test tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts` — 37 pass, 0 fail |
| Failure cleanup and real archive-byte preservation | Same RED command — cleanup/validation seam failed before implementation | Same GREEN command — pass | Bundler plus runtime command — 37 pass, 0 fail | Same typecheck — pass; final focused: `bun test tests/installer-runtime-menu.test.ts` — 33 pass, 0 fail |
| Payload empaquetado → asset instalado en home aislado | Control negativo con el `cc-ein/sync.ts` de `HEAD` (sin la copia del asset) sobre `runClaudeInstall()` con home temporal: `install.ok=true installed=false` — la aserción de paridad no se puede cumplir sin el wiring | `bun test tests/installer-runtime-menu.test.ts -t "packaged payload reaches"` — 1 pass, 0 fail | `bun test tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts` — 69 pass, 0 fail (incluye el fallo de sync con stage real: sin launcher, sin asset, sin stage) | `cd installer && bun run typecheck` — pass; final focused: `bun test tests/installer-runtime-menu.test.ts` — 35 pass, 0 fail |
| Smoke compilado: hand-off, paridad y cleanup | `bun scripts/cc-payload-smoke.ts` — exit 1, `Payload cc-ein incompleto; faltan: ein-pi/agent/assets/orchestrator.md` (archive generado obsoleto) | Archive regenerado con `bun run scripts/bundle-cc-ein.ts` (892 ficheros) — smoke exit 0 | Compilado desde `/tmp`: RED `No se encontro el payload cc-ein: /$bunfs/root/...` (exit 1) → `statSync` en `cc-payload.ts` → exit 0 | `bun test` completo — 2278 pass, 0 fail; `bun run typecheck` y `cd installer && bun run typecheck` — pass |

## Files changed

`installer/src/core/cc-payload.ts`
`installer/scripts/cc-payload-smoke.ts`
`tests/installer-runtime-menu.test.ts`
`tests/release-asset-contract.test.ts`
`openspec/changes/materialize-claude-orchestrator-asset/tasks.md`
`openspec/changes/materialize-claude-orchestrator-asset/apply-progress.md`

Regenerado (output desechable, ignorado por git): `installer/src/assets/cc-ein-runtime.tar.gz`.

## Desviaciones respecto a tasks.md

1. **`installer/src/core/cc-payload.ts` tocado en el grupo 003**, que decía tocar solo el smoke. Justificación: el diseño permite salir del seam existente con evidencia concreta de que no funciona, y el RED compilado la aportó (`realpathSync` sobre BunFS). Sin ese arreglo el instalador compilado no puede resolver su propio payload, que es exactamente lo que R4 exige demostrar.
2. **`tests/release-asset-contract.test.ts` editado** (una aserción). El contrato exigía `staged?.cleanup()` literal en el smoke; con el hand-off real la limpieza la posee `runClaudeInstall()` (D3). La aserción se sustituyó por `runClaudeInstall`, `CC_EIN_ORCHESTRATOR_ASSET` y `payload staging cleanup failed`, que describen el contrato nuevo y más fuerte. El workflow no se tocó.
3. **El comando de verificación literal no es ejecutable en macOS**: el binario `--target=bun-linux-x64` compila (119 MB, incluye `template.tar.gz` por la dependencia de `install.ts`) pero no corre aquí. Se ejecutó el mismo smoke compilado para `bun-darwin-arm64` desde `/tmp`, fuera del checkout, con exit 0. La ejecución Linux real sigue siendo la del job de release, sin cambios.

## Verification and boundaries

- `bun test` completo: 2278 pass, 0 fail (172 ficheros).
- `bun run typecheck` (raíz) y `cd installer && bun run typecheck`: limpios.
- Smoke compilado darwin-arm64 desde `/tmp`: exit 0. Smoke linux-x64: compila.
- Sin cambios en `installer/src/cli/install.ts`, `installer/install.sh`, `installer/src/core/settings.ts`, `cc-payload-inventory.ts`, `bundle-cc-ein.ts`, `cc-ein/sync.ts`, el asset canónico ni `.github/workflows/installer-release.yml`.
- Ningún hunk dirty ajeno se reseteó, reordenó ni absorbió; no se publicó ni se etiquetó nada.
