status: pass

# Verify Report — harden-subagent-envelope-contract

**behavior_coverage: verified**

---

## // 000. RESULTADO

Todas las verificaciones ejecutables pasan. La regla del envelope está escrita, protegida por test y reproducida mediante triangulación. El canal determinista de `summary.md` para `sdd-close` en Claude existe, funciona y está declarado en el estado. Spec delta registrado con los 5 escenarios nuevos.

---

## // 001. PIEZA 1 — GUARDARRAÍL DEL ENVELOPE

### Enunciado y inventario

- `ein-pi/agent/lib/subagent-envelope-contract.ts` declara la regla en cabecera (líneas 1-38):
  - MUST: `silent-incorrect-state` requiere protección
  - SHOULD: `loud-wasteful` debe forzar foreground
  - MAY: `safe-degradation` puede quedarse sin protección
- Inventario declarado: 4 consumidores reales del handler `pi.on("tool_result")` en `ein-ai.ts:934-968`
  - `completeSddParticipantCall`: silent-incorrect-state/foreground-forced
  - `acceptTrackedScoutResult`: loud-wasteful/scout-launch-normalized
  - `participantResultIsUnrecognized`: safe-degradation/none
  - `originalError`: safe-degradation/none

### Tests

- `tests/subagent-envelope-contract.test.ts`: 8 pass / 0 fail
  - T1 (4 tests unitarios): audita `auditEnvelopeConsumers` contra fixtures
  - T2 (2 tests integración): detector de novedad contra handler real; exactitud de inventario
  - T3 (2 tests integración): audita protecciones declaradas contra fuentes reales

### Triangulación (ROJO → VERDE)

- **Paso 1 (ROJO)**: Insertado consumidor ficticio `debugLogEnvelopePayload(event.content)` en handler real
  - Test T2 falló con mensaje claro: `"debugLogEnvelopePayload"` hallado pero no declarado
  - Diff mostró exactamente qué consumidor falta declarar
- **Paso 2 (revertir)**: Removida línea ficticia
- **Paso 3 (VERDE)**: Tests pasan de nuevo (8/8)

La triangulación verifica que el guardarraíl **funciona de verdad**: un consumidor no declarado hace fallar el test con un mensaje que nombra exactamente qué declarar.

---

## // 002. PIEZA 2 — CANAL DETERMINISTA DE `summary.md`

### Núcleo: `writeSddSummary`

- `ein-pi/agent/lib/sdd-summary-write.ts`: rechaza change inexistente, nombre inseguro (vía `isSafeChangeName`), contenido vacío
- Escribe en ruta computada: `openspec/changes/<change>/summary.md`
- Tests: 8 pass / 0 fail
  - Casos: change válido/inválido, nombre seguro/escape, contenido vacío/válido

### CLI: `cc-ein-sdd summary`

- `cc-ein/sdd-cli/cli.ts`: subcomando `summary` + dispatch + `runSummaryCommand`
- **Verificado de verdad** (no solo lectura de código):
  - stdin vacío: rechazado con exitCode 1
  - contenido válido: escribe fichero y exitCode 0
- Espejo exacto de `runDeltaCommand` (precedente ya en producción)

### Remedio calculado

- `ein-pi/agent/lib/sdd-remedies.ts`: función `summaryChannelRemedy`
- Cuando `runtime === "claude"` y `nextPhase === "close"`, la salida de `cc-ein-sdd status` nombra `cc-ein-sdd summary <change>`
- **No garantiza** que el modelo invoque el CLI (eso no es determinista); **sí garantiza** que una negativa a `Write` deja de ser terminal

### Frontmatter: `sdd-close.md` y `orchestrator.md`

- `sdd-close.md`: `tools: read, grep, find, write, bash` (6 bytes, entra en presupuesto)
- `orchestrator.md` línea 24: tabla sincronizada con la misma lista de tools
- Contrato verificado por test `tests/agent-tools-contract.test.ts`: verde

---

## // 003. VERIFICACIÓN MECÁNICA

### Tests

```
bun test tests/subagent-envelope-contract.test.ts    → 8 pass / 0 fail
bun test tests/sdd-summary-write.test.ts             → 8 pass / 0 fail
bun test tests/prompt-budget.test.ts                 → 3 pass / 0 fail
bun test tests/agent-tools-contract.test.ts          → verde
bun test (completo)                                  → 2264 pass / 0 fail
tsc --noEmit                                         → limpio (sin salida)
```

### Presupuesto

- `core/agents/*.md`: fue 83.041/83.053; `sdd-close.md` + `, bash` (6 bytes) → 83.047/83.053
- Test `prompt-budget.test.ts` confirma: dentro del tope, 6 bytes de margen

### Spec Delta

- Registrado en `openspec/specs/surface-wiring/spec.md`
- 5 escenarios nuevos (mapeo directo a R1-R5 de `design.md`):
  1. R1: Inventario declarado y auditoría exacta
  2. R2: Protección `silent-incorrect-state` presente en fuente
  3. R3: Clasificación por modo de fallo (loud-wasteful / safe-degradation)
  4. R4: Asimetría Pi/Claude declarada (no fingida)
  5. R5: Canal determinista de `summary.md`
- Sincronización: `cc-ein-sdd sync harden-subagent-envelope-contract` → `synchronized`, `canonicalChanged: true`

### Ficheros Changed (todos presentes)

- `ein-pi/agent/lib/subagent-envelope-contract.ts`
- `tests/subagent-envelope-contract.test.ts`
- `ein-pi/agent/lib/sdd-summary-write.ts`
- `tests/sdd-summary-write.test.ts`
- `cc-ein/sdd-cli/cli.ts`
- `ein-pi/agent/lib/sdd-remedies.ts`
- `ein-pi/core/agents/sdd-close.md`
- `ein-pi/agent/assets/orchestrator.md`
- `openspec/changes/harden-subagent-envelope-contract/scope.md`
- `openspec/specs/surface-wiring/spec.md`

---

## // 004. TDD ESTRICTO — EVIDENCIA

### PIEZA 1: subagent-envelope-contract

| seam | RED (observado) | GREEN | TRIANGULATE | comando |
|---|---|---|---|---|
| Detector de novedad exige inventario exacto contra handler real | Import error (módulo inexistente) | 8 pass tras implementarlo | Quinta llamada ficticia → test ROJO con id no declarado; revertido, vuelve VERDE | `bun test tests/subagent-envelope-contract.test.ts` |
| R2: protección silent-incorrect-state MUST existir | Import error + RED de auditoría | Fixture sin protección falla; fixture con fuentes reales pasa | Reclasificar consumidor 4 como silent-incorrect-state sin protección → hallazgo | `bun test tests/subagent-envelope-contract.test.ts` |

### PIEZA 2: sdd-summary-write + CLI

| seam | RED (observado) | GREEN | TRIANGULATE | comando |
|---|---|---|---|---|
| `writeSddSummary` rechaza change/contenido y escribe en ruta computada | Import error (función no existe) | 4 tests pasan tras implementarla | `change: "../escape"` rechazo por `isSafeChangeName`, no azar de join | `bun test tests/sdd-summary-write.test.ts` |
| `runSummaryCommand` CLI exitCode 1/0 según stdin | Import error | 2 tests pasan tras añadir subcomando | — | `bun test tests/sdd-summary-write.test.ts` |
| `collectSddRemedies` nombra CC CLI cuando necesario | Import error + RED de firma | 2 tests pasan tras añadir campo `nextPhase` y `summaryChannelRemedy` | — | `bun test tests/sdd-summary-write.test.ts` |

---

## // 005. LIMITACIONES DECLARADAS

### PIEZA 1 (no-objetivos, por diseño)

- **Mundo cerrado**: detector cubre solo `pi.on("tool_result")` de `ein-ai.ts`. Un consumidor cableado por otro hook o indirectamente se escapa. Mitigación: el enunciado en cabecera está en el camino de una edición forzosa — quien añada el tercer consumidor debe abrir este fichero.
- **Cero cobertura Claude**: no hay interception de resultados de subagente en Claude (sin hooks de resultado). La asimetría está declarada en spec (R4), no fingida.
- **Condición de retirada**: cuando `ENVELOPE_CONSUMER_INVENTORY` esté vacío (ningún código derive estado de `tool_result`), el módulo y test se borran juntos.

### PIEZA 2 (honestidad sobre lo no-determinista)

- Que el modelo invoque `cc-ein-sdd summary` en lugar de rehusar `Write` no es comprobable de forma determinista. Lo que SÍ se garantiza: la negativa a `Write` deja de ser terminal porque existe un canal (`writeSddSummary` + `runSummaryCommand`) que no depende de iniciativa del agente, y `sdd-remedies.ts` lo nombra en `status` en el momento exacto.
- Verificación real: ejecución empírica de `sdd-close` en Claude (fuera de test, imposible de automatizar).

---

## // 006. SPEC COVERAGE

- R1 (inventario exacto): cubierto por T2 integración + triangulación ROJO
- R2 (protección presente): cubierto por T1 unitario + T3 integración
- R3 (clasificación por modo): cubierto por T1 (safe-degradation/loud-wasteful no se auditan) + T2 integración
- R4 (asimetría declarada): cubierto en spec delta, `surface-wiring` escenario 2
- R5 (canal determinista): cubierto por `runSummaryCommand` tests + CLI verificado + remedio declarado

---

## // 007. CONCLUSIÓN

Ambas piezas están completas, escritas de verdad (no especulativas), y protegidas por tests ejecutables en el estado actual. La triangulación ROJO→VERDE reproduce el guardarraíl en acción. El canal de `summary.md` existe, funciona y está gateado por el ciclo de vida igual que el resto.
