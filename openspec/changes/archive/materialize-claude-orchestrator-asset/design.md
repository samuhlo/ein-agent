# Design — materialize-claude-orchestrator-asset

## Contexto canónico

La selección canónica reutiliza las dos referencias de `scope.md` y añade únicamente `installer-runtime`, ruta exacta consultada y mapeada en `map.md`. Total: 3 ficheros, 12.262 bytes UTF-8; no se consultaron specs `.sdd` ni cambios archivados como fuente normativa.

| Dominio | Ruta | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| `claude-payload-transport` | `openspec/specs/claude-payload-transport/spec.md` | `ddadb8ae71d370758cd814e62ab04dbfcce00db10354bbb62dfde09ba785c747` | 905 |
| `surface-wiring` | `openspec/specs/surface-wiring/spec.md` | `2229a2dc97b905b083d5e77a3ee4a3555dce581205447b047510fa5d1a054b0c` | 6.036 |
| `installer-runtime` | `openspec/specs/installer-runtime/spec.md` | `959a273ec65c8df8cee613f8b45d72b3f7643541704705cb0b8c0d61c36f9ab9` | 5.321 |

Los resúmenes archivados `package-claude-orchestrator-asset/summary.md` y `deploy-claude-orchestrator-asset/summary.md` se usan solo como evidencia de los contratos upstream ya entregados: transporte con manifest y digest sobre bytes staged, y copia checkout/runtime byte a byte.

## A. Proposal

### Intent

Cerrar el último tramo del asset de Claude: admitir el payload empaquetado solo si su manifest e inventario son íntegros, materializarlo desde BunFS, ejecutar el hand-off existente del instalador y demostrar que el home aislado recibe `assets/orchestrator.md` con los mismos bytes.

### Scope

**Dentro:**
- Hacer obligatorio el manifest `ein-cc-payload-manifest.json` en `stageCcEinPayload()` y exigir que describa de forma completa y no ambigua los miembros regulares extraídos.
- Validar tipo, confinamiento, unicidad, existencia y SHA-256 de los miembros; el asset canónico deberá ser un fichero regular y tener exactamente una entrada válida.
- Mantener la copia byte a byte del archive BunFS a un path real antes de `tar` y el cleanup fail-closed existente.
- Reutilizar `runClaudeInstall()` sin cambiarlo para ejecutar `bun cc-ein/sync.ts` desde el root staged contra un home temporal aislado.
- Extender el smoke compilado para comprobar el hand-off real, el destino regular, la paridad de bytes y el cleanup.

**Fuera / no objetivos:**
- No cambiar inventario, bundler, contenido canónico, `cc-ein/sync.ts`, launchers, publicación, versiones, checksums ni mecánica general de release.
- No rediseñar el formato `ein-cc-payload/v1`, el transporte upstream o el sync checkout/runtime.
- No endurecer en esta slice el parser upstream de cierre de imports: traversal de imports relativos fuera de `repoRoot` e imports estáticos side-effect-only no reconocidos siguen diferidos.
- No añadir abstracciones nuevas al flujo de instalación ni modificar `installer/src/cli/install.ts`.

### Affected areas

**Producción / distribución:**
- `installer/src/core/cc-payload.ts`: frontera única de admisión, extracción y validación del payload.
- `installer/scripts/cc-payload-smoke.ts`: smoke compilado end-to-end sobre BunFS y home aislado.
- `.github/workflows/installer-release.yml`: **sin cambio previsto**; ya compila y ejecuta el smoke Linux x64 después de `build:all`.
- `installer/src/cli/install.ts`: **protegido y sin cambios**; se reutilizan `runClaudeInstall()` y sus opciones `home`/`stagePayload`.

**Pruebas:**
- `tests/installer-runtime-menu.test.ts`, grupos `Claude runtime payload` y `Claude runtime runner`: ajustar únicamente el fixture de archive para el manifest obligatorio; añadir rechazo de manifest ausente/incompleto/duplicado o con digest inválido, tipos requeridos inválidos y cleanup; añadir un hand-off real desde un archive temporal producido por `bundleCcEinPayload()` hasta un home aislado, comparando bytes con la fuente canónica.
- `tests/cc-payload-entrypoints.test.ts`, `tests/cc-payload-bundle.test.ts`, `tests/surface-wiring.test.ts` y `tests/release-asset-contract.test.ts`: contratos upstream/de release preservados, sin edición prevista.

### Risks

- Hacer obligatorio y completo el manifest rompe fixtures manuales permisivos y archives generados con una versión anterior; los fixtures afectados deberán emitir el formato v1 real y release deberá regenerar el output desechable.
- El smoke pasará de probar solo extracción a ejecutar el sync completo; una dependencia accidental del checkout, del cwd o del home real quedará expuesta como fallo de distribución.
- `tests/installer-runtime-menu.test.ts` contiene trabajo dirty protegido: cualquier edición deberá limitarse a los grupos indicados y conservar todos los hunks ajenos.

### Rollback

Revertir los cambios acotados de `installer/src/core/cc-payload.ts`, `installer/scripts/cc-payload-smoke.ts` y los casos/fixture añadidos en `tests/installer-runtime-menu.test.ts`. No hay migración de datos ni workflow nuevo que deshacer; los homes de prueba son temporales y `installer/src/assets/cc-ein-runtime.tar.gz` se descarta o regenera, nunca se restaura como fuente.

### Success criteria

- Ningún payload sin manifest v1 completo, con miembro requerido de tipo incorrecto, entrada duplicada/omitida o checksum inválido llega al hand-off; el staging se limpia al fallar.
- Un archive válido se copia desde BunFS a filesystem real sin alterar sus bytes, se extrae y su asset canónico queda validado.
- El hand-off existente instala en `<home>/.claude-ein/assets/orchestrator.md` un fichero regular byte-idéntico al miembro empaquetado y, por composición con el contrato upstream, al canónico.
- El ejecutable compilado del smoke funciona desde `/tmp`, fuera del checkout, y verifica destino y cleanup.
- No cambian `installer/src/cli/install.ts`, el workflow ya cableado ni los contratos upstream protegidos.

## B. Spec

### R1 — Admisión fail-closed del payload

El sistema **MUST** rechazar antes del hand-off todo payload cuyo manifest v1 esté ausente o malformado, no enumere exactamente una vez cada miembro regular extraído, enumere rutas inválidas o inexistentes, no coincida con los SHA-256 staged, o presente un path requerido con tipo incorrecto. El manifest y la copia staging-only del archive no forman parte de su propio inventario.

**Given** un archive con manifest ausente, incompleto, duplicado, fuera del root, con digest inválido o con el asset canónico no regular; **When** `stageCcEinPayload()` lo materializa y valida; **Then** la operación falla, elimina el root temporal y no devuelve una stage utilizable.

### R2 — Materialización portable y paridad staged

El sistema **MUST** copiar los bytes del archive empaquetado, incluido cuando procede de BunFS compilado, a un path real dentro del root temporal antes de extraerlo, y **MUST** conservar los bytes del miembro `ein-pi/agent/assets/orchestrator.md` durante staging.

**Given** el asset BunFS embebido y un cwd no relacionado con el checkout; **When** se crea la stage; **Then** `tar` recibe el archive materializado dentro del root, el asset canónico validado está disponible con sus bytes originales y el cleanup elimina archive y root.

### R3 — Hand-off existente hasta el home aislado

El sistema **MUST** ejecutar el hand-off existente de Claude desde el root staged, con `HOME` y `CC_EIN_HOME` aislados, y **MUST** considerar fallida la instalación si el sync no deja un fichero regular byte-idéntico en `<home>/.claude-ein/assets/orchestrator.md`. El launcher **MUST NOT** adelantarse a un sync fallido.

**Given** un payload válido producido por el bundler existente y un home temporal; **When** `runClaudeInstall()` usa la stage real y ejecuta `bun cc-ein/sync.ts`; **Then** la instalación termina con éxito, el destino prometido es regular y sus bytes coinciden con el asset canónico empaquetado, tras lo cual la stage se limpia.

### R4 — Prueba de distribución compilada

La distribución **MUST** compilar y ejecutar el smoke BunFS ya cableado, y ese smoke **MUST** demostrar la materialización y el hand-off hasta el asset instalado, no solo la presencia de paths extraídos.

**Given** el archive generado por `build:all` y el smoke compilado para Bun Linux x64; **When** el ejecutable se lanza desde `/tmp`; **Then** usa el asset embebido sin checkout adyacente, instala en un home temporal, comprueba paridad y finaliza no-cero ante cualquier ausencia, corrupción o cleanup incompleto.

## C. Decisions

### D1 — El manifest es obligatorio y completo

**Decisión:** sí. `ein-cc-payload-manifest.json` es parte obligatoria de `ein-cc-payload/v1`, y su conjunto de paths deberá corresponder exactamente a los ficheros regulares extraídos (salvo el propio manifest y la copia local del archive), sin duplicados. Cada digest se calcula sobre el fichero staged.

**Razón:** el contrato canónico de transporte ya promete manifest y checksum para el asset, y el bundler ya enumera todos los ficheros staged. Mantenerlo opcional o validar solo el orchestrator permitiría ejecutar `sync.ts` u otro código no autenticado por el manifest. La tolerancia actual solo beneficia fixtures incompletos, no un formato publicado.

### D2 — `cc-payload.ts` posee la admisión; upstream conserva producción e inventario

`installer/src/core/cc-payload.ts` posee materialización, comprobación de tipos requeridos, parsing, completitud, hashes y cleanup. `installer/src/core/cc-payload-inventory.ts` y `installer/scripts/bundle-cc-ein.ts` siguen poseyendo qué se empaqueta y cómo se genera el manifest; no se duplican ni modifican.

Para los paths requeridos, `ein-pi/core` conserva su naturaleza de directorio; los entrypoints, handoff, launcher y `ein-pi/agent/assets/orchestrator.md` deberán ser ficheros regulares. La completitud del manifest cubre además los ficheros descendientes de roots dinámicos.

### D3 — Reutilizar el handler protegido, no crear otro camino

`installer/scripts/cc-payload-smoke.ts` llamará a `runClaudeInstall()` con un home temporal y un wrapper de `stagePayload` que invoque el resolver no-argumento BunFS y capture los bytes staged antes del cleanup. El launcher existente puede escribir únicamente dentro de ese home temporal. No se exporta otro handler, no se replica el comando `bun cc-ein/sync.ts` y no se edita `installer/src/cli/install.ts`.

### D4 — TDD en seams existentes

Con `preflight.json` en `tdd: strict`, el primer RED vive en `tests/installer-runtime-menu.test.ts`:
1. Casos de admisión y cleanup para manifest ausente/incompleto/duplicado, checksum inválido y miembro requerido no regular.
2. Caso de integración que usa `bundleCcEinPayload({ outputPath })` solo como productor upstream, pasa una `stageCcEinPayload()` real a `runClaudeInstall()` y compara buffers en el home aislado.

Después se hace GREEN únicamente en `cc-payload.ts`; la extensión del smoke reutiliza el mismo camino ya cubierto y su aceptación específica es el ejecutable compilado. No se crean dobles de transporte ni un nuevo framework de fixtures.

### D5 — Release no se rediseña

`.github/workflows/installer-release.yml` ya contiene exactamente el build y la ejecución del smoke requeridos. Se preserva sin cambios salvo que la implementación demuestre que el comando existente dejó de invocar el entrypoint; no se añaden jobs, assets, versiones ni publicación local.

### Alternativas rechazadas

- **Manifest opcional para conservar fixtures:** rechazado porque crea dos niveles de confianza en el mismo formato y permite saltarse checksums.
- **Exigir solo una entrada para orchestrator:** rechazado porque el hand-off ejecuta otros miembros del archive; un manifest parcial no es completo ni fail-closed.
- **Reimplementar el sync dentro del smoke:** rechazado porque probaría una ruta distinta de la instalada.
- **Editar `createClaudeInstallHandlers()` o exportarlo:** rechazado; `runClaudeInstall()` ya es el seam público necesario.
- **Mover la prueba a `surface-wiring.test.ts` o duplicar bundling en `cc-payload-bundle.test.ts`:** rechazado porque esas suites poseen los contratos downstream y upstream, no la composición del instalador.

### Boundaries y paths protegidos

- Sin edición: `installer/src/cli/install.ts`, `installer/install.sh`, `installer/src/core/settings.ts`, `installer/src/core/cc-payload-inventory.ts`, `installer/scripts/bundle-cc-ein.ts`, `cc-ein/sync.ts`, `ein-pi/agent/assets/orchestrator.md`, suites upstream y demás dirty paths citados en `scope.md`.
- `tests/installer-runtime-menu.test.ts` solo podrá recibir los cambios focales descritos; no se resetearán, reordenarán ni absorberán hunks previos.
- `installer/src/assets/cc-ein-runtime.tar.gz` sigue siendo output generado y desechable.
- La skill de release se aplica solo para preservar el workflow y prohibir publicación local; Bun, disciplina y arquitectura guían smoke/TDD/seam mínimo. Vitest y Nuxt Modules no aplican porque la suite usa `bun:test` y no hay módulos Nuxt en este cambio.

## D. Success Criteria

### Comprobaciones observables

- Los casos RED/GREEN demuestran rechazo y cleanup para manifest ausente, malformado/incompleto/duplicado, digest incorrecto y miembro canónico no regular.
- Un payload real generado temporalmente atraviesa `stageCcEinPayload()` y `runClaudeInstall()` sin tocar un home real; `assets/orchestrator.md` existe como fichero regular y sus bytes coinciden con `ein-pi/agent/assets/orchestrator.md`.
- El smoke compilado usa el resolver BunFS sin argumento desde un cwd ajeno, ejecuta el hand-off real, compara bytes y confirma cleanup.
- La instalación no declara éxito ni instala launcher después de un fallo de stage/sync.
- No hay cambios en workflow, `install.ts`, bundler, inventario, sync o contenido canónico salvo evidencia concreta de que el seam existente no funciona.

### Verificación requerida

```bash
bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts tests/release-asset-contract.test.ts
bun run typecheck
cd installer && bun run typecheck
```

Smoke compilado, desde `installer/`, con el mismo comando ya presente en release:

```bash
bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke
(cd /tmp && /tmp/ein-cc-payload-smoke)
```

No se ejecutan tests, builds ni typechecks en esta fase de diseño.
