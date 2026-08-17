---
title: "Overview"
description: "Qué es EIN, qué problema resuelve y para quién está pensado."
sources: ["README.md", "docs/roadmap-features-ein.md", "ein-pi/core/docs/EIN_OPERATING_SYSTEM.md"]
verified_rev: "29861f5"
---

EIN es un **harness de coding-agent**: una capa de disciplina que se instala
encima de un agente de programación y le impone una forma de trabajar.

No es un agente. No es un modelo. Es lo que rodea al agente para que el trabajo
salga en piezas pequeñas, verificadas y explicadas, en lugar de en un volcado de
código que nadie revisa.

Hoy se despliega sobre dos runtimes: **Pi Coding Agent** y **Claude Code**.

## El problema

Pides a un agente "arregla el login". Entiende algo, toca ocho ficheros y
devuelve un diff de 400 líneas con un resumen optimista. Puede que funcione.
Revisarlo cuesta más que haberlo escrito.

Y cuando cierras la conversación, el razonamiento se va con ella: por qué se
eligió ese enfoque, qué se descartó, qué quedó a medias. Mañana, o en otro
runtime, empiezas de cero.

EIN ataca las dos cosas:

- **El tamaño del cambio.** El trabajo se parte en fases con un contrato cada
  una. Ninguna fase hace el trabajo de la siguiente.
- **La memoria.** El estado del cambio vive en disco, no en la conversación.
  Otra sesión, otra máquina u otro runtime lo retoman leyendo los artefactos.

## Cómo lo hace

Una cadena de siete fases, cada una ejecutada por un subagente con
responsabilidades acotadas:

```text
scope → map → design → tasks → apply → verify → close
```

Cada fase deja un artefacto en `openspec/changes/<cambio>/`. El coordinador
decide, enruta y explica; no escribe el código él mismo.

La parte incómoda, y deliberada: **hay comprobaciones que no dependen del
modelo**. Un guardrail determinista valida los artefactos, un gate controla qué
llega a git, y el estado de las fases lo calcula una herramienta, no una
opinión. Un modelo puede equivocarse al decir que algo está hecho; un comando
no.

## Aislamiento primero

EIN no toca tu instalación normal. Cada runtime tiene su casa separada:

| Runtime | Superficie EIN | Casa de EIN | Tu runtime vanilla |
| :--- | :--- | :--- | :--- |
| Pi Coding Agent | `pi-ein` | `~/.pi-ein/agent` | `pi` → `~/.pi/agent` |
| Claude Code | `cc-ein` | `~/.claude-ein` | `claude` → `~/.claude` |

Sigues teniendo `pi` y `claude` intactos. EIN entra por comandos explícitos, no
contaminando tu configuración.

## Para quién es

Para quien ya usa un agente de programación a diario y ha llegado al punto de no
fiarse del todo de lo que le devuelve. Si tu problema es que el agente escribe
poco código, EIN no ayuda: hace lo contrario, mete fricción a propósito.

Es útil cuando el cuello de botella es **revisar**, no producir.

## Qué no intenta resolver

- No sustituye la revisión humana. Reduce lo que hay que revisar de golpe.
- No garantiza que el código sea correcto. Garantiza que sabes qué se comprobó y
  qué no.
- No es portable a cualquier agente. Hoy son Pi y Claude Code, cada uno con su
  adaptador y con capacidades que **no son idénticas**.

## Estado

:::caution[BETA]
EIN está en beta. El registro honesto de qué está probado, qué no y qué puede
cambiar vive en [`docs/roadmap-features-ein.md`](https://github.com/samuhlo/ein-agent/blob/main/docs/roadmap-features-ein.md).
:::

La release vigente se publica en
[GitHub Releases](https://github.com/samuhlo/ein-agent/releases/latest).

## Siguiente

[Getting Started](/ein-agent/00-start/getting-started/) — instalar y comprobar
que funciona.
