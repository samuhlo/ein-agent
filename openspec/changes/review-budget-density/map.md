# Map — review-budget-density

status: complete
scope_status: accepted
change: review-budget-density
phase: map

ledger:
  reads:
    - { path: ein-pi/agent/lib/review-forecast.ts, lines: 104, estimated_tokens: 1050 }
    - { path: tests/review-workload-guard.test.ts, lines: 134, estimated_tokens: 1450 }
    - { path: ein-pi/agent/extensions/ein-ai.ts, lines: 19, estimated_tokens: 300 }
    - { path: ein-pi/agent/lib/tool-receipts.ts, lines: 25, estimated_tokens: 300 }
    - { path: ein-pi/agent/lib/sdd-preflight.ts, lines: 23, estimated_tokens: 350 }
    - { path: runtime/assets/orchestrator.md, lines: 8, estimated_tokens: 250 }
    - { path: runtime/agents/ein-git.md, lines: 28, estimated_tokens: 450 }
    - { path: ein-cc/sync.ts, lines: 7, estimated_tokens: 100 }
    - { path: ein-pi/agent/lib/sdd-lane.ts, lines: 5, estimated_tokens: 100 }
    - { path: openspec/specs/sdd-lifecycle/spec.md, lines: 13, estimated_tokens: 250 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 4600, reads: 10 }

## // 001. Mecanismo actual

`reviewForecast` es el dueño único del pathspec. Ejecuta dos `git diff --shortstat`: uno para producción y otro para tests. Devuelve `production`, `tests`, `range` y `ok`; `formatReviewForecast` decide si `production > budget` y genera el texto que lee el orquestador.

La extensión `ein-ai.ts` aporta el presupuesto de 400 renglones desde el preflight, llama al módulo y publica el resultado crudo en `details`. `tool-receipts.ts` convierte esos detalles en lenguaje humano. No existe hoy una preferencia ni configuración para volumen.

## // 002. Consumidores por responsabilidad

- Cálculo: `ein-pi/agent/lib/review-forecast.ts`.
- Configuración y decisión de la tool: `ein-pi/agent/extensions/ein-ai.ts`.
- Presentación secundaria: `ein-pi/agent/lib/tool-receipts.ts`.
- Contrato que actúa: `runtime/assets/orchestrator.md` llama la tool y transmite la medida; `runtime/agents/ein-git.md` confía en lo transmitido y aplica la puerta sin volver a medir.
- Contrato de sesión: `ein-pi/agent/lib/sdd-preflight.ts` inyecta el límite y la instrucción al orquestador.
- Compatibilidad textual: `ein-cc/sync.ts` traduce el nombre de la tool para Claude. No consume las cifras.
- Mención no funcional: `ein-pi/agent/lib/sdd-lane.ts` explica por qué el forecast no decide el carril. No necesita cambiar.

## // 003. Fronteras del diff

La semántica existente debe conservarse: con base se compara `<base>..HEAD`; sin base, `HEAD` contra staged y unstaged. Tests, snapshots, locks, generados, `e2e/` y todo `openspec/` quedan fuera de producción mediante el mismo pathspec.

Para medir volumen hace falta el contenido del patch, no `--shortstat`. El módulo puede pedir a Git un diff de producción sin contexto y contar únicamente líneas añadidas o eliminadas, retirando sus prefijos y los espacios en blanco antes de medir bytes UTF-8. Los metadatos `+++`/`---`, la marca de falta de salto final y los binarios no aportan volumen. Un listado de nombres con el mismo pathspec da el número de ficheros distintos. Un fallo en cualquiera de las mediciones mantiene `ok: false`.

La densidad es una relación por fichero: bytes no blancos cambiados / renglones cambiados. Es información localizada y no participa en `ok` ni en la decisión de presupuesto.

## // 004. Corte de entrega

1. PR de medición: amplía el contrato y la salida con `productionBytes`, `productionFiles` y métricas por fichero; conserva `overBudget` basado solo en renglones. Incluye tests RED/GREEN de exclusiones, Unicode, adiciones, borrados y múltiples ficheros.
2. PR de puerta: calibra un límite de bytes y un umbral de aviso con diffs de PRs mergeadas reales, documenta la decisión y hace que renglones o bytes puedan superar el presupuesto. Actualiza los contratos del orquestador, preflight, recibo y `ein-git` para transportar ambas medidas; la densidad solo avisa.

El cambio OpenSpec se cierra solo tras la segunda PR. La primera PR es base de la segunda.

## // 005. Contrato canónico

El dominio `openspec/specs/sdd-lifecycle/spec.md` ya contiene `openspec-artifacts-excluded-from-review-budget`; el delta nuevo debe preservar esa exclusión para todas las medidas. El fichero canónico completo mide 56.712 bytes, por encima del paquete máximo de contexto de diseño, por lo que el diseño usa exclusivamente este escenario localizado y el delta exacto del cambio; no incorpora otros dominios.

## // 006. Riesgos y comprobaciones

- Parsear texto de patch exige distinguir cabeceras de líneas cuyo contenido empieza por `+` o `-`; el estado de fichero del diff debe gobernar el parser.
- `git diff` puede devolver nombres con espacios, renombres y contenido Unicode; los tests deben cubrir espacios y Unicode, y el recuento de ficheros debe usar separación NUL.
- Un umbral elegido por intuición convertiría el aviso en ruido. La puerta de bytes no se activa hasta obtener la distribución de PRs reales y registrar la razón del valor elegido.
- El formato de `details` es un contrato consumido por recibos y prompts. Durante la primera PR los campos nuevos son aditivos y `overBudget` conserva su significado actual.

## // 007. Archivos probables

- PR de medición: `ein-pi/agent/lib/review-forecast.ts`, `tests/review-workload-guard.test.ts`, `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/tool-receipts.ts`.
- PR de puerta: los anteriores cuando proceda, `ein-pi/agent/lib/sdd-preflight.ts`, `runtime/assets/orchestrator.md`, `runtime/agents/ein-git.md`, `docs/adr/0001-review-workload-guard.md` y tests de contrato afectados.
- Documentación de planificación: `docs/roadmap.md` y los artefactos de este cambio.
