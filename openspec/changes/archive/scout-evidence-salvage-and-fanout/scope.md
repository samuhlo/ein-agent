# Scope: scout-evidence-salvage-and-fanout

## Summary

El contrato del scout tira trabajo bien hecho y no devuelve nada a cambio. Medido
en producción esta sesión, sobre `planificador-didactico`: dos reportes completos
y útiles, 21 y 28 llamadas de herramienta, ~103 s y ~0,023 $, descartados enteros
por una cita con el final del rango pasado por 2 y por 4 líneas.

| Run | Ref | Cita | Fichero real | Resto |
|---|---|---|---|---|
| bd430b75 | R7 | `server/api/cursos/index.post.ts` 1-105 | 101 líneas | 11/12 refs válidas |
| 528cd37a | R6 | `server/api/cursos/[id].get.ts` 1-85 | 83 líneas | 9/10 refs válidas |

Las dos son citas "el fichero entero" con el final redondeado hacia arriba.
`ein-pi/agent/lib/scout-contract.ts:161` (`endLine > lines.length`) descarta el
reporte completo; `:72` corta el tercer intento como incidente de
infraestructura. El padre se queda sin evidencia y sin poder arreglarla, porque
el mensaje (`"reference line range is invalid"`) no nombra qué referencia, qué
fichero ni qué rango.

Esto viola el MANIFIESTO `// 004` de forma directa: **un arnés que impide que el
trabajo salga no es un arnés, es burocracia**. Y no es un incidente aislado: es
el cuarto fix de la misma clase sobre el mismo fichero (`fix(scout): tolera la
forma natural…`, `fix(scout): valida el reporte desde finalOutput…`,
`fix(scout): repara el handoff estructurado…`, `fix(scout): declara el
foreground…`). El fichero ya adoptó la doctrina correcta —el prompt guía, el
parser tolera— en `normalizeReference`/`normalizeUncertainty`, pero se quedó a
medias: normaliza la FORMA y sigue siendo brutal con el RANGO.

## Scope

Dos piezas, ambas dentro de alcance. La persistencia del reporte en disco para
que `sdd-map` lo consuma queda FUERA: cambia el diseño del handoff entre fases y
va en un cambio propio.

### Pieza 1 — La evidencia válida sobrevive

Tres correcciones sobre `ein-pi/agent/lib/scout-contract.ts`, en orden de
retorno:

1. **Clamp del rango final.** Si `startLine` cae dentro del fichero, recortar
   `endLine` a EOF en vez de fallar. Mata la clase entera de fallo medido arriba.
   Sigue fallando si `startLine` ya está fuera del fichero: eso sí es una cita
   inventada, y el oro (la cita apunta a un fichero:línea real) no se relaja.
2. **Errores que nombran la cita.** Todo `fail()` de `validateReference` debe
   nombrar id, path, rango citado y líneas reales. Sin esto ningún reintento
   puede corregir nada — es exactamente por lo que el segundo intento falló
   igual que el primero.
3. **Aceptación parcial.** Una referencia inválida descarta esa referencia y los
   findings que solo dependan de ella, no el reporte. Lo descartado se devuelve
   como incertidumbre explícita (`// 002`: la evidencia lleva procedencia, un
   determinismo débil se reporta como evidencia incompleta, nunca se asciende a
   conclusión). El reporte solo se rechaza entero si el `summary` se queda sin
   ninguna cita válida.

**Condición de retirada (`// 004`):** la validación estricta de citas se retira
cuando el runtime pueda devolver el rango leído por el propio tool `read` y la
cita deje de ser un número que el modelo escribe a mano.

### Pieza 2 — Fan-out real de scouts

Hoy el paralelo está prohibido en dos sitios: `unsupportedForm`
(`scout-contract.ts:46`) rechaza cualquier `workflowScript` con fan-out, y
`scoutReportText` (`:186`) exige `results.length === 1`.

**La razón declarada ya no se sostiene, y su condición de retirada se cumple.**
El comentario de `:60-66` dice que el contrato no puede saber de qué hijo es cada
reporte. `ein-pi/agent/lib/sdd-participants.ts:159-172` documenta lo contrario:
el runtime devuelve un `SingleResult` por hijo dentro de `details.results[]`,
cada uno con `agent`, `task` y `finalOutput`. Un fan-out son N resultados
identificables dentro de UNA tool call. Validar N reportes y devolverlos todos es
mecánicamente posible hoy.

El bound de 1-3 scouts con ángulos disjuntos se mantiene: lo que se retira es
"uno por turno", no el límite de ramas.

## Budget

```
scope: Que el contrato del scout deje de descartar evidencia válida (clamp de rango, errores que nombran la cita, aceptación parcial) y admita fan-out real de 2-3 scouts en una sola tool call.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Architecture

- Toda la lógica en `ein-pi/agent/lib/scout-contract.ts` (módulo puro, ya
  testeado sin arrancar Pi). El adaptador `ein-ai.ts:988` solo cambia si la
  Pieza 2 obliga a devolver N reportes en vez de uno.
- `openspec/specs/scout-routing/spec.md` recibe delta: los escenarios
  `readonly-scout-bounded-research-contract`,
  `scout-concurrent-launch-rejected-before-execution` y
  `scout-fan-out-is-described-as-sequential` afirman hoy justo lo que este cambio
  retira.
- `ein-pi/agent/assets/orchestrator.md` §"Read-only fan-out (sequential)" y la
  línea 53 (off-contract dos veces = incidente) describen la regla vieja.
- `ein-pi/core/agents/ein-scout.md`: el prompt pide citas exactas sin dar
  procedimiento. Cabe una frase, no un párrafo (`// 004`: presupuesto de prompt,
  la cicatriz no es doctrina).

## Known constraints

1. **Tests que afirman lo contrario.** `tests/readonly-scout-contract.test.ts:149`
   y `:167` esperan `toThrow("line range")` sobre rangos que este cambio pasa a
   aceptar. Hay que reescribirlos, no borrarlos: el caso "startLine fuera del
   fichero" tiene que seguir en rojo.
2. **`strict_tdd: true`** en `openspec/config.yaml`. RED antes que GREEN en apply.
3. **Presupuesto de bytes del prompt** (`// 004`): si el orquestador gana prosa
   sobre fan-out paralelo, tiene que salir prosa equivalente de la regla
   secuencial que se retira. Neto ≤ 0.
4. **`OFF_CONTRACT_LIMIT`** deja de ser el corte principal cuando la aceptación
   parcial existe: hay que decidir si sobrevive y contra qué fallo.
5. **Evidencia reproducible en disco:** los dos reportes fallidos siguen en
   `~/.pi-ein/agent/sessions/--Users-samu-Documents-01_Proyectos-planificador-didactico--/subagent-artifacts/`.
   Sirven de fixture real para el test de regresión.

## Decisions deferred to sdd-design

1. Aceptación parcial: ¿umbral mínimo (summary con ≥1 cita válida) o algo más
   estricto? ¿Cómo se redacta la incertidumbre sintética que reemplaza a la
   referencia descartada?
2. Fan-out: ¿el contrato devuelve un array de reportes, o N reportes fusionados
   con ids de referencia renumerados por rama? Lo segundo es más limpio para el
   padre y más caro de implementar.
3. ¿Sobrevive `OFF_CONTRACT_LIMIT`, y contra qué fallo concreto, una vez que un
   reporte casi-válido ya no cuenta como off-contract?
4. ¿La frase de procedimiento de citas en `ein-scout.md` sustituye a alguna otra,
   o el clamp la hace innecesaria y no se toca el prompt?

---

Spec delta: PRESENTE. Registrado con `cc-ein-sdd delta
scout-evidence-salvage-and-fanout --domain scout-routing` — 4 escenarios ADDED y
2 REMOVED en `openspec/changes/scout-evidence-salvage-and-fanout/specs/scout-routing/spec.md`.
Este cambio ALTERA comportamiento observable: `spec_delta: none` no era una
opción válida aquí.

`off-contract-scout-result-does-not-free-the-turn` se deja intacto a propósito:
si sobrevive, y contra qué fallo, es la decisión 3 diferida a `sdd-design`.
