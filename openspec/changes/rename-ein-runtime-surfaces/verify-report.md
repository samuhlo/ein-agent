# Verify report — `rename-ein-runtime-surfaces`

status: verified
verification_state: all-required-gates-green
behavior_coverage: complete
release_eligible: true
verified_base_head: `0aa5403f3b0807fc69a36c60e1f947226eae397c`
candidate_head: `0aa5403f3b0807fc69a36c60e1f947226eae397c`
candidate_branch: `main`
candidate_index: clean
candidate_worktree_scheme: `git-visible-worktree-v1/excluding-verify-report`
candidate_worktree_entries: 2091
candidate_worktree_sha256: `88f8f8c7c32ef7b612ca331fba813794536e3381d447d66477bccce5710f2107`

## Resultado ejecutivo

La candidata queda **verificada**. Las cuatro continuaciones F-001..F-004
están cerradas con evidencia independiente y fresca: seguridad de parent
symlinks, transacción durable y reentrante, recibos Ein-first, y portabilidad
de los dos archivos tar entre macOS y GNU tar/Linux.

Pasan los 160 focused tests, los 2.781 tests completos, ambos typechecks,
`build:all`, el smoke compilado para Linux arm64 dentro de Docker, los cuatro
escenarios E2E, el build de documentación, dos sync idempotentes, la auditoría
de nombres, la higiene del diff y la igualdad de los roots protegidos.

La identidad sigue deliberadamente en `0.91.0-alpha.2`. Verify no hizo bump,
commit, push, tag ni publicación. Al estar todos los gates en verde, las tareas
`// 029`, `// 030` y `// 031` quedan habilitadas para la fase de release.

## Identidad exacta del candidato

- Base pre-apply: `0aa5403f3b0807fc69a36c60e1f947226eae397c`.
- HEAD observado: `0aa5403f3b0807fc69a36c60e1f947226eae397c`, rama `main`.
- Índice: sin diferencias staged.
- Worktree candidato:
  `git-visible-worktree-v1/excluding-verify-report:sha256:88f8f8c7c32ef7b612ca331fba813794536e3381d447d66477bccce5710f2107`.

El fingerprint se calcula sobre las 2.091 entradas ordenadas devueltas por
`git ls-files -co --exclude-standard`, excluyendo únicamente este
`verify-report.md` para evitar una identidad autorreferente. Para cada path
incluye path, tipo, modo y SHA-256 de bytes; las bajas tracked se representan
como `missing`. Los outputs ignorados de build no forman parte del candidato.

## Verificación de F-001..F-004

### F-001 — Parent symlink real

**Resultado:** verified.

`tests/legacy-runtime-artifacts.test.ts` ejercita la observación real con un
padre enlazado fuera del home. El artefacto se clasifica como colisión antes de
hash, sin leer ni mover el destino exterior. Los casos de symlink final,
directorio, vecino y ownership exacto alpha.2 siguen fail-closed.

### F-002 — Transacción durable y lifecycle global

**Resultado:** verified.

Los focused tests demuestran manifest v2 publicado antes de cada move,
reconciliación tras interrupción entre rename/post-state, reentrada con la
misma identidad, rollback inverso, restauración exacta de bytes/modo y borrado
de recovery solo tras commit global. Install conserva
`shared.retire-legacy` como última entrada estable; update mantiene el mismo
transaction id en prepare/rollback/commit y reanuda journals completos sin
rescan ambiguo.

### F-003 — Completion Ein-first

**Resultado:** verified.

Producción, test contractual y E2E observan la misma completion
`claude code: ein listo`. En `both`, las dos ejecuciones Docker comprueban
que el recibo de Pi aparece antes que el de Claude.

### F-004 — Portabilidad de payload y template

**Resultado:** verified.

Los dos productores contienen el mismo cierre portable:

- `installer/scripts/bundle-ein-cc.ts:159-164`: `COPYFILE_DISABLE=1` y
  `tar --no-xattrs`.
- `installer/scripts/bundle-template.ts:203-208`: `COPYFILE_DISABLE=1` y
  `tar --no-xattrs`.

El test no confía en el listado del tar del host.
`tests/helpers/tar-portability.ts` descomprime gzip y recorre directamente
headers tar, GNU long names y records PAX. Un fixture raw contaminado produjo:

```text
apple-double member = ._payload
xattr key = LIBARCHIVE.xattr.com.ein.verify
xattr key = SCHILY.xattr.com.ein.verify
xattr key = LIBARCHIVE.xattr.com.apple.provenance
xattr key = SCHILY.xattr.com.apple.provenance
exit = 0
```

La inspección raw posterior a `build:all` devuelve `violations:[]` tanto
para `ein-cc-runtime.tar.gz` como para `template.tar.gz`.
`tests/archive-portability.test.ts` verifica además los dos productores reales
y rechaza de forma explícita un miembro `._payload`.

El consumidor no fue relajado:
`installer/src/core/cc-payload.ts:200-268` sigue comprobando forma cerrada,
SHA-256, existencia, tipo regular y equivalencia exacta entre ficheros
extraídos y entradas del manifest. Un fichero extra continúa fallando como
`sin entrada`, y una entrada no extraída como `no extraidos`.
`tests/installer-runtime-menu.test.ts` mantiene los casos de manifest ausente,
malformado, incompleto, duplicado, path inválido y checksum inválido.

## Evidencia fresca de gates

| Gate | Resultado |
| --- | --- |
| Focused F-001..F-004 | pass — 160 tests, 0 fallos, 1.250 aserciones |
| `bun test` | pass — 2.781 tests, 0 fallos, 13.597 aserciones, 200 archivos |
| `bun run typecheck` | pass — `tsc --noEmit` |
| `cd installer && bun run typecheck` | pass — `tsc --noEmit` |
| `cd installer && bun run build:all` | pass — cuatro binarios |
| Raw portability de ambos archivos | pass — 0 violaciones |
| Smoke `bun-linux-arm64` en Docker | pass — launcher materializado, exit 0 |
| `./e2e/docker-test.sh` | pass — cuatro escenarios, exit 0 |
| `cd docs-site && bun run build` | pass — 23 páginas |
| Sync estructurado x2 | pass — cinco dominios, `canonicalChanged:false` x2 |
| Auditoría tipada | pass — 294 referencias, 0 sin clasificar |
| `git diff --check` | pass |
| Roots protegidos contra base | pass — diff vacío |
| Specs canónicas | pass — exactamente cinco dominios autorizados |

## Docker y smoke Linux

Docker client/server 29.3.1 ejecutó el gate real:

```text
E2E_SCENARIO_RESULT=OK:invalid
E2E_SCENARIO_RESULT=OK:default-pi
E2E_SCENARIO_RESULT=OK:claude-only
E2E_SCENARIO_RESULT=OK:both
/// e2e: OK
exit = 0
```

`claude-only` y `both` instalaron dos veces, conservaron estado estable y
materializaron los launchers y ejecutables actuales. `both` emitió en orden:

```text
✓ pi: ein listo. ejecuta `ein`.
✓ claude code: ein listo. ejecuta `ein`.
```

El smoke se compiló con `--target=bun-linux-arm64`, se montó en
`ein-e2e-ubuntu` y, tras preparar el prerequisito Bun con el mismo instalador,
terminó con exit 0 y materializó
`/tmp/ein-cc-payload-smoke-home-*/.config/fish/functions/ein-cc.fish`.

Una sonda previa en la imagen deliberadamente limpia alcanzó la sincronización
después de validar el payload y declaró `Executable not found in $PATH: "bun"`;
esa imagen no incluye Bun por contrato. No fue tratada como pass: el gate
registrado es la ejecución posterior con el prerequisito instalado y exit 0.

## Comandos ejecutados

```bash
bun test tests/archive-portability.test.ts tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts tests/legacy-runtime-artifacts.test.ts tests/runtime-surface-transaction.test.ts tests/runtime-surface-upgrade.test.ts tests/install-journal.test.ts tests/install-plan.test.ts tests/release-update-state-primitives.test.ts tests/release-update-integration.test.ts tests/release-asset-contract.test.ts tests/runtime-surface-naming-audit.test.ts
bun test
bun run typecheck
cd installer && bun run typecheck
cd installer && bun run build:all
cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-arm64 --outfile /tmp/ein-cc-payload-smoke-linux-arm64-verify
docker run --rm --entrypoint /bin/bash -v <installer>:/usr/local/bin/ein:ro -v <smoke>:/tmp/smoke:ro ein-e2e-ubuntu -lc '<preparar Bun> && /tmp/smoke'
./e2e/docker-test.sh
cd docs-site && bun run build
bun ein-cc/sdd-cli/cli.ts sync rename-ein-runtime-surfaces
bun ein-cc/sdd-cli/cli.ts sync rename-ein-runtime-surfaces
bun -e '<inspección raw de los dos tar.gz>'
bun -e '<fixture raw AppleDouble/PAX>'
bun -e '<auditoría tipada completa>'
git diff --check
git diff --exit-code 0aa5403f3b0807fc69a36c60e1f947226eae397c -- openspec/changes/fix-overlay-repaint-recovery openspec/changes/archive
```

## Inspección de superficies y alcance

- `ein --help` presenta `ein` como puerta normal y `ein-install` como
  bootstrap/reparación.
- `ein-install --help` publica los cinco verbos de ciclo de vida.
- `ein-cc-sdd --help` publica los subcomandos actuales.
- `fish -n` acepta ambos launchers; `ein-pi` y `ein-cc` existen en un
  source aislado y las dos funciones legacy están ausentes.
- El payload contiene una vez cada miembro requerido y ningún miembro legacy.
- Los punteros siguen en `0.91.0-alpha.2`: package, `INSTALLER_VERSION` y
  primera entrada de `CHANGELOG.md`.
- Los sync afectan solo `installer-runtime`, `public-entry`, `sdd-lifecycle`,
  `style-delivery` y `surface-wiring`.
- Los roots `openspec/changes/fix-overlay-repaint-recovery/` y
  `openspec/changes/archive/` permanecen byte-idénticos a la base.

## Decisión

El candidato está verificado y es elegible para release. Quedan habilitadas
`// 029` (alpha.3), `// 030` (entrega Git) y `// 031` (tag/publicación),
que deben ejecutarse fuera de verify conservando la identidad de candidato
registrada arriba y repitiendo los gates que esas tareas exijan.
