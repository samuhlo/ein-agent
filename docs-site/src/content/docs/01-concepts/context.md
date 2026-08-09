---
title: "Contexto"
description: "Por qué el contexto es el recurso que escasea y cómo lo administra EIN."
sources: ["ein-pi/agent/assets/orchestrator.md", "openspec/specs/scout-routing/spec.md"]
verified_rev: "29861f5"
---

El contexto es lo que el agente tiene delante cuando piensa: tu petición, lo que
ha leído, lo que lleva hecho. Es finito, y se gasta.

Y no se gasta solo en tokens. Se gasta en **atención**: cuanto más ruido hay
dentro, peor razona el modelo sobre lo que sí importa.

## El vocabulario mínimo

| Término | Qué es |
| :--- | :--- |
| **Ventana de contexto** | el total que cabe |
| `max_tokens` | el presupuesto que una fase tiene asignado |
| `max_reads` | cuántos ficheros puede leer antes de parar |
| **fresh** | arrancar a un subagente limpio, solo con su encargo |
| **fork** | arrancarlo heredando toda la conversación del padre |

## fresh o fork: la decisión que más cuesta

Cuando el orquestador delega, elige una de las dos. Y la intuición engaña.

**`fork` hereda la conversación entera.** En una sesión larga, eso arrastra
cientos de miles de tokens al hijo. Un commit trivial delegado con `fork` llegó
a medir 382k tokens de entrada por esa vía.

**`fresh` arranca en unos 2000 tokens** más el encargo.

La regla práctica: si el subagente puede averiguar lo que necesita por su cuenta
—mirando git, leyendo ficheros, consultando el estado— va `fresh`. Entrega,
revisión de diffs, auditorías: todas `fresh`. Solo se usa `fork` cuando el hijo
necesita de verdad el hilo de la conversación, y aun así solo si la sesión es
corta.

:::caution[CONTRAINTUITIVO]
Delegar en un modelo más barato **no abarata la ejecución** si lo arrancas con
`fork`. El coste dominante es el contexto que le metes, no el precio por token.
Un modelo barato con 382k tokens de entrada sale más caro que uno bueno con
2000.
:::

## Por qué hay presupuestos por fase

Cada fase recibe `max_tokens` y `max_reads`. No es burocracia: es lo que impide
que una fase de exploración se lea el repositorio entero "para entenderlo".

Leerlo entero suena a diligencia y no lo es. Produce un contexto lleno de
ficheros que no vienen al caso, y un mapa peor que si se hubiera buscado con
criterio. La instrucción es explorar por estructura primero —listar, buscar
símbolos— y leer completo solo lo que está dentro del alcance.

Cuando una fase se queda sin presupuesto, **para y lo dice**. No acelera
saltándose comprobaciones para llegar al final.

## Alcance sin acotar

Si le pides a EIN "refactoriza el proyecto entero", la fase de exploración no lo
intenta. Devuelve una recomendación de partirlo en trozos acotados, uno por
cambio.

No es pereza: un mapa de todo el repositorio no cabe en ninguna ventana útil, y
el resultado sería un resumen inútil de todo en vez de un mapa preciso de algo.

## Cómo se nota esto usándolo

En que las fases devuelven sobres cortos. Un subagente que ha hecho un trabajo
de 300 líneas de artefacto vuelve con cinco líneas: qué hizo, dónde lo dejó, qué
riesgos ve.

El detalle está en el fichero. Si el orquestador lo necesita, lo lee del disco;
si no, no lo carga. Un sobre gordo por fase llena la conversación del
coordinador en tres delegaciones, y a partir de ahí coordina peor.

## Siguiente

[Límites deterministas](/ein-agent/01-concepts/deterministic-boundaries/) — qué
decide un modelo y qué comprueba una herramienta.
