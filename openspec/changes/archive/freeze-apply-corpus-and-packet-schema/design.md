status: ready
change: freeze-apply-corpus-and-packet-schema
phase: design
lane: standard
tdd: strict

# Design — freeze-apply-corpus-and-packet-schema

## A. Proposal

### Problema

`2A` pide un corpus congelado y un schema de Apply Packet que rechace lo que un
ejecutor no podría ejecutar sin decidir. Hoy ninguna de las dos cosas es posible,
y las dos razones están medidas sobre los 56 cambios archivados.

**El contrato de ficheros permitidos es ilegible para una herramienta.** Diez
grafías distintas para el mismo campo (`Production files:` ×18,
`Production files (apply touches):` ×11, `- production paths:` ×10,
`**Production files:` ×7, `production-files:` ×6, `production files:` ×6,
`- production files:` ×4, `production_files:` ×3, y dos más con una aparición).
El único extractor existente, `extractProductionFiles`
(`ein-pi/agent/lib/sdd-router.ts:778-780`), no lee la etiqueta: aplica un regex de
rutas a **todo el cuerpo del grupo**. Probado contra el `tasks.md` mejor escrito
del repo:

```
Grupo // 001  declarado: none        extraído: 9 ficheros
Grupo // 005  declarado: 1 fichero   extraído: 2
Grupo // 007  declarado: 1 fichero   extraído: 2 (uno es un basename sin ruta)
```

Para el aviso `oversized-group` esa aproximación es suficiente y correcta. Para
la frontera de escritura de un ejecutor barato es un permiso accidental.

**Las condiciones de parada no existen.** `stop:` aparece en **0 de 51**
`tasks.md` archivados. El resto del vocabulario sí está asentado: `verify:` 50/51,
`architecture:` 50/51, `avoid:` 50/51, `why:` 50/51, `skills:` 49/51.

### Propuesta

Tres módulos `[CORE]` nuevos, una carpeta de datos nueva y ninguna edición de
código existente.

1. **`apply-packet/v1`** — tipo versionado, serialización canónica y validador que
   devuelve una unión discriminada. No lanza, no lee disco.
2. **Compilador** desde el texto de `design.md` + `tasks.md` a packet. Parsea la
   **etiqueta** contra un conjunto cerrado de grafías conocidas; nunca adivina la
   frontera barriendo el cuerpo.
3. **Corpus** cuya pertenencia se **calcula**, no se elige, y se serializa
   canónicamente con digest.

El borde de E/S (git y ficheros) vive en `evals/build-corpus.ts`, fuera de la
lógica y fuera del payload que se instala.

### Alternativas descartadas

- **Reutilizar `extractProductionFiles` para la frontera del packet.** Es la
  opción que menos código escribe y la que reintroduce el defecto medido: barre
  el cuerpo entero. Se reutiliza solo para **clasificar** una ruta ya extraída
  (`isTestPath`, `isProductionFile`), nunca para encontrarla.
- **Migrar los `tasks.md` archivados a una grafía única.** Falsearía el examen:
  el corpus mide el flujo tal como fue, no una versión retocada.
- **Elegir a mano una muestra representativa del corpus.** Una selección humana
  no es reproducible y abre la puerta a escoger los casos favorables.
- **Detectar obsolescencia por fecha de modificación.** `mtime` no es contenido:
  un `touch` marcaría obsoleto un packet válido y un `git checkout` haría lo
  contrario.

## B. Spec

### R1 — Formato y validación del packet

`APPLY_PACKET_FORMAT = "apply-packet/v1"`. Un packet declara: `outcome`,
`allowedFiles`, `invariants`, `focusedCheck`, `stopConditions`,
`expectedEvidence` y `sources` (digest de los artefactos de origen).

`validateApplyPacket` devuelve `{ ok: true, packet }` o
`{ ok: false, code, field, detail }` y **nunca lanza**. Códigos de rechazo, uno
por regla del roadmap:

| `code` | Se dispara cuando |
|---|---|
| `missing-invariant` | `invariants` vacío |
| `unresolved-decision` | un campo contiene una decisión sin resolver (marcador explícito: `TBD`, `?`, `decidir`, `elegir entre`) |
| `stale-source` | el digest recalculado de un artefacto de origen no coincide con el guardado |
| `out-of-scope` | una edición o el comando enfocado nombran una ruta fuera de `allowedFiles` |
| `missing-stop` | `stopConditions` vacío |
| `unknown-grammar` | la etiqueta de ficheros permitidos no está en el conjunto cerrado |
| `missing-field` | un campo obligatorio restante (`outcome`, `allowedFiles`, `focusedCheck`, `expectedEvidence`) está vacío |

Un packet inválido **no** es un packet degradado: no se devuelve packet.

### R2 — La etiqueta se parsea; el cuerpo no

El compilador reconoce un conjunto **cerrado y enumerado** de grafías de la
etiqueta de ficheros permitidos —las diez medidas en el archivo, que colapsan en
siete claves normalizadas— y las normaliza
al mismo campo, registrando en `provenance` cuál vio. Una etiqueta fuera del
conjunto produce `unknown-grammar` y **no** cae de vuelta a barrer el cuerpo.

Las rutas se extraen únicamente del valor de esa etiqueta. Un basename sin
directorio se rechaza: una frontera de escritura no puede ser ambigua sobre qué
fichero nombra.

### R3 — Obsolescencia por contenido

`sources` guarda `sha256` de los bytes exactos de `design.md` y `tasks.md`,
usando el mismo primitivo que `openspec-spec-contract.ts:52-53`. Un packet está
obsoleto cuando el digest recalculado difiere. Ni fechas, ni tamaños, ni marcas
de tiempo.

### R4 — `stopConditions` es obligatorio, y su coste se mide

El schema **exige** condiciones de parada. La consecuencia se declara aquí para
que no se lea como un fallo del compilador: ningún `tasks.md` archivado las
tiene, así que **ningún packet histórico será ejecutable**. Ese número es un
resultado del corpus, no un defecto.

Por eso la validación distingue dos niveles: `executable` (todos los campos
obligatorios presentes y coherentes) e `incomplete` (compila, pero le faltan
campos, y se dice cuáles). El corpus produce el recuento de cuántos cambios
archivados habrían dado un packet ejecutable. Cambiar lo que `sdd-tasks` escribe
para cerrar esa brecha es trabajo posterior, fuera de este cambio.

### R5 — La pertenencia al corpus se calcula

Un cambio archivado entra en el corpus **si y solo si** sus cuatro hechos son
derivables por máquina:

1. exactamente un commit añade su `summary.md`;
2. ese commit toca al menos un fichero fuera de `openspec/`;
3. tiene `tasks.md` con al menos un `verify:`;
4. su `verify-report.md` declara `status: pass`.

Medido hoy sobre el archivo: **40 elegibles de 56**. Las 16 exclusiones se
registran con su motivo (`sin-commit` 1, `solo-artefactos` 7, `sin-tasks` 4,
`verify-sin-status` 4), porque una exclusión silenciosa es un corpus que miente
sobre su cobertura.

Cada ítem guarda: identificador del cambio, commit de entrega, outcome, ficheros
tocados de verdad (del diff de ese commit, clasificados con `isTestPath` /
`isProductionFile`), comando enfocado y número de grupos.

### R6 — Congelado y reproducible

El corpus se serializa canónicamente (claves ordenadas, ítems ordenados por
identificador) y lleva su propio `sha256`. Regenerarlo sobre el mismo historial
produce byte a byte el mismo fichero. Dos lecturas devuelven los mismos ítems en
el mismo orden.

`evals/apply-corpus.json` vive fuera de `ein-pi/` **a propósito**: es dato de
evaluación, no payload que se instala en la máquina del usuario. Y fuera de
`openspec/`, cuya autoridad es el spec-sync.

### R7 — El corpus no es fuente de verdad de nada

Ninguna herramienta de fase (router, gatekeeper, overlay, preflight) lo importa.
Un test lo comprueba sobre el árbol real: si algún módulo de `ein-pi/agent/lib/`
importa el corpus, el test falla.

## C. Riesgo aceptado

- **El conjunto cerrado de grafías envejece.** Un `tasks.md` futuro con una
  duodécima grafía dará `unknown-grammar` en vez de compilar. Es el
  comportamiento correcto —fail-closed— y el coste de arreglarlo es añadir una
  entrada a una lista.
- **`stopConditions` obligatorio hace que hoy nada compile del todo.** Aceptado y
  medido: es el hallazgo, no el fallo.
- **El corpus depende del historial de git.** Un rebase que reescriba el pasado
  cambiaría la pertenencia. Aceptado: el digest lo delata en vez de esconderlo.

## D. Success criteria

1. `validateApplyPacket` rechaza los siete códigos con el campo ofensor
   nombrado, y nunca lanza. Un fallo declara además su nivel: `incomplete`
   (falta contenido obligatorio) o `rejected` (el packet afirma algo falso o
   fuera de su frontera).
2. El compilador parsea las once grafías conocidas, registra cuál vio, y devuelve
   `unknown-grammar` ante una desconocida sin caer al barrido del cuerpo.
3. Un basename sin directorio se rechaza.
4. La obsolescencia se detecta por digest de contenido.
5. La pertenencia al corpus se computa desde los cuatro hechos, y cada exclusión
   lleva motivo.
6. Serializar el corpus dos veces da bytes idénticos.
7. Ningún módulo de fase importa el corpus.
