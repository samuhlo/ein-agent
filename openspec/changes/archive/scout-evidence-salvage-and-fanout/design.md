status: ready
change: scout-evidence-salvage-and-fanout
phase: design

# Design — scout-evidence-salvage-and-fanout

## A. Proposal

### Problema

El contrato del scout descarta trabajo válido y no devuelve nada utilizable a
cambio. Medido, no supuesto: dos reportes completos sobre `planificador-didactico`
(21 y 28 llamadas de herramienta, ~103 s, ~0,023 $) tirados enteros porque UNA
cita de cada uno pasaba el final del fichero por 2 y por 4 líneas. 19 de 21
referencias eran válidas. El padre se quedó sin evidencia, sin poder arreglarla
—el mensaje no nombra la cita— y con la investigación cortada al segundo intento.

Es el cuarto fallo de la misma clase sobre el mismo fichero. El patrón es
constante: el scout investiga bien, el notario tira el resultado. MANIFIESTO
`// 004`: un arnés que impide que el trabajo salga no es un arnés, es burocracia.

En paralelo, el fan-out real está prohibido por una razón que ya no se sostiene
y cuya condición de retirada, escrita en el propio código, se cumple.

### Propuesta

Dos piezas sobre `ein-pi/agent/lib/scout-contract.ts`.

**Pieza 1 — la evidencia válida sobrevive.** La validación se parte en dos
niveles con criterios distintos, y esa separación es la decisión de diseño
central:

- **Coherencia interna: estricta.** Schema, ids únicos, ids usados que existen,
  referencias no huérfanas. Es determinista, gratis, y es responsabilidad del
  modelo. Falla cerrado, como hoy.
- **Citas contra disco: tolerante y con procedencia.** Es donde el modelo
  escribe un número a mano y se equivoca. Aquí se recorta, se descarta lo
  irrecuperable y se sigue.

**Pieza 2 — fan-out real.** Se admite el `workflowScript` con fan-out y N
resultados en una tool call, se valida cada rama por separado y se retira la
puerta de "un scout pendiente por turno". El bound de 3 ramas se conserva.

### Alternativas descartadas

1. **Endurecer el prompt del scout** para que no se pase con los rangos. Es la
   trampa que `// 004` nombra por su nombre: la cicatriz no es doctrina. El
   prompt se paga en cada turno de cada sesión y sigue siendo una sugerencia; el
   clamp es una garantía. Descartada.
2. **Reintento automático del scout con el error.** Paga otra investigación
   completa para arreglar dos líneas de un reporte que ya estaba bien. Duplica
   el coste exacto que este cambio existe para no pagar. Descartada.
3. **Fusionar las ramas del fan-out en un reporte único con ids renumerados.**
   Los marcadores `[R1]` viven DENTRO de la prosa de `summary` y `claim`, que
   los escribió el modelo. Renumerar obliga a reescribir esa prosa: magia oculta
   que rompe en silencio. `// 005`, comportamiento explícito. Descartada a favor
   de devolver las ramas por separado.

## B. Spec

### R1 — Clamp del rango final

`validateReference` recorta `endLine` al número de líneas del fichero cuando
`startLine` cae dentro del fichero. La referencia recortada se acepta y viaja
con su procedencia (ver R3).

Sigue fallando, sin recorte posible, cuando `startLine > lines.length`: eso no es
un redondeo, es una cita inventada, y el oro —la cita apunta a un fichero:línea
real— no se relaja.

**Criterio de aceptación:** una referencia `1-105` sobre un fichero de 101 líneas
se acepta como `startLine: 1, endLine: 101`. Una referencia `120-130` sobre ese
mismo fichero se rechaza.

### R2 — El rechazo nombra la cita

Todo fallo de validación de referencia nombra id, path y rango citado. Un fallo
de rango nombra además las líneas reales del fichero.

Formato: `R7 server/api/cursos/index.post.ts 1-105: startLine 105 is past the
last line (101)`.

**Criterio de aceptación:** el mensaje de un rechazo contiene el id, el path y
ambos números. Ningún `fail()` de `validateReference` queda genérico.

### R3 — Salvamento parcial

Una referencia irrecuperable descarta esa referencia y los findings que dependan
SOLO de ella; el resto del reporte llega al padre. Cada descarte se añade como
incertidumbre explícita con su motivo.

Reglas exactas:

1. Se descarta la referencia; su motivo se guarda.
2. Un finding cuyos `referenceIds` quedan todos descartados se descarta. Un
   finding con al menos una referencia viva se conserva con sus ids vivos.
3. `summaryReferenceIds` conserva los ids vivos.
4. Una referencia que queda sin usar por el descarte de un finding se retira en
   silencio: no es un error del modelo, es consecuencia del descarte.
5. El reporte se rechaza ENTERO solo si tras el barrido no queda ninguna
   referencia, ningún finding, o `summaryReferenceIds` queda vacío.
6. Cada descarte añade una incertidumbre `"R7 server/… 1-105 descartada: <motivo>"`.
   El reporte DEVUELTO puede superar el tope de 8 incertidumbres; el tope sigue
   aplicándose al reporte de ENTRADA. La cota de entrada valida al modelo; la
   salida es enriquecimiento de Ein y no puede quedar muda por un tope ajeno.

**Criterio de aceptación:** un reporte de 12 referencias con 1 irrecuperable
llega al padre con 11 referencias, sus findings vivos y una incertidumbre nueva
que nombra la descartada. Un reporte cuya única referencia es irrecuperable se
rechaza entero.

### R4 — Fan-out en paralelo dentro de una tool call

`unsupportedForm` deja de rechazar un `workflowScript` con fan-out.
`scoutReportText` acepta N resultados. Cada `finalOutput` se valida de forma
independiente: una rama fuera de contrato no arrastra a sus hermanas.

Se retira la puerta de "un scout pendiente por turno"
(`scout-contract.ts:68`). `async: false` NO se toca: el foreground sigue siendo
obligatorio en las dos formas — sin él el resultado no vuelve por esta tool call
y la protección declarada en `ENVELOPE_CONSUMER_INVENTORY` se cae.

**Forma de retorno.** Un resultado devuelve el reporte pelado, byte por byte
como hoy: es el caso mayoritario y no se rompe. N resultados devuelven:

```json
{ "version": "ein-scout-fanout/v1", "branches": [{ "task": "…", "report": { … } }] }
```

**Criterio de aceptación:** un fan-out de 3 ramas con una rama malformada
devuelve 2 ramas válidas y nombra la caída. Un fan-out de 4 ramas se rechaza.

### R5 — `OFF_CONTRACT_LIMIT` sobrevive, re-apuntado

El contador se mantiene en 2, pero ya no puede dispararse por un reporte
salvable: esos ahora pasan. Solo cuenta el fallo total —JSON malformado, schema
inválido, salida vacía, cero resultados—, que es el incidente de infraestructura
que el guardarraíl decía vigilar desde el principio.

En un fan-out, la llamada cuenta como fuera de contrato solo si TODAS las ramas
fallan del todo. Con una rama utilizable, la llamada no es un incidente.

**Condición de retirada (`// 004`):** cuando el runtime devuelva el rango leído
por el propio `read`, la cita deje de ser un número escrito a mano y R1/R3 se
queden sin casos que salvar durante un ciclo completo de uso real.

**Criterio de aceptación:** dos resultados con JSON malformado en el mismo turno
siguen cortando el tercer lanzamiento. Dos reportes con una cita pasada de rango
no cortan nada, porque los dos se aceptan.

### R6 — Prosa: neto ≤ 0

- `orchestrator.md:150,152`: la sección pasa a describir el fan-out en paralelo
  en una sola llamada. Sale "one scout per turn" y la frase del rechazo del
  segundo scout; entra menos texto del que sale.
- `orchestrator.md:53`: "returns off-contract twice" sigue siendo cierto con R5;
  no se toca.
- `ein-scout.md`: "Ein rejects any reference it cannot resolve" pasa a ser falso
  con R3. Se reescribe en su sitio, sin ganar bytes. **No se añade
  procedimiento de citas: eso ya es código** (`// 004`, si puede ser código, es
  código).
- `subagent-envelope-contract.ts:63-67`: la nota de `acceptTrackedScoutResult`
  ("el reporte se tira… el trabajo ya se pagó") describe el bug arreglado. Se
  reescribe. `failureMode` baja de `loud-wasteful` a `safe-degradation`: con R3
  el fallo parcial ya no desperdicia el trabajo.

**Criterio de aceptación:** `tests/prompt-budget.test.ts` en verde sin subir
ningún techo.

## C. Riesgo aceptado

El clamp acepta un final de rango que el modelo infló. Se asume: `startLine` y la
existencia del fichero siguen verificados, el recorte viaja con procedencia, y el
coste de la alternativa está medido en dos reportes buenos a la basura.
