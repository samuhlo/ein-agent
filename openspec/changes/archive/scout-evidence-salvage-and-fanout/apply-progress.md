status: complete
change: scout-evidence-salvage-and-fanout
phase: apply
strict_tdd: true

# Apply — scout-evidence-salvage-and-fanout

## RED → GREEN

RED confirmado antes de tocar producción: `bun test tests/readonly-scout-contract.test.ts`
→ **22 pass / 13 fail**, cada fallo por la razón esperada (rango recortado,
mensaje sin nombrar la cita, salvamento ausente, fan-out rechazado, contador mal
apuntado). GREEN al cerrar: **35 pass / 0 fail**.

## Cambios

### `ein-pi/agent/lib/scout-contract.ts`

- **Dos niveles de validación** documentados en cabecera: coherencia interna
  estricta (schema, ids únicos, ids conocidos, sin huérfanas) frente a citas
  contra disco tolerantes y con procedencia.
- `validateReference` → `checkReference`, que devuelve `{ ok, reference }` o
  `{ ok: false, reason }` en vez de lanzar. Recorta `endLine` al final real del
  fichero; rechaza `startLine` fuera del fichero.
- `lineCount` descuenta el elemento vacío que deja `split` cuando el fichero
  acaba en salto de línea. Sin eso el recorte apuntaría a una línea inexistente.
- `cite()` compone `R7 path 1-105` y lo mete en TODOS los motivos de rechazo;
  el fallo de rango añade las líneas reales.
- `validateScoutReport` salva: descarta la referencia, poda los findings sin
  citas vivas, poda `summaryReferenceIds`, y añade una incertidumbre por
  descarte. Rechaza entero solo si no queda evidencia viva.
- `unsupportedForm` deja de rechazar el fan-out; `workflowScriptFansOut` sale de
  los imports.
- `normalizeScoutLaunch` pierde la puerta "un scout pendiente por turno".
- `scoutReportText` → `scoutBranches` + `validateBranches`. Un resultado devuelve
  el reporte pelado; N devuelven `ein-scout-fanout/v1`. `MAX_FANOUT_BRANCHES = 3`
  aplicado en código.
- `OFF_CONTRACT_LIMIT` re-apuntado: en fan-out solo cuenta si caen TODAS las ramas.

### Prosa y contrato declarado

- `orchestrator.md`: `## Read-only fan-out (parallel)`, "in parallel, in one
  call". **Neto −2 bytes**; `ein-scout.md` **−4 bytes**. Ningún techo tocado.
- `subagent-envelope-contract.ts`: `acceptTrackedScoutResult` baja de
  `loud-wasteful` a `safe-degradation`; la nota describe el comportamiento nuevo.

## Desviación del diseño: R3.4 retirada por imposible

El diseño preveía podar "referencias huérfanas sobrevenidas" (una referencia
viva que se queda sin usar porque cayó su finding). **No puede ocurrir**: un
finding solo cae cuando mueren TODAS sus referencias, así que una referencia
viva siempre mantiene vivo a su finding, y las del summary sobreviven al filtro.

Se descubrió al no poder poner el test en rojo. El filtro que lo implementaba era
código muerto: se retiró, y el test se sustituyó por el invariante que lo hace
imposible ("un finding conserva sus citas vivas y pierde solo las muertas").
`// 007`: no se vende cobertura que no existe.

## Verificación con la evidencia real (tarea 5.3)

Los dos reportes que hoy se descartan, validados contra el contrato nuevo y el
repo real `planificador-didactico`:

```
528cd37a  ACEPTADO  refs 10/10  findings  8/8  recortadas: R6->82
bd430b75  ACEPTADO  refs 12/12  findings 10/10  recortadas: R7->100
```

Cero pérdida. Un recorte por reporte, exactamente las dos citas que antes
tiraban el trabajo entero.

## Suite

`bun test`: 2330 pass / 2 fail antes de arreglar la prosa; ambos fallos
esperados y resueltos (`delegation-shape` invertido, prosa del fan-out).
`bun run typecheck`: limpio.

**Fallo AJENO, preexistente, no tocado:** `tests/sdd-vocabulary.test.ts` falla
por `docs/valoracion-estado-y-rumbo-2026-08.md`, un fichero sin trackear de
trabajo anterior que usa vocabulario bloqueado. No lo introduce este cambio y no
se arregla aquí.
