## // 000. RESUMEN

Un agregador determinista convierte bytes que Ein ya escribía en sesión (transcripts Pi + `subagent-artifacts/*_meta.json`) en informe de coste, contexto, turnos y fallos por agente/modelo, con cobertura explícita y fail-closed. Sin instrumentación nueva: sólo lee lo que existía y nadie leía.

---

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/lib/session-accounting.ts` — agregador `[CORE]` (puro, no I/O, 750 líneas)
- `ein-pi/agent/lib/session-accounting-store.ts` — todo borde E/S (lectura home sesiones, 480 líneas)
- `tests/session-accounting.test.ts` — 21 tests fixture [CORE]
- `tests/session-accounting-store.test.ts` — 22 tests temp-dir (Slice 3: +5 para huérfanos)
- `ein-pi/agent/extensions/ein-ai.ts` — comando `ein:accounting` (71 líneas added)

---

## // 002. CÓMO FUNCIONA POR DENTRO

**Arquitectura de dos módulos** — [CORE] puro (cobertura, precedencia, percentiles) + Store (E/S, clock, árbol):

1. **Store**: Resuelve home sesiones per-call (`EIN_PI_AGENT_HOME ?? AGENT_DIR`), camina transcripts padre/hijo, lee `meta.json` de artefactos. Bounded reads: exceeder límite → `partial`, nunca throw. **Defecto cazado Slice 3**: 63 artefactos sin carpeta `run-N` quedaban fuera de denominadores → falso `complete`. Solución: emite `RunObservation` sintético con `transcript: "missing"` para huérfanos, reintegra verdadera población.

2. **[CORE]**: Toma `SessionCorpus` ya parseado, computa métricas por agente/modelo/partición:
   - **Cobertura**: discriminada unión (`complete | partial | unknown`). Derivación única: `attributed === total && total > 0` → complete; `0 < attributed < total` → partial; `attributed === 0` → unknown. Sin `0` fantasma.
   - **Single-channel**: `transcript > artifact` precedence. Impide sumar $68 + $137 = $205 inventado (R3).
   - **Peaks**: prompt (`max(input+cacheRead+cacheWrite)`) vs. sequence (`usage.totalTokens` cuando se reporta, sino suma 4 componentes). Dos métricas, dos coberturas.
   - **Percentiles**: nearest-rank, no interpolación. En n=2, p95 = max (valor observado, nunca inventado).
   - **Bucket `null`-model**: mantiene su dinero, no se distribuye pro-rata (R9).
   - **Snapshot**: genera identidad corporal (min/max timestamps, counts, discovery) — dos reportes comparables sólo si cada uno declara qué vio.

3. **Comando `ein:accounting`**: Renderiza sólo, sin recompute. Discriminadas uniones impiden imprimir `0` por unknown.

---

## // 003. DECISIONES

| decisión | por qué | alternativa rechazada |
| --- | --- | --- |
| Dos módulos [CORE]+Store | [CORE] no toca I/O → testeable sin filesystem. Precedente: `reviewed-area-ledger.ts` | Un módulo hace todo, requiere filesystem fixture |
| Single-channel precedencia | Evita $68 + $137 = $205. Explicita la brecha: "transcript coverage partial (N/M)" | Sum artifact + transcript (double-count) |
| Nearest-rank, no interpolación | n=2: p95 inventa valor nunca observado (el error que fix existe para prevenir) | Linear interpolation (R-7, Excel) fabrica datos |
| Artefactos huérfanos → observaciones sintéticas | Cobertura denominator cuenta verdadera población, no truncada | Omitir huérfanos (el bug original: false-complete) |
| Discriminadas uniones para `unknown` | Compilador impide `value` en unknown → no `0` fantasma | Convención (field nullable, confía en runtime) |
| `null`-bucket nombrado `null`, no `"unattributed"` | String union con `string` colapsa; `null` no | Sentinel string (compiler stops helping) |

---

## // 004. VERIFICACIÓN

**Puertas ejecutadas y resultado:**

| puerta | comando | resultado |
| --- | --- | --- |
| Tests completo | `bun test` | 2740 pass / 0 fail (2697 + 43 new) |
| TypeCheck root | `bun run typecheck` | limpio, `ein-pi/` + `cc-ein/` |
| TypeCheck installer | `cd installer && bun run typecheck` | limpio |
| Slice 1 ([CORE]) | `bun test tests/session-accounting.test.ts` | 21 pass, 89 expects |
| Slice 2 (Store) | `bun test tests/session-accounting-store.test.ts` | 17 pass, 37 expects (baseline) |
| Slice 3 (Orphans) | (same) | 22 pass (+5 new), 61 expects |

**Real corpus (Slice 3):**

Predicción vs. ejecución:

```
Predicho:     63 orphan runs, +$34,53 cost
Ejecutado:    63 orphan runs, +$34,54 cost  ← exacto
```

| métrica | antes (Slice 2) | después (Slice 3) | Δ |
| --- | --- | --- | --- |
| runsAttributed | 957 | 1020 | +63 ✓ |
| cost overall | $344,23 | $378,77 | +$34,54 ✓ |
| channels.artifact | 0 | 63 | +63 ✓ |
| sdd-apply coverage | false complete (90/90) | partial (119/119) | denominador verdadero ✓ |

Snapshot: 319 artefactos, 225 sesiones, corpus 2026-05-15 a 2026-08-26, rerun max `run-9`, todo contabilizado, sin defaults a 0.

---

## // 005. PENDIENTE / RIESGOS

**Limitaciones clausuradas en scope (no bloqueadores):**
- Duración run, compactaciones y resultado tarea → deferred a cambio futuro
- Claude Code session store → scope out (hoy Pi-only)

**Riesgos gestionados y visibles:**
1. **Ambiente `EIN_PI_AGENT_HOME` no set**: resuelve a Pi vanilla (`~/.pi/agent`), store presente pero corpus vacío. Reportado honestamente: `store: "present"`, `sessions: unknown`, `cost.coverage: unknown`. No 0 inventado, visible que midió nada.

2. **Cobertura now parcial donde antes false-complete**: Por ejemplo, `sdd-apply` pasó de `complete (90/90)` a `partial (119/119)`. **Correcto e intencional** — el verdadero bug estaba en la falsa `complete`. Las 29 observaciones sintéticas de huérfanos tienen `transcript: "missing"`, por eso peaks (sólo transcript) reportan `partial (90/119)` mientras turns (ambos canales) reportan `complete (119/119)`. Asimétrico y correcto.

3. **Corpus de dos proveedores (openai-codex, minimax)**: diseño tolera otros, cubierto con fixtures, no datos reales. Sin impacto — no es un bloqueador.

4. **Bucket `agent: null` mezcla 225 padres + ~480 subagentes no atribuidos**: métrica de decisión vive en `partition.parent` vs. `partition.subagent` (correcta), `byAgent` es ortogonal y completa. Sostenible.

**Ninguno bloquea cierre o uso futuro.**
