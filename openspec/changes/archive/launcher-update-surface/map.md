status: complete
scope_status: ok
phase: sdd-map
change: launcher-update-surface

# Map: launcher-update-surface (N.1 — Detección base + cableado del launcher)

---

## Ledger

```
ledger:
  reads:
    - path: openspec/changes/launcher-update-surface/scope.md
      lines: 212
      estimated_tokens: 4200
    - path: openspec/changes/launcher-update-surface/specs/launcher-update-surface/spec.md
      lines: 47
      estimated_tokens: 900
    - path: ein-pi/agent/lib/workbench.ts
      lines: 300
      estimated_tokens: 3600
    - path: ein-pi/agent/lib/ein-update-notice.ts
      lines: 200
      estimated_tokens: 2400
    - path: ein-pi/agent/extensions/ein-banner.ts
      lines: 200
      estimated_tokens: 2200
    - path: ein-pi/agent/lib/shared-config-update-advisor.ts
      lines: 250
      estimated_tokens: 2900
    - path: ein-pi/agent/surfaces/workbench-entrypoint.ts
      lines: 117
      estimated_tokens: 1400
    - path: tests/minimal-workbench-launcher.test.ts
      lines: 200
      estimated_tokens: 2400
    - path: tests/surface-wiring.test.ts
      lines: 150
      estimated_tokens: 1800
  webfetch_used: false
  budget_consumed:
    tokens: 21400
    reads: 9
```

---

## Resumen ejecutivo

N.1 debe extraer las tres probes de detección de Pi de ein-banner.ts a un módulo compartido (`ein-pi/agent/lib/update-probes.ts`), invocar `detectPiEinUpdates()` en el launcher (workbench-entrypoint.ts línea 100) para obtener observaciones crudas por componente, y renderizar honestamente el estado de cada fuente sin colapsar a un veredicto único. El riesgo clave es que `checkPiPackageUpdates()` importa `SettingsManager` del SDK de Pi, no es portable bajo Claude, y necesita guards explícitos. La costura de superficie ya existe (M entregado); falta integración en workbench + rendering honesto.

---

## 1. Superficie de lectura acotada para N.1

### 1.1 Punto de inyección en workbench (`ein-pi/agent/lib/workbench.ts`)

**Línea 121 — `createWorkbenchAdvisor()`:**
```typescript
export function createWorkbenchAdvisor(
  state: ProjectStateV1,
  readers: WorkbenchAdvisorReaders = { inspectMode, inspectModelConfig },
): SharedConfigUpdateAdvisorResult {
  const mode = readers.inspectMode(state.identity.cwd);
  const model = readers.inspectModelConfig(state.identity.cwd);
  return evaluateSharedConfigUpdateAdvisor({
    configuration: { mode: ..., model: ..., project: ... },
  });
}
```
- Hoy solo evalúa configuración (modo/modelo); no invoca detección de actualizaciones
- `readers` son inyectables (patrón test ya en uso)
- Retorna `SharedConfigUpdateAdvisorResult` (type de F)

**Línea 239 — Punto de render:**
```typescript
if (dependencies.advisor) await write(dependencies.output, renderWorkbenchAdvisor(dependencies.advisor(confirmed.state)));
```
- `dependencies.advisor` es una función inyectable: `(state: ProjectStateV1) => SharedConfigUpdateAdvisorResult`
- Llama `renderWorkbenchAdvisor()` (línea 83-85), que delega a `renderAdvisorSemantics()` de F
- Es el único lugar donde el advisor se invoca en el flujo del launcher

### 1.2 Inyección en superficie (`ein-pi/agent/surfaces/workbench-entrypoint.ts`)

**Línea 100 — Asignación de advisor:**
```typescript
advisor: state => createWorkbenchAdvisor(state),
```
- **N.1 debe parchear aquí** para invocar `detectPiEinUpdates()` además de configuración
- Pattern: función pura que recibe `state` y retorna `SharedConfigUpdateAdvisorResult`

### 1.3 Probes existentes (`ein-pi/agent/extensions/ein-banner.ts`, líneas 334-395)

Tres funciones async que retornan `PiEinUpdateObservation`:

| Función | Línea | Portabilidad | Dependencias | Descripción |
|---------|-------|-------------|--------------|-------------|
| `checkPiBinaryUpdate()` | 334 | ✅ Portable | fetch (remote) + VERSION (local const) | Compara pi.dev/api/latest-version con VERSION |
| `checkPiPackageUpdates(cwd)` | 350 | ❌ NO portable | SettingsManager, DefaultPackageManager del SDK | Invoca packageManager.checkForAvailableUpdates() |
| `checkEinTemplateUpdate()` | 366 | ✅ Portable | fetch (remote) + readEinVersion() (local I/O) | Compara GitHub releases/latest con versión instalada |

Todas retornan `PiEinUpdateObservation` (type en ein-update-notice.ts línea 22-27):
```typescript
export type PiEinUpdateObservation = Readonly<{
  source: "binary" | "packages" | "ein";  // ← N.1 scope
  status: PiEinUpdateStatus;
  reason: string;
  freshness: "current" | "stale" | "unknown";
}>;
```

### 1.4 Detector de actualizaciones (`ein-pi/agent/lib/ein-update-notice.ts`)

**Línea 16 — Constante de timeout:**
```typescript
export const UPDATE_CHECK_TIMEOUT_MS = 2_000;
```
- Fail-open (se resuelve si expira)
- Calibrado para arranque no interactivo

**Línea 131-142 — Colector de evidencia sin status colapsado:**
```typescript
export async function collectPiEinUpdateEvidence(
  sources: UpdateEvidenceSources,
  options: { timeoutMs?: number; scheduler?: UpdateTimeoutScheduler } = {},
): Promise<readonly PiEinUpdateObservation[]>
```
- Retorna array de 3 observaciones (binary, packages, ein), cada una con su `source` y `status` independiente
- No colapsiona ni filtra (ese es el trabajo de updateFacet de F)

**Línea 158-168 — Detector principal:**
```typescript
export async function detectPiEinUpdates(
  _cwd: string,
  options: PiEinUpdateDetectorOptions = {},
): Promise<SharedConfigUpdateAdvisorResult>
```
- Invoca `isPiEinRuntime()` por defecto (gate de runtime)
- Si no es Pi runtime: retorna 3 observaciones con `skipped: not-isolated-runtime`
- Si no hay sources inyectadas: retorna 3 observaciones con `skipped: no-probe`
- Retorna directo `SharedConfigUpdateAdvisorResult` (evaluado vía `advisorResultFromPiEinUpdateObservations` línea 147-151)

### 1.5 Cálculo de veredicto (F, `ein-pi/agent/lib/shared-config-update-advisor.ts`)

**Línea 280-358 — Función `updateFacet()`:**
- Entra por `input.update.observations` (línea 282)
- Aplica colapso de precedencia (línea 289-299):
  - Línea 296: `hasStatus(observations, "unavailable", "skipped", "unknown")` → `status=unavailable`
  - Línea 297: `hasStatus(observations, "update-available")` → `status=update-available`
  - Línea 298: `every(...) === "current"` → `status=current`
- **Este colapso es correcto** (fail-closed de F); no se debe tocar

**Línea 401-413 — Función `renderAdvisorSemantics()`:**
```typescript
const lines = [
  `Configuration: status=${...}...`,
  `Update: status=${...}...`,  // ← Solo status colapsado, no por componente
  `Recommendation: kind=${...}...`,
];
if (result.handoff && result.handoff.owner === "installer" && result.handoff.performed === false) {
  // Print command handoff
}
```
- **Problema visible en N.1**: solo imprime 1 línea Update (status colapsado), no especifica componente ni comando exacto
- N.1 debe renderizar desde observaciones crudas en launcher, no confiar en renderAdvisorSemantics

---

## 2. Problema de portabilidad de probes — Resolución con hechos

### 2.1 Localización de SettingsManager

`ein-banner.ts` línea 10-14:
```typescript
import {
  DefaultPackageManager,
  SettingsManager,
  VERSION,
} from "@earendil-works/pi-coding-agent";
```

Uso en `checkPiPackageUpdates()` línea 353-358:
```typescript
const settingsManager = SettingsManager.create(cwd, AGENT_DIR);
const packageManager = new DefaultPackageManager({
  cwd,
  agentDir: AGENT_DIR,
  settingsManager,
});
const available = (await packageManager.checkForAvailableUpdates()).length > 0;
```

### 2.2 Búsqueda de precedentes de SettingsManager en ein-pi/agent/lib

**Resultado:** `grep -r "SettingsManager\|DefaultPackageManager" ein-pi/agent/lib --include="*.ts"` retorna vacío.

**Conclusión:**
- `SettingsManager` y `DefaultPackageManager` solo se usan en ein-banner.ts
- **No hay precedentes de importar del SDK de Pi en ein-pi/agent/lib** (la frontera es clara: extensions pueden, lib no)
- Esto es por diseño: lib es el núcleo portátil; extensions son Pi-específicas

### 2.3 Viabilidad de extracción con guards

**Opción A (recomendada):** Extraer las tres probes a `ein-pi/agent/lib/update-probes.ts` con guards dinámicos:

```typescript
// update-probes.ts (pseudocódigo)
export async function checkPiBinaryUpdate(): Promise<PiEinUpdateObservation> {
  // No importa SDK, siempre portable
}

export async function checkEinTemplateUpdate(): Promise<PiEinUpdateObservation> {
  // No importa SDK, siempre portable
}

export async function checkPiPackageUpdates(cwd: string): Promise<PiEinUpdateObservation> {
  try {
    // Intenta importar dinámicamente @earendil-works/pi-coding-agent
    // Si falla (ej. en Claude): return { source: "packages", status: "skipped", reason: "not-available-in-runtime", freshness: "current" }
    // Si funciona: ejecuta probe normal
  } catch {
    return { source: "packages", status: "skipped", reason: "not-available-in-runtime", freshness: "current" };
  }
}
```

**Impacto:**
- binary y ein siempre portables (en Pi y Claude)
- packages en Claude: skipped explícitamente (sin error, sin caída)
- packages en Pi: funciona normalmente
- No contamina la frontera (lib sigue sin importar SDK en import-time)

---

## 3. Cómo llega hoy el estado al launcher

### 3.1 Flujo actual de inyección

```
workbench-entrypoint.ts (línea 73-105)
  ↓ createProductionDependencies(candidates)
  ├─ project: projectProjectState (función que lee ProjectStateV1)
  ├─ advisor: state => createWorkbenchAdvisor(state)  ← N.1 parche aquí
  ├─ input/output: readline interface
  └─ adapter: createRuntimeSessionAdapter (Pi o Claude)
       ↓
workbench.ts (runWorkbench, línea 197-300+)
  ├─ Línea 202: state = dependencies.project({ cwd: candidate })
  ├─ Línea 239: renderWorkbenchAdvisor(dependencies.advisor(confirmed.state))
  └─ Línea 245-300+: Flujo de runtime selection y actions
```

### 3.2 Cómo pasa la evidencia sin romper inyección de dependencias

**Problema:**
- `createWorkbenchAdvisor(state)` recibe `ProjectStateV1`
- `ProjectStateV1` no lleva evidencia de updates (es ortogonal)
- `detectPiEinUpdates(cwd)` necesita `cwd` (que está en `state.identity.cwd`) y opcionalmente sources inyectadas

**Solución (N.1):**
1. Extraer probes a `update-probes.ts` con guards
2. En workbench-entrypoint.ts línea 100, parchear:
   ```typescript
   advisor: async state => {
     const config = createWorkbenchAdvisor(state);
     const updates = await detectPiEinUpdates(state.identity.cwd, {
       sources: {
         binary: checkPiBinaryUpdate,
         packages: (cwd) => checkPiPackageUpdates(cwd),
         ein: checkEinTemplateUpdate,
       },
     });
     // Merge observations into result...
     return { ...config, update: { ...updates.update, /* observations */ } };
   },
   ```
   - ✅ Mantiene inyección: readers de workbenchAdvisor siguen reemplazables
   - ✅ Mantiene pureza: detector es puro (solo I/O timeout-bounded)
   - ✅ Mantiene contrato: retorna `SharedConfigUpdateAdvisorResult`

3. **Importante:** `advisor` ya es potencialmente async en el tipo (check workbench.ts línea 239), pero hoy no lo es. **Design debe especificar si N.1 lo hace async o lo sincroniza.**

### 3.3 Punto de render actualizado

Línea 239 workbench.ts sigue igual:
```typescript
if (dependencies.advisor) await write(dependencies.output, renderWorkbenchAdvisor(dependencies.advisor(confirmed.state)));
```

Pero `renderWorkbenchAdvisor()` línea 83-85 debe cambiar:
- No puede confiar solo en `renderAdvisorSemantics()` (que imprime status colapsado)
- Debe extraer observaciones crudas de `result.update.provenance` (que lleva `source` por elemento)
- Debe renderizar: componente + comando si accionable, o estado honesto (stale/unknown/ausencia)

---

## 4. Costura de superficie

### 4.1 Ruta real: `pi-ein workbench` → `cc-ein workbench`

```
surface-runner.ts (createProductionWorkbenchInvocationAdapter)
  ↓ invoke: invokeProductionWorkbench
  ↓
workbench-entrypoint.ts (invokeProductionWorkbench)
  ↓ runWorkbenchEntrypoint(...)
  ↓ createProductionDependencies(candidates)  ← N.1 aquí
  ↓ runWorkbench(dependencies)
  ↓ workbench.ts (línea 197-300+)
     ├─ Confirmación de proyecto
     ├─ Línea 239: Render de advisor
     └─ Selection de runtime + menu de acciones
```

### 4.2 Validaciones que surface-runner impone

`surface-runner.ts` línea 94-96 (createProductionWorkbenchInvocationAdapter):
```typescript
export function createProductionWorkbenchInvocationAdapter(): WorkbenchInvocationAdapter {
  return { invoke: invokeProductionWorkbench };
}
```

- No hay validación de request aquí (workbench es pure, surfaces son el cliente)
- **N.1 Debe respetar:** El workbench sigue siendo puro; I/O de updates (fetch, procesos) ocurre en probes (lado de sources), no en advisor

### 4.3 Límites observados

- Probes tienen timeout explícito (UPDATE_CHECK_TIMEOUT_MS = 2s, línea 16 ein-update-notice.ts)
- Fail-open garantizado (failOpenWithin en línea 53-74 ein-update-notice.ts)
- No hay invocación de subprocesos desde el launcher (bin-banner.ts usa `ProcessRunner` para git, no para updates)

---

## 5. Capacidad de test existente

### 5.1 Fixtures en `tests/minimal-workbench-launcher.test.ts`

**Línea 56-81 — "production-style dependencies inject a real read-only advisor":**
- Mock de `WorkbenchAdvisorReaders`: `inspectMode` e `inspectModelConfig` inyectables
- Verifica render: `"Configuration: status=current"` y `"Update: status=unavailable"`
- **Problema visible:** Update siempre retorna unavailable (porque no se invoca detectPiEinUpdates)

**Línea 122-141 — "launcher and workbench render one normalized fixture":**
- Test de rendering con handoff inerte (`performed=false`)
- Verifica que no hay ANSI codes, spawn, ni runUpdate en output

### 5.2 Patrón de inyección en tests

Línea 64-76:
```typescript
const advisor = createWorkbenchAdvisor(state, {
  inspectMode: () => ({ status: "valid", source: "default", ... }),
  inspectModelConfig: () => ({ status: "valid", source: "global", ... }),
});
```
- Readers son sobrescribibles por fixture
- N.1 debe mantener este patrón: las nuevas probes también deben ser inyectables (para simular timeout, offline, etc.)

### 5.3 Qué falta para N.1

- **Test de probes con timeout:** Simular UPDATE_CHECK_TIMEOUT_MS expirado
- **Test de observaciones crudas:** Verificar que se capturan 3 elementos (binary, packages, ein) con source correcto
- **Test de rendering por componente:** Verificar que output nombra "Ein: ...", "Paquetes: ...", etc.
- **Test de handoff.performed=false:** Asegurar que comando se imprime, no ejecuta
- **Test de portabilidad:** Simular que `checkPiPackageUpdates` falla (SettingsManager no disponible) y retorna skipped sin crash

---

## 6. Riesgos residuales y decisiones pendientes para design

### 6.1 Decisión 2a — Modelar Claude Code como cuarta fuente

**Estado:** Pendiente en design, **no afecta a N.1** (solo Pi las tres fuentes).

Opciones del scope (línea 52-58):
- A: Ampliar `PiEinUpdateObservation.source` a cuatro valores → N.2
- B: Bloque de evidencia aparte → N.2
- C: Adaptador de traducción → N.2

N.1 mantiene 3 fuentes (binary, packages, ein) sin tocar enum.

### 6.2 Decisión 3 — Gate de runtime (qué fuentes en Pi vs Claude)

**Actual en ein-update-notice.ts línea 162-168:**
```typescript
const runtime = options.runtime ?? (() => isPiEinRuntime());
if (!runtime()) {
  return advisorResultFromPiEinUpdateObservations([
    { source: "binary", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
    { source: "packages", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
    { source: "ein", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
  ]);
}
```

**Problema de N.1:** Todas 3 fuentes retornan skipped en Claude. Pero si Claude puede detectar actualizaciones de Ein (fetch a GitHub), debería.

**Design debe resolver (línea 3 scope, decisión 3):**
- ¿Retornar skipped de todas (asimétrico, honesto)?
- ¿Retornar `unknown` si no verificable?
- ¿Permitir ein + binary en Claude, solo packages en Pi?

N.1 respeta la actual (todas skipped si no es Pi runtime) para no cambiar decisiones de F.

### 6.3 Decisión 4 — Política de render honesto

**Timeout:** 2s + fail-open garantizado (línea 16, 53-74 ein-update-notice.ts)

**Rendering de frescura:**
- Si `freshness=current` y `status=update-available` → accionable, imprime comando
- Si `freshness=stale` o `status=skipped` → **no accionable**, imprime "Información no verificada" o silencia
- Si no hay evidencia → silencio declarado, nunca "todo actual" falso

N.1 debe implementar rendering honesto; no ocultar evidencia stale bajo status colapsado.

### 6.4 Colisión 1 — Enmascaramiento del banner (fuera de N.1)

**Ya extraído a PR #128** (`fix-update-notice-masking`).

**N.1 necesita que el fix entre primero:**
- Sin el fix, el banner sigue ocultando observaciones si cualquiera es skipped
- N.2 (Claude Code) agravará esto si una máquina no tiene Claude instalado
- Pero N.1 funciona independiente (son superficies distintas)

**Recomendación:** Revisar si fix-update-notice-masking está en main antes de merguear N.1.

### 6.5 Colisión 2 — Handoff de Claude Code bajo F-007 (N.2)

**No afecta a N.1** (Claude Code es N.2).

---

## 7. Resumen de archivos a tocar en N.1

| Archivo | Cambio | Escala |
|---------|--------|--------|
| `ein-pi/agent/lib/update-probes.ts` | **CREAR** — Extraer 3 probes de ein-banner.ts con guards | ~80-120 LOC |
| `ein-pi/agent/extensions/ein-banner.ts` | **ACTUALIZAR** — Importar probes de lib + adaptar inyección | ~30-40 LOC (eliminación neta) |
| `ein-pi/agent/surfaces/workbench-entrypoint.ts` | **PATCH** — Invocar `detectPiEinUpdates()` + mergear observaciones | ~40-60 LOC |
| `ein-pi/agent/lib/workbench.ts` | **ACTUALIZAR** — Nuevo render honesto por componente (no renderAdvisorSemantics) | ~50-80 LOC |
| `tests/minimal-workbench-launcher.test.ts` | **EXPAND** — Tests de probes, timeout, rendering, handoff | ~60-100 LOC |
| `tests/surface-wiring.test.ts` | **EXPAND** — Tests de paridad Pi/Claude (preparar para N.3) | ~40-60 LOC |

**Total presupuesto N.1:** ~300-460 LOC productivas.

---

## 8. Recomendaciones para design

1. **Async/await en advisor:** Confirmar si workbench-entrypoint.ts línea 100 puede hacer async `advisor: async state => {...}`

2. **Render honesto:** Definir formato exacto para observaciones (ej., línea por componente, símbolos de estado, etc.)

3. **Portabilidad de packages:** Decidir si `checkPiPackageUpdates` debe importar dinámicamente o usar try-catch en call-site

4. **Decisión 3 cierre:** Especificar qué fuentes se reportan en Claude vs Pi (todas skipped vs. honesto unknown vs. selectiva ein+binary)

5. **Handoff.performed:** Reconfirmar que siempre `performed=false` (nunca ejecutar desde launcher)

---

## Artifacts

- Path: `openspec/changes/launcher-update-surface/map.md` (este documento)
- Status: Completo. `cc-ein-sdd check launcher-update-surface` debe pasar.
