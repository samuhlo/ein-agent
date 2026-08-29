# Verify report — beta-phase-zero-baseline

status: pass
behavior_coverage: verified
skill_resolution: not-required

## Resultado

La fase 0 cumple el alcance confirmado. La política neutral se verifica sobre el artefacto desplegable, no solo sobre el JSON fuente; las elecciones explícitas existentes siguen protegidas por los tests de merge y por las rutas de `/ein:models`.

## Cobertura por requisito

| Requisito | Resultado | Evidencia |
|---|---|---|
| Bundle sin proveedor/modelo por defecto | PASS | `tests/installed-agent-inventory.test.ts`; extracción directa del bundle host |
| Instalador sin promoción implícita de MiniMax | PASS | Captura de `requestSecret` con Linear `on/off` en `tests/install-plan.test.ts` |
| Elecciones explícitas preservadas | PASS | Suite existente `tests/deploy-settings.test.ts` y roundtrips de `tests/model-config.test.ts` |
| Recomendaciones solo de esfuerzo | PASS | Forma exacta `{ thinking, reason }` en `tests/sdd-cost-block-g.test.ts` |
| Alertas solo para saltos grandes | PASS | Matriz pura y panel real: adyacente sin alerta, `low→high` con alerta |
| Deuda de límites no crece | PASS | Scanner AST exacto en `tests/architecture-boundaries.test.ts` |

## Comandos frescos

- Focal principal: PASS — 49 tests, 889 expectations.
- Panel y umbral: PASS — 14 tests, 68 expectations.
- `bun test`: PASS — 2.877 tests en 205 archivos, 13.974 expectations.
- `bun run typecheck`: PASS.
- `cd installer && bun run typecheck`: PASS.
- `cd installer && bun run bundle-template:host`: PASS — 27,65 MB.
- Bundle host SHA-256: `a496f1d235d834b335a91c8c4080f8d1c38f0d2c142e125123d1b195a50e9e08`.
- Inspección de `./settings.json` dentro del tar: claves `defaultProvider`, `defaultModel` y `enabledModels` ausentes.
- `git diff --check`: PASS.

## Auditoría TDD y alcance

`preflight.json` fija TDD estricto. `apply-progress.md` registra los fallos RED observados y sus cierres GREEN. La triangulación del panel encontró y corrigió una rama especial del orquestador que no compartía el marcador visual.

No se movieron carpetas, no se creó un perfil minimal, no se eliminó la posibilidad de que el usuario elija proveedor/modelo y no se tocó ningún otro cambio activo. No se desplegó el bundle en el home activo, ni se hizo commit, tag, push o publicación.

## Riesgo residual

El baseline documenta deuda, no la resuelve: siguen existiendo 32 literales únicos desde `installer`/`ein-cc` hacia `ein-pi/agent`. La fase 1 deberá reducir esa lista al extraer el core compartido; el test obliga a actualizarla de forma explícita.
