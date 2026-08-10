# Tasks — fix-update-notice-masking

status: ready
blocked_by: none

---

## // 001. Suite de tests en `ein-banner-updates.test.ts` (fase RED)

Escribir todos los tests nuevos en fase RED antes de tocar `ein-update-notice.ts`. Los tests de guardias (`ambiguous`, `error`, `unsupported`, `current`) ya **pasan** con el corte actual — su valor es fallar si alguien más tarde amplía la lista de admitidos erróneamente. El test del defecto **falla** en RED porque el corte rechaza `unavailable`. Todos van en el mismo fichero y se verifican juntos.

### 1.1 — Test de guardias fail-closed (`ambiguous`, `error`, `unsupported`)

- [x] Agregar tres sub-casos de test en `tests/ein-banner-updates.test.ts` que verifiquen que `renderPiEinAdvisorNotice()` devuelve `null` cuando la faceta de actualización es `ambiguous`, `error`, o `unsupported`, **incluso si** el array de `provenance` contiene un item fresco y accionable (`quality === "update-available"` y `freshness === "current"`).

  - skills: `TypeScript`, `Bun test`, `TDD discipline`
  - why: El diseño D4 requiere cobertura del silencio fail-closed como parte del contrato que este cambio introduce. Sin estos tests, una regresión futura que ampliase la lista de admitidos a `error` pasaría desapercibida.
  - learn: En TDD estricto, los guardias de contrato se escriben como aserciones defensivas: verifican límites sin ser motores del cambio. Estos tests pasan en RED porque el corte actual (`!== "update-available"`) ya las rechaza; su valor es **fallar si el corte se relaja indebidamente**.
  - architecture: El corte es responsabilidad del consumidor (`renderPiEinAdvisorNotice`), no del advisor. El advisor es honesto (devuelve `unavailable` cuando la evidencia es incompleta); el consumidor decide qué estados publicar. Los guardias verifican que solo `update-available` y `unavailable` pasan al filtro por componente.
  - avoid: No confundir estos tests con tests positivos: no están aquí porque se espera que la condición los active, sino porque se espera que el **corte los mantenga silenciosos**. No reescribir el corte para incluirlos.
  - verify: `bun test tests/ein-banner-updates.test.ts` — todos tres sub-casos deben pasar en RED (antes del fix). El comando muestra 0 fallos.

### 1.2 — Test del caso del defecto (motor del cambio)

- [x] Agregar un test que verifica que `renderPiEinAdvisorNotice()` renderiza el comando `- Ein template: \`ein update\`` cuando la evidencia es `ein: update-available/current`, `binary: current/current`, `packages: skipped/current`. Este es el caso medido de scope (punto 1, línea 72). Faceta resultante será `unavailable` (evidencia incompleta: paquetes saltados), pero provenance contiene `["ein"]` con `quality === "update-available"` y `freshness === "current"`.

  - skills: `TypeScript`, `Bun test`, `TDD red-first`
  - why: Este test es el disparador del cambio. Reproduce la defecto exacto: línea 314 corta el flujo en `unavailable`, descartando el comando actionable de Ein. Es el motor que justifica la lista de admitidos.
  - learn: El ciclo TDD comienza aquí: escribir el test que falla por la razón correcta (corte actual rechaza `unavailable`) es el primer paso. El test especifica el comportamiento deseado sin revelar la solución (permite `unavailable` al filtro).
  - architecture: El defecto vive en el corte (línea 314), no en el filtro por componente (líneas 322–327). El filtro es correcto: ya selecciona solo items con `quality === "update-available" && freshness === "current"`. El cambio **permite que `unavailable` llegue a ese filtro**, no lo cambia.
  - avoid: No confundir "el fix debería permitir `unavailable`" con "eliminar el corte por completo". El corte sigue siendo crítico: rechaza `ambiguous`, `error`, `unsupported`. La lista de admitidos es positiva, no una negación acumulada.
  - verify: `bun test tests/ein-banner-updates.test.ts` — este test **falla en RED** devolviendo `null` (el corte actual rechaza `unavailable`). El error esperado es una aserción sobre la ausencia de `"Ein template: \`ein update\`"` en el resultado. Tras el fix (tarea 002), el test pasa.

### 1.3 — Test de límite superior (`current`)

- [x] Agregar un test que verifica que `renderPiEinAdvisorNotice()` devuelve `null` cuando la faceta es `current` (ningún componente tiene actualización disponible). Este test codifica la decisión D2 (exclusión intencional de `current`). Por construcción (línea 340 de `shared-config-update-advisor.ts`), `current` nunca contendrá un item con `quality === "update-available"`, así que el filtro por componente lo rechazaría de todas formas; este test es una aserción de intención, no de seguridad.

  - skills: `TypeScript`, `Bun test`, `boundary testing`
  - why: El diseño D2 excluye `current` por intención clara, no por inocuidad. Sin un test, la decisión se olvida y alguien podría erróneamente "limpiar" el código eliminando esa exclusión como "redundante". El test fija el límite.
  - learn: Un guardia de límite superior (boundary test) verifica que el corte se detiene donde se supone que se detiene, incluso si la downstream logic también lo rechazaría. Es documentación ejecutable de intención.
  - architecture: El corte enumera qué estados **pueden** tener noticias; incluir uno que por construcción nunca las tiene diluye esa declaración y convierte el corte en un filtro redundante. La lista es declarativa, no defensiva.
  - avoid: No eliminar este test bajo la premisa "el filtro por componente ya lo rechaza". La redundancia es intencional y comunica una decisión de diseño.
  - verify: `bun test tests/ein-banner-updates.test.ts` — este test **pasa en RED** (el corte actual rechaza `current`). Tras el fix (tarea 002), sigue pasando.

---

## // 002. Implementar lista de admitidos en `ein-update-notice.ts` (fase GREEN)

Cambiar el corte de la negación acumulada a una lista positiva de estados admitidos. Este es el único cambio en código de producción. Todos los tests escritos en la tarea 001 deben pasar en GREEN.

### 2.1 — Definir constante `RENDERABLE_UPDATE_STATUSES`

- [x] En `ein-pi/agent/lib/ein-update-notice.ts`, justo antes de la función `renderPiEinAdvisorNotice()` (alrededor de línea 309), agregar la constante:
  ```ts
  /**
   * Facet statuses whose evidence can still contain actionable components.
   * - `update-available`: complete evidence, all components checked.
   * - `unavailable`: incomplete evidence (one or more sources skipped), but other sources may have actionable updates.
   * - Excludes `current`, `ambiguous`, `error`, `unsupported`: either no updates available or evidence is contradictory/unrecoverable.
   */
  const RENDERABLE_UPDATE_STATUSES = ["update-available", "unavailable"] as const;
  ```
  El comentario en inglés explica el **porqué** (la razón de negocio / contrato), no el **qué** (que ya está en el nombre).

  - skills: `TypeScript`, `const definition`, `English technical writing`
  - why: El diseño D1 especifica que la decisión se exprese como una lista positiva de admitidos, no como una cadena de negaciones acumuladas. La negación acumulada crece mal y oculta intención. La constante nombrada y comentada es declarativa.
  - learn: Las constantes nombradas comunican intención. Un comentario que explica **por qué** ciertos valores están incluidos / excluidos es más valioso que un comentario que describe la sintaxis. El comentario en inglés es estándar en el codebase.
  - architecture: La constante vive en el consumidor (`renderPiEinAdvisorNotice`), no en el advisor. El advisor no conoce la política de renderización.
  - avoid: No poner el comentario en español; el codebase de Ein es en inglés. No hacer la lista dinámica o configurable — es una decisión fija de contrato.
  - verify: Verifica que TypeScript compila sin errores: `bun test tests/ein-banner-updates.test.ts` incluye compilación implícita.

### 2.2 — Sustituir condición en línea 314

- [x] Cambiar la línea 314 de:
  ```ts
  if (result.update.status !== "update-available") return null;
  ```
  a:
  ```ts
  if (!RENDERABLE_UPDATE_STATUSES.includes(result.update.status)) return null;
  ```
  No agregar comentario adicional en la línea del corte — el comentario de la constante explica la decisión. La línea en sí es clara por el nombre de la constante.

  - skills: `TypeScript`, `minimal change`, `conditional logic`
  - why: Éste es el cambio que habilita el comportamiento deseado: permite que `unavailable` llegue al filtro por componente. La implementación usa `.includes()` que es idiomática y legible.
  - learn: El cambio es una línea lógica. En cambios que mueven lógica de lugar (como aquí: de negación acumulada a lista positiva), la claridad de nombres (`RENDERABLE_UPDATE_STATUSES`) es más importante que la sintaxis.
  - architecture: La operación es una predicción: "¿Este estado puede pasar al filtro?". El `.includes()` es claro. Si el typescript da error de tipado (narrowing), se resuelve verificando el tipo de `result.update.status` contra la lista.
  - avoid: No intentar optimizaciones prematuras (sets, objetos de lookup). La lista tiene 2 elementos. No cambiar el resto de la función.
  - verify: TypeScript compila sin errores. El siguiente paso es ejecutar tests.

### 2.3 — Ejecutar suite completa y verificar línea base

- [x] Ejecutar `bun test tests/ein-banner-updates.test.ts` para verificar que:
  - El test del defecto (1.2) **ahora pasa** en GREEN.
  - Los guardias fail-closed (1.1) **siguen pasando**.
  - El guardia de límite superior (1.3) **sigue pasando**.
  - Los dos tests existentes (línea ~441 stale, línea ~458 frescas) **siguen pasando sin tocar su código**.

  Luego, ejecutar `bun test` desde la raíz para verificar la línea base completa:
  - Debe mostrar **1471+ tests, 0 fallos** (el `+` contabiliza los nuevos tests; la línea base previa era 1471).
  - Ningún otro fichero de `ein-pi/` debe aparecer en el diff de cambio.

  - skills: `Bun CLI`, `test verification`, `regression checking`
  - why: Verificación determinista de que el cambio es correcto y sin regresiones. La línea base (1471 tests) es conocida; el cambio debe sumarle solo los tests nuevos, sin romper nada.
  - learn: Correr la suite completa después de un cambio localizado verifica que no hay efectos secundarios en otras partes del codebase.
  - architecture: El cambio es aislado: toca una condición en una función. La propagación es mínima. Los tests verifican que esa aislación se mantiene.
  - avoid: No ejecutar solo los tests del fichero de test y confundir que pasan con "todo está bien". La puerta de entrega es `bun test` desde la raíz.
  - verify: Comando: `bun test`. Salida esperada: resumen de tests mostrando 0 fallos, sin errores de compilación, sin cambios inesperados en otros ficheros.

---

## Dependencias entre grupos

- **Tarea 001 → Tarea 002**: Los tests de la tarea 001 deben escribirse y ejecutarse en RED antes de implementar el fix (tarea 002). Esto valida que el test del defecto falla por la razón correcta (corte actual), no por un error accidental.

---

## Criterios de aceptación globales

1. **Caso del defecto renderiza**: `ein=update-available/current` + `binary=current/current` + `packages=skipped/current` → faceta `unavailable` → test pasa (tarea 1.2 en RED falla, tarea 2.3 pasa en GREEN).
2. **Guardias fail-closed**: `ambiguous`, `error`, `unsupported` devuelven `null` aunque contengan items accionables (tarea 1.1 pasa en RED, sigue pasando en GREEN).
3. **Límite superior**: `current` devuelve `null` (tarea 1.3 pasa en RED, sigue pasando en GREEN).
4. **Tests existentes intactos**: línea ~441 y ~458 pasan sin editar su código (verificación de no-regresión).
5. **Difícil de código de producción aislado**: solo línea 314 y la constante anterior en `ein-update-notice.ts`. Ningún otro fichero de `ein-pi/` en el diff.
6. **Línea base**: `bun test` desde raíz devuelve 0 fallos, con conteo de tests aumentado solo por los nuevos.

---

## Notas para `sdd-apply`

- Este cambio respeta el presupuesto de 400 líneas (estimado: ~30 líneas netas de tests + ~5 líneas de producción = ~35 líneas totales).
- La branch activa es `fix/update-notice-masking`. No hay cambios de dependencias ni configuración.
- Ciclo rápido: cada aplicación toca un solo fichero. Grupo 1 = tests, grupo 2 = producción + verificación.
- No se espera que haya conflictos: `ein-update-notice.ts` está estable en main; solo esta branch lo toca.
