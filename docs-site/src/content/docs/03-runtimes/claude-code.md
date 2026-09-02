---
title: "Claude Code"
description: "Cómo usar EIN con Claude Code, y qué no se traslada exactamente desde Pi."
sources: ["README.md", "ein-cc/README.md", "openspec/changes/archive/core-parity/summary.md"]
verified_rev: "eeceb7c"
---

Pi es el núcleo de EIN. Claude Code actúa como relevo opcional para continuar un cambio cuando conviene, pero no es una instalación alternativa, una copia de la sesión de Pi ni ofrece las mismas superficies.

## Instalar y abrir

```bash
ein-install install --runtime both       # instala Ein y añade Claude
ein                         # entrada normal
ein-cc                      # acceso directo avanzado
```

`ein-cc` exporta `CLAUDE_CONFIG_DIR` apuntando a `~/.claude-ein` y antepone
`~/.claude-ein/bin` al `PATH`, **solo para esa invocación**. Tu `claude` normal
sigue usando `~/.claude`.

## Pi como referencia y Claude como relevo

La continuidad entre runtimes es bidireccional: un cambio puede pasar de Pi a
Claude y de Claude a Pi. El puente es el estado y el checkpoint del proyecto,
persistidos en disco, para que el siguiente runtime retome las decisiones y el
punto del cambio que están registrados allí.

Ese checkpoint no recupera el historial privado de la sesión anterior ni hace
que las conversaciones, las skills, las herramientas o los servicios MCP sean
compartidos. Continuar el mismo proyecto demuestra continuidad de estado, no
paridad entre runtimes.

:::note
Antes de cambiar de runtime, consulta y deja actualizado el estado del cambio
en disco. Claude y Pi pueden leer ese estado sin depender del contexto de la
conversación que quedó atrás.
::

## El flujo SDD se conduce por CLI

Es la diferencia más visible respecto a Pi. Aquí las comprobaciones
deterministas van por un binario:

```bash
ein-cc-sdd status [cambio]     # en qué fase va y qué falta
ein-cc-sdd check  [cambio]     # valida los artefactos presentes
ein-cc-sdd close  <cambio>     # archiva un cambio verificado
```

Ese binario se compila durante la sincronización del adaptador y vive en
`~/.claude-ein/bin`.

En Claude, las superficies `/ein:status` y `/ein:settings` permiten consultar
el estado de EIN y revisar sus ajustes desde la sesión. Estas superficies no
convierten a Claude en Pi: el relevo sigue dependiendo del estado/checkpoint
persistido en disco.

:::caution[OJO CON EL BINARIO]
Está **compilado**, no interpretado. Si cambias el código de los guardrails en
el repositorio, el binario instalado sigue con la versión anterior hasta que
vuelvas a sincronizar con `bun ein-cc/sync.ts`.
::

## Sincronizar el adaptador

```bash
bun ein-cc/sync.ts          # sincroniza
bun ein-cc/sync.ts --dry    # enseña qué haría
```

Genera el `CLAUDE.md` del adaptador a partir de dos fuentes —la política
compartida y la adaptación específica de Claude—, traduce los agentes, copia
las skills y compila el CLI.

Por eso `ein-cc/CLAUDE.md` es **salida generada**: editarlo a mano se pierde en
la siguiente sincronización. Se edita la adaptación o la fuente compartida.

## Frontera Pi-first: Cleaner y Architect

Cleaner y Architect participan automáticamente solo en Pi: son perfiles
**Pi-only**. En Claude, esa participación está deliberadamente ausente o
desactivada; una directiva para esos perfiles se reporta como `no aplicable` o
`no soportada`, no como una ejecución automática.

## Huecos honestos frente a Pi

Pi y Claude no son equivalentes, y estos son los límites conocidos:

**La inyección de skills no es 1:1.** El mecanismo de skills de Pi y el de
Claude Code son distintos, así que la traducción es aproximada por diseño.

**La traducción de herramientas es best-effort.** El sincronizador sustituye un
conjunto acotado de referencias; una herramienta específica de Pi que no conozca
llega tal cual a Claude Code, donde no existe, y no falla ruidosamente.

**El enrutado de modelos está declarado a mano y falla cerrado.** El
coordinador, scope, design y tasks usan Opus con esfuerzo alto. Map, verify,
close y entrega usan Haiku; apply usa Sonnet con esfuerzo bajo. Un agente nuevo
sin ruta hace fallar la sincronización en vez de heredar un modelo por azar.

**El MCP externo no está verificado en vivo.** La evidencia archivada de la
paridad entre runtimes registra explícitamente que la configuración MCP opcional
de Claude no se ejercitó contra servicios reales. Está soportada, no
demostrada.

## Siguiente

[Matriz de runtimes](/ein-agent/03-runtimes/runtime-matrix/) — la comparación,
solo con lo que se puede defender.
