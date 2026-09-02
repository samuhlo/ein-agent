## // 000. RESUMEN

El carril de fases y la postura TDD de cada cambio tienen ahora un dueño propio. `ein-ai.ts` deja de implementar esas dos herramientas y se limita a registrarlas.

## // 001. QUÉ CAMBIÓ

- `ein-sdd-change-settings.ts`: registra `ein_sdd_lane` y `ein_sdd_preflight`.
- `ein-ai.ts`: delega ambas herramientas y pierde sus imports de política y persistencia.
- Un test fija el inventario y la ausencia de copias en la fachada; la cobertura de recibos sigue toda la composición.

## // 002. CÓMO FUNCIONA POR DENTRO

Las dos herramientas leen una decisión ya guardada y, cuando el usuario pide un cambio válido, escriben únicamente los pequeños registros de carril o TDD del cambio. El router sigue calculando las fases; este módulo solo es dueño de cómo se declara esa configuración.

## // 003. DECISIONES

- Agrupar carril y TDD porque juntos responden a una sola pregunta: “¿cómo se conduce este cambio?”.
- No incluir check, sync ni close: validan o transforman artefactos y tienen ciclos de vida distintos.
- Mantener los mismos contratos y mensajes; el corte es arquitectónico.

## // 004. VERIFICACIÓN

- 62 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Las escrituras de deltas y sincronización OpenSpec siguen dentro de la fachada. Se extraen después con verificación de payload instalado.
