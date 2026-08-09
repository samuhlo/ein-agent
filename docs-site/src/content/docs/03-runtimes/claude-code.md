---
title: "Claude Code"
description: "Cómo usar EIN con Claude Code, y qué no se traslada exactamente desde Pi."
sources: ["README.md", "cc-ein/README.md", "openspec/changes/archive/core-parity/verify-report.md"]
verified_rev: "29861f5"
---

El adaptador `cc-ein` traduce el núcleo de EIN a lo que Claude Code entiende.

## Instalar y abrir

```bash
ein install --runtime claude
cc-ein
```

`cc-ein` exporta `CLAUDE_CONFIG_DIR` apuntando a `~/.claude-ein` y antepone
`~/.claude-ein/bin` al `PATH`, **solo para esa invocación**. Tu `claude` normal
sigue usando `~/.claude`.

## El flujo SDD se conduce por CLI

Es la diferencia más visible respecto a Pi. Aquí las comprobaciones
deterministas van por un binario:

```bash
cc-ein-sdd status [cambio]     # en qué fase va y qué falta
cc-ein-sdd check  [cambio]     # valida los artefactos presentes
cc-ein-sdd close  <cambio>     # archiva un cambio verificado
```

Ese binario se compila durante la sincronización del adaptador y vive en
`~/.claude-ein/bin`.

:::caution[OJO CON EL BINARIO]
Está **compilado**, no interpretado. Si cambias el código de los guardrails en
el repositorio, el binario instalado sigue con la versión anterior hasta que
vuelvas a sincronizar con `bun cc-ein/sync.ts`.
:::

## Sincronizar el adaptador

```bash
bun cc-ein/sync.ts          # sincroniza
bun cc-ein/sync.ts --dry    # enseña qué haría
```

Genera el `CLAUDE.md` del adaptador a partir de dos fuentes —la política
compartida y la adaptación específica de Claude—, traduce los agentes, copia las
skills y compila el CLI.

Por eso `cc-ein/CLAUDE.md` es **salida generada**: editarlo a mano se pierde en
la siguiente sincronización. Se edita la adaptación o la fuente compartida.

## El gate de shell

Un hook intercepta cada llamada a shell y decide sobre los subcomandos de git,
con precedencia fija `deny → confirm → allow`:

| | |
| :--- | :--- |
| **Permitido** | `status`, `diff`, `log`; `add`, `commit`, `branch` sin flags peligrosos |
| **Pide confirmación** | `push`, `rebase`, `branch -D`, `npm publish` |
| **Denegado siempre** | `push --force`, `reset --hard`, `clean -fd`, `rm -rf /` |

Su límite conocido, y conviene saberlo: el hook intercepta **comandos de
shell**. No fuerza que la escritura de ficheros pase por los subagentes, ni
intercepta las ediciones directas.

## Huecos honestos frente a Pi

No son equivalentes, y estos son los que se conocen:

**La inyección de skills no es 1:1.** El mecanismo de skills de Pi y el de
Claude Code son distintos, así que la traducción es aproximada por diseño.

**La traducción de herramientas es best-effort.** El sincronizador sustituye un
conjunto acotado de referencias; una herramienta específica de Pi que no conozca
llega tal cual a Claude Code, donde no existe, y no falla ruidosamente.

**El enrutado de modelos está declarado a mano.** Coincide con los agentes
actuales; un agente nuevo no obtiene enrutado automáticamente ni avisa.

**El MCP externo no está verificado en vivo.** La evidencia archivada de la
paridad entre runtimes registra explícitamente que la configuración MCP opcional
de Claude no se ejercitó contra servicios reales. Está soportada, no
demostrada.

## Siguiente

[Matriz de runtimes](/ein-agent/03-runtimes/runtime-matrix/) — la comparación,
solo con lo que se puede defender.
