# Scope: launcher-update-surface (bloque N del roadmap)

## Objetivo

Que el launcher avise de actualizaciones disponibles y ofrezca aplicarlas, exactamente como hace cualquier programa que se respeta.

## Alcance

Consumir el advisor de F (`shared-config-update-advisor`) desde el launcher; mostrar qué componente tiene actualización (Ein, binario de Pi, extensiones/paquetes, Claude Code) y ofrecer ejecutar la acción correspondiente delegando en el installer. El aviso debe ser accionable (imprimiendo el comando exacto, sin ejecutarlo) y explícitamente silencioso cuando no hay nada que hacer o la evidencia no es fresca.

### Incluye

- Integrar la detección de actualizaciones (`detectPiEinUpdates` de `ein-pi/agent/lib/ein-update-notice.ts`) en la superficie del launcher (`ein-pi/agent/lib/workbench.ts`).
- Renderizar el consejo de actualización de forma legible después de confirmar el proyecto y antes de seleccionar el runtime.
- Detectar y avisar sobre actualizaciones de: Ein, binario de Pi, extensiones/paquetes de Pi, y Claude Code (versión instalada y release disponible).
- Ejecutar la acción de actualización por handoff explícito al installer: **el launcher imprime el comando exacto sin ejecutarlo**.
- Distinguir clara y visiblemente: actualización accionable (componente + comando), evidencia stale/incompleta (no accionable), ausencia (silencio declarado).
- Validar que el launcher imprime el comando sin ejecutarlo y que la frontera al installer es auditable.

### No incluye

- Implementar la lógica de instalación o actualización dentro del launcher.
- Lanzar el installer como proceso, o cualquier ejecución de la acción de actualización desde el launcher. El handoff es inerte: `performed: false` siempre.
- Construir un updater universal o avanzado de terceros.
- Reabrir el diseño del advisor de F.
- Aplicar cambios masivos al launcher más allá de la integración explícita del aviso.

## Dependencias

- **F**: `shared-config-update-advisor` (entregado en `openspec/changes/archive/shared-config-update-advisor/`). Contrato inmutable; contiene Colisión 1 y 2 que N debe resolver.
- **M**: `surface-wiring` (prerequisito de N; debe existir una superficie invocable del launcher antes de que N sea testeable).

## Criterios de aceptación

- El aviso nombra el componente y el comando exacto para aplicar la actualización.
- Evidencia obsoleta, expirada o incompleta nunca se presenta como accionable.
- La ejecución cruza al installer por una frontera explícita y auditable.
- Cuando no hay actualización o la evidencia no es fresca, el launcher no presenta un aviso vacío o confuso; es silencio declarado.

## Decisiones ya resueltas

### Decisión 1 — Claude Code: INCLUIDO en N

**Resolución:** Claude Code **entra** en el alcance de N. Sub-decisión pendiente reformulada (Decisión 2a): ya no es "¿si o no?", sino "¿cómo se modelan los cuatro componentes?" — ampliar `PiEinUpdateObservation.source` o construir modelo aparte.

### Decisión 5 — Handoff: IMPRESIÓN del comando exacto (no ejecución)

**Resolución:** El launcher imprime el comando literal exacto (ej. `ein update`) sin lanzar procesos, invocar el installer, ni ejecutar nada. El handoff sigue siendo inerte: `performed: false` siempre. Esta restricción evita directamente que "actualizar desde aquí" arrastre lógica del installer dentro del launcher.

## Decisiones pendientes — Deben resolverse durante map/design

### 2a. Cómo modelar Claude Code como cuarta fuente

`PiEinUpdateObservation.source` define exactamente `"binary" | "packages" | "ein"`; Claude Code necesita representación.

**Opciones:** A) Ampliar `source` a cuatro valores — simple, pero mezcla binarios Pi con aplicación terceros. B) Bloque de evidencia aparte — modela sin contaminar Pi. C) Adaptador de traducción — lleva overhead.

**Default:** Opción A si diferencias de contexto mínimas; opción B si semántica muy distinta. Design resuelve.

---

### 2b. Dónde viven las probes de Pi (extracción de módulo compartido)

Las probes existen en `ein-banner.ts:334–392`. Restricción: `checkPiBinaryUpdate` y `checkEinTemplateUpdate` son portables (endpoints remotos + lectura local); `checkPiPackageUpdates` importa `SettingsManager` del SDK de Pi y no es portable en Claude.

**Opciones:** A) Extraer a `ein-pi/agent/lib/update-probes.ts` con guards de contexto — limpio, sin duplicación. B) Launcher construye suyas — independiente pero duplica lógica. C) Intermediario de inyección — overhead de wiring.

**Default:** Opción A con guards explícitos. Design especifica si se lanza la probe de paquetes en Claude.

---

### 3. Gate de runtime: qué evidencia tiene sentido en cada contexto

`detectPiEinUpdates` usa `isPiEinRuntime()` por defecto; fuera de Pi devuelve `skipped/not-isolated-runtime`. El launcher corre en ambos runtimes.

**Opciones:** A) Cada runtime solo ve lo relevante (Pi: Ein+binary+packages+Claude; Claude: solo Claude) — honesto pero asimétrico. B) Presentar "desconocido" para no verificables — declara ignorancia. C) Gate ajustable en tiempo de llamada — máxima flexibilidad.

**Default:** Opción B (presentar honestamente lo verificable). Design resuelve qué significa "Ein tiene actualización" en Claude.

---

### 4. Política de espera en interactivo

`UPDATE_CHECK_TIMEOUT_MS = 2000`, fail-open, calibrado para arranque no interactivo.

**Opciones:** A) Respetar 2s — consistente, no bloquea. B) Aumentar timeout — más evidencia fresca pero UX peor si falla. C) Cachear — rápido pero riesgo de stale. D) Render honesto "desconocido" — nunca simular.

**Default:** Opción A + D (2s timeout, render honesto si no hay evidencia fresca). Ejecutar en N.3.

---

## Colisiones de contrato con F

El scope debe resolver explícitamente dos colisiones duras que design descubriría tarde:

### Colisión 1 — La ruta de `observations` produce UN solo veredicto, no uno por componente

`updateFacet()` en `shared-config-update-advisor.ts:289-299` evalúa todas las observaciones con precedencia de colapso: cualquier `unsupported` → `unsupported` total; cualquier `unavailable/skipped/unknown` → `unavailable` total; solo después gana `update-available`.

**Problema (a) — Enmascaramiento existente hoy:** Una fuente `skipped` tumba el veredicto entero. Disparadores reales: `PI_SKIP_VERSION_CHECK` (solo marca `binary` como skipped; `packages` y `ein` se comprueban, pero quedan invisibles por el colapso). Instalación de Ein en desarrollo devuelve `skipped/development-install` de `checkEinTemplateUpdate`, tapando binario y paquetes. Verificado: `ein=update-available, binary=current, packages=skipped` devuelve `Update: status=unavailable`; con `packages=current` devuelve `status=update-available`. Es un defecto independiente de Claude Code.

**Problema (b) — Agravamiento por Decisión 1:** Claude Code `skipped` cuando no esté instalado hará invisible cualquier actualización de Ein/binario/paquetes. Impacto: "el aviso nombra componente y comando exacto" no se puede satisfacer si status colapsado es `unavailable`.

**Problema (c) — Salida no por componente:** `renderAdvisorSemantics()` imprime una sola línea `Update: status=...`, no distingue componentes individuales.

**Solución registrada:** N.1 debe pasar observaciones crudas (que sí llevan `source` por elemento) al launcher, no solo status colapsado. Launcher construye su propio render por componente; usa advisor solo para veredicto global + handoff + recomendación. F queda intacto.

### Colisión 2 — Claude Code no puede ser accionable bajo F-007

F-007: "owner externo es `unsupported` incluso con versión igual o nueva; solo owner installer coherente produce handoff" (`openspec/changes/archive/shared-config-update-advisor/summary.md:24`). Claude Code es externo → `owner: external` → `unsupported` → sin handoff.

**Choque:** "No incluye: Reabrir el diseño del advisor de F" + Decisión 1 (Claude Code incluido).

**Solución registrada:** Claude Code en N.2 es **informativo, no accionable**. El launcher imprime la actualización disponible de Claude Code, pero NO produce handoff del installer (F-007 lo prohíbe). El usuario ve la información pero sin handoff inerte como sí lo hay para Ein.

---

## Evidencia validada (referencias precisas)

1. **Hueco en launcher:** `createWorkbenchAdvisor()` línea 121 de `ein-pi/agent/lib/workbench.ts` nunca invoca `detectPiEinUpdates` para obtener `update`. (Líneas 1-2 en Colisiones expanden esto.)
2. **Probes:** `checkPiBinaryUpdate`, `checkPiPackageUpdates`, `checkEinTemplateUpdate` en `ein-banner.ts:334–392`, inyectadas en línea 386-395. (Línea 2b explica portabilidad diferenciada.)
3. **Gate:** `detectPiEinUpdates` línea 158-168 de `ein-update-notice.ts` usa `isPiEinRuntime()` por defecto. (Línea 3 explica contexto.)
4. **Timeout:** `UPDATE_CHECK_TIMEOUT_MS = 2000` línea 16 de `ein-update-notice.ts`, fail-open. (Línea 4 explica política.)
5. **F-007:** `summary.md` línea 24 de shared-config-update-advisor; verifica `spawns=0`. N.2 probe de Claude Code requiere `ProcessRunner` acotado como en `ein-banner.ts:137-156` (timeout, maxBuffer, ETIMEDOUT).
6. **No precedentes:** Ningún import ein-pi → installer/src. Frontera de handoff es presentación, no ejecución.

## Riesgos declarados

1. **Ownership duplicado** (decisión 5 resuelta): Auditar que no hay imports de installer en ein-pi, launcher solo imprime, sin callback ni ejecución. Test de handoff.performed = false.
2. **Frescura de evidencia:** 2s fail-open deja gaps; render honesto es crítico. N.3 renderiza aviso/stale/desconocido/ausencia. Test con timeouts simulados.
3. **Asimetría entre runtimes:** Decisión 3 crítica. Design de N.1 especifica qué fuentes en Pi y Claude.
4. **Enmascaramiento (Colisión 1):** Ya oculta actualizaciones hoy en el banner de arranque; agravamiento con Claude Code. **Se extrae fuera de N** al cambio `fix-update-notice-masking` (ver "Dependencia externa" abajo), que debe entrar antes de N.1.
5. **Presupuesto productivo:** Cuatro fuentes + extracción + guardias + rendering honesto. Mitigación: partición en tres slices.

## Dependencia externa — `fix-update-notice-masking`

El enmascaramiento de la Colisión 1(a) **no se arregla dentro de N**. Es un defecto de producción del banner de arranque de Pi, una superficie que N no toca, y su arreglo no requiere modificar el advisor de F.

Localización exacta: `renderPiEinAdvisorNotice()` en `ein-pi/agent/lib/ein-update-notice.ts:314` corta con `if (result.update.status !== "update-available") return null;`. Ese corte usa el veredicto **colapsado** de la faceta. La extracción por componente que viene justo después (líneas 322-327, sobre `result.update.provenance`, que sí lleva `source` por elemento) ya es correcta, pero queda **inalcanzable** en cuanto una sola fuente no es `update-available`.

Verificado de punta a punta con runtime Pi simulado:

| observaciones | faceta | banner |
| :--- | :--- | :--- |
| `ein=update-available`, `binary=current`, `packages=skipped` | `unavailable` | `null` (silencio total) |
| `ein=update-available`, `binary=current`, `packages=current` | `update-available` | `"- Ein template: \`ein update\`"` |

El fail-closed agregado de F **es correcto** y no debe tocarse: responde "no puedo dar un veredicto global limpio". El defecto es del consumidor, que sobre-confía en el agregado y descarta el detalle por componente que ya tiene en la mano.

Disparadores reales en producción: `PI_SKIP_VERSION_CHECK` (solo apaga `binary`) y toda instalación de Ein en desarrollo (`checkEinTemplateUpdate` devuelve `skipped/development-install`).

**Contrato con N:** el fix entra antes que N.1 y deja el render por componente del banner funcionando. N.1 aplica el mismo patrón al launcher. Si el fix se retrasa, N.1 puede avanzar igualmente —son surfaces distintas—, pero N.2 no debe añadir Claude Code como cuarta fuente antes del fix, porque una máquina sin Claude dejaría `skipped` permanente y agravaría el enmascaramiento en el banner.

## Partición en slices SDD

Con Claude Code, restricción de impresión-sin-ejecución, y resolución de la Colisión 2, el alcance requiere **tres slices SDD independientes**:

### N.1: Detección base + cableado del launcher

**Objetivo:** Cerrar criterios de aceptación básicos (Ein, binario, paquetes); establecer patrón honesto de rendering en el launcher.

**Alcance:** Extraer probes a `ein-pi/agent/lib/update-probes.ts` con guards; actualizar `ein-banner.ts`; **modificar launcher para recibir observaciones crudas** (opción A: extender `SharedConfigUpdateAdvisorResult` o B: launcher llama `detectPiEinUpdates` directamente); **renderizar por componente**: "Ein: actualización disponible → `ein update`", "Paquetes: no verificable (offline)" sin colapso. Test seam + handoff inerte.

**No incluye:** el arreglo del enmascaramiento del banner, que sale a `fix-update-notice-masking` (ver abajo).

**Criterios de salida:** Observaciones individuales; componente + comando por cada fuente con actualización; handoff.performed = false. Presupuesto: ~150-190 LOC.

---

### N.2: Cuarta fuente — Claude Code

**Objetivo:** Añadir Claude Code sin quebrar invariantes de N.1.

**Alcance:** Decidir modelo (Decisión 2a); implementar probe con `ProcessRunner` acotado (`claude --version` con timeout/maxBuffer); integrar; **renderizar Claude Code como informativo, no accionable** (Colisión 2); test de detección + falta de instalación.

**Criterios de salida:** Observaciones individuales para cuatro componentes; Claude Code informativo sin handoff; aplicación de Decisión 3 (runtime-specific). Presupuesto: ~120-150 LOC.

---

### N.3: Rendering accionable, silencio declarado y paridad Pi/Claude

**Objetivo:** Completar semántica observable; validar respeto a M (surface-wiring).

**Alcance:** Rendering honesto de cuatro estados por fuente (accionable, stale, desconocido, ausencia); Decisión 4 (2s + render honesto); test de paridad Pi/Claude; test E2E; test handoff.

**Criterios de salida — Cierra roadmap:** Nunca aviso accionable si no fresco; silencio declarado; Pi/Claude semánticamente equivalente o diferencia explícita; handoff inerte; Colisiones 1 y 2 resueltas. Presupuesto: ~120-150 LOC.

---

**Total:** ~420-520 LOC productivas en tres slices (presupuesto elevado por resolución de Colisiones).


## Delta OpenSpec

El aviso observable de actualizaciones se formaliza en el archivo `specs/launcher-update-surface/spec.md` con seis escenarios que Design debe verificar:

1. **aviso-accionable-con-componente-y-comando**: Launcher imprime componente exacto y comando cuando actualización disponible.
2. **evidencia-stale-no-accionable**: Evidencia stale/incompleta nunca presentada como accionable; se declara o silencia.
3. **ausencia-silencio-declarado**: Sin actualización → silencio honesto, no "todo actual" falso.
4. **launcher-no-ejecuta-accion**: Imprime comando sin ejecutarlo; handoff performed=false siempre.
5. **claude-code-informativo-no-accionable**: Claude Code informativo; F-007 prohíbe handoff.
6. **paridad-pi-claude-o-diferencia-declarada**: Output semánticamente equivalente o diferencia explícita.

## Budget allocado

N resuelve Colisiones 1 y 2 (defectos de F), extrae probes con guardias, añade cuarta fuente con ProcessRunner acotado, renderiza honesto por componente. Tres slices independientes (~8–10k tokens cada una).

budget_allocated:
  max_tokens: 25000
  max_reads: 45
  max_runtime_ms: 220000
