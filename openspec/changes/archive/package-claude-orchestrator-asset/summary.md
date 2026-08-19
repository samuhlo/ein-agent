## // 000. RESUMEN
Se completó el transporte del asset canónico de Claude `ein-pi/agent/assets/orchestrator.md`, sin materializarlo ni entregarlo al runtime. El cambio queda listo para cerrar.

## // 001. QUÉ CAMBIÓ
- `installer/src/core/cc-payload-inventory.ts`: inventario directo y required path reutilizan una única ruta canónica.
- `installer/scripts/bundle-cc-ein.ts`: staging parametrizable, copia byte a byte, manifest y archive temporal.
- `tests/cc-payload-bundle.test.ts`: verifica miembro, bytes, digest y entradas inválidas.
- `tests/cc-payload-entrypoints.test.ts` y `tests/installer-runtime-menu.test.ts`: contrato y fixture de payload actualizados.
- Sync report: delta `claude-payload-transport` sincronizada; `added=1`, conflictos 0, result SHA-256 `a7a3b989d797f3d3cbcbaabba504346307d25ecd7c9b7893abe15b0d3a7c6234`.

## // 002. CÓMO FUNCIONA POR DENTRO
El inventario declara `ein-pi/agent/assets/orchestrator.md` como fichero directo y ruta requerida, sin transportar todo `ein-pi/agent`. El bundler valida que la fuente exista, sea regular y legible; la copia conserva sus bytes y llega al archive como miembro `ein-pi/agent/assets/orchestrator.md`. Tras el staging, calcula SHA-256 sobre los bytes staged, escribe `ein-cc-payload-manifest.json` y genera el tar. Una fuente ausente, directorio o ilegible falla de forma cerrada antes de producir un payload utilizable.

## // 003. DECISIONES
- Se mantuvo el alcance transport-only y una única identidad de ruta; no se añadió un root recursivo.
- El digest se calcula sobre lo staged, no sobre un valor fijado ni una lectura independiente de la fuente.
- La seam temporal del bundler evita tocar el archive real o fuentes protegidas.
- La delta local añadió un único escenario de transporte; no hubo conflictos.

## // 004. VERIFICACIÓN
- Focused: `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts` — 41/41.
- Suite completa: `bun test` — 2274/2274.
- Suite `tests/`: 2274/2274.
- Typechecks: `bun run typecheck` y `cd installer && bun run typecheck` — PASS.
- Auditoría de límites y `git diff --check` — PASS; no se crearon commits.

## // 005. PENDIENTE / RIESGOS
- Extracción/materialización, hand-off al runtime, sincronización checkout/runtime, smoke BunFS y release quedan diferidos a `materialize-claude-orchestrator-asset`.
- Cleaner conserva el riesgo de traversal de imports relativos fuera de `repoRoot` y de omitir imports estáticos side-effect-only no soportados; las entradas actuales del payload no ejercitan ninguno.
- El archive generado es output desechable; no se edita ni se archiva como fuente.
