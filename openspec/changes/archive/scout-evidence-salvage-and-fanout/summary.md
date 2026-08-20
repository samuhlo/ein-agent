status: complete
change: scout-evidence-salvage-and-fanout
phase: close

# Summary — scout-evidence-salvage-and-fanout

## Qué se arregló

El contrato del scout descartaba reportes enteros por una cita con el final del
rango pasado por dos líneas, y devolvía un error que no nombraba la cita, así que
el reintento fallaba idéntico. Medido: dos investigaciones completas sobre
`planificador-didactico` (21 y 28 llamadas de herramienta, ~103 s, ~0,023 $) a la
basura con 19 de 21 referencias válidas.

Ahora la validación tiene dos niveles con criterios distintos, y esa separación
es lo que cambia de verdad:

- **Coherencia interna → estricta.** Schema, ids únicos, ids conocidos,
  referencias no huérfanas. Determinista, gratis, responsabilidad del modelo.
- **Citas contra disco → tolerante y con procedencia.** Es donde el modelo
  escribe un número a mano. El final que se pasa de EOF se recorta; la cita
  irrecuperable se descarta con su motivo declarado como incertidumbre; el resto
  del reporte llega al padre.

Y el fan-out deja de ser secuencial: 2-3 scouts en una sola llamada, cada rama
validada por su cuenta.

## Comportamiento observable

Los dos reportes que el contrato viejo destruyó, contra el repo real:

```
528cd37a  ACEPTADO  refs 10/10  findings  8/8  recortada R6 -> 82
bd430b75  ACEPTADO  refs 12/12  findings 10/10  recortada R7 -> 100
```

De 0 de 22 referencias entregadas a 22 de 22, con dos finales recortados.

## Por qué, y por qué ahora

Era el **cuarto fix de la misma clase** sobre el mismo fichero: el scout
investiga bien, el notario tira el resultado. MANIFIESTO `// 004` — un arnés que
impide que el trabajo salga no es un arnés, es burocracia. El fichero ya había
adoptado la doctrina correcta (el prompt guía, el parser tolera) para la FORMA
del reporte; faltaba aplicarla al RANGO.

El fan-out estaba prohibido por una razón declarada que había dejado de ser
cierta —"un reporte no puede atarse a varios children"—, con su condición de
retirada escrita en el propio código. `sdd-participants.ts:159-172` documenta que
el runtime devuelve un `SingleResult` por hijo. La condición se cumplió y el
guardarraíl se retiró, que es exactamente el ciclo de vida que `// 004` le exige
a un guardarraíl.

## Ficheros

| Fichero | Qué |
|---|---|
| `ein-pi/agent/lib/scout-contract.ts` | Clamp, motivos que nombran la cita, salvamento parcial, fan-out, `MAX_FANOUT_BRANCHES`, contador re-apuntado |
| `ein-pi/agent/lib/subagent-envelope-contract.ts` | `acceptTrackedScoutResult`: `loud-wasteful` → `safe-degradation` |
| `ein-pi/agent/assets/orchestrator.md` | Fan-out paralelo (**−2 bytes**) |
| `ein-pi/core/agents/ein-scout.md` | La línea que prometía rechazo ahora dice la verdad (**−4 bytes**) |
| `tests/readonly-scout-contract.test.ts` | 35 tests; los que afirmaban lo contrario, invertidos |
| `tests/delegation-shape.test.ts` | El fan-out pasa de rechazado a aceptado |
| `tests/orchestrator-context-diet.test.ts` | Prosa de fan-out paralelo |

`ein-ai.ts` no necesitó cambios: ya serializaba lo que devolviera el contrato.

## Spec delta

8 operaciones sobre `scout-routing`, todas aplicadas a
`openspec/specs/scout-routing/spec.md`:

- **ADDED** `scout-reference-end-line-clamped-to-file-end`
- **ADDED** `scout-reference-rejection-names-the-citation`
- **ADDED** `scout-report-survives-a-single-invalid-reference`
- **ADDED** `scout-fan-out-runs-in-parallel-within-one-tool-call`
- **REMOVED** `scout-concurrent-launch-rejected-before-execution` — su causa
  declarada dejó de ser cierta
- **REMOVED** `scout-fan-out-is-described-as-sequential` — sustituido por el
  escenario paralelo
- **MODIFIED** `readonly-scout-bounded-research-contract` — afirmaba "solo un
  reporte" y "invalid-line falla cerrado"; las dos cosas dejaron de ser verdad
- **MODIFIED** `off-contract-scout-result-does-not-free-the-turn` — hablaba de un
  "one-scout-per-turn slot" que ya no existe

**Nota de fidelidad del artefacto:** el delta se escribió en dos pasadas (las 6
primeras operaciones, y las 2 MODIFIED tras ver que el sync dejaba dos escenarios
contradiciendo el comportamiento nuevo — `// 009` señal 7). El fichero de delta
del cambio conserva solo el último conjunto aplicable, porque `delta` sobrescribe
y `sync` rechaza como conflicto lo ya aplicado. La lista de arriba es el registro
completo; el canónico las tiene las 8.

## Desviación del diseño

**R3.4 retirada por imposible.** El diseño preveía podar "referencias huérfanas
sobrevenidas". No pueden existir: un finding solo cae cuando mueren TODAS sus
referencias, así que una referencia viva siempre mantiene vivo a su finding. Se
descubrió al no poder poner el test en rojo; el filtro que lo implementaba era
código muerto. Se retiró y el test se sustituyó por el invariante que lo hace
imposible.

## Verificación

`bun test` 2331 pass / 1 fail · `bun run typecheck` limpio.

El único ✕ es **ajeno**: `tests/sdd-vocabulary.test.ts` señala
`docs/valoracion-estado-y-rumbo-2026-08.md`, un fichero sin trackear de trabajo
anterior (hoy 10:32). Ni lo introduce ni lo toca esta rama.

## Riesgo que queda en pie

El clamp acepta un final de rango inflado por el modelo. `startLine`, la
existencia del fichero, la no-fuga del root y los symlinks siguen verificados, y
el recorte viaja declarado. **Condición de retirada**, escrita en
`scout-contract.ts`: cuando el runtime devuelva el rango leído por el propio
`read` y la cita deje de ser un número escrito a mano.

## Fuera de alcance, pendiente

Persistir el reporte del scout en disco para que `sdd-map` lo consuma en vez de
rehacer la investigación. Cambia el handoff entre fases y merece su propio cambio.
