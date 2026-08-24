## // 000. RESUMEN
Se preparó la publicación determinista de `installer-v0.82.0-alpha.1`, el bootstrap por tag exacto y la preferencia `alpha` aislada al Pi Ein gestionado. La verificación fresca pasa; la publicación e instalación real siguen deliberadamente fuera de esta fase.

## // 001. QUÉ CAMBIÓ
- `.github/workflows/installer-release.yml`: clasificación SemVer común para push/dispatch, coherencia tag-versión-changelog y `--prerelease` solo para alpha; se conserva la puerta `main` y su escape de hotfix.
- `installer/install.sh`: contrato inseparable `--release-channel` + `--release-tag`, URLs exactas para binario y `checksums.txt`, verificación previa al handoff y comportamiento estable/latest sin selección explícita.
- `installer/src/main.ts`, `release-types.ts`, `release-resolver.ts`: admisión fail-closed del contrato y restricción alpha al runtime Pi.
- `installer/src/cli/install.ts`: persistencia/read-back atómico de canal en el `agentDir` Pi resuelto y marker derivado del valor leído.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`: punteros sincronizados a `0.82.0-alpha.1`.
- Tests y fixtures de release, bootstrap, runtime, aislamiento, updater y backup actualizados; el cleanup de fixtures de manifest-backup recupera árboles protegidos stale.

## // 002. CÓMO FUNCIONA POR DENTRO
Workflow, shell y TypeScript aplican el mismo contrato: tag canónico `installer-v<SemVer>`, estable sin prerelease y alpha solo con primer identificador `alpha`. El workflow valida coherencia antes de compilar/publicar; el bootstrap usa una única base exacta para binario y checksum, verifica el digest y entrega los argumentos al binario. El instalador valida canal/tag/versión antes de mutar, resuelve el `agentDir` Pi, persiste atómicamente y exige read-back coincidente antes de escribir marker o continuar. Lectores de update/advisor recuperan después esa preferencia; hogares Claude, vanilla y clientes quedan aislados.

## // 003. DECISIONES
- Se reutilizó `release-channel-preference.ts` y el límite existente `pi.write-install-marker`, sin nuevo store ni estado global.
- Canal y tag forman un contrato único para impedir mezclar binario/checksum o caer silenciosamente en `latest`.
- La publicación permanece en GitHub Actions; no se añadió publicación local/npm ni build como evidencia de release.
- La limpieza de manifest-backup restaura permisos del árbol `omarchy-target` antes de borrarlo: una ejecución interrumpida lo dejó en modo `000`, causando los 35 fallos posteriores.

## // 004. VERIFICACIÓN
- Strict TDD: **pass**, con evidencia RED/GREEN/TRIANGULATE/REFACTOR para todos los seams y fixtures actuales.
- Focos: release 13, checksum 22, runtime 43, persistencia/update 88, ladder 123, remediaciones 27 y backup 34; todos pasan.
- `bun run typecheck`, `cd installer && bun run typecheck`, `bun test` y `bun test tests/` pasan: 2414 tests, 0 fallos, 10091 assertions.
- Cleaner/Architect no estuvieron disponibles por selectores no soportados; es una ausencia advisory y no bloquea la verificación mecánica.

## // 005. PENDIENTE / RIESGOS
- Tras merge a `main`: crear/push del tag inmutable, esperar Actions, comprobar prerelease, assets y checksums, y ejecutar/read-back de la instalación Pi real.
- No se hicieron tag, publicación, red, build de producción ni instalación real; ese es el límite residual de entrega post-merge.
