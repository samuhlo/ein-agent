# MAP — release-update-semantics

status: partial
scope_status: bounded
change: release-update-semantics
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget_exceeded: true

## Alcance mapeado

La exploración se detuvo al superar el presupuesto de 15.000 tokens. Este mapa cubre el camino actual confirmado, sus bordes de publicación/arranque y las pruebas localizadas; quedan sin lectura directa los cuerpos completos de `deploy.ts`, `backup.ts`, `main.ts`, `banner.ts` y los tests listados. Las afirmaciones marcadas como **pregunta de diseño** no son requisitos ni propuestas de implementación.

## Máquina actual confirmada

### Entrada CLI y despacho

- `installer/src/main.ts:32` separa `process.argv.slice(2)` en `[cmd, ...rest]`; `main.ts:38` despacha `update` a `runUpdate(rest)`.
- `runUpdate(args)` (`installer/src/cli/update.ts:19`) reconoce únicamente `--yes`/`-y` y `--dry-run`. No hay parser de selector de versión: cualquier argumento de versión no tiene semántica actual.
- Si falta `AGENT_DIR`, sale `1` antes de mutar. Lee el marker y muestra `marker.version` junto al `INSTALLER_VERSION` compilado.
- El dry-run sólo lee el manifiesto de la plantilla incorporada (`readBundledManifest`) y describe redeploy/actualización de Pi; sale `0`, sin resolver ni descargar una release.

### Flujo de `runUpdate`

1. `detectPlatform()` selecciona la plataforma.
2. `snapshot("pre-update")` crea/reutiliza un backup de `AGENT_DIR`.
3. `deployTemplate(platform)` redeploya la plantilla **embebida en el binario actualmente ejecutado**.
4. Si el deploy lanza, `restoreBackup(backup.path)` intenta volver al backup y el comando retorna `1`; si el rollback falla, sólo advierte una restauración manual, pero también retorna `1`.
5. Con `--yes` o confirmación interactiva, `installPi()` actualiza la dependencia Pi. Después siempre llama `installDeclaredPackages()`.
6. `writeMarker(marker?.channel ?? "stable")` escribe la identidad del binario local, no una release resuelta.
7. Ejecuta `runDoctor(platform)`, presenta `renderReport(report)`, y recién entonces llama `latestInstallerTag()` para avisar que existe un instalador más nuevo. El aviso recomienda `curl|bash`; no reemplaza el ejecutable.
8. Devuelve `1` sólo si Doctor da `FAIL`; en otro caso devuelve `0` y dice «Ein actualizado».

**Invariante rota confirmada:** `deployTemplate` procede de la release/binario viejo, `writeMarker` persiste `INSTALLER_VERSION` estático (`0.18.0`), y la consulta de latest es posterior y best-effort. Por ello el código puede comunicar éxito sin que binario, plantilla, marker y latest coincidan.

### Resolución, red, assets y procedencia actuales

- `INSTALLER_VERSION = "0.18.0"` y `INSTALLER_REPO = process.env.EIN_INSTALLER_REPO ?? "samuhlo/ein-agent"` viven en `installer/src/core/version.ts:11-14`.
- `latestInstallerTag()` (`version.ts:42-54`) ejecuta `run("curl", ["-fsSL", "https://api.github.com/repos/${INSTALLER_REPO}/releases/latest"])`, parsea sólo `tag_name` y devuelve `null` ante fallo de subprocess o JSON. No resuelve assets, una versión explícita, elegibilidad, redirects, ni checksum/provenance.
- El updater no descarga binario ni checksum y no tiene verificación de bytes. La única fuente de plantilla en el flujo es la incorporada.
- `installer/src/assets.d.ts:1-6` documenta que Bun incorpora archivos `.tar.gz` al binario compilado; es el mecanismo que hace que el redeploy use material del ejecutable actual.

### Publicación y bootstrap

- `.github/workflows/installer-release.yml` se activa en tags `installer-v*` (o manual), instala con Bun, hace typecheck y `build:all`, y publica cuatro assets: `ein-installer-darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, además de `checksums.txt` e `install.sh`.
- El workflow produce `checksums.txt` con `sha256sum ein-installer-* > checksums.txt`; es el contrato de nombres existente que puede usarse para fixtures, pero actualmente no declara firma, attestation ni otra procedencia.
- `installer/install.sh` es el único downloader actual. Para latest construye `https://github.com/${REPO}/releases/latest/download/${ASSET}` y el URL equivalente de `checksums.txt`.
- Bootstrap mapea Darwin/Linux y `arm64|aarch64`/`x86_64|amd64`; rechaza los demás. Detecta WSL sólo para informar y usa la build Linux. Instala en `/usr/local/bin` si es escribible o `${HOME}/.local/bin` en caso contrario.
- Bootstrap descarga a `mktemp -d`, hace `chmod 755` y `mv` sobre `${INSTALL_DIR}/ein`. La comprobación de checksum es opcional: si no se puede descargar `checksums.txt`, o no se encuentra la entrada del asset, continúa; sólo falla si existe un checksum esperado y no coincide. Esto no satisface el fail-closed pedido para el updater.
- Cuando se invoca por pipe, bootstrap reabre `/dev/tty` sólo en Linux; en macOS no ejecuta el binario automáticamente para evitar el bloqueo conocido de kqueue/Bun.

### Estado desplegado, backup y atomicidad

- `AGENT_DIR` es el árbol comprobado y respaldado; el marker es `INSTALL_MARKER` (`~/.pi/agent/.ein-install.json`, según el encabezado de `version.ts`).
- `InstallMarker` contiene sólo `{ version, installedAt, channel }`. `readMarker()` devuelve `null` si no existe o no se puede parsear. `writeMarker()` sincronamente sobrescribe el archivo con `version: INSTALLER_VERSION`, fecha y canal.
- `snapshot` (`installer/src/core/backup.ts:224`) y `restoreBackup` (`:267`) son la protección existente. `runUpdate` sólo los encierra alrededor de `deployTemplate`; la actualización de Pi, paquetes, marker y Doctor quedan fuera de la transacción/rollback.
- El comentario de `update.ts:62-64` confirma que el deploy borra directorios de plantilla antes de extraer y que el backup excluye estado de usuario (auth/secrets/sesiones). El rollback actual protege el árbol de agente, no el binario autoejecutable ni una identidad de release descargada.
- No se encontró referencia del código de installer a `process.execPath` ni `Bun.main`; por tanto no hay ubicación/reemplazo autónomo del binario implementado en las fuentes halladas. La sustitución actual del ejecutable ocurre sólo en shell bootstrap mediante `mv`.

### Consumidores de versión/marker y radio de impacto

- `readMarker` tiene dos callers, incluido `runUpdate`; `INSTALLER_VERSION` tiene cuatro callers: `runUpdate`, `main.ts`, `installer/src/tui/banner.ts` y `version.ts`.
- El banner consume la versión/marker según el baseline de scope; hay que leer su cuerpo en diseño antes de fijar el contrato de presentación.
- `runDoctor` tiene seis callers (`doctor`, `install`, `update` entre ellos). Sus comprobaciones verifican estructura de `AGENT_DIR`, archivos y extensiones, no identidad de release/ejecutable/checksum en la porción leída.
- `installDeclaredPackages` e `installPi` tienen cuatro callers (`install` y `update`). Son una costura de subprocess/package manager distinta de la release del installer; `runUpdate` no comprueba su `ok` antes de continuar, sólo muestra `detail`.
- No se encontró clasificación de ownership, metadata de gestor externo ni una salida específica para instalación package-manager-owned. El bootstrap elige ruta por permisos, lo cual es insuficiente como señal de ownership según scope.

## Grafo y contratos de datos

```text
argv -> main dispatch -> runUpdate(args)
runUpdate -> detectPlatform
          -> readMarker -> InstallMarker | null
          -> snapshot("pre-update") -> SnapshotResult { path, deduped, pruned, ... }
          -> deployTemplate(platform) -> DeployResult { engramFound, engramCommand, ... }
          -> [error] restoreBackup(path)
          -> installPi() / installDeclaredPackages() -> resultado { ok, detail, ... }
          -> writeMarker(channel) -> InstallMarker(version = INSTALLER_VERSION)
          -> runDoctor(platform) -> DoctorReport.result
          -> latestInstallerTag() -> curl GitHub API -> tag | null
```

El flujo de release publicado es independiente:

```text
tag installer-v* -> build:all -> ein-installer-{darwin|linux}-{arm64|x64}
                 -> sha256sum -> checksums.txt -> GitHub release
curl|bash bootstrap -> latest/download/{asset,checksums.txt} -> mv -> ein
```

## Costuras testeables y ramas de plataforma

- **Puras/inyectables:** parseo de selector, normalización tag-versión, selección asset por OS/arch, parsing estricto de checksums, clasificación de ownership, máquina de estados/resultados y formato de salida. No existen todavía como unidades confirmadas.
- **Red:** `run`/`curl` de `latestInstallerTag`; HTTP API/release assets/checksum, JSON inválido, redirects, HTTP/timeout/truncado y credenciales son seams que requieren inyección/mock antes de pruebas focalizadas.
- **Filesystem:** directorio staging, ejecutable destino, bundle/template, marker, backup y restore. Deben permitir fallos inyectados antes/después de cada reemplazo y de la escritura del marker.
- **Subprocess:** `run` para curl y dependencias (`installPi`, paquetes); sus efectos no deben confundirse con una actualización de release del installer.
- **Plataformas confirmadas:** bootstrap Darwin/Linux × arm64/x64, con aliases aarch64/amd64 y rama WSL. La equivalencia de `detectPlatform()` de TypeScript y la estrategia de reemplazo del ejecutable siguen pendientes de lectura directa.

## Cobertura actual y huecos

Localizadas:

- `tests/installer-backup.test.ts`: snapshot/dedup/prune/pin y usos `pre-update`.
- `tests/deploy-clean-managed.test.ts`: limpieza de directorios gestionados.
- `tests/deploy-settings.test.ts`: preservación de settings de usuario durante deploy (regresión histórica de update).
- `tests/install-sh-wsl.test.ts`: contenido/comportamiento de rama WSL del bootstrap.
- `e2e/docker-test.sh`: construye target Linux y sólo ejecuta `ein update --dry-run`; también inspecciona backup y `ein --version`.

No se localizaron pruebas que cubran `runUpdate`, `readMarker`/`writeMarker`, `latestInstallerTag`, descarga de release, selector explícito, asset/checksum binding, reemplazo del propio binario, ownership externo, ni la secuencia completa marker/binario/template. El codegraph también informa «no covering tests» para `runUpdate`, `Platform`, `run` y `BackupPaths`.

La matriz posterior debe demostrar tanto identidad objetivo tras éxito como preservación de identidad previa tras cada fallo; texto/exit code solo no basta. Incluye latest y explícita no-latest, ya-current coherente, marker coincidente/incoherente, API/HTTP/timeout/truncado, asset/checksum ausente o mismatch, OS/arch no soportado, fallo de staging/reemplazo/marker/rollback/interrupción y owner externo.

## Preguntas de diseño (no confirmadas)

1. Fuente autoritativa y regla de elegibilidad para latest/versión explícita; el API actual sólo entrega `tag_name` de latest.
2. Normalización aceptada entre selector y tags `installer-v*`, soporte de downgrade y definición de «published/supported».
3. Cómo establecer procedencia fuerte sobre `checksums.txt` (el workflow sólo publica SHA-256) y reglas exactas de redirects/trust/auth.
4. Inventario final de artefactos y el mínimo protocolo atómico para binario, template, marker, staging y rollback, incluido señal/interrupción.
5. Forma fiable de localizar el ejecutable en ejecución, preservar permisos/links y sustituirlo de forma segura en Darwin/Linux.
6. Esquema/versionado/migración del marker para identidad, coherencia y ownership, sin inferir owner por path.
7. Resultado público y compatibilidad de códigos para `updated`, `already current`, `blocked by external owner`, fallo y rollback-failed.
8. Límite de responsabilidad entre el release updater y `installPi`/paquetes declarados; hoy están acoplados en `runUpdate`.

## Conjunto esperado de archivos y forecast

**Producción probable:** `installer/src/cli/update.ts`, `installer/src/core/version.ts`, `installer/src/main.ts`, `installer/src/core/paths.ts`, `installer/src/core/deploy.ts`, `installer/src/core/backup.ts`, `installer/src/core/exec.ts`, `installer/src/tui/banner.ts`; posiblemente módulos nuevos y acotados de release-resolution/acquisition/ownership/transaction. `installer/install.sh` y `.github/workflows/installer-release.yml` sólo si el contrato de publicación exige un ajuste mínimo; la scope excluye una reescritura/publicación.

**Pruebas probables:** nuevos unit tests de selector/release/checksum/ownership/resultados; integración de HTTP y filesystem transaction; extensiones a `installer-backup`, deploy y bootstrap; e2e instalada. Fixtures de forma de assets/workflow sin publicar releases.

**Forecast:** alto riesgo de superar 400 líneas de producción si resolución, verificación, sustitución del binario, marker versionado y rollback se implementan en un solo corte. La delimitación de scope ya sugiere tres work units (contrato/resolución+owner; adquisición verificada+transacción; matriz observable); conservarlas como unidades revisables y medir el diff antes de delivery. Las líneas de test serán sustanciales y se reportan por separado.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1200 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 128, estimated_tokens: 1600 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/work-unit-commits/SKILL.md", lines: 84, estimated_tokens: 950 }
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/bun/SKILL.md", lines: 150, estimated_tokens: 1900 }
    - { path: "openspec/changes/release-update-semantics/scope.md", lines: 451, estimated_tokens: 5000 }
    - { path: "codegraph explore: updater machine", lines: 380, estimated_tokens: 4500 }
    - { path: "codegraph explore: runUpdate callees", lines: 330, estimated_tokens: 3900 }
    - { path: ".github/workflows/installer-release.yml", lines: 47, estimated_tokens: 600 }
    - { path: "installer/install.sh", lines: 131, estimated_tokens: 1900 }
    - { path: "installer/package.json", lines: 21, estimated_tokens: 250 }
    - { path: "grep tests update/installer/marker/banner", lines: 16, estimated_tokens: 250 }
    - { path: "grep e2e update/installer/marker/banner", lines: 12, estimated_tokens: 150 }
    - { path: "grep installer updater symbols", lines: 100, estimated_tokens: 1400 }
  webfetch_used: false
  budget_consumed: { tokens: 23600, reads: 13 }

Siguiente fase recomendada: `sdd-design`, comenzando por completar únicamente las lecturas directas pendientes que esta ejecución no pudo asumir dentro del presupuesto y fijar los contratos sin diseñar Homebrew.
