# Design — launcher-update-surface (slice N.1)

Alcance de este documento: **solo N.1** (detección base + cableado del launcher para `ein`, `binary`, `packages`).
N.2 (Claude Code como cuarta fuente) y N.3 (rendering completo y paridad Pi/Claude) se mencionan únicamente donde condicionan una decisión de N.1.

## A. Proposal

### Intent

Que el launcher (`pi-ein workbench` / `cc-ein workbench`) muestre, después de confirmar el proyecto y antes de elegir runtime, **el estado de actualización por componente** —con el comando exacto cuando es accionable y una declaración honesta cuando no es verificable— sin ejecutar nada y sin tocar el contrato del asesor de F.

### Problema

Hoy `createWorkbenchAdvisor()` (`ein-pi/agent/lib/workbench.ts:121`) solo evalúa configuración: nunca recoge evidencia de actualización. El launcher imprime siempre `Update: status=unavailable` (verificado en `tests/minimal-workbench-launcher.test.ts:80`). Aunque la recogiera, `renderAdvisorSemantics()` (`shared-config-update-advisor.ts:401-413`) imprime un **veredicto colapsado** de una sola línea, que por la precedencia de `updateFacet()` (`:289-299`) se hunde a `unavailable` en cuanto una fuente es `skipped`. Resultado: no se puede satisfacer "el aviso nombra componente y comando exacto" por la vía del status agregado.

### Scope

**Incluye**

- Extraer a `ein-pi/agent/lib/update-probes.ts` **solo las probes portables** (`binary`, `ein`) más sus utilidades (`isNewerVersion`, lectura del marcador de versión de Ein), con los hechos locales **inyectados como parámetro**.
- Un recolector de evidencia **no bloqueante** (`startUpdateEvidenceSnapshot`) que arranca las probes en el borde y expone una lectura síncrona: observaciones ya resueltas o `undefined`.
- Cablear esa evidencia al launcher a través de `WorkbenchAdvisorReaders`, manteniendo `advisor` **síncrono** (`workbench.ts:350`).
- Render por componente en `renderWorkbenchAdvisor()` derivado de `result.update.provenance` (que sí conserva `source`, `quality`, `reason`, `freshness` por elemento).
- Mantener `ein-banner.ts` funcionando igual, consumiendo las probes extraídas e inyectando la suya de paquetes.

**No incluye (y a dónde va)**

- Claude Code como cuarta fuente → **N.2**.
- Leer la versión instalada del binario de Pi desde disco para que `binary` sea verificable fuera del proceso de Pi → **N.3** (ver Decisión 2).
- Redacción de antigüedad ("verificado hace 5 minutos") → **N.3**: la observación no lleva marca temporal; N.1 declara "no verificado" sin edad.
- Test E2E de paridad Pi/Claude → **N.3**.
- Ejecutar procesos, invocar el installer, cachear evidencia, tocar `shared-config-update-advisor.ts`, o arreglar el enmascaramiento del banner (`fix-update-notice-masking`).

### Affected areas

| Fichero | Cambio | Presupuesto productivo |
|---|---|---:|
| `ein-pi/agent/lib/update-probes.ts` | **CREAR** — probes portables + `startUpdateEvidenceSnapshot` | ~110 |
| `ein-pi/agent/extensions/ein-banner.ts` | **ACTUALIZAR** — importa las probes extraídas, conserva e inyecta `checkPiPackageUpdates` | ~+15 / −55 (neto negativo) |
| `ein-pi/agent/lib/workbench.ts` | **ACTUALIZAR** — reader de observaciones + render por componente | ~60 |
| `ein-pi/agent/surfaces/workbench-entrypoint.ts` | **PATCH** — arranca el snapshot y cablea el reader | ~35 |
| **Total productivo** | | **~205 (< 400)** |
| `tests/update-probes.test.ts` | **CREAR** (espejo obligatorio de `lib/`, EIN.md:19) | ~90 |
| `tests/minimal-workbench-launcher.test.ts` | **AMPLIAR** — cableado, render, handoff inerte | ~70 |

El presupuesto productivo cabe holgadamente bajo el límite de revisión de 400 líneas. Todo lo que amenazaba con desbordarlo (lectura en disco de la versión de Pi, semántica de antigüedad, paridad E2E) está desplazado explícitamente a N.3.

### Risks

1. **El SDK de Pi no está declarado en ningún manifiesto del repo** y resuelve desde la caché global de Bun (`~/.bun/install/cache/@earendil-works/pi-coding-agent@0.84.1`). Es un riesgo **del repositorio**, no de este cambio: no se arregla aquí, pero prohíbe diseñar sobre la suposición de que ese import resuelve. Merece un cambio propio.
2. **Ruido permanente:** en N.1 `binary` y `packages` se declaran no verificables desde el launcher en los dos runtimes, así que el bloque siempre imprimirá al menos dos líneas "no verificado". Es honesto, pero N.3 debe reducirlo haciendo verificable el binario.
3. **Tope de procedencia:** `MAX_ADVISOR_PROVENANCE = 8` (`shared-config-update-advisor.ts:7`). Con 3 observaciones sobra, pero N.2 (cuarta fuente) debe verificar que no se trunca si además llega evidencia de versión.
4. **`ein-pi/` no tiene puerta de tipos:** no hay `tsconfig.json` en la raíz y `bun run typecheck` solo cubre `installer/`. `bun test` no comprueba tipos, así que un error de tipos en lo tocado pasaría la puerta. Mitigación en D (typecheck manual obligatorio).

### Rollback

Revertir los cuatro ficheros. No hay estado persistido, ni migración, ni escritura: la evidencia vive en memoria durante una invocación del launcher. Revertir `update-probes.ts` exige revertir a la vez `ein-banner.ts`, que pasa a importarlo; el resto (`workbench.ts`, `workbench-entrypoint.ts`) es aditivo y reversible por separado, dejando el launcher exactamente como está hoy (`Update: status=unavailable`).

### Success criteria

Ver sección D.

## B. Spec

### R1. El launcher obtiene evidencia de actualización y la renderiza por componente

El launcher **MUST** obtener observaciones de actualización crudas (una por componente, con su `source`, `status`, `reason` y `freshness`) y **MUST** renderizar una línea por componente con algo que decir. **MUST NOT** derivar el detalle por componente del status colapsado de la faceta ni de `renderAdvisorSemantics()`, que solo aporta el veredicto global, el handoff y la recomendación.

**Escenario — detalle por componente sobrevive al colapso**

- **Dado** un conjunto de observaciones donde `ein=update-available/current`, `binary=skipped` y `packages=skipped` (faceta colapsada a `status=unavailable`),
- **Cuando** el launcher renderiza el aviso tras confirmar el proyecto,
- **Entonces** la salida contiene una línea accionable para Ein y sendas líneas declaradas para binario y paquetes, además de la línea global `Update: status=unavailable`.

### R2. Un componente accionable nombra componente y comando exacto

Un componente **MUST** presentarse como accionable solo si su observación es `status=update-available` **y** `freshness=current`. En ese caso la línea **MUST** nombrar el componente y el comando literal (`ein update` para Ein; `pi-ein update --all` para binario y paquetes) y **MUST NOT** usar texto vago ni sugerir que la acción ya ocurrió.

**Escenario — Ein con actualización fresca**

- **Dado** `{source: "ein", status: "update-available", freshness: "current"}`,
- **Cuando** el launcher renderiza,
- **Entonces** imprime exactamente `- Ein: update-available — run \`ein update\``.

### R3. Todos los componentes imprimen comando; solo los del installer de Ein llevan objeto de handoff

El comando impreso es **presentación**; el handoff es un **objeto del asesor**. Todo componente accionable **MUST** imprimir su comando. Un objeto de handoff (`Handoff: owner=installer action=… performed=false`) **MUST** aparecer únicamente cuando F lo emite, es decir para el componente propiedad del installer de Ein con evidencia de versión coherente; **MUST NOT** fabricarse para binario, paquetes ni (en N.2) Claude Code. Esta es la lectura vinculante de los escenarios `aviso-accionable-con-componente-y-comando` y `claude-code-informativo-no-accionable` del delta: la distinción no es "unos llevan comando y otros no", sino **"todos llevan comando, solo los del installer llevan handoff"**.

**Escenario — evidencia por observaciones sin handoff**

- **Dado** que la evidencia llega por `update.observations` (ruta de probes, que en F nunca produce handoff),
- **Cuando** el launcher renderiza un componente accionable,
- **Entonces** imprime el comando y **no** imprime línea `Handoff:`, sin que eso degrade el componente a informativo.

### R4. La evidencia no verificable se declara y nunca es accionable

Una observación con `status` distinto de `update-available`/`current`, o con `freshness` distinto de `current`, **MUST** renderizarse como no verificada, con su motivo normalizado, y **MUST NOT** llevar comando. La incertidumbre **MUST NOT** convertirse en "todo al día".

**Escenario — paquetes no verificables desde el launcher**

- **Dado** `{source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown"}`,
- **Cuando** el launcher renderiza,
- **Entonces** imprime `- Pi packages: not verified (probe-unavailable) — no action` y ninguna cadena que contenga un comando ejecutable para ese componente.

### R5. Ausencia es silencio declarado, no falsa tranquilidad

Un componente con `status=current` **MUST** omitirse de la salida. Si ningún componente tiene nada que decir, el launcher **MUST NOT** imprimir bloque de actualizaciones ni encabezado vacío, y **MUST NOT** afirmar que todo está actualizado.

**Escenario — nada que decir**

- **Dado** que las tres observaciones son `status=current, freshness=current`,
- **Cuando** el launcher renderiza,
- **Entonces** la salida del launcher no contiene el encabezado `Updates:` ni ninguna línea por componente.

### R6. El launcher no espera y nunca ejecuta

La recogida de evidencia **MUST** arrancar en el borde al construir las dependencias de producción y **MUST** leerse de forma síncrona y no bloqueante en el punto de render; si aún no ha resuelto, todas las fuentes **MUST** declararse no verificadas. El launcher **MUST NOT** lanzar procesos, invocar el installer ni ejecutar ningún callback de acción; cualquier handoff **MUST** conservar `performed: false`.

**Escenario — evidencia aún sin resolver**

- **Dado** que el usuario confirma el proyecto antes de que las probes resuelvan,
- **Cuando** el launcher renderiza,
- **Entonces** imprime las tres fuentes como no verificadas con motivo `pending`, no espera, y el flujo continúa a la selección de runtime sin latencia añadida.

### R7. Los readers siguen siendo reemplazables

`createWorkbenchAdvisor` **MUST** recibir la evidencia por un reader inyectable dentro de `WorkbenchAdvisorReaders`, con la misma forma que `inspectMode`/`inspectModelConfig`. El punto de inyección `advisor` de `WorkbenchDependencies` **MUST** permanecer síncrono; **MUST NOT** convertirse en asíncrono.

**Escenario — launcher testeable sin red**

- **Dado** un test que inyecta `readUpdateObservations: () => [fixtures]`,
- **Cuando** ejecuta el flujo completo del launcher,
- **Entonces** obtiene el render por componente sin ninguna llamada de red ni proceso hijo.

### Spec context receipts

`scope.md` no registra ninguna referencia canónica a `openspec/specs/<domain>/spec.md`, y `map.md` no aporta ningún *domain hint* explícito. Por tanto **no se leyó ningún spec canónico de dominio** (0 ficheros, 0 bytes; dentro del límite de 3 ficheros / 32 KiB).

El delta del propio cambio, `openspec/changes/launcher-update-surface/specs/launcher-update-surface/spec.md`, se usó como entrada de comportamiento, no como recibo canónico.

`openspec/specs/surface-wiring/spec.md` existe y gobierna la superficie del launcher, pero **no está mapeado**: el trabajo de paridad de N.3 debería pedir ese *hint* explícito en su propio `map`.

## C. Decisions

### 1. Las probes portables bajan a `lib/`; la de paquetes se queda en el borde y se inyecta

`ein-pi/agent/lib/update-probes.ts` se lleva `checkPiBinaryUpdate` y `checkEinTemplateUpdate`. `checkPiPackageUpdates` **se queda en `ein-pi/agent/extensions/ein-banner.ts`** y se inyecta al detector por el canal que `detectPiEinUpdates` ya soporta (`UpdateEvidenceSources`, `ein-update-notice.ts:153-156`).

**Hecho que cierra la decisión (medido, no inferido):** el SDK `@earendil-works/pi-coding-agent` **no está declarado en ningún manifiesto del repo** — los únicos son `installer/package.json` y `docs-site/package.json`, y ninguno lo lista. El import resuelve hoy solo porque la caché global de Bun de la máquina está caliente (`import.meta.resolve` → `~/.bun/install/cache/@earendil-works/pi-coding-agent@0.84.1@@@1/dist/index.js`). Que hoy cargue no es una garantía sobre la que diseñar. **Corrección posterior a la fase apply (medida, no inferida):** la primera redacción de esta decisión afirmaba que *todas* las referencias al SDK dentro de `ein-pi/agent/lib/*.ts` son `import type`. **Es falso**: `lib/guardrails.ts:29` importa valor de `@earendil-works/pi-coding-agent` y `lib/models-panel.ts:9` importa valor de `@earendil-works/pi-tui`, ambos preexistentes a este cambio. La invariante ancha no se cumple en el repo y no debe usarse como garantía.

La invariante que **sí** se cumple y que sostiene esta decisión es más estrecha: *el cierre de imports del launcher no contiene ningún import de valor del SDK de Pi*. Verificado cargando los módulos en aislamiento — `lib/update-probes.ts`, `lib/workbench.ts` y `surfaces/workbench-entrypoint.ts` cargan los tres sin el SDK resuelto, y ninguno importa `guardrails.ts` ni `models-panel.ts`. Esa es la invariante que las auditorías futuras deben comprobar; una auditoría que grepee todo `lib/` fallará por deuda ajena a este cambio.

**Por qué no se mete en `lib/`:** un import estático de valor del SDK dentro de `lib/` trasladaría una dependencia del runtime de Pi al núcleo portable que el launcher importa **también bajo Claude Code** y que los tests cargan de forma eager. Contradice EIN.md:13 ("la E/S se queda en el borde"). Hoy la fragilidad está confinada a una extensión que solo corre dentro de Pi, donde el SDK existe por definición.

**Alternativas rechazadas:** import dinámico con `try/catch` alrededor, o guard de contexto en `lib/` — son parches a un problema de ubicación: dejan la dependencia donde no debe estar y convierten un fallo de arquitectura en un `catch` silencioso. **Falla cerrado:** si la probe de paquetes no se inyecta, la fuente se declara no verificable, nunca `current`.

**Corolario del `VERSION` del SDK:** `checkPiBinaryUpdate` compara contra `VERSION` importado del SDK (`ein-banner.ts:344`). La probe extraída por tanto **recibe la versión instalada como parámetro** (`installedVersion: string | undefined`); la extensión de Pi le pasa `VERSION`, y quien no pueda aportarla obtiene `{status: "skipped", reason: "installed-version-unavailable", freshness: "unknown"}`. Igual con la versión de Ein: la lectura del marcador `.ein-install.json` baja a `lib/` con `agentDir` como parámetro.

### 2. Qué fuentes se comprueban en cada runtime (Decisión 3 del scope)

**Regla:** *una fuente se comprueba cuando el proceso del launcher puede obtener su hecho local sin importar el SDK de Pi; si no puede, se declara no verificable, de forma idéntica en los dos runtimes.*

El launcher es un proceso CLI independiente (`bun ein-pi/workbench.ts`), no corre dentro del agente de Pi, así que en N.1:

| fuente | en el launcher (Pi y Claude) | en el banner de arranque (extensión Pi) |
|---|---|---|
| `ein` | **comprobada** — lee `.ein-install.json` + releases de GitHub | comprobada |
| `binary` | no verificable: `skipped/installed-version-unavailable` | comprobada (`VERSION` del SDK) |
| `packages` | no verificable: `skipped/probe-unavailable` | comprobada (probe inyectada) |

Esto elige la **opción B del scope** (presentar honestamente lo verificable) en lugar de la A (asimetría por runtime): la salida del launcher es **idéntica en Pi y en Claude**, lo que satisface por construcción el escenario `paridad-pi-claude-o-diferencia-declarada` sin trabajo extra en N.1, y la diferencia real (el banner de Pi sí ve más) queda declarada, no escondida. También se descarta llamar a `detectPiEinUpdates` con su gate `isPiEinRuntime()` por defecto desde el launcher: ese gate marcaría las tres fuentes como `not-isolated-runtime` bajo Claude y haría invisible la única fuente que sí es verificable.

N.3 puede subir `binary` a verificable leyendo la versión instalada del Pi aislado desde disco; el contrato de la probe (versión inyectada) ya lo admite sin cambios.

### 3. Política de espera: el launcher no espera (Decisión 4 del scope)

`UPDATE_CHECK_TIMEOUT_MS = 2000` y el fail-open interno **no se tocan**. Lo que cambia es quién espera: **nadie**.

`startUpdateEvidenceSnapshot(sources, options)` arranca la recogida al construir las dependencias de producción —antes de imprimir la lista de candidatos— y devuelve un objeto con `read(): readonly PiEinUpdateObservation[] | undefined`. Las probes corren en paralelo con la selección y confirmación del proyecto, que exige dos lecturas humanas y dos entradas de teclado: en la práctica los 2 s vencen mucho antes del punto de render. Si aún no han resuelto, `read()` devuelve `undefined` y el render declara las tres fuentes como `pending`.

Esto es la opción A + D del scope con una garantía adicional: **cero latencia añadida a un flujo interactivo**. Un launcher que hace esperar al usuario por un aviso opcional es peor que un launcher que dice "no verificado". La opción C (caché) se rechaza: guardar evidencia entre invocaciones sin marca temporal en el modelo de observación produce exactamente el estado obsoleto disfrazado de fresco que el delta prohíbe.

### 4. Por dónde entra la evidencia ya resuelta

`WorkbenchAdvisorReaders` gana un tercer reader opcional:

```
readUpdateObservations?: () => readonly PiEinUpdateObservation[] | undefined
```

`createWorkbenchAdvisor(state, readers)` lo invoca y, **solo si devuelve observaciones**, añade `update: { observations }` a la entrada de `evaluateSharedConfigUpdateAdvisor`. Si devuelve `undefined`, la llamada queda exactamente como hoy y el comportamiento actual (y sus tests) no cambia.

Consecuencias buscadas:

- El asesor de F sigue **puro y síncrono**; la E/S se queda en el borde (`workbench-entrypoint.ts`), como manda EIN.md:13.
- El punto de inyección `advisor` de `WorkbenchDependencies` (`workbench.ts:350`) **no se vuelve asíncrono**: no se toca el contrato ni los tests existentes.
- El patrón de readers reemplazables se conserva íntegro: los tests inyectan observaciones fijas y ejercitan el launcher sin red.

**Alternativa rechazada:** un cuarto canal paralelo de observaciones colgado de `SharedConfigUpdateAdvisorResult`. Innecesario: `updateFacet()` ya conserva el detalle por componente en `result.update.provenance` (`source`, `quality`, `reason`, `freshness` por elemento, `collectProvenance` en `:180-187`), que es justo lo que el fix del banner usa. Un canal nuevo duplicaría una verdad que ya viaja.

### 5. Formato del render por componente

`renderWorkbenchAdvisor()` devuelve `renderAdvisorSemantics(result)` (veredicto global, recomendación y handoff, sin cambios) y **añade debajo** un bloque derivado de `result.update.provenance`, filtrando las entradas cuyo `source` es un componente conocido:

```
Updates:
- Ein: update-available — run `ein update`
- Pi binary: not verified (installed-version-unavailable) — no action
- Pi packages: not verified (probe-unavailable) — no action
```

Reglas, en orden:

| condición de la entrada de procedencia | línea |
|---|---|
| `quality=update-available` y `freshness=current` | `- <Componente>: update-available — run \`<comando>\`` |
| `quality=update-available` y `freshness≠current` | `- <Componente>: not verified (stale-evidence) — no action` |
| `quality=current` | *(omitida)* |
| cualquier otro caso | `- <Componente>: not verified (<reason>) — no action` |

- Etiquetas: `binary` → `Pi binary`, `packages` → `Pi packages`, `ein` → `Ein`. Comandos: `ein` → `ein update`; `binary` y `packages` → `pi-ein update --all` (mismo mapa que `UPDATE_COMMANDS`, `ein-update-notice.ts:289-293`).
- Sin líneas, no se imprime ni `Updates:` ni nada (R5).
- Determinista y seguro: orden fijo `ein`, `binary`, `packages`; `reason` normalizado por F (`safeToken`); sin ANSI, sin `\r`, sin rutas ni valores de entorno.
- La única cadena que parece un comando va entre acentos graves y solo en la fila accionable, de modo que un test puede afirmar "el componente no verificable no imprime comando" con una aserción exacta.

### 6. `ein-banner.ts` conserva su comportamiento

El banner sigue construyendo su `UpdateEvidenceSources` con las tres probes: dos importadas de `lib/update-probes.ts` (pasándoles `VERSION` y `AGENT_DIR`) y `checkPiPackageUpdates` local. No cambia su salida ni su gate. El cambio es una extracción, no un rediseño.

## D. Success Criteria

### Aceptación observable

1. El launcher renderiza detalle por componente a partir de observaciones crudas, con `Update: status=unavailable` presente y una línea accionable de Ein al mismo tiempo (R1).
2. Un componente con evidencia fresca y accionable imprime componente + comando exacto (R2).
3. Un componente no verificable se declara con su motivo y su línea no contiene comando (R4).
4. Ningún componente `current` aparece; sin nada que decir, no hay bloque (R5).
5. El handoff sigue inerte: `performed: false`, sin `spawn`, sin `execFile`, sin llamada al installer en la ruta del launcher (R6).
6. Los readers siguen reemplazables: el flujo completo del launcher se ejercita con observaciones inyectadas, sin red ni procesos (R7).
7. `ein-banner.ts` conserva su salida actual tras la extracción (sus tests existentes siguen verdes sin modificarse).

### Cobertura de test exigida (TDD estricto, `strict_tdd: true`)

Cada punto debe tener un test que **falle si el cambio se revierte**:

- `tests/update-probes.test.ts` (espejo obligatorio del módulo de `lib/`, EIN.md:19):
  - probe de binario sin versión instalada → `skipped/installed-version-unavailable`, `freshness=unknown` (nunca `current`);
  - probe de binario y de Ein con `fetch` inyectado: respuesta más nueva → `update-available`; respuesta no-OK → `unavailable/provider-unavailable`; cuerpo malformado → `error/malformed-response`;
  - `startUpdateEvidenceSnapshot` con scheduler manual (reutilizar `createManualScheduler` de `tests/ein-banner-updates.test.ts:50`): `read()` es `undefined` antes de resolver y devuelve las tres observaciones después;
  - fuente de paquetes ausente → observación declarada no verificable, nunca `current`.
- `tests/minimal-workbench-launcher.test.ts` (ampliar sobre los fixtures existentes de `createWorkbenchAdvisor` en `:64-67` y del flujo completo en `:70-81`):
  - el launcher obtiene evidencia por reader inyectado y la renderiza por componente, con la línea colapsada `Update: status=unavailable` coexistiendo con la línea accionable de Ein;
  - `ein=update-available/current` → la salida contiene `- Ein: update-available — run \`ein update\``;
  - `packages=skipped/probe-unavailable` → la salida contiene `not verified (probe-unavailable)` y esa línea no contiene ningún comando entre acentos graves;
  - las tres fuentes `current` → la salida no contiene `Updates:`;
  - handoff inerte y frontera auditable: reutilizar el fixture normalizado de `:123-141`, manteniendo `performed=false` y la aserción `not.toMatch(/\x1b|\r|spawn|runUpdate/)`;
  - sin reader (`readUpdateObservations` ausente) el render es idéntico al de hoy — protege la compatibilidad hacia atrás.

**Línea base a superar:** `bun test` desde la raíz da hoy **1476 pass, 0 fail, 109 ficheros**. Tras N.1: `0 fail`, `pass` estrictamente mayor, y 110 ficheros (el nuevo `tests/update-probes.test.ts`).

### Comandos de verificación obligatorios

```bash
# Puerta del repo (desde la raíz)
bun test

# Puerta de tipos MANUAL: ein-pi/ no tiene tsconfig propio y `bun test` no comprueba tipos.
installer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck \
  --target esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions \
  ein-pi/agent/lib/update-probes.ts \
  ein-pi/agent/lib/workbench.ts \
  ein-pi/agent/surfaces/workbench-entrypoint.ts
```

Este typecheck manual es **paso de verificación explícito, no opcional**: sin él, un `any` implícito o una aserción de tipo rota pasarían la puerta. `ein-pi/agent/extensions/ein-banner.ts` queda fuera del comando porque importa el SDK no declarado y fallaría por resolución de módulo, un fallo preexistente ajeno a este cambio.

### Auditoría manual

- `grep -rn "installer/src" ein-pi/` sigue sin resultados: la frontera al installer es presentación, no ejecución.
- La ruta de render del launcher no introduce `Bun.spawn`, `execFile` ni `child_process`.
- Ningún fichero de `ein-pi/agent/lib/` gana un import de valor de `@earendil-works/pi-coding-agent`.
