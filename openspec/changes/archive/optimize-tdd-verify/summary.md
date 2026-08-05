## // 000. RESUMEN
El cambio optimiza el contrato entre apply y verify para deduplicar comandos finales sin debilitar strict-TDD, la verificación independiente ni el cierre. La cobertura de comportamiento es honestamente `partial`: se verificó el contrato textual, no un planificador runtime.

## // 001. QUÉ CAMBIÓ
- `ein-pi/core/agents/sdd-apply.md`: cada behavior seam conserva ciclos RED → GREEN → TRIANGULATE → REFACTOR y una asociación final de comando enfocado; apply no absorbe checks globales ni builds de producción.
- `ein-pi/core/agents/sdd-verify.md`: verify reconstruye un plan fresco por ejecución, normaliza solo con `trim()`, fusiona coincidencias exactas y conserva seams/roles/evidencia.
- `tests/sdd-tdd-phase-boundary.test.ts`: cobertura contractual de ownership apply/verify, deduplicación, frescura, checks requeridos, auditoría TDD y close gate.
- `apply-progress.md`: inventario de siete seams con evidencia completa y un comando final por seam.

## // 002. CÓMO FUNCIONA POR DENTRO
Apply registra cada seam observable junto con el comando final de su ciclo, pero esa evidencia solo sirve como entrada de auditoría. Verify vuelve a inventariar obligaciones enfocadas y checks globales, descarta comandos vacíos, recorta whitespace exterior y fusiona únicamente strings normalizados idénticos; una ejecución puede cubrir varios seams/roles. Cada verify invoca de nuevo los comandos únicos y registra el resultado actual. La auditoría strict-TDD bloquea evidencia ausente, ambigua, fallida, stale o checks requeridos no ejecutados; el close gate sigue exigiendo un verify passing actual.

## // 003. DECISIONES
- Se modificaron contratos de agentes y tests, no router, guardrails, close, configuración ni un helper sin consumidor runtime.
- La normalización es deliberadamente conservadora: no equipara aliases, flags reordenados, quoting, prefijos de entorno ni directorios de trabajo.
- El typecheck de `installer` se clasificó no relevante para este cambio limitado a `ein-pi` y contratos; no se inventaron checks globales.
- No se afirma comportamiento runtime del planificador: esta fase no implementa uno.

## // 004. VERIFICACIÓN
- `timeout 300 bun test tests/sdd-tdd-phase-boundary.test.ts`: 17 pasaron, 0 fallaron, 37 expectations.
- `git diff --check`: pasó.
- El comando enfocado se ejecutó una vez en el verify actual; no se usaron cachés, timestamps, hashes ni resultados previos como sustitutos.
- `verify-report.md`: `status: pass`, `behavior_coverage: partial`; sin blockers críticos.

## // 005. PENDIENTE / RIESGOS
- La prueba contractual no demuestra ejecución de un agente ni deduplicación/frescura en runtime; un futuro harness smoke podría cubrirlo.
- La relevancia de `cd installer && bun run typecheck` debe reevaluarse si cambia `installer/`.
- Comandos con diferencias semánticas de shell permanecen separados por diseño.
