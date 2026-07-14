## // 000. RESUMEN
Se cerró el contrato E2 opcional y determinista de Engram: notebook acotado, no bloqueante y subordinado a OpenSpec. La evidencia es exclusivamente de transportes falsos; el cierre aquí significa completar SDD, no publicar ni entregar.

## // 001. QUÉ CAMBIÓ
- `engram-cli.ts` y `memory-contract.ts`: adaptador CLI por arrays (`shell: false`), resultados normalizados, límites y filtros.
- `memory-lifecycle.ts`: identidad de proyecto, topics estables, recuperación/save acotados, deduplicación, frescura y recibos seguros.
- `sdd-preflight.ts` y `ein-ai.ts`: recuperación determinista en sesión y en `map`, `design`, `apply`, `verify`, con inyección advisory no confiable.
- `sdd-memory-save.ts`, `ein-ai.ts` y cierre: save posterior a gate limpio, fallback de cierre después de archivar y sidecars `memory-receipts.jsonl`.
- Preflight, estado, orquestador y agentes: `memoryMode: off|engram`; `openspec` queda siempre canónico y los valores legacy `openspec→off`, `engram|both→engram`.
- Tests fake-only y `handoff.md` documentan la evidencia para `readme-release-ia`; no se modificó README.

## // 002. CÓMO FUNCIONA POR DENTRO
El adaptador ejecuta `engram search ... --project <id> --scope project --limit 5` y `save ... --topic <topic>` mediante argumentos, sin MCP ni acceso directo a DB. La identidad prioriza remote `origin` válido, luego el único remote válido, luego hashes de commits raíz ordenados; si no, es `unknown` y no hay llamada.

Cada clave de ciclo admite una recuperación, hasta 5 resultados/6 KiB, 1.500 ms y cero reintentos; el contexto se delimita como memoria advisory no confiable y siempre ceden instrucciones, código/configuración y OpenSpec. La política permite contenido estructurado, filtra secretos y ruido, genera topics SDD o durables, deduplica por proyecto/topic/digest y marca o descarta memoria stale/unverified.

El save sólo ocurre tras artefacto válido sin errores; el cierre archiva OpenSpec primero y guarda `close` de forma independiente. Sólo una confirmación válida produce `saved`; fallos, ausencia, duplicados y filtrado generan recibos seguros sin bloquear la continuidad.

## // 003. DECISIONES
- Se eligió un adaptador CLI inyectable, no cliente MCP ni DB directa: es el límite determinista y testeable disponible.
- OpenSpec sigue siendo el registro completo obligatorio; Engram es opcional y no puede sustituir artefactos ni gates.
- La primera verificación falló por R4: el proveedor de producción no aportaba commits raíz para el fallback de identidad. Se corrigió con `git -C <cwd> rev-list --max-parents=0 --all`, también acotado e inyectable, y una prueba con raíces invertidas que valida el hash ordenado.

## // 004. VERIFICACIÓN
- `bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts`: PASS, 22 tests, 99 assertions.
- `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts`: PASS, 46 tests, 98 assertions.
- `bun test tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts`: PASS, 30 tests, 83 assertions; `git diff --check`: PASS.
- La matriz cubre arrays exactos, `shell:false`, timeout/caps, unavailable/failed, aislamiento, topics/upsert, redacción, ruido, stale, receipts, gates, archive-first y continuidad OpenSpec.

## // 005. PENDIENTE / RIESGOS
- Workload real registrado: runtime/contratos internos `+1.001/-50`, tests `+586/-5`, OpenSpec `+530` antes de los reportes; producción supera el presupuesto de 400 líneas y el guard de entrega debe decidir la forma futura.
- No hay evidencia de CLI Engram real, MCP, DB, `~/.engram-pi`, compatibilidad instalada ni persistencia viva. Sólo son E2 los seams verificados; los demás siguen E0/E1.
- `readme-release-ia` recibió el handoff: puede usar sólo la afirmación fake-verified de notebook opcional con OpenSpec canónico. No hay README, release, commit, push, PR ni otra acción de delivery en este cierre.
