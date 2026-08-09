---
title: "Las siete fases"
description: "Qué hace cada fase, qué recibe, qué produce y qué tiene prohibido hacer."
sources: ["openspec/specs/sdd-lifecycle/spec.md", "ein-pi/core/docs/GUIA_PI_WORKFLOW.md"]
verified_rev: "29861f5"
---

```text
scope → map → design → tasks → apply → verify → close
```

Cada fase la ejecuta un subagente distinto. Lo que define a cada una no es solo
lo que hace: es **lo que tiene prohibido hacer**. Sin esa prohibición, la
primera fase con contexto suficiente se lleva por delante a las demás.

## scope

Acota. Qué entra, qué no, y con qué presupuesto se trabaja.

Es también donde se detectan las capacidades del proyecto: qué runner de tests
hay, qué comandos de calidad existen. Y donde se declara si el cambio altera
comportamiento observable o no.

**Prohibido:** explorar el repositorio entero "para entenderlo", implementar
nada, tocar tests.

Si el alcance viene sin acotar —"refactoriza el proyecto"— no lo acepta:
recomienda partirlo en trozos.

## map

Localiza. Dónde vive el código que hay que tocar, qué lo llama, qué se rompe si
cambia.

Aquí es donde salen los conflictos entre fuentes: dos ficheros que dicen cosas
distintas sobre lo mismo, documentación que ya no coincide con el código. Se
declara cuál manda y por qué.

**Prohibido:** escribir código, aunque sea una línea. Su única salida es
`map.md`.

## design

Decide. Qué se va a hacer, qué alternativas se descartaron y **con qué criterios
se sabrá si salió bien**.

Esa última parte es la que hace útil la fase. Un diseño sin criterios de
aceptación deja a `verify` sin nada contra qué verificar.

**Prohibido:** implementar. Y cambiar el alcance por su cuenta: si el diseño
revela que el trabajo es el doble, se dice, no se asume.

## tasks

Convierte el diseño en un checklist ejecutable, agrupado en lotes con
dependencias explícitas.

Cada tarea lleva su comando de verificación. Si `apply` tiene que adivinar cómo
comprobar algo, no lo comprueba.

**Prohibido:** rediseñar. Si un criterio del diseño no es comprobable tal como
está escrito, se reformula aquí **dejando constancia** de que sustituye al
original.

## apply

Implementa, lote a lote.

Con runner de tests, en ciclos: escribir el test, verlo fallar por la razón
correcta, implementar, verlo pasar. La salida real de cada ejecución queda
registrada — no un "todos en verde", la salida.

**Prohibido:** fabricar salidas de tests que no se ejecutaron, relajar una regla
del contrato para que el código encaje, y salirse de la superficie de escritura
declarada.

Si se queda sin presupuesto, para y devuelve dónde llegó. No acelera saltándose
comprobaciones.

## verify

Comprueba la implementación contra el **diseño**, no contra la intención.

Ejecuta los comandos por su cuenta en lugar de fiarse de lo que `apply` diga
haber ejecutado. Y cuando un criterio no es comprobable por comando, lo dice en
vez de darlo por bueno.

**Prohibido:** arreglar lo que encuentra. Lo reporta con evidencia y criterio
incumplido; arreglarlo es otra pasada.

## close

Condensa el cambio en un `summary.md` revisable: qué se hizo, qué se decidió,
qué quedó abierto.

**Prohibido:** afirmar que algo está desplegado, publicado o terminado si no lo
está. Un resumen que envejece mal es peor que no tenerlo.

## El estado no se recuerda, se consulta

En cualquier momento:

```bash
cc-ein-sdd status     # en qué fase va y qué falta
cc-ein-sdd check      # valida los artefactos presentes
```

Lo calculan leyendo el disco. El agente no puede afirmar que va por `apply` si
`design.md` no existe.

## Siguiente

[Artefactos](/ein-agent/02-workflow/artifacts/) — qué problema resuelve cada
fichero.
