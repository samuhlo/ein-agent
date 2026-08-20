status: pass
change: scout-evidence-salvage-and-fanout
phase: verify

# Verify — scout-evidence-salvage-and-fanout

Ejecutado en esta sesión, no inferido.

## Suite

```
bun test        2331 pass · 1 fail · 9393 expect() · 173 ficheros · 63,14 s
bun run typecheck   limpio (exit 0)
```

El único ✕ es **ajeno a este cambio**: `tests/sdd-vocabulary.test.ts` señala
`docs/valoracion-estado-y-rumbo-2026-08.md`, un fichero sin trackear escrito hoy
a las 10:32 en trabajo anterior. No lo introduce ni lo toca esta rama, y
arreglarlo aquí sería meter en el cambio algo que no le pertenece. Queda
declarado, no escondido.

Ficheros de contrato tocados, todos en verde:

```
tests/readonly-scout-contract.test.ts     35 pass · 0 fail
tests/delegation-shape.test.ts            27 pass · 0 fail
tests/orchestrator-context-diet.test.ts   verde
tests/orchestrator-scope-gate.test.ts     verde
tests/prompt-budget.test.ts               verde, sin subir ningún techo
tests/subagent-envelope-contract.test.ts  verde
```

## Requisitos del diseño

| Req | Cómo se comprobó | Resultado |
|---|---|---|
| R1 clamp | `1-99` sobre fichero de 3 líneas → `endLine: 3`; `50-60` → rechazo | pass |
| R2 mensaje | el rechazo contiene id, path, rango y líneas reales | pass |
| R3 salvamento | 12 refs con 1 irrecuperable → 11 vivas + incertidumbre con procedencia | pass |
| R3 suelo | sin evidencia viva → `no valid evidence survived` | pass |
| R4 fan-out | 3 ramas con una caída → 2 válidas + `dropped`; 4 ramas → rechazo; 1 resultado → reporte pelado | pass |
| R5 contador | 2 fallos totales cortan el tercero; 2 rangos pasados no cortan nada | pass |
| R6 prosa | `orchestrator.md` **−2 bytes**, `ein-scout.md` **−4 bytes** | pass |

## Comportamiento observable: la evidencia real

La prueba que importa. Los dos reportes que el contrato viejo destruyó, contra
el repo real:

```
528cd37a  ACEPTADO  refs 10/10  findings  8/8  recortada R6 -> 82
bd430b75  ACEPTADO  refs 12/12  findings 10/10  recortada R7 -> 100
```

Antes: 0 de 22 referencias entregadas, dos veces, ~103 s y ~0,023 $ tirados, y la
investigación cortada como "incidente de infraestructura".
Ahora: 22 de 22 entregadas, con dos finales de rango recortados.

## Desviación declarada

R3.4 (podar referencias huérfanas sobrevenidas) se retiró: es **imposible por
construcción**, no una tarea pendiente. Un finding solo cae cuando mueren todas
sus referencias, así que una referencia viva siempre mantiene vivo a su finding.
Se detectó al no poder poner el test en rojo; el filtro que lo implementaba era
código muerto. El test se sustituyó por el invariante que lo hace imposible.

## Riesgo que queda en pie

El clamp acepta un final de rango inflado por el modelo. Asumido y acotado:
`startLine`, la existencia del fichero, la no-fuga del root y los symlinks siguen
verificados, y el recorte viaja declarado. Condición de retirada escrita en
`scout-contract.ts`: cuando el runtime devuelva el rango leído por el propio
`read` y la cita deje de ser un número escrito a mano.
