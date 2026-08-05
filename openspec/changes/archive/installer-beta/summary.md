## // 000. RESUMEN
Entrega verificada del instalador 0.41.0: selección no interactiva de runtime, E2E Pi/Claude reproducible, contrato de versión macOS/Linux y metadatos sincronizados. La cobertura es parcial por límites explícitos de entorno y una rama sin aserción directa.

## // 001. QUÉ CAMBIÓ
- `installer/src/cli/install.ts`: `--runtime pi|claude|both`, rechazo fail-closed y default Pi; conserva la selección interactiva.
- `e2e/docker-test.sh`: escenarios aislados para entrada inválida, Pi, Claude y ambos, con reruns e idempotencia.
- `installer/src/main.ts`, `installer/src/core/version.ts`, `installer/scripts/build-all.ts` y contratos de tests: identidad SemVer común y probe independiente `template-version`.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`: punteros alineados en `0.41.0`.
- `tests/installer-runtime-menu.test.ts`, `tests/updater-cli-entrypoints.test.ts`, `tests/release-update-cli.test.ts`, `tests/release-asset-contract.test.ts` y `tests/readme-release-ia.test.ts`: cobertura TDD y contratos actualizados.

## // 002. CÓMO FUNCIONA POR DENTRO
`runInstall` valida primero la gramática separada de `--runtime` y resuelve target explícito de menú, runtime CLI o Pi por defecto antes de preparar Bun. El orquestador reutilizado prepara Bun una vez, ejecuta Pi antes de Claude para `both`, continúa tras fallo de Pi y agrega el fallo. Docker compila un binario Linux y ejecuta cuatro contenedores limpios; los casos válidos se repiten y comprueban artefactos, ausencia de runtime no seleccionado y orden. La versión pública sale de `INSTALLER_VERSION`; el probe embebido mantiene `template-version`.

## // 003. DECISIONES
- Se reutilizaron los seams existentes de parser, menú, runners y orquestador; no se creó una segunda arquitectura.
- La preparación se detuvo en los tres punteros locales de versión; no se modificaron workflows, tags ni publicación.
- El digest E2E excluye solo el formato variable de `settings.json`, conservando las comprobaciones funcionales y de seguridad.
- El cross-build Darwin estático no se trató como ejecución nativa macOS.

## // 004. VERIFICACIÓN
- Strict TDD documentado RED/GREEN/TRIANGULATE/REFACTOR en `apply-progress.md`; suite completa: 1074 tests, 3537 expectativas, 0 fallos.
- Pasaron suites enfocadas, regresiones de checksum/escrituras/backup/deploy/deps (61 tests, 457 expectativas), typecheck y `./e2e/docker-test.sh`.
- Build Darwin x64 produjo Mach-O y comprobó estáticamente identidad 0.41.0; punteros package/source/changelog: `0.41.0`.
- `verify-report.md` sincronizado: PASS local, cobertura parcial.

## // 005. PENDIENTE / RIESGOS
- No se ejecutó binario nativo macOS; falta esa comprobación si hay runner disponible.
- Falta aserción directa de fallo/excepción en preparación compartida de Bun.
- Publicación no autorizada y no realizada: después del cierre, orden: commit/PR y revisión, dispatch E2E real, comprobación nativa macOS si disponible y autorización explícita de release.
