## // 000. RESUMEN
Se endurecieron las escrituras de secretos y del bloque Context7 en `installer/src/core/secrets.ts`: validación no-follow, publicación atómica y errores observables. También se corrigió tardíamente `hasSecret` para no leer objetivos inseguros.

## // 001. QUÉ CAMBIÓ
- `writeSecret`: valores recortados + una nueva línea, no-op para vacío, archivos `0600` y reemplazo atómico.
- `ensureContext7Export`: bloques POSIX/Fish compatibles, preservación de bytes y modos, idempotencia del sentinel y publicación atómica.
- Validación de padres y destinos mediante `lstat`: se rechazan symlinks, directorios, FIFO y otros objetos no regulares.
- `hasSecret`: clasifica el destino sin seguir symlinks y devuelve `false` para objetivos ausentes o inseguros.
- `tests/installer-safe-secret-writes.test.ts`: cobertura estricta de fallos, modos, residuos temporales, referentes y compatibilidad RC.

## // 002. CÓMO FUNCIONA POR DENTRO
Un núcleo privado de escritura recibe operaciones FS inyectables, crea temporales exclusivos en el mismo directorio con `0600`, escribe completamente, hace fsync/close, revalida padre y destino, y renombra atómicamente. Solo se acepta un destino regular existente o ausente; las lecturas RC usan descriptor no-follow e identidad. Los fallos conservan el destino original y limpian únicamente temporales propios. `hasSecret` aplica clasificación no-follow antes de leer.

## // 003. DECISIONES
- Se reutilizó un único núcleo acotado en `secrets.ts`, sin crear una abstracción FS general.
- Se mantuvieron formato secreto, sentinel, detección de shell, contenido RC y propagación de errores de los callers.
- Se excluyeron cifrado/keyring, migración de formato, checksum/tar/release/CI/E2E y primitivas nativas descriptor-relative.
- Permanece explícitamente el límite TOCTOU basado en rutas entre la última validación y `rename`; eliminarlo requiere primitivas nativas fuera de alcance.

## // 004. VERIFICACIÓN
- Strict-TDD RED/GREEN/TRIANGULATE/REFACTOR registrado en `apply-progress.md`, incluido el fix tardío de `hasSecret`.
- Suite enfocada: 27 tests, 165 assertions — PASS.
- Regresiones adyacentes: 29 tests, 104 assertions — PASS.
- Suite completa: 1.000 tests, 3.224 assertions en 87 archivos — PASS.
- `cd installer && bun run typecheck` — PASS.

## // 005. PENDIENTE / RIESGOS
- Ningún blocker. Riesgo residual advisory: sustitución de padre/destino en la ventana path-based TOCTOU antes de `rename`.
- No se ejecutaron build de producción, red, Docker ni instalación real.
