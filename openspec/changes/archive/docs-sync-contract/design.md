status: ready
change: docs-sync-contract
phase: design
verified_rev: "0ae709d"
spec_delta: none
canonical_spec_context: none — `scope.md` declara `canonical_spec_context: none` y `map.md` no mapea ninguna ruta `openspec/specs/<domain>/spec.md`. No se cargó ningún spec canónico en esta fase.

# Design — docs-sync-contract (FASE B: validador de contrato + detector de drift)

## A. Proposal

### Intent

Convertir el contrato de página (CT-1…CT-9, SK-1…SK-5 de `openspec/changes/archive/docs-content-inventory/design.md` §B) en dos módulos TypeScript puros y testeables: un validador estructural que corre sobre las 21 páginas de `docs-site/src/content/docs/`, y un detector de drift que compara las fuentes de cada página contra el `verified_rev` **de esa página**. El validador debe seguir siendo útil cuando la fase D redacte prosa; el detector no debe fallar en silencio.

### Scope

**Dentro:**

- `ein-pi/agent/lib/docs-site-contract.ts` — parser de página + lints puros + agregador de árbol.
- `ein-pi/agent/lib/docs-site-drift-detector.ts` — drift por página contra su propio rev, con `git` inyectable.
- `tests/docs-site-contract.test.ts` y `tests/docs-site-drift-detector.test.ts`.
- Job `docs-contract` en `.github/workflows/ci.yml`.

**Fuera (no-goals):**

- Modificar cualquiera de las 21 páginas o cualquier artefacto de `openspec/changes/archive/`.
- Reglas propias de SLICE 2 (RM-1…RM-3 de la matriz, OV-1…OV-3 de solapamiento, HN-1/HN-2): son de su cambio productor y ya se verificaron allí. Este validador cubre solo el contrato común.
- La mitad semántica de CT-9 (decidir si una capacidad está evidenciada en `roadmap-beta.md`): ver §C5, con evidencia de por qué no es mecanizable hoy.
- La correspondencia `###` ↔ filas de `map.md` (CT-3, segunda mitad): ver §C6.
- Bloques autogenerados: pospuestos, como fija `scope.md` §B4. Este cambio define CT-1…CT-9 sobre estructura; los bloques generados esperan a que la fase D produzca prosa.
- CLI propio, script `.sh`, o cambios en `openspec/config.yaml` (ya corregido antes de esta fase).

### Affected areas

| Ruta | Acción |
|------|--------|
| `ein-pi/agent/lib/docs-site-contract.ts` | crear |
| `ein-pi/agent/lib/docs-site-drift-detector.ts` | crear |
| `tests/docs-site-contract.test.ts` | crear |
| `tests/docs-site-drift-detector.test.ts` | crear |
| `.github/workflows/ci.yml` | añadir job `docs-contract` |

Ningún fichero bajo `docs-site/` se modifica.

### Risks

1. **El validador caduca al empezar la fase D.** Es el riesgo caro: una regla de pureza por página rechaza toda página con prosa. Mitigación: §B.SK, pureza por sección con el marcador como interruptor.
2. **Falso "todo limpio" en el detector de drift.** Un `verified_rev` ausente (clon superficial, rama recreada) no puede leerse como "sin cambios". Mitigación: estado `unknown` explícito, separado de `clean`, contado y reportado.
3. **Regla mecánica que exige juicio editorial.** CT-9 y la mitad de CT-3 no son decidibles con `grep`; implementarlas «como se pueda» produce falsos positivos que se acaban silenciando. Mitigación: se implementa solo la mitad decidible y se documenta la otra como no cubierta (§C5, §C6).
4. **Suite que solo comprueba lo que ya existe.** 21 páginas verdes no prueban que el validador detecte nada. Mitigación: tres familias de fixture (§C8), con casos negativos sintéticos y mutaciones de páginas reales.
5. **Todo mockeado, `git` real nunca ejercitado.** Mitigación: un test de integración sobre un repo temporal, además de los unitarios con `GitRunner` falso.

### Rollback

Todo es aditivo salvo el job de CI. `git rm` de los cuatro ficheros nuevos y revertir el bloque `docs-contract` de `ci.yml` restauran el árbol. Sin migraciones, sin dependencias nuevas, sin ficheros de datos.

### Success criteria

§D. Todos son comandos.

---

## Hallazgos de verificación previa (evidencia)

Comprobados sobre las **21** páginas, no por muestreo. Ninguna página incumple el contrato; los defectos están en el contrato tal y como `map.md` lo describía.

| # | Hallazgo | Evidencia | Consecuencia |
|---|----------|-----------|--------------|
| F1 | `verified_rev` es por página: 10 páginas (`00-start`, `01-concepts`, `02-workflow`) declaran `0ae709d`, 11 (`03-runtimes`, `04-reference`, `05-debug`) declaran `2f67c73` | `verified_rev` en línea 5 de las 21 páginas | CT-1 comprueba **forma** (`^[0-9a-f]{7,40}$`), nunca un literal. La regla del map («`verified_rev ≠ 0ae709d` ⇒ falla») rechazaría 11 páginas |
| F2 | El filtro de pureza del map es falso contra el árbol real: los ítems de `## Fuentes` son ``- `ruta` — desc`` (92 de 92 líneas `- ` empiezan por ``- ` ``), no `- [../`; y tres páginas cierran con `## Siguiente paso` en **texto plano** (`05-debug/known-limitations.md:54`, `05-debug/uninstall-recovery.md:70`, `02-workflow/real-workflow-example.md:110`), que un filtro `^\[` marcaría como residuo | mismas rutas y líneas | La pureza no se implementa como filtro de prefijos sobre la página entera (§B.SK) |
| F3 | CT-9 como denylist global falla hoy: `04-reference/optional-tooling.md` nombra Engram, Linear, Context7, Codegraph y Hypa en `description:3`, `sources:4`, cuatro `###` y sus ítems de `## Fuentes` sin `[BETA-EXCLUDED]`; `03-runtimes/claude-code.md:63` nombra *acceptance* sin tag | esas líneas | La exclusión de RM-2 estaba acotada a `runtime-matrix.md`. Solo se implementa la buena formación del tag (§C5) |
| F4 | CT-7 son **dos** cadenas, no una: `overview → … → real-workflow-example` (cierre en texto plano) y `runtime-overview → … → uninstall-recovery` (cierre en texto plano), con `known-limitations.md` fuera de cadena | las 18 líneas de enlace `[x](y.md)` | La cadena es dato inyectado, no constante única (§B.CT-7) |
| F5 | `description` no es siempre una sola frase (`02-workflow/real-workflow-example.md:3`, `artifacts.md:3`, `workflow-overview.md:3` tienen dos) | esas líneas | CT-1 comprueba línea única y ≤ 160 caracteres; «una sola frase» no se implementa |
| F6 | El recuento de bloques `:::caution[PENDIENTE-D]` por página es exactamente `4 + nº de ###` en las 21 páginas (p. ej. 5 en `known-limitations`, 12 en `artifacts`) | conteo por fichero | SK-2 (un bloque por sección de contenido) se sostiene hoy y es comprobable sin consultar ningún `map.md` |

CT-8 verificado limpio en el árbol entero: cero coincidencias de `v?[0-9]+\.[0-9]+\.[0-9]+`. `title` (línea 2) y H1 (línea 8) coinciden en las 21 páginas; las cuatro claves están en las líneas 2-5 en el orden de CT-1 en las 21.

---

## B. Spec

`PAGES` = los 21 ficheros `.md` bajo `docs-site/src/content/docs/`.

### CT — contrato de página

**CT-1.** El validador MUST comprobar que el frontmatter contiene exactamente las claves `title`, `description`, `sources`, `verified_rev`, en ese orden, delimitado por `---` desde la línea 1; que `title` acaba en ` · EIN`; que `description` es una línea de ≤ 160 caracteres; que `sources` es una lista no vacía y sin duplicados de rutas POSIX relativas a la raíz del repositorio; y que `verified_rev` casa `^[0-9a-f]{7,40}$`. El validador MUST NOT comparar `verified_rev` con ningún valor literal.

> Given `03-runtimes/cli.md` con `verified_rev: "2f67c73"` y `00-start/overview.md` con `verified_rev: "0ae709d"`
> When se valida cada una
> Then ninguna emite issue de `verified_rev`.

**CT-1b.** Cada ruta de `sources` MUST existir como fichero en el árbol. La comprobación se hace con un predicado de existencia inyectado, no con `fs` dentro del lint.

**CT-2.** El primer encabezado del cuerpo MUST ser `# <title sin el sufijo ` · EIN`>`.

**CT-3.** La lista de `^## ` MUST ser exactamente los siete encabezados de CT-3, en orden, sin duplicados ni adicionales. Bajo `## Detalles` MUST haber al menos un `###`; el cuerpo de `## Detalles` anterior al primer `###` MUST estar vacío.

**CT-4.** Todo bloque pendiente MUST tener la forma literal `:::caution[PENDIENTE-D]`, seguido de `falta:`, `fuentes:`, `lineas:` en ese orden, una por línea y en minúsculas, y cerrar con `:::`. Toda ruta de `fuentes:` MUST aparecer en el `sources` del frontmatter.

**CT-5.** `## Fuentes` MUST contener un ítem `- ` por entrada de `sources`, en el mismo orden y cantidad, con la ruta entre acentos graves seguida de ` — ` y descripción no vacía.

**CT-6.** Todo enlace markdown relativo a `.md` de la página —esté en `## Siguiente paso` o dentro de una línea `falta:`— MUST resolver, relativo al directorio de la página, a un fichero existente.

**CT-7.** `## Siguiente paso` MUST contener o bien exactamente un enlace relativo `.md`, o bien una única línea de texto plano sin enlace. Cuando la página pertenece a una cadena de lectura declarada, el destino del enlace MUST ser el siguiente elemento de esa cadena, y el último elemento de cada cadena MUST cerrar en texto plano. Las cadenas son **dato de entrada** del validador, no una constante única.

> Given `01-concepts/context.md`, elemento 6 de la cadena de `00-start`/`01-concepts`/`02-workflow`
> When se valida su `## Siguiente paso`
> Then el enlace resuelve a `01-concepts/deterministic-boundaries.md`, el elemento 7.

**CT-8.** Ninguna línea de la página MUST contener el patrón `v?[0-9]+\.[0-9]+\.[0-9]+`.

**CT-9 (parcial).** Toda aparición del tag de exclusión MUST ser el literal exacto `[BETA-EXCLUDED]`; variantes de caja o sin corchetes son error. Qué menciones exigen el tag NO se comprueba (§C5).

### SK — pureza de esqueleto, evaluada por sección

**SK-1.** El validador MUST clasificar cada sección del cuerpo en uno de tres roles: *estructural* (`## Siguiente paso`, `## Fuentes`, y el contenedor `## Detalles`), o *de contenido* (`## En una frase`, `## Para quién y qué aprenderás`, `## Ruta rápida`, `## Checklist`, y cada `###` bajo `## Detalles`).

**SK-2.** Una sección de contenido que contiene al menos un `:::caution[PENDIENTE-D]` está en estado **`pending`**, y entonces MUST contener exactamente un bloque y ninguna otra línea no vacía. Una línea de prosa junto a un marcador es error `SK_MIXED_SECTION`; dos marcadores en la misma sección son error `SK_MULTIPLE_MARKERS`.

**SK-3 (el interruptor).** Una sección de contenido sin ningún marcador está en estado **`drafted`** y queda **fuera del alcance de la regla de pureza**: su prosa no genera issue alguno. El marcador es el interruptor; la fase D lo apaga sección a sección al redactar, sin tocar el frontmatter ni ninguna quinta clave.

**SK-4.** Una sección de contenido sin marcador y sin ninguna línea no vacía MUST ser error `SK_EMPTY_SECTION`. Es el caso que la regla existe para atrapar: alguien borró el marcador y no escribió nada.

> Given una página en la que `## Ruta rápida` conserva su bloque `PENDIENTE-D` y `## Checklist` ya tiene tres párrafos sin marcador
> When se valida
> Then no hay ningún error; `## Ruta rápida` se reporta `pending` y `## Checklist` `drafted`.

> Given una página en la que `## En una frase` tiene un bloque `PENDIENTE-D` y además un párrafo suelto
> When se valida
> Then error `SK_MIXED_SECTION` con el número de línea del párrafo.

**SK-5.** El validador MUST derivar un `state` de página —`skeleton` (toda sección de contenido `pending`), `drafted` (ninguna) o `partial` (mezcla)— y exponerlo como dato informativo. Ese `state` MUST NOT decidir por sí mismo si la página pasa.

Respuesta explícita a las tres situaciones exigidas:

| Página | Qué comprueba el validador |
|--------|----------------------------|
| Completamente redactada | CT-1…CT-9 íntegros. Ninguna sección de contenido tiene marcador ⇒ SK-2 no aplica en ninguna, SK-4 solo si alguna quedó vacía. `state: "drafted"`, `ok: true` si la estructura se mantiene |
| A medias | CT-1…CT-9 íntegros; pureza aplicada **solo** a las secciones que aún tienen marcador; mezcla marcador+prosa dentro de una sección es error. `state: "partial"` |
| Esqueleto puro | CT-1…CT-9 íntegros; toda sección de contenido con exactamente un bloque y nada más. `state: "skeleton"` |

### DR — detector de drift

**DR-1.** El detector MUST leer el `verified_rev` de **cada página** y comparar contra los cambios de **sus** `sources` desde **ese** rev. MUST NOT existir un rev global.

**DR-2.** Antes de nada MUST comprobar que el directorio es un repositorio (`git rev-parse --git-dir`). Si falla, el informe entero es `unknown` con razón `not-a-repo`, y ninguna página se reporta `clean`.

**DR-3.** Por página MUST verificar el rev con `git rev-parse --verify --quiet <rev>^{commit}`. Si el objeto no está en el árbol, la página es `unknown` con razón `rev-not-found`, se registra el rev concreto, y **no** se ejecuta ningún diff para ella.

> Given un clon superficial en el que `2f67c73` no existe
> When se ejecuta el detector
> Then las 11 páginas de ese rev quedan `status: "unknown"`, `reason: "rev-not-found"`, el contador `unknown` es 11, y ninguna aparece como `clean`.

**DR-4.** Para una página con rev válido MUST ejecutar `git diff --numstat --no-renames <rev>..HEAD -- <sources…>` y `git diff --name-status --no-renames <rev>..HEAD -- <sources…>`, una llamada de cada por página, y combinar por ruta: recuento de líneas de la primera, letra de estado (`A`/`M`/`D`) de la segunda.

**DR-5.** Una página sin ninguna fuente cambiada es `clean`; con al menos una, `drifted`, listando por fuente el cambio y las líneas añadidas/eliminadas. El detector MUST NOT reescribir ninguna página.

**DR-6.** Cualquier fallo de `git` no previsto MUST producir `unknown` con razón `git-error` y el `stderr` recortado. El detector MUST NOT lanzar excepción ni devolver `clean` por defecto ante un fallo.

---

## C. Decisions

### C1. Un parser, muchos lints (precedente `sdd-guardrails.ts`)

`parsePage(content)` produce una sola vez el modelo de la página —frontmatter con claves en orden, líneas del cuerpo con número absoluto, árbol de secciones con rango de líneas, bloques `PENDIENTE-D` con sus claves— y cada lint consume ese modelo. Alternativa rechazada: diez funciones con su propia expresión regular sobre el texto crudo (lo que sugería `map.md` §B1). Se rechaza porque la numeración de líneas y la noción de «sección» se reimplementarían diez veces y divergirían; y porque las reglas caras (SK, CT-4, CT-5) necesitan el mismo árbol.

**API pública de `docs-site-contract.ts`:**

```ts
export type IssueLevel = "error" | "warning";
export type PageIssue = { level: IssueLevel; code: string; message: string; line?: number };
export type SectionRole = "content" | "structural";
export type SectionState = "pending" | "drafted" | "empty" | "structural";
export type PageSection = { heading: string; level: 2 | 3; role: SectionRole; state: SectionState; startLine: number; endLine: number };
export type PageFrontmatter = { keys: string[]; title: string; description: string; sources: string[]; verifiedRev: string };
export type ParsedPage = { path: string; lines: string[]; frontmatter: PageFrontmatter | null; bodyStart: number; sections: PageSection[]; blocks: PendingBlock[] };

export type PageContext = {
  path: string;                                   // ruta relativa a la raíz del repo
  fileExists: (repoRelativePath: string) => boolean;
  linkExists: (pageRelativePath: string) => boolean;
  chain?: { pages: string[]; index: number };     // CT-7, inyectado
};
export type PageReport = { path: string; ok: boolean; state: "skeleton" | "partial" | "drafted"; issues: PageIssue[]; errors: number; warnings: number; sections: PageSection[] };
export type TreeReport = { ok: boolean; pages: PageReport[]; errors: number; warnings: number; census: { skeleton: number; partial: number; drafted: number } };

export function parsePage(path: string, content: string): ParsedPage;
export function lintFrontmatter(page: ParsedPage, ctx: PageContext): PageIssue[];   // CT-1, CT-1b
export function lintHeadings(page: ParsedPage): PageIssue[];                        // CT-2, CT-3
export function lintPendingBlocks(page: ParsedPage): PageIssue[];                   // CT-4
export function lintSourcesSection(page: ParsedPage): PageIssue[];                  // CT-5
export function lintLinks(page: ParsedPage, ctx: PageContext): PageIssue[];         // CT-6, CT-7
export function lintLineRules(page: ParsedPage): PageIssue[];                       // CT-8, CT-9
export function lintSectionPurity(page: ParsedPage): PageIssue[];                   // SK-1…SK-4
export function lintPage(content: string, ctx: PageContext): PageReport;            // agrega, puro
export function lintDocsTree(repoRoot: string, docsDir?: string): TreeReport;       // única función con fs
```

Cada lint devuelve `PageIssue[]` y no toca el filesystem: lo que necesita del disco entra por `ctx` (`fileExists`, `linkExists`). Es exactamente el reparto de `sdd-guardrails.ts` (lints de string puros, `lintChange` como único punto con `fs`), y es lo que hace triviales los casos negativos.

**Forma del error:** `{ level, code, message, line? }`, con `code` estable (`CT1_KEY_ORDER`, `CT1_REV_SHAPE`, `CT3_SECTION_ORDER`, `CT4_BLOCK_KEYS`, `CT6_BROKEN_LINK`, `CT7_CHAIN_MISMATCH`, `CT8_VERSION_LITERAL`, `SK_MIXED_SECTION`, `SK_EMPTY_SECTION`, …). Los tests asertan sobre `code`, nunca sobre el texto del mensaje: el mensaje es para humanos y puede reescribirse sin romper la suite.

### C2. La pureza es por sección, y el marcador es el interruptor

Adoptada la candidata del parent. `validateSkeletonPurity()` por página, tal como la describía `map.md` §B2, devuelve `valid: false` en cuanto hay residuo — es decir, rechazaría las 21 páginas en cuanto la fase D escriba el primer párrafo, y la fase B habría entregado una herramienta con fecha de caducidad.

SK-2 del contrato original ya está formulado por sección («cada sección de contenido contiene exactamente un bloque `PENDIENTE-D` y nada más»), así que evaluar ahí no inventa regla nueva: la aplica en su unidad natural. El marcador presente/ausente es el interruptor, y es el único estado que la fase D ya tiene que gestionar de todos modos (redactar = sustituir el bloque). No hace falta quinta clave de frontmatter (rechazada en C4 del design de SLICE 1), ni fichero de estado paralelo.

Efecto colateral valioso: la regla deja de ser un gate de fase A y pasa a ser un **invariante permanente** — «ninguna sección mezcla marcador con prosa, ninguna queda vacía» sigue siendo cierto y útil después de D.

### C3. `validateNoExamples()` se elimina

`map.md` §B1 fila 14 proponía detectar «comandos, salidas de terminal, nombres de fichero» por heurística. Con la pureza por sección es redundante: una sección `pending` no admite ninguna línea fuera del bloque, así que no cabe un ejemplo; y una sección `drafted` tiene todo el derecho a contener comandos, porque eso es justo lo que la fase D escribe. Un detector heurístico ahí solo produce falsos positivos que se acaban ignorando. Se elimina, no se pospone.

### C4. Estado `unknown` de primera clase en el drift

Tres estados (`clean` / `drifted` / `unknown`) en vez de dos más una lista de errores al margen. Razón: con dos estados, «no pude comprobarlo» acaba pareciendo «no hay drift» en cualquier resumen que cuente `pages.length - drifted`. Con tres, el informe lleva `unknown: 11` y quien lea el job lo ve sin abrir el detalle.

`GitRunner` inyectable —`(args: string[]) => { ok: boolean; code: number; stdout: string; stderr: string }`— con implementación por defecto sobre `execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", timeout: 10_000 })`, que es el precedente del repo (`cc-ein/sync.ts`, `installer/src/core/pi-migration.ts`, `tests/review-workload-guard.test.ts`). La inyección es lo que permite probar `rev-not-found` sin fabricar un clon superficial.

`--numstat` y `--name-status` en vez de parsear un diff textual: salida tabulada, estable y sin dependencia de locale. `--no-renames` para que la ruta de la columna sea siempre una sola y el parseo no tenga caso especial `a => b`.

### C5. CT-9: solo la mitad decidible

`map.md` §C2 proponía parsear `roadmap-beta.md` y cotejar menciones. Eso es un clasificador semántico disfrazado de parser. La evidencia F3 lo confirma: cualquier denylist global de los términos de RM-2 falla hoy sobre `optional-tooling.md`, cuya página entera trata legítimamente de esas integraciones, y sobre `claude-code.md:63`. La exclusión de RM-2 estaba acotada a una página concreta y la verificó su cambio productor.

Se implementa lo que es cierto siempre: si el tag aparece, es el literal exacto. Lo demás queda declarado como no cubierto en vez de cubierto a medias. Alternativa rechazada: una lista de términos por página en fichero de configuración — hoy tendría exactamente una entrada, y una abstracción con un solo caso real no se gana su sitio.

### C6. CT-3: se comprueba la estructura, no el roster

La segunda mitad de CT-3 («los `###` corresponden uno a uno con las filas de la tabla del map») exige leer el `map.md` del cambio que produjo cada página, que está archivado y es distinto para cada mitad del árbol. Codificar los 39+ títulos como constante en la librería crearía una segunda fuente de verdad que envejece sin que nadie la mire. Se comprueba lo estructural y duradero: hay al menos un `###` bajo `## Detalles` y cada uno cumple SK-2. El roster concreto fue verificado en la fase verify de cada cambio productor, y F6 muestra que sigue cuadrando.

### C7. Qué bloquea y qué avisa

Se confirma la propuesta de `scope.md` §B3, con una precisión.

- **El validador de contrato bloquea.** Una violación es una propiedad de ficheros del propio repositorio, introducida por el mismo PR que la puede arreglar. No hay waiver.
- **El drift avisa, nunca bloquea.** Una fuente que cambia no implica que la página esté mal: `README.md` puede cambiar una coma. Si bloqueara, cualquier PR ajeno a la documentación fallaría en CI y la señal se aprendería a ignorar o a saltar — que es la forma de matar una comprobación útil. El drift es una lista de tareas, no un defecto.
- **También el `unknown` avisa**, con la página y el rev concretos en el log. Silencio ahí sería peor que un error, como pide el scope.
- **La excepción que parecía necesaria no lo es.** Se consideró bloquear cuando una fuente se ha *borrado*. No hace falta: una ruta de `sources` que ya no existe hace fallar CT-1b en el validador, que sí bloquea. La frontera queda limpia — el validador responde por el estado del árbol, el detector por su historia.
- El job de drift corre con `fetch-depth: 0`; con el checkout superficial por defecto todos los revs serían `rev-not-found` y el informe sería ruido.

### C8. Fixtures: tres familias

1. **Positiva real:** `lintDocsTree(repoRoot)` sobre las 21 páginas, esperando `ok: true`, `pages.length === 21` y censo `{ skeleton: 21 }`. Es la restricción del cambio y a la vez el guardián de que el validador no se aleje del árbol real.
2. **Negativa sintética:** un helper `buildPage(overrides)` dentro del propio test construye el esqueleto canónico como string, y cada test muta **una** cosa y aserta **un** `code`. En memoria y sin `fs`, porque los lints son puros y `ctx` inyecta la existencia de ficheros. Fixtures en disco añadirían una segunda copia del contrato que hay que mantener.
3. **Mutación de página real:** se lee una página real y se le aplica una mutación textual mínima (añadir un párrafo dentro de una sección con marcador; borrar el marcador dejando la sección vacía; cambiar `verified_rev` por `zzzz`). Es el puente entre 1 y 2: atrapa el caso «mi fixture sintética no se parece a una página de verdad». Nada se escribe en disco.

Para el drift: `GitRunner` falso con salidas preparadas (rev inexistente ⇒ código ≠ 0; `numstat` con dos ficheros; `name-status` con `D`; `git` ausente), **más** un test de integración que crea un repo temporal con dos commits y ejercita el `GitRunner` por defecto — si todo fuera mock, el comando real nunca se probaría.

### C9. Fronteras

| Responsabilidad | Propietario |
|-----------------|-------------|
| Contrato normativo CT/SK | `openspec/changes/archive/docs-content-inventory/design.md` §B (heredado) |
| Interpretación ejecutable del contrato y forma de los errores | este `design.md` |
| Corte en lotes y checklist | `tasks.md` |
| Ciclos RED/GREEN y código | fase apply |
| Reglas RM/OV/HN de SLICE 2 | su cambio productor, ya verificadas |
| Prosa de cada `PENDIENTE-D` | fase D |
| Bloques autogenerados | cambio posterior, cuando exista prosa |

### C10. Alternativas rechazadas

- **Quinta clave de frontmatter (`status: skeleton`).** Rechazada por CT-1 y por C4 del design de SLICE 1: sería estado duplicado que la fase D tendría que acordarse de borrar.
- **Pureza por página.** Rechazada: caduca al escribir el primer párrafo (§C2).
- **`verified_rev` literal.** Rechazada por F1: rechazaría 11 páginas.
- **Clase `PageValidator` con estrategias por regla.** Rechazada: son funciones puras sobre un modelo inmutable; una jerarquía de clases no quita duplicación, solo añade indirección.
- **CLI propio o script `.sh`.** Rechazado: `bun test` ya es el punto de entrada y las funciones quedan importables desde `sdd-verify` si algún día hace falta.
- **Fichero de configuración del contrato (JSON/YAML).** Rechazado: hoy hay un solo consumidor; las constantes exportadas del módulo son igual de legibles y se refactorizan con el tipo delante.

---

## D. Success Criteria

Observables, por comando. `bun test` es el runner declarado en `openspec/config.yaml`.

1. `bun test tests/docs-site-contract.test.ts` pasa, y contiene un test que ejecuta `lintDocsTree` sobre el árbol real con `ok: true`, `pages.length === 21` y censo `{ skeleton: 21, partial: 0, drafted: 0 }`.
2. La suite de contrato incluye al menos un caso negativo por cada `code` de error definido, y cada aserción se hace sobre `code`, no sobre el mensaje.
3. Existe un test que valida una página con `verified_rev: "2f67c73"` **sin** emitir issue, y otro con `verified_rev: "zzzzzzz"` que emite `CT1_REV_SHAPE`.
4. Existe un test de una página con todas las secciones de contenido redactadas (sin ningún marcador) que devuelve `ok: true` y `state: "drafted"`; otro con mezcla que devuelve `ok: true` y `state: "partial"`; y otro con marcador + párrafo en la misma sección que devuelve `SK_MIXED_SECTION` con el número de línea correcto.
5. Existe un test de sección sin marcador y sin contenido que devuelve `SK_EMPTY_SECTION`.
6. `bun test tests/docs-site-drift-detector.test.ts` pasa e incluye: rev inexistente ⇒ `status: "unknown"`, `reason: "rev-not-found"`, contador `unknown` correcto y cero páginas `clean`; fuente modificada ⇒ `drifted` con recuento de líneas; fuente borrada ⇒ cambio `deleted`; directorio sin repo ⇒ `not-a-repo` sin excepción.
7. Existe un test de integración con repo temporal que ejercita el `GitRunner` por defecto y obtiene un `drifted` real.
8. Un test comprueba que el detector procesa dos revs distintos en la misma ejecución (una página `0ae709d`, otra `2f67c73`) y no comparte rev entre ellas.
9. `bun test` completo pasa (la suite previa del repo no se rompe).
10. `git status --porcelain docs-site/ openspec/changes/archive/` está vacío al terminar: ni una página ni un artefacto archivado tocados.
11. `.github/workflows/ci.yml` contiene el job `docs-contract` que ejecuta la suite de contrato como paso bloqueante y la de drift como paso informativo con `continue-on-error: true` y `fetch-depth: 0` en el checkout.
12. El job `docs-contract` aparece en verde en la ejecución de CI de la PR de este cambio.

### Plan de ciclos RED/GREEN por lote

`strict_tdd: true` es satisfacible aquí. Cada lote arranca con un test que falla por una razón concreta, no por «la función no existe» salvo en el primero.

| Lote | RED (por qué falla) | GREEN |
|------|---------------------|-------|
| L1 · parser | `parsePage` de una página canónica debe devolver 7 secciones `##` y N `###` con rangos de línea; falla porque el módulo aún no existe | `parsePage` + tipos |
| L2 · CT-1/CT-2 | frontmatter con 3 claves no emite `CT1_KEY_ORDER`; y una página con `2f67c73` **no** debe emitir issue | `lintFrontmatter`, `lintHeadings` (H1) |
| L3 · CT-3 | secciones desordenadas no emiten `CT3_SECTION_ORDER`; `## Detalles` con texto antes del primer `###` no se detecta | `lintHeadings` completo |
| L4 · SK (núcleo) | sección con marcador + párrafo no emite `SK_MIXED_SECTION`; sección redactada emite falso positivo; sección vacía pasa desapercibida | `lintSectionPurity` + `state` de página |
| L5 · CT-4/CT-5 | bloque sin `lineas:` no emite `CT4_BLOCK_KEYS`; `fuentes:` con ruta ausente del frontmatter no se detecta; lista de `## Fuentes` desordenada pasa | `lintPendingBlocks`, `lintSourcesSection` |
| L6 · CT-6/CT-7 | enlace a fichero inexistente no emite `CT6_BROKEN_LINK`; enlace que salta un elemento de la cadena no emite `CT7_CHAIN_MISMATCH`; cierre en texto plano se marca por error | `lintLinks` con `ctx.chain` |
| L7 · CT-8/CT-9 | `v0.42.0` en una línea no emite `CT8_VERSION_LITERAL`; `[beta-excluded]` en minúsculas pasa | `lintLineRules` |
| L8 · árbol real | `lintDocsTree` sobre las 21 páginas: falla porque el agregador no existe | `lintPage` + `lintDocsTree`; las 21 en verde |
| L9 · drift | con `GitRunner` falso de rev inexistente, el informe devuelve `clean` en vez de `unknown` | `docs-site-drift-detector.ts` completo |
| L10 · drift real + CI | test de integración sobre repo temporal; job de CI | `GitRunner` por defecto; job `docs-contract` |

L8 es el punto de control de la restricción del cambio: si alguna de las 21 páginas falla ahí por una razón que no sea un defecto del validador, es un hallazgo real. Se reporta con la línea concreta y **no** se modifica la página ni se relaja la regla sin decisión explícita.
