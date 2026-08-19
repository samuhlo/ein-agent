## // 000. RESUMEN
El sync checkout/runtime de Claude despliega el asset canónico `orchestrator.md` en el home aislado prometido por el adaptador, preservando sus bytes. El cambio está verificado y listo para cierre; no se crearon commits.

## // 001. QUÉ CAMBIÓ
- `cc-ein/sync.ts`: crea `assets/` y copia `ein-pi/agent/assets/orchestrator.md` a `${CC_EIN_HOME}/assets/orchestrator.md` mediante `copyFileSync`, dentro de la ruta requerida y respetando `--dry`.
- `tests/surface-wiring.test.ts`: añade cobertura con procesos Bun y homes temporales para despliegue real, fichero regular, paridad byte a byte, dry-run sin mutaciones y fallo requerido.
- `openspec/specs/surface-wiring/spec.md`: sincronizado con un delta añadido para el despliegue del asset (`sync-report.md`).

## // 002. CÓMO FUNCIONA POR DENTRO
`runSync()` resuelve `CC_EIN_HOME`, crea el árbol requerido con el helper dry-safe existente y copia directamente el fichero canónico antes del bloque MCP opcional. Cualquier error de copia entra en `requiredFailures`; el proceso no puede declarar éxito con un asset ausente. Las pruebas lanzan un Bun nuevo porque `DEST` se fija al importar el módulo, y comparan buffers fuente/destino además del tipo regular.

## // 003. DECISIONES
- Se usa `copyFileSync` en vez de serializar Markdown como UTF-8 para expresar y conservar la paridad binaria.
- Se mantiene el seam de `tests/surface-wiring.test.ts`; no se añade una abstracción de producción ni se toca el contenido canónico.
- Este cambio cubre exclusivamente sync checkout/runtime de Claude. La inclusión en payload empaquetado del instalador —inventario, bundling, staging, archivo y smoke— queda explícitamente diferida a `package-claude-orchestrator-asset`.

## // 004. VERIFICACIÓN
- `bun test tests/surface-wiring.test.ts`: PASS, 34 tests, 269 assertions.
- `bun test` y `bun test tests/`: PASS, 2.268 tests, 8.981 assertions.
- `bun run typecheck` y `cd installer && bun run typecheck`: PASS.
- Integridad canónica: 42.926 bytes; SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.
- Auditoría de límites y paths dirty protegidos: PASS. No se ejecutó build porque no lo exige el diseño/configuración; los wrappers iniciales de timeout fallaron antes de Bun, y las ejecuciones requeridas posteriores pasaron.

## // 005. PENDIENTE / RIESGOS
- Pendiente: `package-claude-orchestrator-asset` debe incorporar el asset al payload del instalador.
- Riesgo acotado: el sync completo depende de los inputs actuales de la superficie Claude y de Bun.
- Ninguno adicional; no se crearon commits.
