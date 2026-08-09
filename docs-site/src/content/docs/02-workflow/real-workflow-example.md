---
title: "Ejemplo real"
description: "Un cambio de verdad de principio a fin, con lo que salió torcido incluido."
sources: ["openspec/changes/archive/docs-sync-contract/scope.md", "openspec/changes/archive/docs-sync-contract/design.md", "openspec/changes/archive/docs-sync-contract/apply-progress.md", "openspec/changes/archive/docs-sync-contract/verify-report.md", "openspec/changes/archive/docs-sync-contract/summary.md"]
verified_rev: "29861f5"
---

Un cambio real, archivado en este repositorio:
[`openspec/changes/archive/docs-sync-contract/`](https://github.com/samuhlo/ein-agent/tree/main/openspec/changes/archive/docs-sync-contract).

Lo cuento entero, con los errores intermedios. Una demo en la que todo sale a la
primera no enseña nada sobre cómo se siente esto.

## El punto de partida

Esta documentación tiene un contrato: cada página declara sus fuentes y en qué
commit se verificaron. Existía como texto dentro de un documento de diseño, y se
comprobaba con `grep` escritos a mano en cada fase y tirados después.

La petición fue: convertir ese contrato en algo ejecutable, y añadir un detector
que avise cuando una fuente cambia y la página se queda desfasada.

## scope — recortar antes de empezar

El plan original incluía además un generador de bloques automáticos. La fase lo
descartó por prematuro: generaría contenido dentro de páginas que todavía no
tenían contenido, solo marcadores.

Salió también un hallazgo incómodo: `openspec/config.yaml` declaraba que el
proyecto no tenía runner de tests. Falso — hay 94 ficheros de test y `bun test`
funciona. Esa mentira había hecho que dos cambios anteriores declararan TDD
inaplicable con razón aparente.

## map — un filtro que era falso

La fase mapeó cada regla a una función. Y propuso un filtro para detectar prosa
residual usando el patrón `^- [../` para los ítems de fuentes.

Ese patrón no existe en las páginas: el formato real es `` - `ruta` — texto ``.
El filtro habría fallado sobre páginas correctas desde el primer test.

## design — el problema estaba en el contrato

Aquí la fase hizo lo que se espera de ella: comprobar sobre las 21 páginas en
vez de sobre una muestra. Y encontró que **los defectos estaban en el contrato
tal como estaba escrito, no en las páginas**.

Uno de ellos era de fondo. La regla de pureza —una página en estado esqueleto no
puede tener prosa— se evaluaba por página. Eso funcionaba mientras todas fueran
esqueletos, y habría rechazado las 21 en cuanto alguien empezara a redactar.

La solución: **evaluarla por sección**, con el marcador pendiente como
interruptor. Una sección que aún lo tiene debe seguir sin prosa; una ya
redactada queda fuera de la regla.

## apply — TDD de verdad, y un hallazgo

Siete lotes en ciclos RED/GREEN reales. Y al correr el validador terminado
contra las 21 páginas, apareció esto:

```text
04-reference/cli.md: CT4_SOURCE_NOT_IN_FRONTMATTER@46
 36 pass, 1 fail
```

Una página citaba una fuente en un bloque sin declararla en su frontmatter.
Incumplía el contrato.

**Los dos cambios anteriores habían cerrado con verificación en verde sin
detectarlo.** Uno con 19 criterios, otro con 23. Sus comprobaciones eran
comandos escritos a mano, y ninguna cruzaba las fuentes citadas contra las
declaradas — nadie escribe ese `grep` salvo que se le ocurra pensarlo.

La fase no relajó la regla para que pasara. Reportó el defecto y siguió.

## Y un test que estaba mal planteado

Otro lote había escrito un test que comprobaba `git status --porcelain` para
asegurar que el validador no modificaba ficheros. Intención correcta,
implementación mala: fallaría ante cualquier cambio sin commitear, que es lo
normal mientras se trabaja.

Se sustituyó por una comprobación del comportamiento real —que los `mtime` de
las 21 páginas no cambian al invocar el validador— con su propio ciclo RED
provocado.

## verify — comprobar en vez de convalidar

La fase ejecutó los comandos por su cuenta en lugar de aceptar el informe de
`apply`. 49 tests en verde, y dictamen sobre cada punto abierto.

## Lo que quedó abierto, escrito como tal

El `summary.md` no dice "terminado". Dice qué falta:

- Nueve páginas afirman haber verificado sus fuentes en un commit donde una de
  ellas todavía no existía. Hallazgo real, sin corregir.
- El generador de bloques sigue fuera, pendiente de que haya prosa.
- Una parte del contrato no es comprobable por comando y se declara fuera de
  cobertura en vez de fingirla.

## El resultado

El detector, corriendo sobre esta misma documentación:

```text
Drift de fuentes de docs-site: 5 clean, 16 drifted, 0 unknown (de 21 páginas).

DRIFTED (fuentes cambiaron desde verified_rev):
  - 00-start/overview.md (verified_rev=0ae709d):
      modified README.md (+12/-9)
      modified docs/roadmap-beta.md (+173/-121)
```

Nadie tuvo que acordarse de nada. La rama se puso al día, y el sistema dijo qué
páginas dejaron de ser de fiar y por qué.

## Qué demuestra esto

No que EIN evite los errores: hubo un filtro falso, un test mal planteado y una
configuración que mentía.

Lo que demuestra es que **los errores salieron a la superficie en la fase
siguiente**, con evidencia y por escrito, en vez de llegar al diff. Que es
exactamente para lo que existe la cadena.

## Siguiente

[Runtimes](/ein-agent/03-runtimes/runtime-overview/) — Pi, Claude Code y en qué
se diferencian.
