# Design — publish-installer-alpha

## A. Proposal

### Intent

Preparar una publicación determinista de `installer-v0.82.0-alpha.1` y un bootstrap que seleccione esa release exacta, verifique su checksum y entregue al binario un contrato explícito de canal/tag. La instalación resultante debe persistir y leer de vuelta `alpha` únicamente en el límite de la instalación Pi Ein gestionada, manteniendo `stable` como comportamiento por defecto.

### Scope

**Dentro:** clasificación SemVer coherente para push y dispatch; coherencia de tag, versión y changelog; metadata GitHub prerelease; selección exacta de assets y manifest; handoff explícito al binario; persistencia/read-back fail-closed en el `agentDir` Pi resuelto; aislamiento de Claude, runtimes vanilla y clientes; sincronización a `0.82.0-alpha.1`.

**Fuera:** firmas, expiración, promoción o rollback remoto automáticos, rediseño de UI, publicación local/npm y cualquier tag, push, ejecución de workflow o instalación real antes del merge a `main`.

### Affected areas

- `.github/workflows/installer-release.yml`: resolver/clasificador común para push y dispatch, puerta de metadata, prerelease condicional y conservación del main-tip gate.
- `installer/install.sh`: argumentos `--release-channel`/`--release-tag`, URLs exactas vinculadas, checksum previo al handoff y ejecución Pi-only para la selección explícita.
- `installer/src/cli/install.ts` y su entrada en `installer/src/main.ts`: validación del contrato, propagación del canal y commit/read-back en el contexto Pi resuelto.
- `installer/src/core/release-channel-preference.ts`, `release-types.ts` y `release-resolver.ts`: reutilización de vocabulario, normalización y primitiva atómica; no se crea otro almacén.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`: punteros autorizados sincronizados.
- Contratos enfocados en `tests/release-asset-contract.test.ts`, `tests/install-sh-checksum.test.ts`, `tests/installer-runtime-menu.test.ts` y, solo donde aporte aislamiento no cubierto, `tests/release-update-contract.test.ts`/`tests/release-update-cli.test.ts`.

### Risks

- Tres bordes nativos (YAML/Bash, bootstrap Bash y TypeScript) pueden divergir en SemVer si no comparten los mismos vectores de conformidad.
- Una selección exacta podría descargar binario y manifest de releases distintas o entregar al binario un tag diferente si el contrato no se valida como una unidad.
- Un fallo posterior al despliegue pero anterior al read-back puede dejar trabajo recuperable; nunca debe producir marker ni mensaje de éxito.
- El árbol ya contiene cambios solapados; la implementación debe conservar los bytes ajenos y limitarse a estos seams.

### Failure handling

- Tag, canal, combinación canal/tag, versión o changelog inválidos MUST fallar antes de build, publicación, descarga o mutación local, según el borde.
- Descarga ausente, manifest inválido, entrada duplicada, digest distinto o herramienta SHA-256 no disponible MUST impedir instalar o ejecutar el binario.
- El binario MUST rechazar antes del plan mutable un tag que no sea elegible para el canal o cuya versión no coincida con `INSTALLER_VERSION`.
- Un write/read-back no explícito y coincidente MUST hacer fallar `pi.write-install-marker`; no se ejecutan marker, doctor, launcher ni promoción posteriores y el journal queda como evidencia de recuperación. La escritura atómica conserva el fichero previo ante fallo antes del rename.
- Ningún fallo se convierte en `stable` por conveniencia salvo la ausencia de contrato/preferencia, que es el default definido.

### Rollback

Antes de entrega, revertir el cambio de código y los tres punteros restaura el flujo estable anterior. Tras publicar, nunca mover ni force-pushear el tag: una release incorrecta se detiene y se corrige con un nuevo tag desde `main`. Para una instalación local fallida, usar el backup/journal y el restore existente sobre el árbol Pi gestionado; no afirmar rollback remoto ni tocar Claude/clientes.

### Success criteria

La preparación acepta y clasifica `installer-v0.82.0-alpha.1`, mantiene finals como releases normales y conserva el main-tip gate. El bootstrap explícito usa la misma release para binario y checksum, verifica antes de ejecutar y entrega `install --runtime pi --release-channel alpha --release-tag installer-v0.82.0-alpha.1`; el instalador confirma el contrato y persiste/read-back `alpha` en el `agentDir` Pi resuelto sin modificar ningún hogar no objetivo.

### Canonical spec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-release-channels` | `openspec/specs/installer-release-channels/spec.md` | `9232badaf647f2a76e49eb2aa4f70ce48982b340d407ec44665bf3900e0ea240` | 5438 |

La delta aplicada es `openspec/changes/publish-installer-alpha/specs/installer-release-channels/spec.md`; no añade otra referencia canónica.

## B. Spec

### Requirement 1 — Clasificación SemVer/tag

The system MUST accept only canonical publication/bootstrap tags shaped as `installer-v<SemVer 2.0.0>`, classify a tag without prerelease identifiers as `stable`, classify a prerelease only when its first identifier is exactly `alpha`, and reject malformed SemVer or unsupported prerelease vocabularies. Build metadata MAY be accepted as SemVer metadata but MUST NOT change stable/prerelease classification.

**Scenario**

- **Given** the shared conformance vectors include finals, `installer-v0.82.0-alpha.1`, leading-zero forms, `beta`/`rc`, malformed identifiers and optional build metadata,
- **When** workflow shell, bootstrap shell and installer TypeScript boundaries classify them,
- **Then** all boundaries produce the same accept/reject and stable/alpha result, with `installer-v0.82.0-alpha.1` classified as alpha.

### Requirement 2 — Coherent GitHub publication

The system MUST apply the same classifier to tag pushes and `workflow_dispatch`, MUST require the normalized tag version to equal `installer/package.json`, `INSTALLER_VERSION` and the leading changelog release, MUST retain the tagged-commit-equals-main-tip gate and its existing explicit maintenance-hotfix escape hatch, and MUST pass GitHub prerelease metadata only for classified alpha tags.

**Scenario**

- **Given** a push or dispatch requests a final or alpha installer tag,
- **When** the workflow resolves metadata before build/publication,
- **Then** malformed, unsupported or inconsistent input fails; a valid alpha reaches `gh release create --prerelease`; a valid final omits that flag; and both remain subject to the unchanged main-tip guard.

### Requirement 3 — Exact bootstrap acquisition and checksum

The bootstrap MUST treat `--release-channel` and `--release-tag` as one explicit contract: both or neither are present. With the explicit contract, it MUST bind the platform asset and `checksums.txt` to `/releases/download/<exact-tag>/`; without it, it MUST retain `/releases/latest/download` and stable behavior. It MUST verify the selected asset against exactly one matching manifest entry before chmod, move or execution.

**Scenario**

- **Given** `--release-channel alpha --release-tag installer-v0.82.0-alpha.1`,
- **When** the bootstrap acquires the platform artifact,
- **Then** both requests use `/releases/download/installer-v0.82.0-alpha.1/`, checksum verification succeeds before handoff, and no request falls back to `latest`.

### Requirement 4 — Explicit Pi-only binary handoff

The bootstrap MUST pass an accepted explicit contract to the verified binary as `install --runtime pi --release-channel <channel> --release-tag <tag>`. The installer MUST validate canonical tag shape, channel eligibility and agreement with its running `INSTALLER_VERSION` before mutable work. It MUST reject explicit alpha selection for `claude` or `both`; non-executing terminal branches SHOULD print the exact bound Pi command rather than a generic command.

**Scenario**

- **Given** the verified `0.82.0-alpha.1` binary and the explicit alpha contract,
- **When** bootstrap hands off or emits the required manual handoff,
- **Then** only the Pi install route is selected and a mismatched, partial or Claude-targeted contract exits non-success before mutation.

### Requirement 5 — Installation-boundary persistence/read-back

The Pi installer MUST resolve the selected channel to `stable` when no explicit contract exists and otherwise use the validated channel. At `pi.write-install-marker`, it MUST atomically persist through `writeReleaseChannelPreference(context().agentDir, channel)`, consume a matching explicit read-back, and write the marker with that read-back channel instead of hard-coding `stable`. It MUST NOT report success if persistence/read-back is unavailable or mismatched.

**Scenario**

- **Given** a validated alpha install targeting the resolved managed Pi Ein context,
- **When** the marker boundary commits the channel,
- **Then** `release-channel-preference.json` under that exact `agentDir` reads back `alpha`, the marker channel is `alpha`, and a later advisor/update read resolves the same installation as alpha.

### Requirement 6 — Isolation and unchanged default

The system MUST confine explicit alpha persistence and marker mutation to the resolved managed Pi Ein `agentDir` (normally `~/.pi-ein/agent`, preserving the existing managed legacy migration path). It MUST leave `~/.pi/agent` when vanilla, `~/.claude-ein`, vanilla Claude homes and client project settings byte-for-byte unchanged. Absence of explicit bootstrap/install selection MUST continue to resolve stable and preserve the current latest-release bootstrap path.

**Scenario**

- **Given** fixture homes for managed Pi Ein, vanilla Pi, Claude Ein, vanilla Claude and a client with stable settings,
- **When** the exact alpha Pi installation commits and is read on a later run,
- **Then** only the resolved Pi Ein preference/marker reports alpha and every non-target fixture remains byte-for-byte unchanged; a separate no-input run remains stable/latest.

### Requirement 7 — Delivery boundary

The system MUST keep tag creation/push, workflow execution, remote release/asset read-back and real dogfooding installation as post-merge delivery. Local builds MUST NOT be treated as publication.

**Scenario**

- **Given** code preparation and verification are complete but not merged to `main`,
- **When** this change is accepted,
- **Then** no release or installation side effect has occurred; delivery begins only after merge and verifies GitHub prerelease metadata, assets and checksum before the real Pi-only install.

## C. Decisions

### 1. One behavioral classifier, native at each boundary

The canonical external language is exact `installer-v<SemVer>` plus classification: no prerelease means stable; first prerelease identifier exactly `alpha` means alpha; every other prerelease vocabulary is unsupported. One accepted/rejected vector table is the conformance authority used by installer tests to exercise the native Bash and TypeScript boundaries. The workflow remains shell and the installer remains TypeScript; no Bun/Node dependency is introduced into early workflow resolution and no cross-language runtime abstraction is added.

**Trade-off:** the tiny parser shape exists at native boundaries, but executable conformance vectors make drift observable. A generated parser or new shared runtime was rejected as more coupling than this slice earns.

### 2. Channel and tag form one inseparable bootstrap contract

`--release-channel` and `--release-tag` are separate explicit fields but valid only together. This distinguishes release acquisition (`tag`) from installation preference (`channel`) while proving their eligibility relationship. Exact stable tags remain supportable, alpha accepts eligible finals or alpha prereleases per the canonical domain, and the requested alpha delivery uses the exact alpha tag.

A lone `--alpha` shorthand was rejected because it hides which immutable release supplied binary/checksum. A tag-only contract was rejected because it does not explicitly carry installation preference into the binary.

### 3. The verified binary owns managed installation semantics

`install.sh` owns platform selection, exact URLs, checksum verification and handoff only. The binary owns runtime target validation, managed Pi context resolution, preference persistence, marker and journal behavior. The script does not write `~/.pi-ein` itself, and the binary never trusts a release tag that does not match its compiled version.

### 4. Reuse the Pi marker boundary and preference primitive

`pi.write-install-marker` is the existing success boundary after deploy and before doctor/launcher. It owns preference commit/read-back and then marker write using the resolved channel. `release-channel-preference.ts` continues to own atomic file I/O and exact-byte read-back; `paths.ts` continues to own the destination. No new store, process-global channel or Claude preference is introduced.

A separate install-plan entry was rejected because persistence and marker represent one installation commit boundary; splitting them would enlarge journal/recovery semantics without benefit. Conflating preference with marker-only state was rejected because later update/advisor reads already use the installation-scoped preference file.

### 5. Publication metadata and local state remain separate authorities

The workflow owns GitHub prerelease metadata and immutable assets; installer code owns only local installation state. Post-merge verification may compare them, but neither side claims to roll back the other.

### Boundaries

- Workflow resolver: syntax/classification and version-pointer coherence.
- Existing main-tip step: release ancestry policy; unchanged behavior and escape hatch.
- Bootstrap: exact acquisition and checksum, then explicit handoff.
- Install flag parser: complete contract and Pi-only admission before planning/mutation.
- Resolved Pi handler: preference/read-back and marker channel.
- Update/advisor readers: later-run proof only; no new write authority.
- Delivery process: tag/push/Actions/assets/real installation after merge only.

## D. Success Criteria

Acceptance is observable when:

- Strict TDD evidence shows focused tests failed for the new prerelease, exact-tag handoff and Pi preference behavior before production changes, then pass after the implementation.
- A shared conformance matrix proves canonical final/alpha acceptance and malformed, leading-zero, `beta` and `rc` rejection across workflow/bootstrap/TypeScript behavior.
- Workflow contract tests prove push and dispatch validation, three-pointer equality at `0.82.0-alpha.1`, prerelease-only `--prerelease`, unchanged six assets, and main-tip guard ordering/hotfix escape.
- Shell process fixtures prove stable no-input latest URLs; exact alpha asset and checksum URLs; rejection before curl for incomplete/unsupported contracts; checksum before chmod/move/exec; and exact Pi-only binary argv.
- Installer tests prove default stable, alpha/tag/version validation before mutation, atomic preference read-back at the resolved Pi `agentDir`, marker channel from read-back, later-run alpha resolution, fail-closed write/read errors and byte-for-byte non-target isolation.
- Required later verification commands are green: `bun test tests/release-asset-contract.test.ts tests/install-sh-checksum.test.ts tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts`, `bun test`, `bun run typecheck`, and `cd installer && bun run typecheck`.
- No local production build is cited as publication evidence. After merge only, delivery verifies the GitHub Release is prerelease, contains four binaries plus `checksums.txt` and `install.sh`, then performs the exact checksum-bound Pi-only bootstrap and reads back alpha from the managed Pi installation.
