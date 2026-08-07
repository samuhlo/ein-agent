# Tasks — docs-sync-contract

status: ready
blocked_by: none

---

## // 001. Parser de página + tipos base

- [x] 1.1 Crear `ein-pi/agent/lib/docs-site-contract.ts` con tipos y función `parsePage`
  - skills: `TypeScript`, `types`, `parsing`, `regex`
  - why: Los 10 lotes posteriores consumirán un modelo unificado de página (frontmatter, líneas numeradas, árbol de secciones, bloques PENDIENTE-D). Sin el parser, cada lint reimplementaría la numeración y divergería.
  - learn: Un modelo de árbol único reduce duplicación; la separación `parsePage` (sin fs) + `lintDocsTree` (con fs) permite lints puros e inyectables.
  - architecture: `parsePage(path: string, content: string): ParsedPage` es puro, sin fs ni git. Tipos exportados: `PageFrontmatter`, `PageSection` (con `level: 2|3`, `role`, `state`, `startLine`, `endLine`), `PendingBlock`, `ParsedPage`.
  - avoid: No lanzar lógica de linting dentro de `parsePage` — mantenerlo como modelo de datos inmutable que cada lint consume.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "RED.*parser.*falla.*módulo"` → test falla porque módulo no existe; luego `bun test tests/docs-site-contract.test.ts --grep "GREEN.*parser.*parsePage.*7.*secciones"` pasa después de implementar.

- [x] 1.2 Implementar tipos públicos en `docs-site-contract.ts` según `design.md` C1 (API pública)
  - skills: `TypeScript`, `types`
  - why: Contrato explícito para consumers (tests, futuros CLI, sdd-verify).
  - learn: Tipos estables permiten que tests aserten sobre `code` del issue, no sobre mensaje (los mensajes evolucionan sin romper suite).
  - architecture: `export type IssueLevel = "error" | "warning"`, `PageIssue`, `SectionRole`, `SectionState`, `PageSection`, `PageFrontmatter`, `ParsedPage`, `PageContext`, `PageReport`, `TreeReport`. Enumerados concretos (no strings literales) donde sea clave.
  - avoid: Types demasiado genéricos (p.ej. `any`, `unknown` en lugar de uniones tipadas). Cada tipo debe ser casi autosexy: el nombre + campos explican qué se espera.
  - verify: `tsc --noEmit` en `installer/` completa sin errores de tipo; `bun test` importa los tipos sin queja.

---

## // 002. CT-1 + CT-2: Frontmatter y H1

- [x] 2.1 Escribir test RED para CT-1 (frontmatter con 3 claves, no 4)
  - skills: `testing`, `TypeScript`, `expect`, `regex patterns`
  - why: RED concreto: frontmatter con solo `title`, `description`, `sources` (falta `verified_rev`) debe emitir `CT1_KEY_ORDER`; y frontmatter con `verified_rev: "2f67c73"` **no** debe emitir issue (§D criterio 3).
  - learn: Una página puede tener múltiples `verified_rev` (10 páginas `0ae709d`, 11 páginas `2f67c73` per hallazgo F1). El validador comprueba **forma** (`^[0-9a-f]{7,40}$`), jamás una literal.
  - architecture: Test fixture sintética `buildPage()` con `overrides`. Mock `ctx.fileExists` → true para todas las `sources`. Dos casos RED: (a) 3 claves, (b) rev forma inválida.
  - avoid: No hardcodear `verified_rev == "0ae709d"` en el linter. Lo rechazó el design por F1.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT1.*3-claves\|CT1.*2f67c73"` falla, reporta `CT1_KEY_ORDER`; después de `lintFrontmatter` implementado, pasa.

- [x] 2.2 Implementar `lintFrontmatter(page: ParsedPage, ctx: PageContext): PageIssue[]`
  - skills: `TypeScript`, `parsing`, `error codes`
  - why: Valida orden exacto de claves, existencia de `sources`, forma de `verified_rev` (diseño §B CT-1, C1).
  - learn: Cada `PageIssue` lleva `code` estable (no mensaje), para que tests aserten sobre él. Mensaje es reescribible sin romper suite.
  - architecture: Chequeos en orden: (1) claves presentes y orden, (2) cada ruta de `sources` existe vía `ctx.fileExists()`, (3) `verified_rev` casa `^[0-9a-f]{7,40}$`. Codes: `CT1_KEY_ORDER`, `CT1_KEY_COUNT`, `CT1_KEY_MISSING`, `CT1_SOURCE_NOT_FOUND`, `CT1_REV_SHAPE`.
  - avoid: Comparar `verified_rev` con un valor literal (§D criterio 3 lo rechaza).
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT1"` pasa; PAGE con `2f67c73` retorna `issues: []`.

- [x] 2.3 Escribir test RED para CT-2 (primer encabezado no es H1 exacto)
  - skills: `testing`, `regex patterns`
  - why: H1 debe ser exactamente `# <title sin ` · EIN`>` (diseño §B CT-2). RED: página con `# El título`  pero `title: "El título · EIN"` en frontmatter.
  - learn: La línea 8 debe ser H1. Las 7 primeras son frontmatter + `---`. Numerar correctamente evita errores de off-by-one.
  - architecture: Busca primer `^# ` después de `bodyStart` del ParsedPage. Compara contra `title` del frontmatter con sufijo ` · EIN` removido.
  - avoid: Asumir que `# ` es siempre H1 — puede haber comentarios html o código fallido.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT2"` falla antes; implementado, pasa.

- [x] 2.4 Implementar `lintHeadings(page: ParsedPage): PageIssue[]` parcial (CT-2 solo, sin CT-3 aún)
  - skills: `TypeScript`, `parsing`
  - why: Delega para que L3 agregue CT-3 sin reescribir.
  - learn: Small functions are easier to review and test; bundle only when they share logic or state.
  - architecture: `lintHeadings` arranca validando H1. Retorna `CT2_MISSING_H1`, `CT2_H1_MISMATCH`. En L3 se extiende a CT-3.
  - avoid: Mezclar lógica de dos reglas en una función si difieren en entrada/salida.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT2"` pasa; las 21 páginas reales parecen H1 correctas.

---

## // 003. CT-3: Orden y presencia de siete encabezados `##`

- [x] 3.1 Escribir test RED para CT-3 (secciones en orden incorrecto)
  - skills: `testing`, `fixture building`
  - why: Siete `##` exactos en orden: `En una frase`, `Para quién y qué aprenderás`, `Ruta rápida`, `Detalles`, `Checklist`, `Siguiente paso`, `Fuentes` (§B CT-3, §D criterio L3). RED: página con secciones `[En una frase, Checklist, Para quién…, Ruta rápida, Detalles, Siguiente paso, Fuentes]` debe emitir `CT3_SECTION_ORDER`.
  - learn: Constante exportada de los 7 encabezados esperados (como enum o const array) hace fácil verificar orden en linter y mantenerlo en tests.
  - architecture: Fixture con ítems swapped. Verify: lista derivada de `ParsedPage.sections` debe coincidir en cantidad y orden con la canónica.
  - avoid: Hardcodear los 7 nombres en dos lugares (linter + test) — usar una const exportada.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT3.*order"` falla; implementado, pasa.

- [x] 3.2 Escribir test RED para CT-3 (duplicados o falta de secciones)
  - skills: `testing`
  - why: No debe haber duplicados. Si falta alguno, debe fallar (§B CT-3).
  - learn: "Exactamente N" no es lo mismo que "al menos N" — tests deben cubrir ambos bordes.
  - architecture: Dos fixtures: (a) dos `## Detalles`, (b) falta `## Checklist`. Cada uno emite error diferente: `CT3_DUPLICATE_SECTION` o `CT3_SECTION_MISSING`.
  - avoid: Test genérico "secciones mal" sin especificar qué falla.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT3.*duplicate\|CT3.*missing"` falla; implementado, pasa.

- [x] 3.3 Escribir test RED para CT-3 (## Detalles con prosa antes del primer ###)
  - skills: `testing`, `text fixtures`
  - why: Bajo `## Detalles` debe haber un `###` inmediatamente, sin prosa interpuesta (§B CT-3, §D criterio L3).
  - learn: El árbol de secciones necesita punteros de inicio/fin de línea (`startLine`, `endLine`) para esta comprobación.
  - architecture: Fixture con `## Detalles\nAlgún párrafo\n### Subsección`. El linter debe detectar el párrafo antes del `###`.
  - avoid: Falso positivo si `## Detalles` tiene un párrafo **después** del último `###` (eso es error SK, no CT-3).
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT3.*detalles.*prosa"` falla; implementado, pasa.

- [x] 3.4 Extender `lintHeadings` para incluir CT-3
  - skills: `TypeScript`, `parsing`
  - why: CT-2 + CT-3 comparten la lectura del árbol de encabezados.
  - architecture: `lintHeadings` ahora chequea ambas. Codes: `CT2_MISSING_H1`, `CT2_H1_MISMATCH`, `CT3_SECTION_ORDER`, `CT3_DUPLICATE_SECTION`, `CT3_SECTION_MISSING`, `CT3_DETALLES_HAS_PROSA_BEFORE_SUBSECTION`.
  - avoid: Reescribir la lógica de CT-2 — solo agregar CT-3 sin tocar lo que ya funciona.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT3"` pasa; L2 aún pasa (regresión).

---

## // 004. SK (núcleo): Pureza de sección — SK-2, SK-3, SK-4

- [x] 4.1 Escribir test RED para SK-2 (sección con marcador + párrafo emite SK_MIXED_SECTION)
  - skills: `testing`, `regex patterns`, `line numbers`
  - why: Una sección de contenido (no-structural) que tenga un bloque `:::caution[PENDIENTE-D]` debe tener **exactamente** ese bloque y nada más — ni prosa, ni otros bloques (§B SK-2, §D criterio L4 y criterio 4).
  - learn: "Sección" es un rango de líneas entre dos `##` (o entre `##` y siguiente `##` o fin). El validador debe nombrar la línea exacta del párrafo residual.
  - architecture: Fixture con `## En una frase`, el bloque PENDIENTE-D, y un párrafo suelto. `lintSectionPurity` debe reportar `SK_MIXED_SECTION` con el número de línea del párrafo.
  - avoid: Reportar solo "sección tiene mezcla" sin línea — la línea es crucial para que el usuario corrija.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "SK2.*mixed"` falla; implementado, pasa.

- [x] 4.2 Escribir test RED para SK-3 (sección redactada sin marcador no emite error, devuelve state drafted)
  - skills: `testing`, `fixtures`
  - why: Una sección sin marcador PENDIENTE-D y con prosa es **válida** (la fase D la escribió). El validador no debe quejar (§B SK-3, §D criterio 4).
  - learn: El **marcador es el interruptor** — su presencia/ausencia decide si la sección está bajo regla de pureza.
  - architecture: Fixture con sección que tiene solo prosa, sin `:::caution[PENDIENTE-D]`. `lintSectionPurity` retorna `issues: []` y la sección en `state: "drafted"`.
  - avoid: Codificar reglas de pureza que se aplican aunque el marcador no esté — eso caduca la herramienta cuando la fase D escribe.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "SK3.*drafted"` falla; implementado, pasa.

- [x] 4.3 Escribir test RED para SK-4 (sección vacía sin marcador emite SK_EMPTY_SECTION)
  - skills: `testing`
  - why: Una sección sin marcador y sin línea no vacía es un defecto — alguien borró el marcador sin redactar (§B SK-4, §D criterio 5).
  - learn: Distinguir "vacía porque está pendiente" (tiene marcador) de "vacía porque olvidaron redactar" (sin marcador).
  - architecture: Fixture con `## En una frase` seguido de `## Para quién…` sin una línea entre. `lintSectionPurity` emite `SK_EMPTY_SECTION`.
  - avoid: Asunto como advertencia en lugar de error — es un defecto real.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "SK4.*empty"` falla; implementado, pasa.

- [x] 4.4 Implementar `lintSectionPurity(page: ParsedPage): PageIssue[]` + derivar `PageState`
  - skills: `TypeScript`, `text filtering`
  - why: Evalúa todas las secciones de contenido de la página con el criterio SK-2/SK-3/SK-4 y derive el `state` de la página (skeleton / partial / drafted).
  - learn: State es informativo, no decisor — la página pasa si todo cumple CT-1…CT-9 y SK-2/SK-4, sin que `state` por sí solo bloquee.
  - architecture: Para cada sección de contenido: (1) detecta marcador, (2) evalúa contenido residual (líneas no blanco, no encabezado, no bloque, no item fuentes, no línea siguiente paso). (3) clasifica: `pending` (marcador + cero residuo), `drafted` (sin marcador, tiene residuo), `empty` (sin marcador, cero residuo). (4) emite errores SK_MIXED_SECTION, SK_EMPTY_SECTION. (5) almacena state en cada sección. (6) derivo state de página: `skeleton` (todas `pending`), `drafted` (ninguna `pending`), `partial` (mezcla).
  - avoid: Aplicar purezas a secciones `structural` — solo a `content`.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "SK[234]"` pasa; L2, L3 aún pasan.

---

## // 005. CT-4 + CT-5: Bloques PENDIENTE-D y lista de Fuentes

- [x] 5.1 Escribir test RED para CT-4 (bloque sin clave `lineas:`)
  - skills: `testing`, `regex patterns`
  - why: Bloque PENDIENTE-D debe tener **exactamente** las claves `falta:`, `fuentes:`, `lineas:` en ese orden, minúsculas, una por línea, cerrado con `:::` (§B CT-4, §D criterio L5).
  - learn: El marcador es literal, no flexible — variantes de caja o formato hacen falta.
  - architecture: Fixture con bloque `:::caution[PENDIENTE-D]\nfalta:...\nfuentes:...\n:::` (falta `lineas:`). Emite `CT4_BLOCK_MISSING_KEY`.
  - avoid: Permitir órdenes distintos de las claves.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT4.*missing.*lineas"` falla; implementado, pasa.

- [x] 5.2 Escribir test RED para CT-4 (fuentes en bloque no en frontmatter)
  - skills: `testing`
  - why: Toda ruta listada bajo `fuentes:` del bloque PENDIENTE-D debe existir en `sources` del frontmatter (§B CT-4, §D criterio L5).
  - learn: El bloque y el frontmatter deben estar sincronizados — es un invariante de integridad.
  - architecture: Fixture con `fuentes: ruta/ficticia` que no está en frontmatter. Emite `CT4_SOURCE_NOT_IN_FRONTMATTER`.
  - avoid: Reportar solo que la ruta no existe en el árbol — reportar específicamente que falta en frontmatter.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT4.*orphaned"` falla; implementado, pasa.

- [x] 5.3 Escribir test RED para CT-5 (lista Fuentes desordenada o incompleta)
  - skills: `testing`, `fixtures`
  - why: `## Fuentes` MUST listar exactamente las rutas de `sources` del frontmatter, en el mismo orden, con formato `- ` + backtick + ruta + ` — ` + desc (§B CT-5, §D criterio L5).
  - learn: Cantidad Y orden importan. Una lista con las rutas pero en distinto orden falla.
  - architecture: Fixture con frontmatter `sources: [ruta1, ruta2, ruta3]` y `## Fuentes` listando `[ruta2, ruta1, ruta3]` o `[ruta1, ruta2]`. Emite `CT5_SOURCES_MISMATCH`.
  - avoid: Falso positivo si la descripción está ausente o vacía — eso es un error separado (`CT5_MISSING_DESCRIPTION`).
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT5"` falla; implementado, pasa.

- [x] 5.4 Implementar `lintPendingBlocks(page: ParsedPage): PageIssue[]` y `lintSourcesSection(page: ParsedPage): PageIssue[]`
  - skills: `TypeScript`, `regex`, `parsing`
  - why: Validates CT-4 (bloque PENDIENTE-D literal y claves) y CT-5 (lista de Fuentes).
  - architecture: `lintPendingBlocks` encuentra todos `:::caution[PENDIENTE-D]…:::` y chequea formato literal, claves presentes, orden, minúsculas. Codes: `CT4_FORMAT`, `CT4_BLOCK_MISSING_KEY`, `CT4_BLOCK_KEY_ORDER`, `CT4_SOURCE_NOT_IN_FRONTMATTER`. `lintSourcesSection` compara array de rutas encontradas en `## Fuentes` contra `sources` del frontmatter. Code: `CT5_SOURCES_MISMATCH`, `CT5_MISSING_DESCRIPTION`.
  - avoid: Duplicar parseo de claves entre ambas funciones.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT4\|CT5"` pasa; L4 aún pasa.

---

## // 006. CT-6 + CT-7: Enlaces relativos y cadena de lectura

- [x] 6.1 Escribir test RED para CT-6 (enlace a fichero inexistente)
  - skills: `testing`, `fixtures`, `mocking`
  - why: Todo enlace relativo `.md` en la página debe resolver, relativo al directorio de la página, a un fichero existente (§B CT-6, §D criterio L6).
  - learn: Inyectabilidad es clave — el test proporciona `ctx.linkExists` como mock para controlar qué ficheros "existen".
  - architecture: Fixture con `[enlace-roto](../no-existe.md)` en `## Siguiente paso` o en `lineas:` de PENDIENTE-D. `ctx.linkExists("../no-existe.md")` retorna false. Emite `CT6_BROKEN_LINK` con línea.
  - avoid: Tocar fs real; usar mock.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT6.*broken"` falla; implementado, pasa.

- [x] 6.2 Escribir test RED para CT-7 (enlace salta elemento de cadena)
  - skills: `testing`, `fixtures`
  - why: Si una página pertenece a una cadena de lectura declarada (parámetro `ctx.chain`), el `## Siguiente paso` MUST ser un enlace al elemento siguiente de la cadena (§B CT-7, §D criterio L6).
  - learn: Cadena es dato inyectado, no constante única — `ctx.chain` trae `{pages: [...], index: number}`. El linter no memoriza la cadena.
  - architecture: Fixture de página con `ctx.chain = {pages: ["overview", "getting-started", "context"], index: 0}` (page es overview). `## Siguiente paso` con enlace `[siguiente](../getting-started.md)` pasa; si fuera `[saltar](../context.md)`, emite `CT7_CHAIN_MISMATCH`.
  - avoid: Hardcodear la cadena en el linter.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT7.*chain"` falla; implementado, pasa.

- [x] 6.3 Escribir test RED para CT-7 (cierre en texto plano vs enlace)
  - skills: `testing`
  - why: El último elemento de una cadena cierra con texto plano, no enlace (§B CT-7, §D criterio L6 implícito). Si índice == `chain.pages.length - 1`, `## Siguiente paso` no debe ser un enlace.
  - learn: Límite de cadena es un caso especial — tests necesitan fixture explícita.
  - architecture: Fixture con `index: 2` (último elemento) y `## Siguiente paso` con `[enlace](...)` emite error. Fixture con texto plano no emite nada.
  - avoid: Falso negativo si cierre es enlace a página fuera del árbol.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT7.*text-close"` falla; implementado, pasa.

- [x] 6.4 Implementar `lintLinks(page: ParsedPage, ctx: PageContext): PageIssue[]`
  - skills: `TypeScript`, `parsing`
  - why: CT-6 + CT-7 en una sola función que recorre todas las líneas buscando `[…](…)` y valida.
  - architecture: Busca patrones `\[([^\]]+)\]\(([^)]+)\)` en la página (fuera de code blocks si es necesario). Para cada enlace relativo `.md`, chequea `ctx.linkExists()`. Si `ctx.chain` está presente y la página es parte de ella, valida que el destino es el siguiente elemento y que el cierre cumple la regla de texto plano.
  - avoid: Falsos positivos en code blocks o URLs absolutas.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT6\|CT7"` pasa; L5 aún pasa.

---

## // 007. CT-8 + CT-9: Versiones y tag [BETA-EXCLUDED]

- [x] 7.1 Escribir test RED para CT-8 (literal de versión `v0.42.0`)
  - skills: `testing`, `regex`
  - why: Ninguna línea debe contener el patrón `v?\d+\.\d+\.\d+` — versiones hard-coded envejecen y rompen la verdad única (§B CT-8, §D criterio L7).
  - learn: El test fixture tiene línea con `v0.42.0` que debe ser detectada y reportada.
  - architecture: Fixture con línea `La versión actual es v0.42.0.` Emite `CT8_VERSION_LITERAL` con línea.
  - avoid: Falso positivo en comentarios de cambio como "en v0.42.0 se fijó X" — el linter reporta, pero es juicio editorial si la línea debe existir.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT8.*version"` falla; implementado, pasa.

- [x] 7.2 Escribir test RED para CT-9 parcial (tag [BETA-EXCLUDED] debe ser literal exacto)
  - skills: `testing`, `regex`
  - why: El tag de exclusión MUST ser exacto `[BETA-EXCLUDED]` — variantes `[beta-excluded]`, `[Beta-Excluded]` o sin corchetes son error (§B CT-9, §D criterio L7 implícito).
  - learn: Formas incorrectas son muy fáciles de escribir si el validador es flexible. Ser estricto previene acumulación de excepciones no documentadas.
  - architecture: Fixture con línea `característica sin tag`, otra con `[beta-excluded]` (minúsculas), otra con `[BETA-EXCLUDED]` (correcta). Las incorrectas emiten `CT9_TAG_MALFORMED`.
  - avoid: Aceptar variantes de caja.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT9.*tag"` falla; implementado, pasa.

- [x] 7.3 Nota: CT-9 semántica (qué menciones exigen tag) no se implementa — solo la forma
  - skills: `design decision documentation`
  - why: Determinar si una mención de una capacidad de RM-2 necesita tag exige clasificador semántico (§C5 del design). Es pospuesto; solo se implementa validación de forma (§D criterio L7).
  - learn: Admitir que algo no es mecanizable hoy evita falsos positivos que se acaban ignorando.
  - architecture: `lintLineRules()` implementa CT-8 + forma de CT-9. CT-9 semántica queda declarada como "no cubierto" en comentario del código.
  - avoid: Implementación a medias que silencie falsamente.
  - verify: N/A — nota, no tarea de código.

- [x] 7.4 Implementar `lintLineRules(page: ParsedPage): PageIssue[]` (CT-8 + CT-9 forma)
  - skills: `TypeScript`, `regex`, `line iteration`
  - why: Escanea cada línea del cuerpo buscando patrones prohibidos (versión, tag malformado).
  - architecture: Itera `page.lines[page.bodyStart:]`. Comprueba `v?\d+\.\d+\.\d+` (CT-8) y `\[[Bb][Ee][Tt][Aa].*[Ee][Xx][Cc][Ll][Uu][Dd][Ee][Dd]\]` (variante de forma de CT-9). Para cada coincidencia, emite issue con línea. Codes: `CT8_VERSION_LITERAL`, `CT9_TAG_MALFORMED`.
  - avoid: Búsqueda global en toda la página sin números de línea.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "CT8\|CT9"` pasa; L6 aún pasa.

---

## // 008. Árbol real: Agregador + validación de las 21 páginas

- [x] 8.1 Escribir test RED para `lintPage` agregador (una página, todos los lints)
  - skills: `testing`, `fixtures`
  - why: `lintPage(content: string, ctx: PageContext): PageReport` orquesta todos los lints (CT-1…CT-9, SK) sobre una página y retorna agregado. RED: test que intenta llamar a `lintPage` falla porque no existe.
  - learn: El agregador es donde los lints individuales convergen en una decisión (`page.ok = all issues are resolved`).
  - architecture: `lintPage` llama a `parsePage`, luego cada `lintFrontmatter`, `lintHeadings`, `lintPendingBlocks`, `lintSourcesSection`, `lintLinks`, `lintLineRules`, `lintSectionPurity`. Agrega `issues`, cuenta `errors` y `warnings`, asigna `ok = errors === 0` (warnings no bloquean), expone `state` derivado.
  - avoid: Stopping on first error — agregar todos.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "lintPage.*agregador"` falla; implementado, pasa.

- [x] 8.2 Escribir test RED para `lintDocsTree(repoRoot: string, docsDir: string): TreeReport` (árbol real)
  - skills: `testing`, `fs`, `fixtures`
  - why: **El punto crítico del cambio.** Lee todas las páginas bajo `docsDir`, invoca `lintPage` en cada una, agrega en `TreeReport` y retorna. RED: debe fallar si alguna de las **21 páginas reales** viola contrato (§D criterio 1 y L8).
  - learn: Este test es el guardián de que el validador se mantiene en sintonía con el árbol real. Si aquí falla, es un hallazgo real de fase A (o defecto del validador que debe corregirse).
  - architecture: `lintDocsTree` abre `docs-site/src/content/docs/`, itera archivos `.md`, llama `lintPage` sobre cada una (inyectando `ctx` con `fileExists` y `linkExists` que usan fs real). Agrega todas en `TreeReport` con recuento de secciones en `census`. Sin modificaciones de archivo — solo lectura.
  - avoid: Modificar o cachear páginas.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "lintDocsTree.*21"` falla; implementado, ejecuta linting real. Si alguna de las 21 falla, es hallazgo real — se reporta línea concreta, **no se modifica la página, se documenta el hallazgo en apply-progress.md**.

- [x] 8.3 Verificar que las 21 páginas pasan `lintDocsTree` con `ok: true`, `census: { skeleton: 21, partial: 0, drafted: 0 }`
  - skills: `testing`, `assertions`
  - why: Criterio § D.1: suite debe contener test que ejecuta `lintDocsTree` esperando las 21 en verde con estado skeleton.
  - learn: Si aquí falla, no es error de test — es defecto corregible del árbol o del validador.
  - architecture: Test afirma `report.ok === true`, `report.pages.length === 21`, `report.census.skeleton === 21`, `report.census.partial === 0`, `report.census.drafted === 0`.
  - avoid: Ignorar fallos de alguna página sin investigar.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "lintDocsTree.*21.*verde"` pasa si las 21 están limpias; si falla, revisar output y aplicar corrección (puede ser hallazgo real).

- [x] 8.4 Verificar que no hay modificación de archivo en `docs-site/` ni `openspec/changes/archive/`
  - skills: `git`, `shell`
  - why: Criterio §D.10: `git status --porcelain docs-site/ openspec/changes/archive/` debe estar vacío al terminar.
  - learn: El validador **observa** el árbol, no lo altera. Esto es una garantía invariante.
  - architecture: Test final ejecuta `git status --porcelain` después de toda la suite y aserta que output es vacío.
  - avoid: Permitir cambios silenciosos.
  - verify: `bun test tests/docs-site-contract.test.ts --grep "no-modifications"` pasa.

---

## // 009. Detector de drift: Unitarios con GitRunner mock

- [x] 9.1 Escribir test RED para detector (rev inexistente devuelve `clean` en vez de `unknown`)
  - skills: `testing`, `mocking`, `TypeScript`
  - why: Detector MUST diferenciar "sin cambios" (`clean`) de "no pude verificar" (`unknown` con razón `rev-not-found`). RED: con `GitRunner` falso que reporta rev inexistente, informe devuelve `clean` en lugar de `unknown` y contador `unknown === 0`.
  - learn: Tres estados (`clean` / `drifted` / `unknown`) son mejor que dos + lista de errores al margen (§C4 del design). Con dos, "no pude verificar" se lee como "está limpio" en resúmenes rápidos.
  - architecture: `GitRunner` inyectable: `(args: string[]) => { ok: boolean; code: number; stdout: string; stderr: string }`. Test proporciona mock que retorna `ok: false` para `git rev-parse --verify <rev>^{commit}`. Detector capta error, registra en `errors[]` con `reason: "rev-not-found"`, página queda con `status: "unknown"`.
  - avoid: Retornar `clean` por defecto ante error — eso mata la señal.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "rev-not-found"` falla; implementado, pasa.

- [x] 9.2 Escribir test RED para detector (fuente modificada devuelve `drifted` con recuento)
  - skills: `testing`, `mocking`
  - why: Detector MUST ejecutar `git diff` y reportar cambios. RED: `GitRunner` falso retorna numstat con 5 líneas añadidas, 2 eliminadas; informe debe devolver `drifted` con `{lines_changed: 7}`.
  - learn: Suma de líneas añadidas y eliminadas es la métrica de "cuánto cambió".
  - architecture: Mock `GitRunner` para `git diff --numstat` retorna `5\t2\t ruta/fuente`. Detector parsea, suma, reporta en `sources_changed`.
  - avoid: Perder diferencia entre add/modify/delete en el reporte.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "drifted"` falla; implementado, pasa.

- [x] 9.3 Escribir test RED para detector (fuente eliminada reporta `status: "deleted"`)
  - skills: `testing`, `mocking`
  - why: Si un archivo de `sources` fue borrado (`D` en git), debe reportarse con ese estado (§D criterio 6).
  - learn: Status de git (`A`, `M`, `D`) conviene mapear a tipos semánticos.
  - architecture: Mock `GitRunner` para `git diff --name-status` retorna `D\truta/fuente`. Detector reporta `status: "deleted"` en esa fuente.
  - avoid: Confundir "archivo fuente borrado" con "página tiene drift" — son mensajes distintos.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "deleted"` falla; implementado, pasa.

- [x] 9.4 Escribir test RED para detector (directorio no es repo devuelve `not-a-repo`)
  - skills: `testing`, `mocking`
  - why: Antes de nada, detector MUST verificar que el directorio es un repo git (§D criterio 6, DR-2).
  - learn: Fail fast y con mensaje limpio previene confusiones.
  - architecture: Mock `GitRunner` para `git rev-parse --git-dir` retorna error (exit ≠ 0). Detector reporta estado global `unknown` con razón `not-a-repo`.
  - avoid: Lanzar excepción; retornar estructura limpia.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "not-a-repo"` falla; implementado, pasa.

- [x] 9.5 Escribir test RED para detector (dos revs distintos, no comparte)
  - skills: `testing`, `fixtures`
  - why: Detector MUST procesar páginas con distintos `verified_rev` en la misma ejecución sin contaminar (§D criterio 8).
  - learn: Cada página lleva su propio rev — no hay rev global.
  - architecture: Fixture con dos páginas: una `verified_rev: "0ae709d"`, otra `"2f67c73"`. Detector ejecuta diff separadamente para cada una. Test afirma que los revs procesados son diferentes y que no hay contaminación.
  - avoid: Caché global de `git diff` por rev.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "dos-revs"` falla; implementado, pasa.

- [x] 9.6 Implementar `docs-site-drift-detector.ts` con `detectDrift` y tipos `DriftReport`, `DriftPageReport`
  - skills: `TypeScript`, `git`, `child_process`, `parsing`
  - why: Módulo ejecutable que compara fuentes versionadas contra el árbol actual.
  - architecture: `detectDrift(docsDir: string, repoRoot: string, gitRunner?: GitRunner): DriftReport`. Parámetro `gitRunner` por defecto ejecuta `execFileSync("git", ...)`. Lógica: (1) chequea `git rev-parse --git-dir`, (2) por cada página lee frontmatter, (3) por cada fuente en `sources` ejecuta `git rev-parse --verify <rev>^{commit}` y `git diff --numstat --no-renames <rev>..HEAD -- <fuente>`, (4) agrega en `DriftReport`.
  - avoid: Lanzar excepciones; capturar y registrar como `unknown` con razón.
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "detectDrift"` pasa; L9 entero pasa.

---

## // 010. Drift real + integración en CI

- [x] 10.1 Escribir test de integración: repo temporal con commits reales
  - skills: `testing`, `shell`, `git`, `fixtures`
  - why: Criterio §D.7: test que ejercita el `GitRunner` por defecto (no mock) sobre un repo temporal con dos commits reales. Verde: detector retorna `drifted` con cambios reales cuantificados.
  - learn: Sin este test, el comando `git` real nunca se ejecuta. Los unitarios con mock nunca prueban la integración de verdad.
  - architecture: Test crea directorio temporal, `git init`, crea archivo fuente, primer commit (rev = V1), modifica archivo, segundo commit (rev = V2). Página ficticia con `verified_rev: V1` y `sources: ["archivo"]`. Detector ejecuta contra repo temporal con `GitRunner` por defecto. Resultado debe ser `drifted` con líneas cambiadas entre V1 y V2.
  - avoid: Usar repos reales del proyecto (deja artifacts).
  - verify: `bun test tests/docs-site-drift-detector.test.ts --grep "integracion.*repo-temp"` pasa y reporta drift real.

- [x] 10.2 Agregar job `docs-contract` en `.github/workflows/ci.yml`
  - skills: `YAML`, `GitHub Actions`, `git`
  - why: Criterio §D.11 y §D.12: job debe ejecutar `docs-site-contract.test.ts` como paso bloqueante y `docs-site-drift-detector.test.ts` como informativo. Fetch-depth 0 para permitir diff contra revs históricos.
  - learn: `fetch-depth: 0` es crucial — sin él, `rev-not-found` es silencioso (§C7 del design y criterio 11).
  - architecture: Job `docs-contract` paralelo a `test`, pasos: (1) checkout con `fetch-depth: 0`, (2) setup-bun, (3) run `bun test tests/docs-site-contract.test.ts --reporter=verbose` (bloqueante), (4) run `bun test tests/docs-site-drift-detector.test.ts --reporter=verbose` con `continue-on-error: true` (informativo).
  - avoid: Compartir checkout entre jobs sin fetch-depth — drift test falla silenciosamente.
  - verify: CI ejecuta el job en la rama, ambos pasos en verde (contrato bloqueante, drift informativo).

- [x] 10.3 Verificar que CI pasa en la PR de este cambio
  - skills: `git`, `CI review`
  - why: Criterio §D.12: "El job `docs-contract` aparece en verde en la ejecución de CI de la PR de este cambio."
  - learn: Observational verification — build system es fuente de verdad.
  - architecture: Trigger workflow en la rama, revisar Checks de GitHub, confirmar job `docs-contract` green.
  - avoid: Asumir que pasará sin ejecutar.
  - verify: GitHub Checks muestra ✓ `docs-contract` en la PR.
  - **Cerrada por el parent con evidencia remota.** La redacción original exigía una PR, que este cambio no abre por decisión del usuario (la PR de la documentación va tras fases posteriores). Se resolvió con `workflow_dispatch` sobre la rama, declarado en el workflow, sin abrir PR. Ningún subagente puede completar esta tarea: no lanzan workflows.
    - Run `31190266200` sobre `1c32f05` (`feat/docs-site`): `conclusion: success`; jobs `test (ubuntu-latest)`, `test (macos-latest)` y `docs-contract` los tres en verde.
    - El paso de drift sobre las 21 páginas reales devolvió en CI `12 clean, 9 drifted, 0 unknown`, idéntico a la ejecución local. Los `0 unknown` son la prueba de que `fetch-depth: 0` hace su trabajo: con checkout superficial los `verified_rev` históricos no serían alcanzables y las 21 habrían salido `unknown`.
    - Run previo `31188175711` sobre `1bdaadc`: también verde, pero con el paso de drift ejecutando solo los tests del detector; no cuenta como evidencia del criterio §D.12.

- [x] 10.4 Test final: verificar que `bun test` completo pasa (suite previa + nuevo)
  - skills: `testing`, `regression`
  - why: Criterio §D.9: "suite previa del repo no se rompe."
  - learn: Regressión es real riesgo cuando se agregan funciones grandes. TDD mitiga, pero debe verificarse.
  - architecture: Test runner ejecuta `bun test` sin filtro. Debe pasar con 22 + N tests (N = nuevos).
  - avoid: Assumir que los unitarios de contrato no afectan al resto.
  - verify: `bun test` output muestra todos en verde, conteo incrementado.

---

## Dependencias entre lotes

```
L1 (parser)
  └─> L2 (CT-1/2) ─-> L3 (CT-3) ─-> L4 (SK) ─->
  └─> L5 (CT-4/5) ─-> L6 (CT-6/7) ─-> L7 (CT-8/9) ─->
  └─> L8 (árbol real)
        └─> L10 (CI)

L9 (drift unitarios)
  └─> L10 (CI + drift real)
```

- L1 es la base (tipos y parser).
- L2-L7 son implementaciones independientes de cada CT/SK, pero todas alimentan L8.
- L8 es el punto crítico: **si las 21 fallan aquí, es hallazgo real**. No se relajan reglas sin decisión explícita del usuario.
- L9 es paralelo (no depende de L1-L8).
- L10 consume L8 (suite de contrato) y L9 (suite de drift) y agrega CI.

---

## Criterios de recepción §D, mapeados a tareas

| Criterio | Lote | Tarea |
|----------|------|-------|
| 1. `lintDocsTree` sobre 21 en verde, `skeleton: 21` | L8 | 8.3 |
| 2. Casos negativos por cada `code`, aserción sobre `code` | L2-7 | Cada lote |
| 3. `verified_rev: "2f67c73"` sin issue; `"zzzzzzz"` emite `CT1_REV_SHAPE` | L2 | 2.1, 2.2 |
| 4. Drafted, partial, mixed+line | L4 | 4.2, 4.3, 4.1 |
| 5. Empty section | L4 | 4.3 |
| 6. Drift: unknown+rev-not-found, drifted, deleted, not-a-repo | L9 | 9.1-9.4 |
| 7. Integración repo temporal, GitRunner real, drifted | L10 | 10.1 |
| 8. Dos revs distintos en ejecución, sin compartir | L9 | 9.5 |
| 9. `bun test` completo pasa | L10 | 10.4 |
| 10. Ningún archivo modificado en `docs-site/`, `archive/` | L8 | 8.4 |
| 11. Job `docs-contract` en CI con contrato bloqueante, drift informativo, `fetch-depth: 0` | L10 | 10.2 |
| 12. Job verde en la PR | L10 | 10.3 |

---

## Notas de implementación

### Restricción verificada: No modificar las 21 páginas

El validador **observa** el árbol sin alterarlo. Tarea 8.4 afirma esto ejecutando `git status` después de la suite. Si una página falla validación en L8, es hallazgo real que se documenta en `apply-progress.md` con línea concreta; **la página no se modifica, la regla no se relaja sin decisión del usuario**.

### Restricción verificada: No modificar `openspec/config.yaml`

Config ya fue corregido en la fase `scope`. No se toca en apply.

### Restricción verificada: No modificar `openspec/changes/archive/`

Ningún lote toca archivos archivados. La pureza de esqueleto es por sección de la página actual, no por referencia a otros cambios.

### Cómo ejecutar cada lote

Después de la fase de `apply` para cada lote:

```bash
# L1
bun test tests/docs-site-contract.test.ts --grep "parser"

# L2
bun test tests/docs-site-contract.test.ts --grep "CT1\|CT2"

# ... (cada lote filtrado por su regla)

# L8
bun test tests/docs-site-contract.test.ts --grep "lintDocsTree.*21"

# L9
bun test tests/docs-site-drift-detector.test.ts

# L10
bun test tests/docs-site-drift-detector.test.ts --grep "integracion"
bun test # completo
```

### Cadena de lectura (CT-7)

El design §D criterio L6 menciona cadenas de lectura. Según `map.md` §C2, la cadena es dato inyectado en `ctx.chain`, no constante única. En los tests, simular cadenas explícitamente:
- Cadena 1 (00-start/01-concepts/02-workflow): `[overview, getting-started, first-run, orchestrator, sdd-openspec, context, deterministic-boundaries, workflow-overview, artifacts, real-workflow-example]`
- Cadena 2 (03-runtimes/04-reference/05-debug): comenzando desde la primera página de cada zona.

Verificar contra el árbol real en L8.

### Marcador como interruptor (SK-3)

El criterio SK-3 es central: **un bloque PENDIENTE-D presente quiere decir "pendiente redacción"; ausente quiere decir "redactado"**. El validador no toca la regla de pureza en secciones sin marcador. Esto permite que la fase D escriba sin actualizar ninguna quinta clave.

### Sobre CT-9 parcial

El design declara explícitamente (§C5) que la mitad semántica de CT-9 (qué menciones exigen tag) no es mecanizable y queda fuera de alcance. Solo se implementa la forma: `[BETA-EXCLUDED]` literal. No hay fallback a lista de palabras clave; eso sería falso positivo sin fin.

### Test del árbol real y hallazgos

L8 es el espejo de la verdad. Si `lintDocsTree` falla, el output debe nombrar la página y línea exactas. La tarea es documentar el hallazgo, no silenciarlo. Si el validador es demasiado estricto, se relaja en design fase D (no aquí).

