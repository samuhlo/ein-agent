## // 000. RESUMEN
Se reorganizó el README para que la entrada muestre qué es Ein, el bootstrap soportado y la release canónica antes de los conceptos. La documentación queda protegida por un contrato Bun offline que evita deriva de release, claims volátiles y canales no soportados.

## // 001. QUÉ CAMBIÓ
- `README.md`: ruta rápida con un único `curl | bash`, enlace a `#instalacion-detallada` y resumen de `0.18.0` (`2026-07-13`) enlazado a `CHANGELOG.md#0180---2026-07-13`.
- `README.md`: tres hechos de la release (CodeGraph, dependencia opcional y bootstrap de OpenSpec), guía de modelos por capacidad/riesgo/coste y contrato explícito de no-fallback automático.
- `README.md`: bootstrap como único canal documentado; WSL queda como camino Linux, la TUI distingue Linux/macOS y se eliminan ejemplos de versión, proveedor/modelo y actualización de Pi que podían caducar.
- `tests/readme-release-ia.test.ts`: control determinista de metadatos, orden, comando, anchors, claims, presets, Homebrew y ramas de TUI.

## // 002. CÓMO FUNCIONA POR DENTRO
El README conserva la numeración y badges existentes, inserta los bloques iniciales antes de `// 000` y mantiene la instalación extensa en una sola sección. El test extrae la primera release de `CHANGELOG.md`, la contrasta con `installer/package.json`, `INSTALLER_VERSION`, la convención `installer-v*` del workflow y el copy del README; también valida el one-liner único, los tres bullets y las zonas acotadas de prohibiciones. Las afirmaciones de Engram permanecen opcionales y limitadas a fuente/desarrollo; updater y banner no se presentan como novedades publicadas.

## // 003. DECISIONES
- Copy manual protegido por test, no generación automática: el workflow actual no demuestra esa capacidad.
- Sólo bootstrap documentado: los assets manuales no tienen verificación remota permitida en este cambio.
- Se mantuvieron anchors y numeración para evitar churn; Homebrew sigue bloqueado hasta disponer de canal publicado, instalación/upgrade verificados y ownership explícito del updater.

## // 004. VERIFICACIÓN
- `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts`: PASS, 12 tests y 75 aserciones.
- `cd installer && bun run typecheck`: PASS (`tsc --noEmit`).
- `git diff --check`: PASS; el test nuevo también pasó la comprobación de whitespace.
- No se ejecutaron red, instalaciones, builds ni acciones de entrega.

## // 005. PENDIENTE / RIESGOS
El contrato es offline: no demuestra que GitHub sirva actualmente la release o sus assets. La distinción Linux/macOS se valida textualmente contra el instalador, no mediante smoke multiplataforma. No hay tareas pendientes dentro del alcance; cualquier canal Homebrew o afirmación de publicación remota requiere un cambio posterior con sus pruebas y evidencias.