# Tasks — launcher-update-surface (slice N.1)

status: ready
blocked_by: none

## // 001. Especificación de tipos para probes portables

- [x] 1.1 Definir tipo `UpdateEvidenceSnapshot` en `ein-pi/agent/lib/update-probes.ts`
  - skills: `TypeScript`, `type-definition`
  - why: Contrato de retorno para `startUpdateEvidenceSnapshot`; encapsula las probes en ejecución y expone un `read()` síncrono
  - learn: Un snapshot retrasa la resolución de promesas al borde, no al punto de render
  - architecture: Vive en `lib/`, no en extensión; el tipo es erasable (solo `type`, no `const`)
  - avoid: No hacerlo un estado mutável; debe ser `Readonly`
  - verify: `tsc --noEmit` sobre el fichero; tipo exportable sin dependencias de SDK

- [x] 1.2 Extraer utilidades de versión (`parseVersion`, `isNewerVersion`) a `lib/update-probes.ts`
  - skills: `refactoring`, `function-extraction`
  - why: Las probes portables usan estas funciones; vivían en `ein-banner.ts` como privadas, necesitan ser públicas en `lib/`
  - learn: La inyección de parámetros (como `fetch`) permite testear sin red
  - architecture: Funciones puras, sin side-effects, sin imports del SDK
  - avoid: Usar `VERSION` del SDK aquí; inyectarlo como parámetro
  - verify: `bun test tests/update-probes.test.ts --grep "version comparison"` (test RED esperado: sin implementación aún)

## // 002. Probe de binario portable con inyección de versión

- [x] 2.1 Definir firma de `checkPiBinaryUpdate(installedVersion?: string, fetchFn?)` en `lib/update-probes.ts`
  - skills: `function-signature`, `parameter-injection`
  - why: En N.1 el launcher no puede leer `VERSION` del SDK; solo la extensión Pi lo tiene. La probe debe aceptarlo como parámetro
  - learn: Fail-closed: sin versión instalada, retorna `{status: "skipped", reason: "installed-version-unavailable", freshness: "unknown"}`, nunca `current`
  - architecture: El `fetch` es inyectable para tests; timeout interno (2 s) se toca solo en el borde
  - avoid: No importar `VERSION` del SDK directamente dentro de `lib/`
  - verify: **TEST RED esperado** `tests/update-probes.test.ts` debe fallar con "checkPiBinaryUpdate sin versión retorna skipped" (aún no existe impl)

- [x] 2.2 Implementar `checkPiBinaryUpdate(installedVersion?, fetchFn?)` → `Promise<PiEinUpdateObservation>`
  - skills: `async-function`, `fetch-wrapper`, `error-handling`
  - why: Llama a `https://pi.dev/api/latest-version`, compara con la versión inyectada, retorna observación tipada
  - learn: `try/catch` en la probe; `failOpenWithin` en `ein-update-notice.ts` ya maneja timeout, aquí es local
  - architecture: Respeta el contrato de `UpdateEvidenceSource` (retorna `Promise<PiEinUpdateObservation>` o `boolean` legacy)
  - avoid: Llamar al SDK dentro de esta función; no escribir a disco
  - verify: `bun test tests/update-probes.test.ts --grep "binary"` pasa; fixture con `fetch` inyectado verifica "update-available" cuando versión remota > local

## // 003. Probe de Ein portable con inyección de directorio

- [x] 3.1 Definir y extraer `readEinVersion(agentDir: string)` → `Promise<string>` a `lib/update-probes.ts`
  - skills: `async-file-io`, `json-parsing`
  - why: Lee `.ein-install.json` para obtener la versión instalada; vivía en `ein-banner.ts`, ahora portable
  - learn: `dev` es la versión de desarrollo (sin marcador); la probe declara esto como `skipped/development-install`
  - architecture: Recibe `agentDir` como parámetro, no `AGENT_DIR` global
  - avoid: Crashear si el fichero no existe; retorna `dev` silenciosamente
  - verify: Unit test con fixtures falsas (fichero ausente, JSON malformado, versión válida)

- [x] 3.2 Definir firma de `checkEinTemplateUpdate(installedVersion?: string, fetchFn?)` en `lib/update-probes.ts`
  - skills: `function-signature`, `parameter-injection`
  - why: Simétrica a `checkPiBinaryUpdate`; la versión proviene de `readEinVersion` invocado por quien la inyecte
  - learn: Sin versión instalada, declara `skipped/installed-version-unavailable`, no `current`
  - architecture: No toca GitHub API; eso es en la implementación; el timeout es local o heredado de fetch
  - avoid: No hacer HTTP si no hay versión instalada
  - verify: **TEST RED esperado** `tests/update-probes.test.ts` "Ein sin versión retorna skipped" (aún no existe impl)

- [x] 3.3 Implementar `checkEinTemplateUpdate(installedVersion?, fetchFn?)` → `Promise<PiEinUpdateObservation>`
  - skills: `async-function`, `github-api`, `version-comparison`
  - why: Llama a GitHub API (configurable por env `EIN_INSTALLER_REPO`), compara tags con versión local
  - learn: Los tags de GitHub son strings tipo `v0.45.1`; la función de parse debe normalizarlos
  - architecture: El repo se lee de env, no hardcoded; igual que hoy
  - avoid: Importar SDK; no escribir a disco
  - verify: `bun test tests/update-probes.test.ts --grep "ein"` pasa; fixture verifica "update-available" cuando tag remoto > instalado

## // 004. Colector de observaciones no bloqueante

- [x] 4.1 Definir tipo `UpdateEvidenceSnapshot` con método `read()` síncrono
  - skills: `type-definition`, `closure`
  - why: Encapsula el estado de tres promesas en paralelo; `read()` retorna `undefined` si aún resuelven
  - learn: Sin espera; el timeout está en `failOpenEvidenceWithin` que ya maneja 2 s
  - architecture: Vive como `export type` en `update-probes.ts` junto con la factory
  - avoid: Hacer `read()` asíncrono; el render debe ser síncrono
  - verify: Type check; no hay lógica de runtime aquí

- [x] 4.2 Implementar `startUpdateEvidenceSnapshot(sources: UpdateEvidenceSources, options?)` → `UpdateEvidenceSnapshot`
  - skills: `async-coordination`, `promise-handling`, `closure`
  - why: Arranca las tres probes (`binary`, `packages`, `ein`) al construir dependencias; retorna snapshot con `read()` que devuelve observaciones resueltas o `undefined`
  - learn: Las promesas corren en paralelo con TTY input; en la práctica los 2 s vencen antes del render
  - architecture: Timeout y scheduler heredados de `ein-update-notice.ts` sin cambios
  - avoid: Hacer esperar al launcher (`await`); `read()` es no-bloqueante
  - verify: **TEST RED esperado** `tests/update-probes.test.ts` "snapshot.read() undefined antes de resolver, observaciones después" (scheduler manual con delay)

- [x] 4.3 Implementar lógica de `read()`: retorna `undefined` si alguna promesa no resuelve, array de 3 observaciones si todas resuelven
  - skills: `promise-inspection`, `defensive-programming`
  - why: Protege contra llamadas prematuras; si el timeout de 2 s vence, las promesas quedan pending y `read()` devuelve `undefined` para que el render declare todo como `pending`
  - learn: No se puede cancelar una Promesa en JS; descartamos el resultado late sin esperar
  - architecture: Cierre sobre tres estados booleanos o tres valores; no mutación
  - avoid: Lanzar excepciones en `read()`; siempre devuelve array o `undefined`
  - verify: Test con scheduler manual que no ejecuta el timeout; `read()` es `undefined`; test que ejecuta el timeout, `read()` retorna observaciones

## // 005. Reader inyectable en `WorkbenchAdvisorReaders`

- [x] 5.1 Añadir miembro `readUpdateObservations?: () => readonly PiEinUpdateObservation[] | undefined` a tipo `WorkbenchAdvisorReaders` en `workbench.ts`
  - skills: `type-augmentation`
  - why: Patron de readers reemplazables; tests inyectan fixtures, producción inyecta el snapshot
  - learn: Opcional (?) porque los tests existentes no lo pasaban; backward-compatible
  - architecture: Vive junto a `inspectMode` e `inspectModelConfig`; mismo patrón
  - avoid: No hacer asíncrono; mantener síncrono como el resto de readers
  - verify: Type check; existentes tests siguen pasando (no usan este reader)

## // 006. Integración de observaciones en el asesor

- [x] 6.1 Modificar `createWorkbenchAdvisor(state, readers)` para invocar `readers.readUpdateObservations?.()` e inyectar en la entrada del asesor
  - skills: `refactoring`, `optional-chaining`
  - why: Si el reader devuelve observaciones, pasarlas a `evaluateSharedConfigUpdateAdvisor` en el campo `update.observations`; si devuelve `undefined` o el reader no existe, comportamiento idéntico al de hoy
  - learn: El asesor ya soporta `observations` (campo de `AdvisorInput`); solo hay que alimentarlo
  - architecture: `advisor` sigue síncrono; la E/S (snapshot) arrancó antes, en el borde
  - avoid: Hacerlo asíncrono; no tocar el contrato de `advisor` en `WorkbenchDependencies`
  - verify: Existente test `production-style dependencies` sigue verde sin cambios (sin reader = sin observaciones = comportamiento idéntico)

## // 007. Render por componente en `renderWorkbenchAdvisor`

- [x] 7.1 Modificar `renderWorkbenchAdvisor(result)` para renderizar línea por componente además del veredicto global
  - skills: `string-rendering`, `array-iteration`, `conditional-formatting`
  - why: Derive de `result.update.provenance`, que ya contiene el detalle por source (`binary`, `packages`, `ein`); renderiza componente + estado + comando (si accionable)
  - learn: Solo `update-available` + `current` freshness = accionable; otros casos = "not verified"; `current` quality se omite silenciosamente (R5)
  - architecture: Bloque "Updates:" debajo de `renderAdvisorSemantics(result)`, no modificado; orden fijo `ein`, `binary`, `packages`
  - avoid: ANSI, `\r`, paths, env vars en la salida; determinista
  - verify: **TEST RED esperado** `tests/minimal-workbench-launcher.test.ts` "launcher renderiza Ein accionable + binario no verificable + veredicto colapsado al mismo tiempo" (aún no existe impl de render)

- [x] 7.2 Implementar tabla de decisión R5 del diseño: formato exacto de cada línea
  - skills: `string-matching`, `regex`, `mapping`
  - why: Contrato exacto del formato de salida; cada estado del componente genera una línea específica o ninguna
  - learn: Etiquetas normalizadas (binary → `Pi binary`, packages → `Pi packages`, ein → `Ein`); comandos solo entre acentos graves
  - architecture: Función helper `renderUpdateComponentLine(provenance: AdvisorProvenance)` → `string | null`
  - avoid: Afirmar que todo está actualizado cuando hay `current`; silencio declarado
  - verify: Test per-component: `update-available/current` → `run \`ein update\``; `current/current` → null; `skipped/unknown` → `not verified (reason)`

- [x] 7.3 Omitir encabezado `Updates:` si no hay líneas que renderizar (R5)
  - skills: `conditional-rendering`, `array-filtering`
  - why: Absence is silence; si no hay nada que decir, no imprimir nada
  - learn: Tres fuentes todas `current` → sin bloque
  - architecture: Coleccionar líneas, solo imprimir `Updates:` si count > 0
  - avoid: Imprimir `Updates:` vacío o "Everything is up to date"
  - verify: Test: tres observaciones `current/current` → salida sin `Updates:`

## // 008. Cableado del snapshot en workbench-entrypoint

- [x] 8.1 Importar `startUpdateEvidenceSnapshot` en `workbench-entrypoint.ts`
  - skills: `import`
  - why: Necesario para arrancar el snapshot en la factory de dependencias de producción
  - learn: No es una hook; es una factory que retorna un objeto con `read()`
  - architecture: Importa de `lib/update-probes.ts`, no de extensión
  - avoid: Capas circulares; el snapshot NO importa nada de superficie
  - verify: `tsc --noEmit`

- [x] 8.2 En `createProductionDependencies`, crear el snapshot inyectando las fuentes portables (sin paquetes aún)
  - skills: `factory-pattern`, `dependency-injection`
  - why: El snapshot debe arrancar al construir dependencias, no en `advisor`; así corre en paralelo con TTY input
  - learn: Aún sin source de paquetes (N.2 la inyecta); binary y ein usan versiones del SDK (solo en Pi) o se declaran no verificables
  - architecture: Snapshot arranca before `projectProjectState` o los inputs; corre en background
  - avoid: Esperar en este punto; `startUpdateEvidenceSnapshot` es síncrono (las promesas están adentro)
  - verify: Snapshot object creado; `read()` se invocará después en el advisor

- [x] 8.3 Pasar `readUpdateObservations: () => snapshot.read()` a través del factory de readers para `createWorkbenchAdvisor`
  - skills: `closure`, `reader-injection`
  - why: Reader inyectable del snapshot; quien crea el advisor obtiene acceso a `read()`
  - learn: El reader no hace nada salvo invocar `snapshot.read()` cada vez (idempotente; segunda invocación devuelve las mismas observaciones resueltas)
  - architecture: Reader vive como closure en el factory, no mutación global
  - avoid: Hacer el snapshot global; inyectarlo siempre
  - verify: Test fixture sin reader (como hoy) vs fixture con reader (nuevas observaciones)

## // 009. Probes de paquetes inyectables (se queda en extension)

- [x] 9.1 En `ein-banner.ts`, importar `checkPiBinaryUpdate` y `checkEinTemplateUpdate` desde `lib/update-probes.ts`
  - skills: `import-refactoring`
  - why: Ya no se definen aquí; se llevan a `lib/`
  - learn: La extension Pi sigue siendo quien inyecta `VERSION` e `AGENT_DIR` a las probes portables
  - architecture: El import es de `lib/`, no de otra extension; evita duplicación
  - avoid: Mover `checkPiPackageUpdates` a `lib/` (el diseño lo prohíbe; necesita el SDK)
  - verify: Type check; sin errores de resolución

- [x] 9.2 Actualizar `detectPiEinUpdates` en `ein-banner.ts` para inyectar versiones a las probes extraídas
  - skills: `function-call-update`, `parameter-passing`
  - why: Las probes ahora esperan parámetros; el banner pasa `VERSION` (del SDK) y la versión de Ein leída localmente
  - learn: `checkPiBinaryUpdate(VERSION)` y `checkEinTemplateUpdate(installedEinVersion)` donde `installedEinVersion` se lee localmente
  - architecture: `readEinVersion(AGENT_DIR)` se invoca en el banner; su resultado se inyecta en la probe
  - avoid: No extraer `readEinVersion` de las llamadas; quedara local si es necesario (hoy lo hace)
  - verify: Existing test suite de banner sigue verde

- [x] 9.3 Remover funciones de `checkPiBinaryUpdate`, `checkEinTemplateUpdate`, `readEinVersion`, `parseVersion`, `isNewerVersion` de `ein-banner.ts` (ya en `lib/`)
  - skills: `dead-code-removal`
  - why: Las funciones están extraídas; remover duplicación
  - learn: Mantener solo `checkPiPackageUpdates` y helpers locales si es necesario
  - architecture: `ein-banner.ts` importa de `lib/`, solo inyecta SDK-specific facts
  - avoid: Dejar funciones "por si acaso"; cobertura de test garantiza que se usan
  - verify: Existing test suite pasa; grep `checkPiBinaryUpdate` en `ein-banner.ts` retorna 0

## // 010. Tests de probes portables (espejo de lib/)

- [x] 10.1 Crear `tests/update-probes.test.ts` como espejo obligatorio de `ein-pi/agent/lib/update-probes.ts` (EIN.md:19)
  - skills: `test-setup`, `test-file-structure`
  - why: Cobertura de `lib/`, que no tiene puerta de test propia (como `workbench.ts`)
  - learn: Un test file por módulo de `lib/`; formato `describe()` estándar
  - architecture: Importa de `lib/`, no de extension; inyecta `fetch`, scheduler, etc
  - avoid: Tests de integración de E2E; focalizados en la lógica pura de probes
  - verify: File exists, compila, primeras suites están RED esperado

- [x] 10.2 Test: probe de binario sin versión instalada retorna `{status: "skipped", reason: "installed-version-unavailable", freshness: "unknown"}`
  - skills: `test-assertion`, `typed-result`
  - why: **RED esperado esperado aquí**: la probe aún no verifica versión inyectada; sin implementar, falla
  - learn: `freshness: "unknown"` nunca devuelve `current`; fail-closed
  - architecture: Assert exacto sobre estructura
  - avoid: Assert fuzzy ("contiene skipped"); exactitud
  - verify: `bun test tests/update-probes.test.ts --grep "binary.*no-version"` falla hoy (impl aún no existe o está incorrecta)

- [x] 10.3 Test: `startUpdateEvidenceSnapshot` con scheduler manual: `read()` es `undefined` antes de resolver, retorna 3 observaciones después
  - skills: `test-scheduling`, `async-test`, `promise-inspection`
  - why: **RED esperado esperado aquí**: el snapshot no arranca aún; test verifica que lea estado correcto
  - learn: Reutilizar `createManualScheduler` del test de banner si existe, o definir uno nuevo
  - architecture: Inyecta 3 source functions que se resuelven en orden fijo; snapshot espera timeout
  - avoid: Esperar real (2 s); usar scheduler manual para controlar tiempo
  - verify: `bun test tests/update-probes.test.ts --grep "snapshot"` falla (impl aún no existe)

- [x] 10.4 Test: probe de binario con `fetch` inyectado: respuesta más nueva → `update-available`, respuesta no-OK → `unavailable/provider-unavailable`, body malformado → `error/malformed-response`
  - skills: `fetch-mocking`, `response-fixtures`, `error-cases`
  - why: Cobertura de casos de fetch; cada path debe estar testeado
  - learn: Las probes manejan malformación gracefully, nunca crash
  - architecture: Mock `fetch` con fixtures; inyectarla en la probe
  - avoid: HTTP real; siempre fixtures
  - verify: 3 tests separados, cada uno verifica un caso

- [x] 10.5 Test: fuente de paquetes ausente (no inyectada) → observación declarada no verificable, nunca `current`
  - skills: `optional-injection`, `absence-handling`
  - why: En N.1 el launcher no inyecta packages; snapshot debe declararla no verificable
  - learn: `UpdateEvidenceSources` tiene fields obligatorios; si faltan, el colector falla de forma declarada
  - architecture: `startUpdateEvidenceSnapshot(sources)` donde `sources` le faltan `packages` → debe manejar gracefully
  - avoid: Crash si source falta; declare no verificable
  - verify: Test pasa cuando implementación está completa; audit después

## // 011. Tests de integración del launcher

- [x] 11.1 Ampliar `tests/minimal-workbench-launcher.test.ts`: test "launcher renderiza detalle por componente + veredicto colapsado simultáneamente"
  - skills: `integration-test`, `fixture-injection`
  - why: **RED esperado esperado**: el launcher aún no renderiza por componente; test verifica que en N.1 lo hace
  - learn: Inyectar observaciones a través de `readUpdateObservations` reader; fixture es `[{source: "ein", status: "update-available", freshness: "current"}, {source: "binary", status: "skipped", reason: "installed-version-unavailable", freshness: "unknown"}, {source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown"}]`
  - architecture: Usa fixture existente de `createWorkbenchAdvisor` en test; solo añade reader
  - avoid: Fixtures nuevas sin documentar; reutilizar fixtures nombradas en comentarios
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --grep "component-detail"` falla hoy (impl de render no existe)

- [x] 11.2 Test: Ein con observación `{status: "update-available", freshness: "current"}` → salida contiene `- Ein: update-available — run \`ein update\``
  - skills: `output-assertion`, `string-matching`
  - why: Verifica exactitud del formato accionable (R2 del diseño)
  - learn: Comando exacto entre backticks; sin variación
  - architecture: Assertion sobre la salida renderizada, no sobre objetos intermedios
  - avoid: Regex fuzzy; string exact o `includes` preciso
  - verify: `bun test` pasa cuando render está implementado

- [x] 11.3 Test: paquetes con observación `{status: "skipped", reason: "probe-unavailable", freshness: "unknown"}` → salida contiene `not verified (probe-unavailable)` y NO contiene comando entre backticks para esa línea
  - skills: `negative-assertion`, `line-isolation`
  - why: No verificable no es accionable; no se imprime comando (R3, R4)
  - learn: Línea específica no contiene backticks; otras sí pueden
  - architecture: Parse output line-by-line; verifica línea de packages específicamente
  - avoid: Assert fuzzy "no run anywhere"; exactitud sobre la línea específica
  - verify: `bun test` pasa

- [x] 11.4 Test: tres observaciones todas `{status: "current", freshness: "current"}` → salida NO contiene `Updates:`
  - skills: `negative-assertion`, `section-absence`
  - why: Silence is declared absence (R5)
  - learn: Sin nada que decir, no hay bloque; no afirmar "up to date"
  - architecture: Assert simple `not.toContain("Updates:")`
  - avoid: Buscar veredicto alternativo; solo ausencia del bloque
  - verify: `bun test` pasa

- [x] 11.5 Test: handoff inerte: `performed: false`, sin `spawn`, sin `execFile`, sin invocación al installer
  - skills: `mock-inspection`, `security-assertion`
  - why: El launcher no ejecuta nada; solo advierte y renderiza (R6)
  - learn: Reutilizar fixture de `:123-141` del test actual; mantener aserción `not.toMatch(/\x1b|\r|spawn|runUpdate/)`
  - architecture: Assert sobre output renderizado, no sobre observación de efectos laterales
  - avoid: Permitir que `advisor` mute estado externo; el contrato lo prohíbe
  - verify: `bun test` pasa

- [x] 11.6 Test: sin reader (`readUpdateObservations` ausente) → render es idéntico al de hoy (`Update: status=unavailable` solo)
  - skills: `backward-compatibility-test`
  - why: Protege compatibilidad hacia atrás; tests existentes sin reader no se rompen
  - learn: Si reader es `undefined`, comportamiento exacto como hoy
  - architecture: Pasa `{}` como readers (solo `inspectMode`, `inspectModelConfig`), no `readUpdateObservations`
  - avoid: Cambiar tests existentes; agregar nuevo test
  - verify: `bun test` pasa; existente test en línea 80 sigue verde

## // 012. Auditoría de arquitectura: imports en lib/

- [x] 12.1 Verificar que `ein-pi/agent/lib/update-probes.ts` NO contiene import de valor de `@earendil-works/pi-coding-agent`
  - skills: `grep`, `architectural-audit`
  - why: Invariante del diseño (Decisión 1): `lib/` es portable, no debe tener dependencia del SDK
  - learn: `import type { ... }` es OK (erasable); `import { ... }` de SDK es NOT OK
  - architecture: Límite de arquitectura; el SDK vive en extensions
  - avoid: False positives (imports de `type`); buscar solo imports de valor
  - verify: `grep -n "^import.*@earendil-works/pi-coding-agent" ein-pi/agent/lib/update-probes.ts` retorna 0 líneas

- [x] 12.2 Verificar que toda `lib/` sigue sin imports de valor del SDK (auditoría de no-regresión)
  - skills: `grep`, `project-audit`
  - why: Garantizar que N.1 no introduce dependencia accidental en `lib/`
  - learn: Solo la extensión (`extensions/`) puede importar SDK
  - architecture: Barrera de arquitectura; `lib/` es inyectable en cualquier runtime
  - avoid: Permitir "just for this", "temporary"; refactor si es necesario
  - verify: `grep -rn "^import.*@earendil-works/pi-coding-agent" ein-pi/agent/lib/` retorna 0 líneas

## // 013. Typecheck manual obligatorio

- [x] 13.1 Ejecutar typecheck manual sobre ficheros tocados de `ein-pi/agent/lib/` y `ein-pi/agent/surfaces/`
  - skills: `typescript`, `type-checking`
  - why: `ein-pi/` no tiene `tsconfig` propio; `bun test` no comprueba tipos; riesgo de `any` implícito
  - learn: `tsc --noEmit --strict` sin `package.json` en `ein-pi/` requiere flags explícitos
  - architecture: Paso de verificación obligatorio; no optional
  - avoid: Saltar el check "todo pasó unit tests"; tipos son barrera extra
  - verify: **Comando de verificación**: 
    ```bash
    installer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck \
      --target esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions \
      ein-pi/agent/lib/update-probes.ts \
      ein-pi/agent/lib/workbench.ts \
      ein-pi/agent/surfaces/workbench-entrypoint.ts
    ```
    Debe retornar exit code 0 sin errores.

- [x] 13.2 Nota: `ein-pi/agent/extensions/ein-banner.ts` queda fuera del check porque importa SDK no declarado (preexistente, fuera de scope N.1)
  - skills: `scope-awareness`
  - why: El problema de resolución del SDK existe independientemente de este cambio; no es introducido por N.1
  - learn: Documentar limitaciones conocidas
  - architecture: Auditoría de la arquitectura de imports (tarea 12) lo verifica; typecheck manual lo evita
  - avoid: Intentar arreglar resolución del SDK aquí; es un problema de repositorio (Decisión 3 del scope)
  - verify: Mencionar en el report de auditoría

## // 014. Verificación final de línea base

- [x] 14.1 Ejecutar `bun test` desde la raíz; verificar línea base 1476 pass + nuevos tests
  - skills: `test-execution`, `result-validation`
  - why: Puerta del repo; debe pasar completo sin fallos
  - learn: Baseline es 1476 pass, 0 fail, 109 ficheros. Tras N.1: mismo 0 fail, pass ≥ 1476 + nuevos
  - architecture: Cobertura integral de cambios
  - avoid: Dejar tests skipped o pending; todo debe ejecutarse
  - verify: `bun test` exit code 0, output contiene "1. ✓ all pass", nuevo fichero `tests/update-probes.test.ts` presente

- [x] 14.2 Verificar que el fichero `tests/update-probes.test.ts` existe y contiene suite de 5+ tests (cobertura de D)
  - skills: `file-verification`
  - why: Espejo obligatorio de `lib/update-probes.ts`
  - learn: EIN.md:19 lo exige; ~90 líneas presupuestadas
  - architecture: Fichero nuevo, contribuye a conteo de "110 ficheros"
  - avoid: Saltarlo "porque los tests del launcher lo cubren"; cobertura explícita de `lib/`
  - verify: `wc -l tests/update-probes.test.ts` muestra ≥ 90 líneas; `grep "describe\|test" tests/update-probes.test.ts` contiene ≥ 5 suites/tests

---

## Orden de ejecución recomendado

Ejecutar en orden de **dependencias**:

1. **Grupo 001–004** (tipos + probes + snapshot): capa pura, sin dependientes
2. **Grupo 010** (tests de probes): valida implementación de 001–004
3. **Grupo 005–006** (reader + advisor): depende de tipos de 001, necesario para 007
4. **Grupo 007** (render): depende de 005–006
5. **Grupo 008** (workbench-entrypoint): depende de 004, 005–006
6. **Grupo 009** (ein-banner): depende de 001–004
7. **Grupo 011** (tests launcher): depende de 007, 008, 006
8. **Grupo 012–013** (auditoría + typecheck): validación post-implementación
9. **Grupo 014** (línea base): puerta final

Cada grupo es **una sesión de apply independiente**; flujo SDD resume después de cada `verify: pass`.
