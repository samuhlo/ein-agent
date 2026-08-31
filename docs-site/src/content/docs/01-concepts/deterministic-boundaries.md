---
title: "Límites deterministas"
description: "Qué decide un modelo, qué comprueba una herramienta y qué puede garantizar EIN de verdad."
sources: ["ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", "docs/roadmap.md"]
verified_rev: "29861f5"
---

Esta es la página más importante para saber de qué te puedes fiar.

Un modelo puede decirte que algo está hecho y equivocarse. No por mentir: porque
generar una frase plausible es exactamente lo que hace, y "los tests pasan" es
una frase muy plausible.

EIN reparte el trabajo entre lo que decide un modelo y lo que comprueba un
comando. Saber dónde está la línea es saber qué significan sus afirmaciones.

## Las cuatro categorías

| | Quién responde | Ejemplo |
| :--- | :--- | :--- |
| **Decide el modelo** | juicio, sin verdad comprobable | qué enfoque tomar, cómo nombrar algo, qué es relevante |
| **Comprueba la herramienta** | un comando, con respuesta binaria | ¿existe el fichero? ¿pasan los tests? ¿en qué fase está el cambio? |
| **Garantiza EIN** | lo que el sistema impide, no lo que pide | el gate de entrega, el guardrail de artefactos, el aislamiento de runtimes |
| **Solo se observa** | se registra, no se asegura | que el código sea correcto, que la decisión fuera la mejor |

## Qué está en el lado determinista

Estas cosas no dependen de que el modelo tenga un buen día:

**El estado de las fases.** `ein-cc-sdd status` lee el disco. Si faltan
artefactos, lo dice, y el agente no puede afirmar lo contrario.

**La validación de artefactos.** Un guardrail comprueba que cada fase escribió
lo que debía y con la forma que debía. Un cambio no cierra sin su declaración de
spec delta, por ejemplo.

**El gate de entrega.** Push, PR y merge pasan por un control explícito. El
force-push está denegado siempre, sin excepción y sin forma de convencerlo.

**El aislamiento.** Que `pi` y `claude` sigan intactos no es una promesa del
agente: es que EIN vive en otros directorios.

## Qué NO está

Y aquí es donde conviene ser desconfiado:

**Que el código sea correcto.** Los tests comprueban lo que alguien pensó en
comprobar. Un test verde significa "esto que se comprobó, pasa", no "esto
funciona".

**Que la decisión de diseño fuera buena.** `design.md` registra la decisión y
sus alternativas. Que sea la acertada es juicio, y por eso es lo primero que
deberías revisar tú.

**Que el resumen sea una transcripción perfecta.** Un `summary.md` lo escribe
un modelo. El cierre comprueba que exista y sea posterior a apply/verify, y su
formato conserva los comandos ejecutados, pero sigue siendo una condensación.
Por eso se revisa antes de cerrar: después será el único registro duradero.

**Que un informe de subagente sea exacto.** Pasa que un informe cita una línea
que no dice eso, o da un recuento que no cuadra. Son datos plausibles en el
hueco donde debería haber uno verificado.

## La regla que se deriva de todo esto

:::tip[CÓMO LEER LO QUE TE DICE EIN]
Cuando EIN afirme algo, pregúntate si eso **lo comprobó un comando o lo concluyó
un modelo**. Si fue un comando, la salida está en el artefacto. Si fue un
modelo, es una hipótesis razonable y nada más.
:::

Los artefactos distinguen las dos cosas a propósito. `apply-progress.md` guarda
la salida real de los tests, no un "todos en verde". `verify-report.md` lista lo
que se comprobó **y lo que quedó fuera de cobertura**.

Esa segunda lista es la que más información tiene, y la que la mayoría de
sistemas no escriben.

## Por qué EIN no promete más

Sería fácil escribir aquí que EIN garantiza calidad. No lo hace, y decirlo sería
justo el tipo de afirmación que este sistema existe para evitar.

Lo que hace es más modesto y más útil: dejar por escrito qué se comprobó, con
qué salida y qué se quedó sin comprobar, para que la revisión humana sepa dónde
mirar.

## Siguiente

[Workflow](/ein-agent/02-workflow/workflow-overview/) — las siete fases en
detalle.
