---
title: "Carriles del flujo SDD"
description: "Qué fases componen los carriles standard y micro y cómo se persisten por cambio."
sources: ["openspec/specs/sdd-lifecycle/spec.md", "runtime/docs/GUIA_PI_WORKFLOW.md"]
verified_rev: "29861f5"
---

El flujo SDD ofrece dos carriles que se declaran para cada cambio. `standard`
proporciona el recorrido completo; `micro` reduce la preparación cuando el
cambio no necesita mapear el repositorio ni desglosar tareas.

## Carril `standard`

El carril `standard` recorre todas las fases del cambio:

```text
scope → map → design → tasks → apply → verify → close
```

Usa `standard` cuando el cambio necesita localizar sus superficies, resolver
conflictos entre fuentes y convertir el diseño en un checklist ejecutable.

## Carril `micro`

El carril `micro` recorre las fases siguientes:

```text
scope → design → apply → verify → close
```

`micro` omite únicamente `map` y `tasks`. Conserva `scope`, `design`, `apply`,
`verify` y `close`; no elimina la verificación ni el cierre del cambio.

## Persistencia por cambio

El carril y la postura TDD se persisten por cambio. Pi y Claude consultan esa
decisión en los artefactos del cambio actual: no se hereda entre cambios ni se
infiere por el tamaño, el contenido o el runtime que lo ejecuta.

La postura TDD determina cómo se realiza `apply`. Con TDD activa y un runner
disponible, el trabajo sigue ciclos RED, GREEN, TRIANGULATE y REFACTOR; con otra
postura, se aplica la verificación que el cambio haya declarado.

## Responsabilidades de las fases

Las fases explican responsabilidades concretas y solo aparecen cuando el
carril del cambio las incluye.

### scope

Acota qué entra, qué no y con qué presupuesto se trabaja. También detecta las
capacidades del proyecto —como el runner de tests y los comandos de calidad— y
declara si el cambio altera comportamiento observable.

**Prohibido:** explorar el repositorio entero "para entenderlo", implementar
nada o tocar tests.

Si el alcance viene sin acotar —"refactoriza el proyecto"— no lo acepta:
recomienda partirlo en trozos.

### map

Localiza dónde vive el código que hay que tocar, qué lo llama y qué se rompe si
cambia. También identifica conflictos entre fuentes y declara cuál manda y por
qué.

**Prohibido:** escribir código, aunque sea una línea. Su única salida es
`map.md`.

### design

Decide qué se va a hacer, qué alternativas se descartan y **con qué criterios
se sabrá si salió bien**. Un diseño sin criterios de aceptación deja a `verify`
sin nada contra qué verificar.

**Prohibido:** implementar o cambiar el alcance por su cuenta. Si el diseño
revela que el trabajo es el doble, se dice, no se asume.

### tasks

Convierte el diseño en un checklist ejecutable, agrupado en lotes con
dependencias explícitas. Cada tarea lleva su comando de verificación.

**Prohibido:** rediseñar. Si un criterio del diseño no es comprobable tal como
está escrito, se reformula aquí **dejando constancia** de que sustituye al
original.

### apply

Implementa, lote a lote. La salida real de cada ejecución queda registrada; no
se fabrica un "todos en verde" sin evidencia.

**Prohibido:** fabricar salidas de tests que no se ejecutaron, relajar una regla
del contrato para que el código encaje o salirse de la superficie de escritura
declarada.

Si se queda sin presupuesto, para y devuelve dónde llegó. No acelera saltándose
comprobaciones.

### verify

Comprueba la implementación contra el **diseño**, no contra la intención.
Ejecuta los comandos por su cuenta en lugar de fiarse de lo que `apply` diga
haber ejecutado. Cuando un criterio no es comprobable por comando, lo dice en
vez de darlo por bueno.

**Prohibido:** arreglar lo que encuentra. Lo reporta con evidencia y criterio
incumplido; arreglarlo es otra pasada.

### close

Condensa el cambio en un `summary.md` revisable: qué se hizo, qué se decidió y
qué quedó abierto.

**Prohibido:** afirmar que algo está desplegado, publicado o terminado si no lo
está. Un resumen que envejece mal es peor que no tenerlo.

## El estado no se recuerda, se consulta

En cualquier momento:

```bash
ein-cc-sdd status     # en qué fase va y qué falta
ein-cc-sdd check      # valida los artefactos presentes
```

Lo calculan leyendo el disco. El agente no puede afirmar que va por `apply` si
`design.md` no existe.

## Siguiente

[Artefactos](/ein-agent/02-workflow/artifacts/) — qué problema resuelve cada
fichero.
