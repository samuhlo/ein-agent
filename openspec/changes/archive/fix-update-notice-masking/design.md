# Design: fix-update-notice-masking

**status:** `designed`
**change:** `fix-update-notice-masking`
**phase:** `sdd-design`
**spec_delta:** `none` (heredado de `scope.md`: el fix restaura comportamiento ya especificado; el contrato del advisor no cambia)

## Referencias de spec canónica

`scope.md` no registró referencias a `openspec/specs/<dominio>/spec.md` y `map.md` no aportó domain hints explícitos. Ficheros canónicos leídos en esta fase: **ninguno** (0 de 3 permitidos, 0 bytes de 32 KiB). No se hizo descubrimiento por glob.

---

## A. Proposal

### Intent

Permitir que la noticia de arranque de Ein renderice los componentes frescos y accionables cuando la evidencia agregada del advisor está incompleta (`unavailable`), en lugar de silenciarse por completo. El filtro por componente ya existente es quien decide qué se muestra.

### Scope

**Dentro:**
- Cambiar la condición de corte de `renderPiEinAdvisorNotice()` (`ein-pi/agent/lib/ein-update-notice.ts:314`) por una lista explícita de estados admitidos.
- Cobertura de test que fija el contrato del corte: el caso del defecto **y** el silencio de los estados fail-closed.

**Fuera (no-goals):**
- `shared-config-update-advisor.ts`: su agregación fail-closed es correcta y no se toca.
- El resto de `renderPiEinAdvisorNotice()`: rama de handoff (318-320), filtro por componente (322-327) y válvula de comandos vacíos (328) quedan intactos.
- Runner de tests, CI, y el consumidor `renderPiEinUpdateNotice()` (ruta legacy).

### Affected areas

| Fichero | Cambio |
| :--- | :--- |
| `ein-pi/agent/lib/ein-update-notice.ts` | Línea 314: condición de corte (~1-4 LOC netas, más un comentario de porqué). |
| `tests/ein-banner-updates.test.ts` | Tests nuevos (defecto + silencio fail-closed). Los dos guardias existentes (~441, ~458) **no se modifican**. |

### Risks

1. **Abrir el corte de más.** Si se elimina el corte en vez de acotarlo, `ambiguous`/`error` con un item fresco y accionable en su `provenance` renderizarían — violación directa del principio fail-closed de `EIN.md`. Mitigación: lista de admitidos positiva, más test de silencio por estado.
2. **Ruido en arranque.** `unavailable` es el estado más frecuente en instalaciones reales; ahora habla. Es el objetivo del cambio, no un efecto colateral: solo habla si hay un componente `quality === "update-available" && freshness === "current"`.
3. **Falso sentido de completitud.** El usuario ve un comando accionable sin saber que una fuente no pudo leerse. Aceptado: el texto no afirma nada sobre las fuentes que faltan, y callar una actualización real es peor que informarla parcialmente.

### Rollback

Revertir el commit. El cambio es una condición aislada sin migración, estado persistido ni contrato público: restaurar `if (result.update.status !== "update-available") return null;` devuelve el comportamiento anterior sin efectos residuales.

### Success criteria

- `ein=update-available/current` + `binary=current/current` + `packages=skipped/current` renderiza `- Ein template: \`ein update\``.
- `ambiguous`, `error` y `unsupported` siguen devolviendo `null` aunque su `provenance` contenga un item fresco y accionable.
- Los dos guardias existentes siguen verdes sin tocarse.
- `bun test` desde la raíz en verde.

---

## B. Spec

### R1 — Evidencia incompleta con componentes accionables

El sistema **MUST** renderizar la noticia de arranque cuando el estado de la faceta de actualización sea `update-available` o `unavailable` y exista al menos un item de `provenance` con `quality === "update-available"` y `freshness === "current"`.

> **Given** un resultado del advisor con `ein = update-available/current`, `binary = current/current` y `packages = skipped/current` (faceta resultante: `unavailable`)
> **When** se llama a `renderPiEinAdvisorNotice()` en runtime Pi/Ein
> **Then** el resultado contiene `- Ein template: \`ein update\`` y no menciona los componentes no accionables.

### R2 — Fail-closed en evidencia contradictoria, rota o no soportada

El sistema **MUST** devolver `null` cuando el estado de la faceta sea `ambiguous`, `error` o `unsupported`, **incluso si** su `provenance` contiene items frescos y accionables.

> **Given** un resultado del advisor cuya faceta de actualización es `ambiguous` (o `error`, o `unsupported`) e incluye un item `update-available/current`
> **When** se llama a `renderPiEinAdvisorNotice()`
> **Then** el resultado es `null`.

### R3 — El guardia de frescura no depende del agregado

El sistema **MUST** devolver `null` cuando ningún item de `provenance` sea a la vez accionable y fresco, con independencia del estado de la faceta.

> **Given** evidencia por comparación de versiones con `release` marcada `stale` (faceta `unavailable`, razón `stale-evidence`)
> **When** se llama a `renderPiEinAdvisorNotice()`
> **Then** el resultado es `null`, porque la lista de comandos queda vacía.

### R4 — `current` no anuncia nada

El sistema **MUST NOT** admitir el estado `current` en el corte.

> **Given** un resultado del advisor con faceta de actualización `current`
> **When** se llama a `renderPiEinAdvisorNotice()`
> **Then** el resultado es `null`.

### R5 — Contrato del advisor intacto

El sistema **MUST NOT** modificar la agregación de facetas del advisor compartido ni el filtro por componente existente. El fix vive exclusivamente en el consumidor.

> **Given** el mismo input del advisor antes y después del cambio
> **When** se evalúa `evaluateSharedConfigUpdateAdvisor()`
> **Then** `status`, `freshness`, `reason`, `provenance` y `handoff` son idénticos.

---

## C. Decisions

### D1 — Lista de admitidos positiva, no negación acumulada

La condición se expresa como el conjunto de estados **cuya evidencia todavía puede contener un componente accionable**, no como una cadena de `!==`. Una negación acumulada crece mal y oculta la intención: leyendo `status !== A && status !== B` no se sabe si los demás estados están fuera por diseño o por olvido — que es exactamente cómo nació este defecto. La forma preferida es una constante con nombre (p. ej. `RENDERABLE_UPDATE_STATUSES`) consultada por el corte, con un comentario **en inglés** que explique el porqué (evidencia incompleta puede seguir conteniendo componentes frescos; el filtro por componente decide) y no el qué.

Conjunto admitido: **`update-available`, `unavailable`**.

### D2 — `current` queda fuera por intención, no por inocuidad

Medido en `shared-config-update-advisor.ts`: la faceta solo vale `current` cuando todas las observaciones son `status: "current"` (línea 298) o cuando la comparación de versiones da igualdad con owner `installer` (línea 340), donde la `provenance` son items `valid`. Como `quality` es el `status` de la evidencia (línea 174), en ambos caminos ningún item puede tener `quality === "update-available"`: dejar pasar `current` sería **inocuo pero inútil**.

Se excluye igualmente. El corte declara qué estados *pueden* tener noticia; incluir uno que por construcción nunca la tiene diluye esa declaración y convierte el corte en un filtro redundante. Confirma R4.

### D3 — La rama de handoff no se ve afectada

`handoff` solo se construye en el camino de comparación de versiones cuando hay release más nueva, y ese retorno fija `status: "update-available"` (líneas 351-357). Ningún resultado con faceta `unavailable` puede llevar `handoff`, así que admitir `unavailable` **nunca** alcanza la rama de escape de la línea 318: siempre pasa por el filtro por componente. Esto es lo que hace seguro el cambio, y por eso no hace falta tocar la rama de handoff.

### D4 — El silencio fail-closed entra en cobertura (discrepancia con `map.md`)

`map.md` deja el guardia de `ambiguous`/`error`/`unsupported` como riesgo residual fuera de alcance. Se rechaza: el fix **es** la decisión de qué estados pasan el corte, y verificar solo el lado positivo deja sin test la mitad del contrato que este cambio introduce. Una regresión futura que ampliase la lista a `error` no rompería nada. La cobertura del silencio no es trabajo extra: es la aserción negativa del mismo contrato.

### D5 — Alternativas rechazadas

| Alternativa | Por qué se rechaza |
| :--- | :--- |
| Eliminar el corte y confiar solo en el filtro por componente | El filtro no distingue evidencia contradictoria: una faceta `ambiguous` o `error` puede contener un item `update-available/current` y renderizaría. Rompe fail-closed. |
| Que `updateFacet()` no devuelva `unavailable` cuando hay items accionables | Cambia el contrato del advisor y degrada su honestidad: la evidencia *está* incompleta. El defecto es de interpretación en el consumidor. |
| Renderizar además un aviso de "evidencia incompleta" | Fuera de alcance y contrario a la nota de la función: el arranque solo observa probes y no debe afirmar más de lo que leyó. |

### D6 — Fronteras de responsabilidad

- `shared-config-update-advisor.ts`: **agrega** evidencia de forma fail-closed. No sabe quién la pinta.
- `renderPiEinAdvisorNotice()`: **decide qué evidencia es publicable** (corte por estado) y **qué componentes se nombran** (filtro por `quality` + `freshness`).
- `startPiEinUpdateNotice()`: transporte. No filtra.

---

## D. Success Criteria

### Comportamiento observable

1. **Caso del defecto (trigger de producción).** Advisor con observaciones `ein: update-available/current`, `binary: current/current`, `packages: skipped/current` → faceta `unavailable` → `renderPiEinAdvisorNotice()` devuelve la noticia con `- Ein template: \`ein update\`` y sin `pi-ein update --all`. Es el disparador real: `updateObservation()` (`ein-banner.ts:325-332`) fija `freshness: "current"` por defecto y las probes no lo sobrescriben.
2. **Silencio fail-closed.** Un caso por estado (`ambiguous`, `error`, `unsupported`), cada uno con un item accionable y fresco en `provenance`, devuelve `null`.
3. **Guardias existentes intactos.** `tests/ein-banner-updates.test.ts` líneas ~441 (stale sigue en silencio) y ~458 (tres fuentes frescas renderizan igual) pasan **sin modificar su código**. Si un test existente necesita edición, el cambio se ha ido de alcance.
4. **`current` en silencio** (R4), como aserción barata del límite superior del corte.

Los cuatro se mantienen: (1) es el defecto, (2) es el contrato que este cambio introduce (D4), (3) es la no-regresión, (4) fija la decisión D2 para que no se reabra por descuido.

### Orden TDD (estricto)

`strict_tdd: true`. Cada test de los puntos 1, 2 y 4 se escribe **primero** y debe fallar por la razón correcta antes de tocar `ein-update-notice.ts`:
- Punto 1 falla en RED devolviendo `null` (corte actual).
- Puntos 2 y 4 pasan en RED con el corte actual: son guardias de contrato, no motores del cambio. Se escriben antes igualmente y deben seguir verdes tras el fix; su valor es fallar si alguien amplía la lista de admitidos.

### Verificación

- `bun test tests/ein-banner-updates.test.ts` — ciclo corto durante apply.
- `bun test` desde la raíz del repo — puerta de entrega.
- Revisión manual: el diff de producción toca una sola condición en `ein-pi/agent/lib/ein-update-notice.ts`; ningún otro fichero de `ein-pi/` aparece en el diff.
