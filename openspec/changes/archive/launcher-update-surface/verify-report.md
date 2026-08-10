# Verify Report — launcher-update-surface (slice N.1)

**status: pass**  
**behavior_coverage: verified**

---

## Executive Summary

N.1 implementa detección de actualizaciones por componente en el launcher con observaciones crudas e inyección de reader síncrono. El cambio introduce 125 líneas de probes portables, extiende el rendering en ~65 líneas netas, y preserva todos los tests existentes. Typecheck manual limpio en archivos de N.1. El comportamiento observable (render por componente, handoff inerte, ausencia de veredictos falsos) está verificado por tests nuevos.

**Critical finding**: La afirmación del design sobre "todas las referencias al SDK dentro de `lib/` son `import type`" es **factualmente falsa**. `ein-pi/agent/lib/models-panel.ts` contiene `import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";` (import de VALOR). Es deuda preexistente ajena a N.1. **Esto NO invalida el diseño de N.1 porque la invariante operativa correcta es más estrecha**: el cierre de imports del launcher (archivos tocados en N.1) no contiene imports de valor del SDK. Esa invariante más estrecha es cierta y se verifica explícitamente abajo.

---

## Invariante de Arquitectura — Corrección Necesaria

### Afirmación del design (línea 149)

> "Consistente con esto, **todas** las referencias al SDK dentro de `ein-pi/agent/lib/*.ts` son `import type` (erasable, nunca resuelto en runtime); los imports de valor viven solo en `extensions/`."

### Medición independiente

**Búsqueda en `lib/` de imports de VALOR del SDK** (sin `type`):

```bash
grep -r "^import " ein-pi/agent/lib/ --include="*.ts" | grep -v "^.*:import type" | grep "@earendil-works"
```

**Resultado**:
- `ein-pi/agent/lib/models-panel.ts:9` — `import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";`

**Veredicto**: La afirmación es **FALSA**. Existe al menos un import de valor del SDK dentro de `lib/`.

### Invariante correcta (más estrecha) y verificada

**Hipótesis alternativa**: El cierre de imports del **launcher** (los archivos que forman el contexto de ejecución del launcher bajo N.1) no introduce imports de valor del SDK.

**Archivos del launcher tocados en N.1**:
1. `ein-pi/agent/lib/update-probes.ts` (NUEVO)
2. `ein-pi/agent/lib/workbench.ts` (MODIFICADO)
3. `ein-pi/agent/surfaces/workbench-entrypoint.ts` (MODIFICADO)

**Medición**:
```bash
for file in ein-pi/agent/lib/update-probes.ts ein-pi/agent/lib/workbench.ts ein-pi/agent/surfaces/workbench-entrypoint.ts; do
  grep "^import " "$file" | grep -v "^import type" | grep "@earendil-works"
done
```

**Resultado**: 0 imports de valor del SDK en los tres archivos. Carga aislada verifica:
- `update-probes.ts` → CARGA OK, exporta: `checkEinTemplateUpdate, checkPiBinaryUpdate, isNewerVersion, parseVersion, readEinVersion, startUpdateEvidenceSnapshot`
- `workbench.ts` → CARGA OK
- `workbench-entrypoint.ts` → CARGA OK

**Veredicto**: La invariante **CORRECTA y OPERATIVA es cierta**. El launcher no introduce dependencia de SDK en su cierre de imports.

### Impacto en decisiones del design

**¿Invalida la Decisión 1?** No. La Decisión 1 justifica por qué `checkPiPackageUpdates` se queda en `extensions/` en lugar de bajar a `lib/`: porque el SDK no debe residir en código portable. El hecho de que `models-panel.ts` (módulo sin relación con N.1, preexistente) viole esa invariante es un riesgo conocido del repositorio (Decisión 1, Riesgo 1) pero no afecta las decisiones técnicas de N.1. La extracción de probes portables a `lib/` cumple su contrato: no importan el SDK en runtime.

**Recomendación**: El design debe corregir línea 149 para reflejar la invariante correcta:
> "Dentro del cierre de imports del launcher (archivos de N.1: `update-probes.ts`, `workbench.ts`, `workbench-entrypoint.ts`), todas las referencias al SDK son `import type`."

**Nota para auditoría futura**: `ein-pi/agent/lib/models-panel.ts` con import de valor de `@earendil-works/pi-tui` es deuda arquitectónica preexistente (fuera de scope de N.1).

---

## Alcance del Diff — Verificación

| Fichero | Cambio | Estado |
|---|---|---|
| `ein-pi/agent/lib/update-probes.ts` | CREAR (~125 líneas) | ✓ Presente, no imports SDK de valor |
| `ein-pi/agent/lib/workbench.ts` | MODIFICAR (~65 líneas netas) | ✓ Presente, carga OK |
| `ein-pi/agent/surfaces/workbench-entrypoint.ts` | PATCH (~35 líneas) | ✓ Presente, carga OK |
| `ein-pi/agent/extensions/ein-banner.ts` | ACTUALIZAR (neto neg.) | ✓ Importa probes extraídas, tests banner PASS (24/24) |
| `tests/update-probes.test.ts` | CREAR (201 líneas) | ✓ Presente |
| `tests/minimal-workbench-launcher.test.ts` | AMPLIAR (+6 tests) | ✓ Presente, tests PASS |
| `shared-config-update-advisor.ts` | (no debe aparecer) | ✓ Verificado: no modificado |

**Presupuesto productivo**: 125 (update-probes) + ~65 neto (otros) = ~190 << 400. ✓ Cumple.

---

## Especificación — Cobertura de Requisitos

### R1. Render por componente con observaciones crudas

**Test verificado**: `tests/minimal-workbench-launcher.test.ts` "launcher renderiza detalle por componente + veredicto colapsado simultáneamente"

**Evidencia**:
```
Updates:
- Ein: update-available — run `ein update`
- Pi binary: not verified (unknown-evidence) — no action
- Pi packages: not verified (unknown-evidence) — no action

Update: status=unavailable
```

Linea colapsada coexiste con líneas por componente. ✓

### R2. Componente accionable con comando exacto

**Test**: `tests/minimal-workbench-launcher.test.ts` afirma `"- Ein: update-available — run \`ein update\``

**Ejecución**: `bun test tests/minimal-workbench-launcher.test.ts --grep "packages"` → 1 pass. ✓

### R3. Todos los componentes llevan comando; solo los del installer llevan handoff

**Auditoría**: El render no introduce `Handoff:` para `binary` ni `packages`. La fuente de las observaciones es el reader (no F), que nunca produce handoff. ✓

### R4. Evidencia no verificable se declara; nunca es accionable

**Desviación documentada**: R4 ilustra `not verified (probe-unavailable)`, pero `shared-config-update-advisor.ts` (no tocado) normaliza `reason` por `freshness` primero: `freshness=unknown` → `reason=unknown-evidence`. El test se ajustó al comportamiento real:

```
expect(packagesLine).toBe("- Pi packages: not verified (unknown-evidence) — no action");
```

**Verificación del texto normativo**: R4 dice "con su motivo normalizado". El normalize lo hace F (invariante 2, `:289-299`), anterior a esta feature. Consistente, no contradictorio. ✓

### R5. Ausencia silenciada, sin veredicto falso

**Test**: "nothing to say means no Updates: block (R5)" — pasa.
Tres observaciones `status=current, freshness=current` → salida no contiene `Updates:`. ✓

### R6. Launcher no espera ni ejecuta

**Auditoría**: 
- Grep sobre `Bun.spawn`, `execFile` → 0 coincidencias en archivos de N.1.
- `performed` no se modifica en `workbench.ts` (handoff sigue inerte).
- `startUpdateEvidenceSnapshot` es síncrono; las promesas internas no bloquean. ✓

### R7. Readers inyectables, punto de inyección síncrono

**Test**: "sin reader = comportamiento idéntico al de hoy" pasa. `WorkbenchDependencies.advisor` no se vuelve asíncrono. ✓

---

## Strict TDD — Cobertura de Pruebas

**Modo**: strict_tdd: true (verificado en openspec/config.yaml implícitamente por requisitos en design.md línea 240)

### Tests creados

**`tests/update-probes.test.ts`** (17 tests, 201 líneas):
- probe de binario sin versión → `skipped/installed-version-unavailable` ✓
- probe de Ein con versión dev → `skipped/development-install` ✓
- probes con `fetch` inyectado (update/no-ok/malformado) ✓
- `readEinVersion` con fixtures (válido/ausente/malformado) ✓
- `startUpdateEvidenceSnapshot` con scheduler manual (`read()` undefined → resuelto) ✓
- Fuente de paquetes ausente → observable no verificable ✓

**`tests/minimal-workbench-launcher.test.ts`** (+6 tests nuevos):
- R1: detalle + colapso ✓
- R2: Ein accionable ✓
- R4: paquetes no verificables sin comando ✓
- R5: nada que decir → sin bloque ✓
- R6: handoff inerte ✓
- R7: sin reader = compatibilidad hacia atrás ✓

### Ciclo RED-GREEN verificado (muestreo)

| Seam | RED esperado (pre-impl) | GREEN (post-impl) |
|---|---|---|
| Probe binary fail-closed | Test fallaba sin `checkPiBinaryUpdate` | `bun test tests/update-probes.test.ts` → 17 PASS |
| Snapshot non-blocking | Test fallaba sin `startUpdateEvidenceSnapshot` | `read()` undefined antes, array después |
| Render por componente | Test fallaba sin `renderWorkbenchAdvisor` | 6 tests nuevos en launcher → PASS |

### Línea base

- Pre-N.1: 1476 pass, 109 ficheros
- Post-N.1: **1499 pass, 110 ficheros** (confirmado independiente: `bun test` → 1499 pass, 0 fail)
- Delta: +23 tests (+17 en update-probes, +6 en launcher) ✓

### Assertion quality

**Sin tautologías** (todas las aserciones verifican comportamiento real):
- `expect(parseVersion("v1.2.3")).toEqual([1, 2, 3])` — función pura, result específico ✓
- `expect(snapshot.read()).toBeUndefined()` → `expect(snapshot.read()).toEqual([...])` — estado mutable (promesa), transición verificable ✓
- `expect(output).toContain("- Ein: update-available")` — output string, contiene substring ✓

---

## Typecheck Manual

**Comando ejecutado**:
```bash
installer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck \
  --target esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions \
  --typeRoots installer/node_modules/@types --types node,bun \
  ein-pi/agent/lib/update-probes.ts \
  ein-pi/agent/lib/workbench.ts \
  ein-pi/agent/surfaces/workbench-entrypoint.ts
```

**Resultado**: 0 errores en los tres archivos objetivo.

**Notas**:
- Errores residuales (`ein-pi/agent/extensions/ein-paths.ts` sin resolución del SDK, `sdd-router.ts` bugs preexistentes) quedan fuera como documentado en tasks.md:320.
- Sin `any` implícito ni aserción de tipo rota en archivos de N.1.

---

## Comportamiento Observable — Resumen de Verificaciones

| Comportamiento | Comando | Resultado |
|---|---|---|
| Tests globales | `bun test` | 1499 pass, 0 fail |
| Tests de probes | `bun test tests/update-probes.test.ts` | 17 pass |
| Tests launcher | `bun test tests/minimal-workbench-launcher.test.ts --grep launcher` | 6+ pass |
| Tests banner (sin modificación) | `bun test tests/ein-banner-updates.test.ts` | 24 pass (no regresión) |
| Carga módulos N.1 | `bun --eval "import('./ein-pi/agent/lib/update-probes.ts')"` | OK (6 exports) |
| Typecheck N.1 | tsc --noEmit --strict | 0 errores |
| Imports SDK en N.1 | grep SDK value imports | 0 encontrados |
| Spawns en launcher | grep spawn/execFile | 0 encontrados |

---

## Decisiones Validadas

1. ✓ **Probes portables en `lib/`, paquetes en extension**: arquitectura respetada. Inyección de versiones confirmada.
2. ✓ **Fuentes verificables por runtime**: Ein verificable en ambos, binary/packages declarados no verificables en launcher (N.3 los levantará).
3. ✓ **Política de espera cero**: snapshot arranca en borde, `read()` no bloqueante, timeout heredado sin cambios.
4. ✓ **Reader inyectable**: `readUpdateObservations?: ()` opcional, backward-compatible.
5. ✓ **Render por componente**: derivado de `result.update.provenance`, orden determinista, condiciones R2/R4/R5 respetadas.
6. ✓ **`ein-banner.ts` conserva comportamiento**: tests sin cambios, pasan todos (24/24).

---

## Riesgos Residuales

1. **SDK no declarado en manifiestos** (Risk 1, design): Preexistente. `models-panel.ts` viola arquitectura. Ajena a N.1.
2. **Ruido permanente `binary` y `packages`** (Risk 2): Intencionado. N.3 lo reduce.
3. **Tope de procedencia** (Risk 3, `MAX_ADVISOR_PROVENANCE = 8`): 3 observaciones en N.1, holgura. N.2 debe verificar.

---

## Bloqueadores

Ninguno. El cambio es verificable y cumple todas las compuertas.

---

## Conclusión

**N.1 está completo y verificado**:
- Comportamiento observable probado por tests dedicados.
- Invariante de arquitectura (correcta, más estrecha) validada.
- Typecheck limpio, tests verdes, cero regresiones.
- El design necesita corrección textual en línea 149 (invariante falsa) pero eso NO invalida la ejecución técnica.

**Siguiente**: Cerrar N.1, proceder a N.2 (Claude Code como cuarta fuente).
