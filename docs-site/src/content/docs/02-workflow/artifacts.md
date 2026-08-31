---
title: "Artefactos"
description: "Qué problema resuelve cada fichero de un cambio y cuál deberías leer tú."
sources: ["ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md", "openspec/specs/sdd-lifecycle/spec.md"]
verified_rev: "29861f5"
---

Un cambio es un directorio en `openspec/changes/<nombre>/`. Cada fase deja
dentro un fichero, y cada fichero existe para resolver un problema concreto.

```text
scope.md            ──►  ¿qué entra y qué no?
map.md              ──►  ¿dónde vive y qué se rompe?
design.md           ──►  ¿qué se hace y cómo sabremos si salió bien?
tasks.md            ──►  ¿en qué orden y con qué comprobación?
apply-progress.md   ──►  ¿qué se hizo y qué devolvieron los tests?
verify-report.md    ──►  ¿qué se comprobó y qué NO?
summary.md          ──►  ¿qué le cuento a quien lo lea en seis meses?
```

## scope.md

Fija los límites. Sin él, cada fase decide por su cuenta qué es "el cambio" y el
alcance crece sin que nadie lo note.

Lleva también el presupuesto que la cadena propaga entre fases, y la declaración
de si el cambio altera comportamiento observable.

## map.md

Evita que `design` decida a ciegas. Localiza el código, los símbolos que lo
tocan y lo que se rompe si cambia.

Es donde se resuelven los conflictos entre fuentes: si dos ficheros describen lo
mismo de forma distinta, aquí se declara cuál manda.

## design.md

**El más importante para ti.** Contiene la decisión: qué se va a hacer, qué se
descartó y por qué.

Y los criterios de aceptación, que son el contrato con `verify`. Escritos como
comandos siempre que se pueda:

```text
1. Existen 10 ficheros bajo docs-site/src/content/docs/ y ninguno más.
2. Cada uno tiene las cuatro claves de frontmatter en orden.
3. Cada ruta declarada en `sources` existe en el repositorio.
```

Un criterio que dependa de juicio editorial no sirve: `verify` no puede
responderlo sin opinar.

## tasks.md

El checklist ejecutable, en lotes con dependencias. Cada tarea lleva su comando
de comprobación.

El estado de las casillas se lee del fichero, no se recuerda. Por eso
`ein-cc-sdd status` puede decirte cuántas quedan sin preguntarle a nadie.

## apply-progress.md

La crónica de la implementación, con **la salida real** de cada ejecución de
tests. No "los tests pasan": la salida.

```text
✗ rechaza direcciones sin dominio    (fail)
 36 pass, 1 fail
→ implementación
 37 pass, 0 fail
```

Si el proyecto no tiene runner, se declara aquí explícitamente en lugar de
fingir un ciclo que no existe.

## verify-report.md

Responde los criterios del diseño uno a uno. Y tiene una sección que suele ser
la más informativa: **lo que quedó fuera de cobertura**.

Un criterio que no se puede comprobar por comando se declara como tal en vez de
darlo por bueno. Eso es lo que separa una verificación de un visto bueno.

## summary.md

El resumen de cierre. Qué se hizo, cómo funciona por dentro, qué se decidió y
qué queda abierto.

Es lo que alguien leerá dentro de seis meses. Lo escribe un modelo, así que es
una condensación, no una transcripción. Mientras el cambio está activo se puede
contrastar con los demás artefactos; después del cierre se convierte en el
registro permanente del cambio.

## Al archivar

Solo `summary.md` se mueve a `openspec/changes/archive/<nombre>/`. El resto son
papeles de trabajo y se elimina. El resumen archivado debe bastar para entender
el resultado, el mecanismo, las decisiones, las comprobaciones y los riesgos.

## Qué leer tú, y en qué orden

Mientras está activo:

1. **`design.md`** — la decisión. Si el enfoque está mal, el resto da igual.
2. **El diff.**
3. **`verify-report.md`**, y en concreto lo que dice que no comprobó.

`map.md` y `apply-progress.md` son para cuando algo no cuadra y hay que
reconstruir por qué.

Cuando ya está cerrado, lee `summary.md`: es la única pieza histórica que se
mantiene deliberadamente.

## Siguiente

[Ejemplo real](/ein-agent/02-workflow/real-workflow-example/) — un cambio de
verdad, con sus artefactos.
