---
status: pass
scope_status: bounded
change: beta-phase-zero-baseline
phase: map
created: 2026-08-28T00:00:00Z
---

# Map — beta phase zero baseline

## Superficies afectadas

| Responsabilidad | Fuente | Prueba |
|---|---|---|
| Plantilla Pi | `ein-pi/agent/settings.json` | `tests/installed-agent-inventory.test.ts` sobre tar real |
| Wizard de secretos | `installer/src/cli/install.ts` | `tests/install-plan.test.ts` con efectos inyectados |
| Política de esfuerzo | `ein-pi/agent/lib/model-config.ts` | `tests/sdd-cost-block-g.test.ts`, `tests/model-config.test.ts` |
| Render de alertas | `ein-pi/agent/extensions/internal/models-panel.ts` | helper puro probado por matriz |
| Límite arquitectónico | `ein-cc/**`, `installer/{src,scripts}/**` | `tests/architecture-boundaries.test.ts` |

## Invariantes que se preservan

- `installer/src/core/settings.ts` sigue preservando settings propiedad del usuario.
- `/ein:models` sigue permitiendo elegir y persistir un modelo explícitamente.
- `enabledModels`, si ya existe en settings del usuario, sigue actualizándose al elegir explícitamente un modelo desde el panel.
- No se cambia la distribución ni la estructura de carpetas en esta fase.

## Riesgos

- Probar solo el JSON fuente ocultaría una regresión del bundler; por eso el contrato extrae el tar real.
- Comparar esfuerzo con desigualdad simple seguiría generando ruido; la distancia se centraliza en una función pura.
- Un allowlist arquitectónico generado automáticamente aprobaría deuda nueva; el baseline será literal y revisable.

## Referencias canónicas

No se modifica ningún `openspec/specs/<domain>/spec.md`; esta fase materializa decisiones de producto y deuda arquitectónica ya confirmadas por el usuario.
