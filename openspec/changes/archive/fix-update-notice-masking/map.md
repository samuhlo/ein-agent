# Map: fix-update-notice-masking

**status:** `mapped`  
**scope_status:** `bounded`  
**change:** `fix-update-notice-masking`  
**phase:** `sdd-map`

---

## Scope Summary

Defecto: `renderPiEinAdvisorNotice()` en `ein-update-notice.ts:314` realiza un corte conservador que silencia la noticia de actualización cuando la faceta de actualización tiene estado `unavailable` (evidencia incompleta), incluso si existen componentes frescas y accionables entre sus fuentes. El filtro por componente (líneas 321–327) es correcto; el corte debe permitir que `unavailable` llegue a ese filtro.

Confirmación de evidencia medida (del scope):
- Caso 1 (trigger real): `packages=skipped/current` → facet: `unavailable`, actionable: `["ein"]` — actualmente silenciado, debe renderizar.
- Caso 3 (test existente, stale): `freshness="stale"` → facet: `unavailable`, actionable: `[]` — sigue siendo silenciado por el filtro de componente (protección automática).

---

## Reading Surface (Bounded Scope)

### Core defect: `ein-update-notice.ts`

**File:** `ein-pi/agent/lib/ein-update-notice.ts`

- **Línea 309–330:** Función `renderPiEinAdvisorNotice(result, runtime)` — es el blanco.
  - Línea 314: `if (result.update.status !== "update-available") return null;` — corte defectuoso.
  - Línea 318–320: Rama de handoff installer (irrelevante al fix).
  - Línea 322–327: Filtro por componente correcto (`quality === "update-available" && freshness === "current"`).
  - Línea 328: Retorno de `null` si no hay comandos — válvula de seguridad.

- **Línea 332:** Alias `export const renderPiEinUpdateAdvice = renderPiEinAdvisorNotice;` — no es un llamante.

- **Línea 262–287:** Función `startPiEinUpdateNotice(ctx, detectUpdates, runtime, renderRuntime, provenance)` — llamante de producción.
  - Línea 274: `renderPiEinAdvisorNotice(availability, renderRuntime)` — llamada al defectuoso.
  - Lógica: detecta `availability`, decide si es `SharedConfigUpdateAdvisorResult` (contiene `configuration`), y llama a `renderPiEinAdvisorNotice` en ese caso.

### Type definitions: `shared-config-update-advisor.ts`

**File:** `ein-pi/agent/lib/shared-config-update-advisor.ts`

- **Línea 17–23:** `AdvisorUpdateStatus` type union:
  ```ts
  "current" | "update-available" | "unavailable" | "unsupported" | "ambiguous" | "error"
  ```
  **6 valores totales.** El scope enumera decisión solo para 5: no menciona explícitamente `"current"`.
  - **Análisis:** `"current"` significa "no hay actualización disponible". Por naturaleza, nunca alcanzará `renderPiEinAdvisorNotice` porque `detectUpdates()` no llamaría a ella si el estado es `current` (es un no-evento de actualización). Sin embargo, es posible que un test lo inyecte. **No cambia la decisión del fix,** pero es una faceta que debe confirmarse como "no aplica".

- **Línea 94–99:** `AdvisorFacet<TStatus>` contiene `status`, `freshness`, `reason`, `provenance[]`.
- **Línea 114–120:** `SharedConfigUpdateAdvisorResult` contiene `configuration`, `update` (ambos `AdvisorFacet`), `recommendation`, `handoff?`.

### Tests: `ein-banner-updates.test.ts`

**File:** `tests/ein-banner-updates.test.ts`

- **Línea 441–456:** Test `"stays silent when stale evidence never became an actionable update"`
  - Input: status `unavailable`, `freshness: "stale"`
  - Expectativa: `renderPiEinAdvisorNotice(result, ...) === null`
  - **Blast radius: NO ROMPE.** Con el fix (permitir `unavailable`), el filtro de componente (línea 324: `freshness === "current"`) excluye items `stale`. Array `commands` queda vacío. Línea 328 devuelve `null` de todas formas. Protección automática validada.

- **Línea 458–472:** Test `"startup notice renders actionable commands and never claims unread configuration"`
  - Input: 3 observaciones, una `update-available/current`, dos `current/current`
  - Expectativa: renderiza `"- Ein template: `ein update`"`
  - **Blast radius: NO AFECTA.** Estado faceta probable `update-available` (3 fresh + 1 actionable). Línea 314 ya lo deja pasar actualmente. El fix no lo toca.

- **No otros tests** usan `renderPiEinAdvisorNotice` en este archivo (confirmado por grep).

---

## Caller Inventory

### Transitive call chain (production)

1. **`ein-banner.ts`** → imports `startPiEinUpdateNotice` from `ein-update-notice.ts`
   - Llamante de arranque durante `session_start`.
   - No llama directamente a `renderPiEinAdvisorNotice`; lo hace vía `startPiEinUpdateNotice`.

2. **`startPiEinUpdateNotice()`** (línea 262 de `ein-update-notice.ts`)
   - Llamante directo a `renderPiEinAdvisorNotice` en línea 274.
   - Pasa la evidencia completa colapsada (`availability`, que es `SharedConfigUpdateAdvisorResult`).
   - No existe usuario final que dependa del silencio actual: `renderPiEinAdvisorNotice` es un consumidor interno, no una API pública.

3. **Direct test callers** (2)
   - `tests/ein-banner-updates.test.ts` línea 455: test de stale (verificación de no-regresión).
   - `tests/ein-banner-updates.test.ts` línea 468: test de frescas (verificación de positivo).

### Alias

- `renderPiEinUpdateAdvice` (línea 332) es un alias puro, sin llamantes separados.

**Conclusión:** Ningún llamante depende del comportamiento actual de silencio total en `unavailable`. El riesgo de dependencia es **nulo**.

---

## Decision Surface for Design

### Current behavior (defective)

```
if (result.update.status !== "update-available") return null;
```

Silencia cuando: `"current"`, `"unavailable"`, `"unsupported"`, `"ambiguous"`, `"error"`.
Renderiza solo cuando: `"update-available"`.

### Required behavior (fix)

Según el scope:
- **Pasar a filtro:** `"update-available"`, `"unavailable"`
- **Silenciar:** `"ambiguous"`, `"error"`, `"unsupported"`
- **Nota sobre `"current"`:** No es relevante en producción (no se inyecta en faceta de actualización); si llega a un test, el filtro por componente lo maneja.

### Decision: Minimal change

La línea 314 debe cambiar de:
```ts
if (result.update.status !== "update-available") return null;
```
a:
```ts
if (result.update.status !== "update-available" && result.update.status !== "unavailable") return null;
```

O equivalentemente (más legible):
```ts
if (!["update-available", "unavailable"].includes(result.update.status)) return null;
```

**El resto de la función es correcto:** El filtro de componente (línea 324) ya ejecuta el gatekeeping por `freshness === "current"`, asegurando que no se renderizan items stale, missing o unknown.

---

## Blast Radius Analysis

### Existing tests

1. **Test línea 441 (stale):**
   - Escenario: facet `unavailable`, componente `freshness: "stale"`
   - Cambio post-fix: línea 314 permite `unavailable` → pasa a línea 322 → filtro en línea 324 excluye `stale` → `commands.length === 0` → línea 328 retorna `null`
   - **Resultado:** Test sigue pasando. ✓

2. **Test línea 458 (frescas):**
   - Escenario: facet `update-available`, componentes fresh
   - Cambio post-fix: línea 314 ya permite `update-available` actualmente → sin cambio de ruta
   - **Resultado:** Test sigue pasando. ✓

### New test required (per scope, line 72)

Debe verificar: `ein=update-available/current` + `binary=current/current` + `packages=skipped/current`.
- Facet resultante: `unavailable` (evidencia incompleta: package skipped)
- Provenance actionable: `["ein"]` (freshness="current" + quality="update-available")
- Expectativa: renderiza `"- Ein template: `ein update`"` (no silencia)
- **Esto es exactamente el defecto medido en caso 1 del scope.**

### Código afectado

- Solo `ein-update-notice.ts` línea 314 se modifica.
- Ningún import, export, o llamante adicional se toca.
- No hay dependencia de `current` (si existiera, sería pre-fix un no-op silencioso; post-fix, se filtraría igual).

---

## Residual Risks

### 1. Scope gap: `"current"` status not enumerated
- **Hallazgo:** `AdvisorUpdateStatus` tiene 6 valores; scope enumera decisión para 5 (olvida mencionar `"current"` explícitamente).
- **Análisis:** `"current"` nunca debería alcanzar este código (significa "sin actualización"). Si un test lo inyecta, línea 324 lo excluye (requiere `quality === "update-available"`).
- **Mitigación:** No es un riesgo del fix. Design/apply puede confirmarlo si quiere.

### 2. Handoff branch (línea 318–320) unverified
- **Hallazgo:** El scope no menciona si handoff `owner="installer"` puede coexistir con `status="unavailable"`.
- **Análisis:** Si handoff es verdadero (existe y `performed=false`), devuelve antes de llegar al filtro. No hay conflicto de lógica.
- **Mitigación:** No es un riesgo del fix; handoff es una rama de escape que no cambia.

### 3. No regression guard for `ambiguous`, `error`, `unsupported`
- **Hallazgo:** No hay test que verifique que estos estados sigan siendo silenciosos.
- **Análisis:** El nuevo test (caso 1) verifica `unavailable` renderiza; no testa que otros silencien.
- **Mitigación:** Recomendado: agregar un test para cada uno de estos estados. Pero fuera de scope de fix. Design puede considerarlo.

---

## Summary for Design

**Cambio:** Una línea lógica (314) para permitir `unavailable` pasar a filtro por componente.

**Protecciones automáticas:**
- Filtro por freshness (línea 324) protege contra stale/unknown.
- Filtro por quality (línea 324) protege contra items no-update-available.
- Test de regresión (línea 441) verifica stale sigue siendo silencioso.
- Handoff branch (línea 318) no es afectada.

**Nueva cobertura de test:** Caso medido del scope (packages skipped + ein available).

**Líneas de código modificadas:** 1 (línea 314). **Presupuesto: ~5 LOC de cambio neto.**

---

## Ledger

```
reads:
  - path: openspec/changes/fix-update-notice-masking/scope.md
    lines: ~91
    estimated_tokens: 2200
  - path: ein-pi/agent/lib/ein-update-notice.ts
    lines: 60 (offset 300-360) + 80 (offset 250-330) = 140 total
    estimated_tokens: 1800
  - path: ein-pi/agent/lib/shared-config-update-advisor.ts
    lines: 30 (10-40) + 6 (114-120) + 6 (94-99) = 42 total
    estimated_tokens: 600
  - path: tests/ein-banner-updates.test.ts
    lines: 50 (430-472) + 40 (441-480) = 90 total
    estimated_tokens: 1200

budget_consumed:
  tokens: ~5800 / 8000 (72%)
  reads: 8 / 15 (53%)

webfetch_used: false
```
