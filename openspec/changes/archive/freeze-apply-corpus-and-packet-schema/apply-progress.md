status: complete
change: freeze-apply-corpus-and-packet-schema
phase: apply
strict_tdd: true

# Apply — freeze-apply-corpus-and-packet-schema

## // 001. Schema y validador del Apply Packet — COMPLETO

### RED

`bun test tests/apply-packet.test.ts` → **0 pass / 1 fail**, el fallo por el
motivo esperado: `Cannot find module '../ein-pi/agent/lib/apply-packet'`. 15
casos escritos antes de que existiera una línea de producción.

### GREEN

Primera ejecución con producción: **11 pass / 4 fail**. Los cuatro fallos fueron
información, no ruido:

| Fallo | Causa real |
|---|---|
| packet completo no ejecutable | el marcador `decidir` saltaba con el `outcome` de la propia fixture |
| `missing-invariant` daba nivel `rejected` | mismo falso positivo arrastrando el nivel |
| placeholder en el comando nombraba `outcome` | mismo falso positivo, ganaba el primer campo |
| último caso con un código de más | mismo falso positivo |

**Un solo defecto explicaba los cuatro.** `UNRESOLVED_MARKERS` incluía palabras
sueltas (`decidir`, `elegir entre`) y la prosa legítima las usa: el propio
`outcome` decía "...que un ejecutor no podría ejecutar sin decidir". Corregido a
marcadores **estructurales** —`TBD`, `TODO`, `???`, `<placeholder>`,
`[decidir ...]`— que nadie escribe por accidente. Tras la corrección: **15 pass /
0 fail**.

### TRIANGULATE

10 casos nuevos, y encontraron un segundo defecto real:

- `**Production files:**` normalizaba a `null`. El limpiador de viñetas
  (`/^[-*]\s*/`) se comía **un** asterisco de la negrita antes de que el
  limpiador de `**` actuara. Corregido invirtiendo el orden, con el porqué en el
  comentario. Sin este caso, la grafía más común en negrita (7 apariciones en el
  archivo) habría fallado en producción.
- Regresión anclada: un `outcome` que usa la palabra "decidir" sigue siendo
  ejecutable, y `[decidir cuál]` sigue siendo una decisión pendiente.
- `production_forecast:` confirmado como **no** frontera: es una estimación de
  tamaño. Es la razón por la que las grafías reconocidas son diez y no once.
- Bordes: edición sin ruta, `edits` vacío (intención acotada), digest de más en
  el árbol vivo, `sources` vacío y comando sin ficheros.

Final: **25 pass / 0 fail / 63 expect()**.

### REFACTOR

Sin extracción. El validador es una secuencia lineal de comprobaciones de tres
líneas cada una, ya agrupadas por concepto; extraer un predicado por código
añadiría indirección sin quitar duplicación. Se revisó que no quedara código
muerto ni comentarios que repitan el código.

### Desviaciones del diseño, declaradas

Dos códigos de rechazo que el diseño no tenía y que RED hizo evidentes:

1. **`missing-field`** — un campo obligatorio restante vacío (`outcome`,
   `allowedFiles`, `focusedCheck`, `expectedEvidence`, `sources`). Sin él, un
   packet con `outcome` vacío habría sido ejecutable. Añadido a `design.md` antes
   de escribir la prueba.
2. **`malformed`** — el objeto no es un packet, o declara un formato que no es
   `apply-packet/v1`. Es un corte estructural previo a toda validación de
   contenido.

Corregido además un dato que los artefactos afirmaban de más: las grafías
reconocidas son **diez**, no once. `production_forecast:` se contó por error en
el recuento inicial y no es una etiqueta de frontera. Ajustado en `scope.md`,
`design.md` y `tasks.md`.

### Evidencia

```
bun test tests/apply-packet.test.ts   25 pass · 0 fail · 63 expect()
bun run typecheck                     sin errores
```

Ficheros: `ein-pi/agent/lib/apply-packet.ts` (nuevo),
`tests/apply-packet.test.ts` (nuevo). Ningún módulo existente modificado.

## // 002. Compilador que parsea la etiqueta — COMPLETO

### RED

`bun test tests/apply-packet-compile.test.ts` → **0 pass / 1 fail** por módulo
ausente. 9 casos escritos antes de producción, incluido uno que compila un grupo
**real** del archivo y valida el resultado.

### GREEN

8 de 9 al primer intento. El fallo fue el caso contra el archivo real y destapó
una decisión de contrato que el diseño no había cerrado: **la frontera es
producción ∪ tests**. Bajo TDD estricto el ejecutor escribe el test antes que el
código; una frontera que excluye el fichero de test lo bloquea en el primer
ciclo. Se midieron las grafías de la etiqueta de tests en el archivo —**once**,
más `> Test runner:` que se excluye por no ser una lista de ficheros— y
`allowedFilesGrammar` pasó de ser una etiqueta a ser la lista de etiquetas que
produjeron la frontera. La prueba del bloque 001 se realineó con ese cambio.

### TRIANGULATE

11 casos nuevos. Encontraron **dos defectos reales**:

1. **Fuga entre tareas hermanas.** La frontera del grupo se leía del cuerpo
   entero, así que la tarea 1.2 heredaba los ficheros declarados por la 1.1. Es
   la misma clase de fuga que este módulo existe para cerrar. Corregido leyendo
   la frontera del **preámbulo** del grupo, lo que hay antes del primer checkbox.
2. **`**Focused tests:**` no se reconocía.** Estaba en el conjunto cerrado, pero
   el regex de línea exigía que la etiqueta empezara por `production` o `test`.
   Regex y conjunto decidían cosas distintas. Corregido: el regex propone
   candidatas y el conjunto cerrado decide; una etiqueta no reconocida es otro
   campo (`why:`, `skills:`), y solo la ausencia total de etiqueta reconocida es
   `unknown-grammar`.

### La medida que justifica 2A

Compilando **todas** las tareas de los 51 `tasks.md` archivados:

```
packets que compilan        120
no compilan                 499 unknown-grammar · 2 ambiguous-path
ejecutables                   0
motivos    missing-stop 120 · missing-field 133 · out-of-scope 100 · unresolved-decision 2
```

Tres hechos, ninguno supuesto:

- **499 tareas no declaran su frontera de forma legible.** El caso típico
  (`banner-git-semantics // 001`) la narra dentro del título de la tarea: "Crear
  `x.ts` … y añadir la matriz en `y.test.ts`". Un ejecutor barato no puede
  derivar un permiso de escritura de una frase.
- **Ninguno de los 120 que compilan es ejecutable**, y los 120 fallan por
  `missing-stop`. La condición de parada no existe en la gramática actual.
- **100 de 120 declaran una frontera que su propio comando enfocado incumple**:
  el `verify:` corre un fichero de test que el grupo nunca declaró.

Ese `expect(reasons.get("missing-stop")).toBe(compiled)` queda como test vivo: si
alguien cambia lo que `sdd-tasks` escribe, el número se mueve y la prueba lo dice.

### Evidencia

```
bun test tests/apply-packet-compile.test.ts tests/apply-packet.test.ts
  39 pass · 0 fail · 128 expect()
bun run typecheck   sin errores
```

Ficheros: `ein-pi/agent/lib/apply-packet-compile.ts` (nuevo),
`tests/apply-packet-compile.test.ts` (nuevo), más el realineo de
`ein-pi/agent/lib/apply-packet.ts` y `tests/apply-packet.test.ts` por el cambio
de `allowedFilesGrammar`. Ningún módulo ajeno al cambio modificado.

## // 003. Pertenencia y serialización canónica del corpus — COMPLETO

### RED

`bun test tests/apply-corpus.test.ts` → **0 pass / 1 fail** por módulo ausente.
13 casos: inclusión con verdad de git, los cuatro motivos de exclusión, orden de
entrada indiferente, corpus vacío y estabilidad del digest.

### GREEN

**13 pass / 0 fail al primer intento.** El diseño ya había cerrado las reglas
con números medidos, así que no hubo nada que descubrir aquí.

### TRIANGULATE

Cubierta dentro del propio RED, que ya incluía los bordes: orden de entrada
alterado, corpus vacío, exclusión múltiple (gana el primer motivo, no "el mejor")
y digest que se mueve al cambiar un solo hecho.

### REFACTOR

Sin extracción. `exclusionReason` es una escalera de cuatro comprobaciones en
orden fijo; ese orden ES la regla, y esconderlo tras predicados sueltos lo haría
menos legible, no más.

## // 004. Corpus real congelado y aislado — COMPLETO

### RED

`bun test tests/apply-corpus-frozen.test.ts` → **0 pass / 1 fail**: ni el
generador ni el dato existían.

### GREEN

`bun run evals/build-corpus.ts` → **40 items · 16 exclusiones**, en 0,58 s. El
recuento coincide **exactamente** con la medición manual hecha en la fase de
diseño, lo que confirma que la regla implementada es la que se diseñó. 6 pass /
0 fail, incluida la prueba dura: regenerar sobre el mismo historial produce el
fichero byte a byte.

### TRIANGULATE

4 casos nuevos. El escaneo de aislamiento pasaba a base de no encontrar nada,
que es la forma más fácil de que un test mienta; ahora su predicado está
extraído y se prueba **contra ofensores sintéticos** (`from "./apply-corpus.ts"`,
`import ... "../evals/apply-corpus.json"`, la ruta en una cadena) y contra
menciones inocentes. Además: un árbol sin archivo devuelve cero hechos sin
reventar, y quitarle el commit de entrega a un ítem real lo saca del corpus con
motivo `sin-commit`.

## // 005. Puertas completas — COMPLETO

```
bun test          2316 pass · 16 fail · 9 errors   (con mi trabajo)
bun test          2254 pass · 16 fail · 9 errors   (baseline origin/main, stash)
bun run typecheck sin errores
```

**Los 16 fallos y 9 errores son preexistentes en `origin/main`** y se reproducen
con mi trabajo guardado en stash: mismo número exacto, mismos ficheros
(`updater-cli-entrypoints`, `installer-uninstall`, cierre empaquetado de Cleaner,
inventario instalado de agentes). Mi cambio suma **62 pruebas verdes y cero
rojas**. Siguiendo la condición de parada declarada, no se toca ninguno de esos
tests: se reportan.

## Resumen del apply

| Bloque | Producción | Tests | Resultado |
|---|---|---|---|
| 001 | `ein-pi/agent/lib/apply-packet.ts` | `tests/apply-packet.test.ts` | 25 pass |
| 002 | `ein-pi/agent/lib/apply-packet-compile.ts` | `tests/apply-packet-compile.test.ts` | 14 pass |
| 003 | `ein-pi/agent/lib/apply-corpus.ts` | `tests/apply-corpus.test.ts` | 13 pass |
| 004 | `evals/build-corpus.ts` + `evals/apply-corpus.json` | `tests/apply-corpus-frozen.test.ts` | 10 pass |

Ningún módulo existente del runtime fue modificado. Ningún artefacto archivado
fue reescrito.

## // 006. Corrección posterior a verify: el corpus no estaba congelado

Detectada **al cerrar**, antes de entregar nada: archivar este mismo cambio hizo
fallar `tests/apply-corpus-frozen.test.ts`.

### El defecto

`collectArchivedFacts` leía el **árbol de trabajo**. Eso significaba que el
corpus se regeneraba distinto cada vez que alguien archivaba un cambio — y el
primer caso fue el propio cambio que creó el corpus, que se incluía a sí mismo
como exclusión número 17. Un examen que se mueve solo no es un examen: las notas
tomadas antes y después dejan de compararse.

Que lo detectara el test y no una revisión a ojo es exactamente para lo que
estaba escrito el criterio "regenerar produce los mismos bytes".

### La corrección

El corpus se ancla a un `baseCommit` y **todo** se lee de git en ese commit: el
listado de cambios archivados (`git ls-tree`), los commits de entrega
(`git log <base>`) y los artefactos (`git show <base>:<path>`). El árbol de
trabajo deja de influir. Regenerar dentro de un año con el mismo `baseCommit`
devuelve el mismo fichero.

RED: dos casos nuevos —`baseCommit` presente y con forma de commit, y "archivar
un cambio nuevo NO mueve el corpus congelado"— fallando antes de tocar
producción. GREEN: `40 items · 16 exclusiones @ 1671a6e`, los mismos recuentos
que antes, ahora anclados.

Añadido de paso: stderr de git silenciado. Un artefacto ausente en el commit base
(carril `micro` sin `tasks.md`) es un hecho normal, no un incidente que ensucie
la salida.

### Evidencia final

```
bun test (los 4 ficheros del cambio)   63 pass · 0 fail · 408 expect()
bun test completo                      2317 pass · 16 fail · 9 errors
bun run typecheck                      sin errores
```

## // 007. Corrección posterior a la PR: dos defectos que destapó CI

CI falló donde el local no. Dos causas distintas, ambas en los **tests**, no en
producción.

### La medida convertía una foto en ley

`TRIANGULATE: medida sobre TODO el archivo` recorría la carpeta
`openspec/changes/archive/` del árbol de trabajo y afirmaba que **todos** los
packets que compilan fallan por `missing-stop`. Al archivarse este mismo cambio,
compilan 126 y solo 120 fallan por eso: los seis restantes son sus propias
tareas, que **sí** declaran `stop:` porque la gramática se usó mientras se
construía.

El número se movió por la razón correcta y el test estaba escrito como si la
foto de ayer fuese permanente. Es el mismo defecto de fondo que el `baseCommit`
ya corrigió en el corpus, escondido en otro sitio.

**Corregido anclando la medida al corpus congelado**: se recorren los 40 ítems
del examen, no la carpeta. Añadida además una afirmación que faltaba —
`EJECUTABLE` no aparece entre los motivos—, para que un packet que pase a ser
ejecutable rompa el test en vez de diluirse en el recuento.

Por qué no se vio antes: la suite completa se corrió **antes** del archivado
final y ese fichero no se volvió a ejecutar después.

### CI clona superficial

Las tres pruebas del corpus leen historial (`git log`, `ls-tree`, `show` sobre el
commit base). El job `test` de `.github/workflows/ci.yml` usaba
`actions/checkout` sin `fetch-depth`, es decir profundidad 1: sin historial, el
commit base no existe y el congelado no se puede verificar.

Corregido con `fetch-depth: 0` y su comentario. El job `docs-site` del mismo
fichero ya lo tenía por esta misma clase de problema.

### Hallazgo colateral

En CI la suite da **2462 pass / 5 fail**; en local, 16 rojos. Los 16 locales
pasan en CI porque el workflow ejecuta `bun run bundle-template:host` antes de
los tests y en local nadie lo hace. **No están rotos: les falta un paso previo
sin documentar.** Queda anotado; no se toca aquí.

El quinto fallo de CI (`manifest backup v1 > Omarchy real tree`, timeout a los
5.000 ms) es del área del instalador y ajeno a este cambio.
