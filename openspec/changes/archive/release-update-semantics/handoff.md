# Handoff — release-update-semantics

> Contexto para los siguientes cambios (`homebrew-install-channel`,
> `readme-release-ia`). Documento factual, no renegocia el diseño ni añade
> comportamiento. Cita los artefactos verificados y deja explícitas las
> limitaciones y no-claims que los consumidores deben respetar.

## Verified artifacts

- Diseño aceptado: `openspec/changes/release-update-semantics/design.md`.
  Secciones relevantes: §B (Identity model + R1–R12), §C (decisiones y
  arquitectura), §D (criterios observables).
- Tareas cerradas `// 001`–`// 006`: `openspec/changes/release-update-semantics/tasks.md`.
  Las casillas del grupo `// 006` son la evidencia de que las nuevas capas
  de tests y este handoff están terminados.
- Progreso del apply: `openspec/changes/release-update-semantics/apply-progress.md`.
  Estado: `complete`. Cambios productivos listados al pie; ledger de líneas
  productoras/tests en la sección *Budget and ledger*.
- Tests de integración: `tests/release-update-integration.test.ts` —
  compone todos los módulos `// 001`–`// 005` sobre `caps` falsos, sin red,
  sin publicación, sin reemplazo del proceso de test.
- Tests de contrato de assets: `tests/release-asset-contract.test.ts` —
  pinea el workflow `.github/workflows/installer-release.yml` y el script
  `installer/scripts/build-all.ts` contra `asset-selector.ts` y
  `checksum.ts` leyendo sus archivos como texto.
- Suites previas que continúan verdes: `tests/release-update-contract.test.ts`,
  `tests/release-update-acquisition.test.ts`, `tests/release-update-exec.test.ts`,
  `tests/release-update-transaction.test.ts`, `tests/release-update-cli.test.ts`,
  `tests/installer-backup.test.ts`, `tests/deploy-clean-managed.test.ts`,
  `tests/deploy-settings.test.ts`.

## Stable inputs for homebrew-install-channel

El consumidor (`homebrew-install-channel`) **debe** consumir:

- **Esquema de marker v2.** Campos requeridos en un marker externo válido:
  `schemaVersion: 2`, `version`, `releaseTag`, `binaryVersion`,
  `templateVersion`, `installedAt`, `channel`, `owner`, `asset.assetName`,
  `asset.sha256`. El campo `owner` distingue `standalone` y
  `package-manager`; un marker externo debe escribir explícitamente
  `owner={type:"package-manager", manager:"<nombre>"}`.
- **Inventario de artefactos administrados.** El binario, los directorios
  del template (lista `MANAGED_DIRS` en `installer/src/core/deploy.ts`),
  `.ein-install.json`, el candidato de ejecutable y su backup, el snapshot
  de la transacción y el journal durable `.ein-update-journal.json` son
  updater-owned. Las credenciales, sesiones, backups, `auth.json` y
  `skills/downloaded/` permanecen user/runtime-owned.
- **Comportamiento de bloqueo externo.** Ante
  `owner={type:"package-manager", manager:"<nombre>"}` y un target que
  difiere del binario en ejecución, `ein update` devuelve
  `blocked-external-owner` (exit `2`), nombra el `manager` en la salida y
  rechaza reemplazar ejecutable, template y marker.
- **Reparación segura cuando el binario coincide.** Si el target resuelto
  es el mismo release que el binario en ejecución, el updater puede
  transaccionalmente reparar el template desde el template embebido de
  ese binario (regla `R9`, diseño §B). El canal debe documentar este
  camino para que Homebrew pueda invocarlo tras actualizar su binario.
- **Contrato de release, asset y checksum.** La fuente autoritativa es
  `installer/src/core/release-record.ts` (endpoints `latest` y por tag),
  `installer/src/core/asset-selector.ts` (cuatro assets publicados:
  `ein-installer-{darwin|linux}-{arm64|x64}`) y
  `installer/src/core/checksum.ts` (líneas GNU `<sha256>  <asset>`; el
  workflow actual no emite formato BSD con `*`).
- **Banner e identidad de versión.** El subtítulo `v…` se deriva del
  `marker.version` committed; el banner nunca vuelve a usar
  `INSTALLER_VERSION` como verdad de estado instalado.
- **Contrato de resultados y exit codes** (ver `installer/src/cli/result.ts`):
  `EXIT_UPDATED=0`, `EXIT_ALREADY_CURRENT=0`, `EXIT_DRY_RUN=0`,
  `EXIT_BLOCKED_EXTERNAL_OWNER=2`, `EXIT_FAILED=1`.
- **Límites de recuperación.** Una transacción interrumpida deja un
  journal bajo `BACKUP_DIR/.ein-update-journal.json` y bloquea cualquier
  nuevo update con `recovery-required` hasta que se ejecute el helper de
  recuperación.

## Stable inputs for readme-release-ia

El consumidor (`readme-release-ia`) **debe** citar, y solo citar:

- Sintaxis verificada del selector: `ein update`, `ein update latest`,
  `ein update X.Y.Z`, `ein update vX.Y.Z`, `ein update installer-vX.Y.Z`.
  Versiones malformadas, `^`, `~`, rangos, SHAs, drafts y prereleases
  fallan antes de cualquier mutación.
- Comportamiento de elegibilidad: `latest` resuelve el último release
  no-draft y no-prerelease elegible; `latest` nunca degrada.
- Resultados y exits observados (ver `installer/src/cli/result.ts`):
  `updated`, `already-current`, `dry-run`, `blocked-external-owner`,
  `failed`. Códigos numéricos: `0` para `updated`, `already-current` y
  `dry-run`; `2` para `blocked-external-owner`; `1` para `failed`.
- Garantía de procedencia y su **limitación**: la identidad se verifica
  con la SHA-256 publicada por GitHub Releases en el mismo release. **No
  es** firma criptográfica ni atestación publisher-independent.
- Versión mostrada por el banner: `marker.version` cuando hay marker
  committed, `recovery required` ante journal pendiente, `unverified` o
  `legacy v<version> (unverified)` en marcadores antiguos.
- Comportamiento de rechazo externo: para `owner=package-manager`, el
  updater se niega a reemplazar el binario y dirige al usuario al
  gestor de paquetes (`manager`); no promete Homebrew específico.
- Comportamiento de recuperación: tras una interrupción post-replacement,
  el siguiente `ein update` detecta el journal y devuelve
  `recovery-required`; el usuario debe correr el helper de recuperación
  antes de continuar.

## Remaining limitations

- **Provenance = GitHub + SHA-256.** No hay firma publisher-independent
  ni atestación reproducible; un compromiso del publisher invalida la
  garantía. El diseño §A lo declara como limitación explícita.
- **Atomicidad real = per-artifact.** `rename(2)` es atómico solo dentro
  de un mismo filesystem; un ejecutable en `tmpdir()` no puede renombrarse
  sobre un destino en otro filesystem sin migrar el staging al directorio
  destino. La transacción mitiga esto snapshotando bytes en `BACKUP_DIR`.
- **No hay Pi ni declared packages dentro de la release transaction.**
  Esos efectos externos no son rollback-safe y siguen viviendo en sus
  propios flujos (`install.ts`, mantenimiento de packages).
- **Adquisición antes de coerencia.** La transacción actual descarga y
  verifica bytes antes de evaluar coherencia del marker; cuando la
  instalación ya está al día se ejecuta una verificación que no muta
  estado. Es un punto de eficiencia conocido, no un fallo de seguridad.
- **Marker v2 = authoritative; v1 = migration-only.** Readers antiguos
  pueden seguir parseando `version`/`installedAt`/`channel`, pero el
  ownership solo lo decide el campo `owner` del marker v2.
- **WSL mapping = linux-x64.** `asset-selector.ts` resuelve WSL a
  `ein-installer-linux-x64`. Cualquier arquitectura WSL no-x64 falla
  cerrada con `unsupported-arch`.

## Rollback state

- Estado actual del repo: `HEAD` `06f6a92` en `main`, sincronizado con
  `origin/main`. Los artefactos untracked y modificados de los grupos
  `// 001`–`// 005` se preservan intactos; el grupo `// 006` no toca
  producción.
- `apply-progress.md` se actualiza a `status: complete` al cierre de
  este grupo, con la lista exacta de archivos cambiados, comandos de
  verificación y ledger productoras/tests.
- Si un cambio posterior descubre un defecto en los grupos `// 001`–`// 005`:
  1. No ampliar el scope de este handoff; abrir una nueva propuesta SDD.
  2. Mantener `release-types.ts`, `update-caps.ts` y los markers v2
     compatibles con los tests de `tests/release-update-contract.test.ts`
     y `tests/release-update-integration.test.ts`.
- Si se descarta la propuesta: `rm openspec/changes/release-update-semantics/handoff.md`
  no invalida los tests ni la transacción; el código permanece hasta que
  otra propuesta decida retirarlo.

## Explicit non-claims

Este handoff **no** afirma:

- **No existe** tap o fórmula de Homebrew para Ein. `homebrew-install-channel`
  sigue siendo un cambio futuro; este handoff solo expone los puntos de
  contrato estables para que ese cambio los consuma.
- **No existe** firma criptográfica publisher-independent ni atestación
  reproducible. La procedencia es GitHub + SHA-256, declarada como
  limitación arriba.
- **No se ha modificado** `README.md`, `EIN.md` curado, banner público,
  `install.sh`, `.github/workflows/installer-release.yml`, ni el script
  `installer/scripts/build-all.ts`. Cualquiera de esos cambios pertenece
  a una propuesta SDD separada (por ejemplo, `readme-release-ia`).
- **No se ha publicado** ningún release; ningún tag `installer-v*` ha
  sido creado ni enviado a GitHub Releases durante este apply.
- **No se ha tocado** el ejecutable de test activo: los tests usan caps
  falsos y `process.execPath`/`process.argv0` se comprueban idénticos
  antes y después del run.
- **No se ha migrado** Pi/`installDeclaredPackages` dentro de la release
  transaction; esos flujos siguen separados por diseño §C.
