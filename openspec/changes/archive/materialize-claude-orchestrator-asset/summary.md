## // 000. RESUMEN
El asset canónico de Claude ya llega hasta el home instalado: el payload solo se admite si su manifest v1 está completo y verificado, se materializa desde BunFS y el hand-off existente deja `assets/orchestrator.md` byte a byte en el home. El smoke compilado lo demuestra fuera del checkout. El cambio queda listo para cerrar.

## // 001. QUÉ CAMBIÓ
- `installer/src/core/cc-payload.ts`: manifest obligatorio y completo, rutas confinadas y únicas, tipos requeridos fichero-vs-directorio, SHA-256 sobre bytes staged, cleanup en cada rechazo, y prueba de existencia con `statSync` para que el binario compilado pueda resolver su propio payload BunFS.
- `installer/scripts/cc-payload-smoke.ts`: pasa de comprobar extracción a componer el hand-off real contra un home temporal y exigir destino regular, paridad de bytes y cleanup, con exit no-cero en cualquier fallo.
- `tests/installer-runtime-menu.test.ts`: 10 casos de rechazo con verificación de limpieza, el test de composición bundler → stage → `runClaudeInstall()` → home aislado, y el caso fail-closed con stage real.
- `tests/release-asset-contract.test.ts`: el contrato del smoke pasa a exigir hand-off, asset canónico y cleanup en lugar de una llamada interna concreta.
- Sync report: delta `installer-runtime` sincronizada; `added=1`, conflictos 0, result SHA-256 `3682a3d733e201ae5d4922b0be0c52121c746e8bc507443bc82325590bbc0150`.

## // 002. CÓMO FUNCIONA POR DENTRO
`stageCcEinPayload()` es la única frontera de admisión. Resuelve un archive concreto —el embebido por Bun o uno explícito— y copia sus bytes a un path real dentro del root temporal, porque `tar` no sabe leer BunFS. Extrae, comprueba que cada ruta requerida existe con el tipo correcto (`ein-pi/core` directorio, el resto ficheros), y entonces valida el manifest: formato `ein-cc-payload/v1`, entradas bien formadas, rutas confinadas y sin duplicados, y SHA-256 recalculado sobre el fichero staged. Además exige correspondencia exacta entre lo enumerado y los ficheros regulares extraídos, excluyendo solo el manifest y la copia local del archive: nada sin firmar entra en la stage. Cualquier fallo borra el root y no devuelve stage.

Sobre esa stage, `runClaudeInstall()` —intacto— ejecuta `bun cc-ein/sync.ts` con el root staged como cwd y `HOME`/`CC_EIN_HOME` apuntando al home destino, y solo instala el launcher si el sync terminó bien; la stage se limpia en el `finally` del último paso. El sync es quien copia el asset canónico a `<home>/.claude-ein/assets/orchestrator.md`, así que la prueba compara los bytes instalados con los del miembro staged y con el fichero canónico del repo: si alguno de los tres eslabones deja de coincidir, falla.

El smoke compilado repite esa composición desde `/tmp`, sin checkout adyacente, usando el resolver sin argumento. Ahí apareció el defecto real: la existencia se probaba con `realpathSync`, y una ruta `/$bunfs/root/...` responde a `stat` pero no tiene ruta real, así que el instalador compilado no encontraba su propio payload. Cambiar la prueba a `statSync` cierra el circuito sin relajar nada.

## // 003. DECISIONES
- El manifest es obligatorio y su inventario debe ser exacto: un manifest parcial permitiría ejecutar código no autenticado desde la stage.
- La corrección de `realpathSync` se hizo en `cc-payload.ts` pese al límite de fichero del grupo 003, porque el RED compilado demostró que el seam existente no funcionaba; el diseño lo autoriza con evidencia concreta.
- La aserción del contrato de release se reescribió en términos de comportamiento (hand-off, asset, cleanup) en lugar de una llamada interna, coherente con que la limpieza la posee el runner.
- El smoke no reimplementa el sync ni exporta un handler nuevo: reutiliza `runClaudeInstall()` con home temporal.
- El archive generado se regenera, nunca se archiva como fuente.

## // 004. VERIFICACIÓN
- Focal: `bun test tests/cc-payload-entrypoints.test.ts tests/release-asset-contract.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts` — 89/89.
- Suite completa: `bun test` — 2278/2278 en 172 ficheros.
- Typechecks: `bun run typecheck` y `cd installer && bun run typecheck` — PASS.
- Smoke compilado `bun-darwin-arm64` ejecutado desde `/tmp` — exit 0; `bun-linux-x64` compila (ELF x86-64).
- Auditoría de límites y `git diff --check` — PASS; no se crearon commits.

## // 005. PENDIENTE / RIESGOS
- La regresión BunFS solo la detecta el smoke compilado: `bun test` no compila binarios, así que el guardián real es el job de release antes de checksums.
- El smoke compilado pesa 119 MB porque `install.ts` arrastra `template.tar.gz`; es coste de CI, no se publica.
- El test de composición ejecuta el sync real (~3 s): es el test más caro de la suite y se resentirá si `sync.ts` gana trabajo pesado.
- Siguen diferidos los riesgos de parser del bundler (imports relativos fuera de `repoRoot`, imports estáticos side-effect-only); ninguna entrada actual del payload los ejercita.
