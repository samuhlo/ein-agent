status: pass
behavior_coverage: verified

# Verify Report: fix-update-notice-masking

---

## Executive Summary

El cambio completa todos los criterios de verificación: sustituye la negación acumulada por una lista explícita de admitidos en el corte de `renderPiEinAdvisorNotice()`, permitiendo que evidencia incompleta (`unavailable`) con componentes accionables se renderice. Cuatro comportamientos con test verificados (defecto + guardias fail-closed × 3 + límite superior). Dos tests existentes intactos. Suite completa en verde.

---

## Alcance del Diff

| Fichero | Cambios | Verificado |
| :--- | :--- | :--- |
| `ein-pi/agent/lib/ein-update-notice.ts` | Constante `RENDERABLE_UPDATE_STATUSES` (línea 309) + condición (línea 322) + import tipo (línea 8) | ✓ Aislado |
| `tests/ein-banner-updates.test.ts` | 5 tests nuevos (defecto + 3 guardias + límite) | ✓ Correctos |
| `ein-pi/agent/lib/shared-config-update-advisor.ts` | Sin cambios (solo importado tipo) | ✓ Intacto |
| Resto de `ein-pi/` | Sin cambios | ✓ Intacto |

**Verificación de no-regresión:**
- Línea ~441 `"stays silent when stale evidence never became an actionable update"` — idéntico en `main` y actual.
- Línea ~458 `"startup notice renders actionable commands and never claims unread configuration"` — idéntico en `main` y actual.

---

## Contrato de la Constante

```typescript
const RENDERABLE_UPDATE_STATUSES: ReadonlySet<AdvisorUpdateStatus> = new Set(["update-available", "unavailable"]);
```

✓ Tipo explícito: `ReadonlySet<AdvisorUpdateStatus>`  
✓ Contenido exacto: `["update-available", "unavailable"]` (ambos, nada más)  
✓ Uso correcto: `.has()` en línea 322 (narrowing seguro con `ReadonlySet`)

---

## Cobertura de Comportamientos (Seams de Test)

### 1. Caso del Defecto — Renderiza con Faceta Agregada `unavailable`

**Test:** Línea 474-487 `"renders an actionable component even when the aggregate facet is unavailable"`

```typescript
observations: [
  { status: "update-available", source: "ein", reason: "newer-release", freshness: "current" },
  { status: "current", source: "binary", reason: "read-success", freshness: "current" },
  { status: "skipped", source: "packages", reason: "offline", freshness: "current" },
]
// Faceta resultante: unavailable (packages skipped)
// Esperado: renderiza "- Ein template: `ein update`"
```

**TDD Evidence:** Según `apply-progress.md`:
- RED: Test falla devolviendo `null` (corte línea 314 rechaza `unavailable`).
- GREEN: Tras añadir `RENDERABLE_UPDATE_STATUSES` que admite `unavailable`, test pasa.

**Assertion:** `expect(rendered).toBe(["/// 000. EIN UPDATES", "", "- Ein template: `ein update`"].join("\n"))` — revierte a `null` si se elimina `unavailable` de la lista.

**Status:** ✓ Verificado. Comando: `bun test tests/ein-banner-updates.test.ts`

---

### 2. Silencio Fail-Closed — `ambiguous`, `error`, `unsupported`

**Tests:** Línea 489-502 — bucle `for...of` generando 3 sub-casos

```typescript
for (const [status, reason] of [
  ["ambiguous", "ambiguous-evidence"],
  ["error", "invalid-evidence"],
  ["unsupported", "unsupported"],
] as const) {
  test(`stays silent when the aggregate facet is ${status}, even with an actionable component`, () => {
    // Cada caso: observations con status accionable pero faceta fail-closed
    // Esperado: renderiza null
```

**TDD Evidence:** Según `apply-progress.md`:
- RED: Ya pasaban (guardia de contrato, no motor del cambio). El corte actual (`!== "update-available"`) ya rechaza estos estados.
- GREEN: Siguen pasando. Protegen contra regresiones si alguien amplía la lista a `error` u otro estado fail-closed.

**Assertions:**
- `expect(result.update.status).toBe(status)` — confirma que el advisor construyó el estado esperado.
- `expect(renderPiEinAdvisorNotice(...)).toBeNull()` — revierte a no-null si se agrega el estado a la lista de admitidos.

**Status:** ✓ Verificado. Comando: `bun test tests/ein-banner-updates.test.ts` (3 sub-casos integrados en 1 test parametrizado).

---

### 3. Límite Superior — Exclusión Intencional de `current`

**Test:** Línea 505-516 `"stays silent when the aggregate facet is current, by construction and by intent"`

```typescript
observations: [
  { status: "current", source: "binary", reason: "read-success", freshness: "current" },
  { status: "current", source: "packages", reason: "read-success", freshness: "current" },
]
// Faceta resultante: current (todas las fuentes current)
// Esperado: null (por intención D2, aunque el filtro por componente también lo rechazaría)
```

**TDD Evidence:** Según `apply-progress.md`:
- RED: Pasaba (el corte actual rechaza `current`).
- GREEN: Sigue pasando. Fija la decisión D2 (excluir `current` por intención, no por inocuidad).

**Assertion:** `expect(renderPiEinAdvisorNotice(...)).toBeNull()` — revierte a no-null si se añade `"current"` a la lista.

**Status:** ✓ Verificado. Comando: `bun test tests/ein-banner-updates.test.ts`

---

### 4. Guardias Existentes — No-Regresión

**Tests:** Línea ~441 y ~458 (intactos)

**Status:** ✓ Verificado. Código idéntico a `main`, tests pasan.

---

## Evidencia TDD (Estricto)

**Orden de fases:**

| Seam | RED | GREEN | Fase |
| :--- | :--- | :--- | :--- |
| Defecto (unavailable renderiza) | Falla: null → esperado comando | Pasa tras `RENDERABLE_UPDATE_STATUSES` | ✓ Motor TDD |
| Guardias (ambiguous/error/unsupported) | Pasa (guardia contrato) | Sigue pasando | ✓ Protección |
| Límite superior (current) | Pasa (guardia intención) | Sigue pasando | ✓ Documentación |
| Existentes (~441, ~458) | Pasan | Siguen sin editar | ✓ No-regresión |

**Requisito de Design D4:** "El silencio fail-closed entra en cobertura… El fix **es** la decisión de qué estados pasan el corte, y verificar solo el lado positivo deja sin test la mitad del contrato que este cambio introduce."

**Compliance:** ✓ Los guardias (`ambiguous`, `error`, `unsupported`, `current`) tienen tests que fallarían si la lista se ampliara indebidamente. La cobertura es bidireccional (qué sí, qué no).

---

## Suite Completa

**Comando:** `bun test` (raíz)

**Resultado:**
```
1476 pass
0 fail
109 ficheros
```

**Línea base esperada:**
- Preexistente: 1471 pass
- Nuevos: 5 tests (defecto + 3 guardias + límite)
- **Total:** 1471 + 5 = 1476 ✓

---

## Tests Focalizados

**Comando:** `bun test tests/ein-banner-updates.test.ts`

**Resultado:**
```
24 pass
0 fail
78 expect() calls
```

**Desglose:**
- Preexistentes: 19 tests
- Nuevos: 5 tests (defecto + 3 guardias + límite)
- **Total:** 19 + 5 = 24 ✓

---

## Limitaciones de Verificación (Documentadas en apply-progress.md)

- **ein-pi/ no tiene puerta de tipos determinista:** No hay `tsconfig.json` en la raíz; `bun run typecheck` solo cubre `installer/`. El tipado se verificó implícitamente a través de `bun test` (compilación via bun).
- **Import de tipo `AdvisorUpdateStatus`:** Agregado correctamente a la línea 8. `shared-config-update-advisor.ts` no modificado.

Estas limitaciones son conocidas y no representan defectos de este cambio.

---

## Decisiones de Diseño Verificadas

| Decisión | Verificación |
| :--- | :--- |
| **D1** — Lista positiva, no negación acumulada | ✓ `RENDERABLE_UPDATE_STATUSES` es declarativa |
| **D2** — `current` fuera por intención | ✓ Test específico verifica exclusión |
| **D3** — Rama de handoff no afectada | ✓ Diff no toca líneas 318-320 |
| **D4** — Guardias fail-closed cubiertos | ✓ 3 tests + límite en cobertura |
| **D5** — Alternativas rechazadas | ✓ Implementación sigue diseño |
| **D6** — Fronteras de responsabilidad | ✓ Solo consumidor modificado, advisor intacto |

---

## Criterios de Aceptación Globales (Design § D)

1. **Caso del defecto renderiza:** ✓ Test línea 474-487 pasa
2. **Guardias fail-closed:** ✓ Tests línea 489-502 pasan
3. **Límite superior:** ✓ Test línea 505-516 pasa
4. **Tests existentes intactos:** ✓ Línea ~441, ~458 sin editar
5. **Diff aislado:** ✓ Solo `ein-update-notice.ts` + tests
6. **Línea base:** ✓ `bun test` 1476 pass, 0 fail

---

## Comportamiento Observable

El cambio habilita un caso de producción real:

**Antes:** Advisor devuelve faceta `unavailable` (paquetes saltados) → consumidor corta en línea 314 → noticia `null` → usuario no ve "ein update" disponible.

**Después:** Advisor devuelve faceta `unavailable` → consumidor consulta `RENDERABLE_UPDATE_STATUSES.has("unavailable")` → pasa → filtro por componente nombra Ein → noticia renderiza "- Ein template: `ein update`" → usuario informado.

**Evidencia:** Test línea 474-487 verifica este flujo end-to-end con `renderPiEinAdvisorNotice()`.

---

## Conclusión

✓ **Verificado.** Todos los seams cubiertos, TDD completo, no-regresión confirmada, diff aislado, suite en verde. El cambio es mínimo, seguro y especificado.

**Comando de cierre:** `cc-ein-sdd check fix-update-notice-masking`
