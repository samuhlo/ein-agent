---
title: "SDD y OpenSpec"
description: "Por qué EIN trabaja por fases y por qué el estado del cambio vive en disco."
sources: ["openspec/specs/sdd-lifecycle/spec.md", "runtime/docs/SDD_ARTIFACT_GRAMMAR.md", "runtime/docs/GUIA_PI_WORKFLOW.md"]
verified_rev: "29861f5"
---

Dos cosas distintas que se usan juntas:

- **SDD** es el ciclo: siete fases, cada una con un contrato.
- **OpenSpec** es dónde vive el estado: un directorio por cambio, con un
  artefacto por fase.

## Por qué fases

Porque "arregla el login" y "arregla el login" pueden ser dos trabajos
completamente distintos, y no lo sabes hasta que alguien mira.

Las fases obligan a mirar antes de tocar:

```text
scope    qué entra y qué no
map      dónde vive eso en el código
design   qué se va a hacer y con qué criterios se sabrá si salió bien
tasks    el checklist ejecutable
apply    hacerlo
verify   comprobarlo contra el diseño, no contra la intención
close    condensarlo en algo revisable
```

Cada fase recibe lo de la anterior y no puede hacer su trabajo. `map` no
diseña. `design` no implementa. `verify` no arregla lo que encuentra: lo
reporta.

Suena rígido y esa es la idea. La alternativa es un agente que decide sobre la
marcha que ya ha entendido bastante y empieza a escribir.

## Por qué en disco y no en la conversación

Una conversación se cierra, se compacta o se pierde. Un directorio no.

```text
openspec/changes/fix-email-validation/
├── scope.md
├── map.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── summary.md
```

Eso permite tres cosas que la conversación no:

**Retomar.** Abres el proyecto mañana, en otra máquina o en el otro runtime, y
el estado está ahí. No hay que reconstruir nada.

**Comprobar de forma determinista.** El estado de la fase lo calcula una
herramienta leyendo ficheros:

```bash
ein-cc-sdd status
```

Si el agente cree que va por `apply` y el disco dice que falta `design.md`, gana
el disco. No es una opinión que se pueda negociar.

**Revisar la decisión, no solo el diff.** Dentro de seis meses, `design.md`
explica por qué se eligió ese enfoque y qué se descartó. El diff solo enseña el
resultado.

## Los artefactos no son notas

Son el contrato entre fases, y por eso tienen forma:

- `design.md` fija los **criterios de aceptación**.
- `verify-report.md` los responde uno a uno.
- `tasks.md` marca qué está hecho, y ese estado se lee, no se recuerda.

Si `design.md` no dice cómo se sabrá que el cambio salió bien, `verify` no tiene
contra qué verificar y el ciclo se convierte en teatro.

## Cuando el cambio no altera comportamiento

No todo cambio toca la especificación. Un refactor sin cambio observable, una
corrección de documentación o un ajuste de configuración no la tocan, y el
sistema exige decirlo explícitamente en vez de dejarlo ambiguo.

Es una declaración de una línea, y el guardrail no deja cerrar el cambio sin
ella.

## Qué pasa al cerrar

El cambio se mueve a `openspec/changes/archive/` con todo dentro. A partir de
ahí es **evidencia inmutable**: no se reescribe para que encaje con lo que se
sabe después.

Eso importa más de lo que parece. Un registro que se retoca cuando la historia
resulta incómoda deja de servir como registro.

## Siguiente

[Contexto](/ein-agent/01-concepts/context/) — por qué el contexto es el recurso
que de verdad escasea.
