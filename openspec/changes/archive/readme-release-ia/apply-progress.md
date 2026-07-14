status: complete

# Apply progress — readme-release-ia

## Tareas completadas

- [x] 1.1 Control Bun offline para versión, fecha y anchor entre `CHANGELOG.md`, las dos versiones locales del instalador y el resumen del README.
- [x] 1.2 Límites de orden, one-liner único, anchor semántico, tres bullets, presets, nombres volátiles y claims Homebrew acotados a Ein.
- [x] 2.1 Ruta rápida antes de `// 000`, sin renumerar las secciones existentes, con enlace descriptivo a `#instalacion-detallada`.
- [x] 2.2 Resumen manual de la release `0.18.0` del `2026-07-13` con su anchor relativo y exactamente tres hechos canónicos.
- [x] 2.3 Guía de modelos por capacidad, riesgo y coste; conserva los tres comandos de presets y la decisión humana sin fallback automático.
- [x] 2.4 Claims ajustados: bootstrap único, WSL como camino Linux, tag genérico, Engram opcional de fuente/desarrollo y `ein update` sin prometer actualizar Pi.

## Archivos modificados

- `README.md`
- `tests/readme-release-ia.test.ts`
- `openspec/changes/readme-release-ia/tasks.md`
- `openspec/changes/readme-release-ia/apply-progress.md`

## Remediación del bloqueo VERIFY

Se corrigió el claim de inicio de la TUI en `README.md`: el bootstrap reabre la TUI en Linux sólo si hay terminal disponible; en macOS indica ejecutar `ein` después de instalar. El contrato offline ahora contrasta ambas ramas del instalador con el copy público, sin modificar su comportamiento.

## Evidencia de implementación

`strict_tdd: false` en `openspec/config.yaml`; se aplicó modo estándar. Aun así, el control se creó antes de los cambios finales del README: su primera ejecución falló porque aún no existía `## // INSTALACIÓN RÁPIDA`, confirmando el estado previo. Tras introducir la ruta rápida y el resumen, una ejecución intermedia detectó dos expectativas de copy (telemetría y mayúscula inicial de «Arquitectura»); se precisó el copy y se hizo la comparación de criterios sin distinguir mayúsculas/minúsculas. La ejecución final pasó.

El control lee sólo archivos locales. Comprueba por separado versión, fecha y anchor; exige el anchor `0180---2026-07-13`, la convención `installer-v*`, un único one-liner, tres bullets, los comandos de modelos, el no-fallback, la ausencia de nombres volátiles en las zonas afectadas, la ausencia de Homebrew para Ein, el tag genérico y los límites de Engram/updater.

## Comandos ejecutados

- `bun test tests/readme-release-ia.test.ts` — RED inicial: faltaba la ruta rápida antes de editar el README.
- `bun test tests/readme-release-ia.test.ts` — ejecución intermedia: 3 PASS, 2 FAIL; precisó el copy de telemetría y la comparación sin distinción de mayúsculas/minúsculas.
- `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts` — PASS final: 11 tests, 71 aserciones.
- `cd installer && bun run typecheck` — PASS (`tsc --noEmit`).
- `git diff --check` — PASS.
- Remediación VERIFY: `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts` — PASS.
- Remediación VERIFY: `cd installer && bun run typecheck` — PASS (`tsc --noEmit`).
- Remediación VERIFY: `git diff --check` — PASS.

## Desviaciones del diseño

Ninguna. No se modificaron versiones, changelog, workflow, instalador, presets, dependencias ni canales de publicación. `homebrew-install-channel` sigue bloqueado: no se añadió documentación, comando, badge ni promesa de Homebrew.

## Tareas restantes

Ninguna. El cambio queda listo para `sdd-verify`.
