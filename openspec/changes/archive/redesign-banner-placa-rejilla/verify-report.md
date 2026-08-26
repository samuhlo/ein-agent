# Verify Report: redesign-banner-placa-rejilla

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Scope and coverage

- Verificado solo lo declarado: la geometría del banner (`ein-banner.ts`), la
  sección `grid` del módulo puro (`banner-panel.ts`), el corte `compact` sin
  patas (`ein-tv.ts`) y la elección de corte en las otras dos superficies
  (`terminal-splash.ts`, `installer/src/tui/banner.ts`).
- Los cuatro requisitos de `design.md // B` quedan cubiertos: ancho invariante de
  la rejilla, numeración y sangría por mitad, aparato rectangular en todos los
  cortes salvo `full`, y la placa cediendo a la forma apilada antes que recortar.
- `spec_delta: none` declarado y aceptado: no hay base canónico que sincronizar.
- Carril micro: `map.md` y `tasks.md` ausentes por diseño. `apply-progress.md`
  reporta `complete`.

## Independent focused command plan

1. `bun test ./tests/banner-panel.test.ts ./tests/ein-tv.test.ts`
   - seams: ancho de la rejilla, numeración izquierda-derecha, sangría por
     mitad, columna corta, valor desbordado, cortes sin antena ni patas
   - resultado: PASS, 39 tests, 258 expect calls

2. Medición de geometría con los módulos reales (`renderTv` + `renderPanel`) de
   120 a 40 columnas.
   - seams: 30 filas × 62 columnas de 66 columnas en adelante; placa activa
     hasta 59; apilado por debajo; ninguna anchura desborda su terminal
   - resultado: PASS

## Global-check disposition and results

| comando normalizado | rol / origen | resultado |
|---|---|---|
| `bun test` | unit + integration; raíz | 2418 pass, 1 fail, 10113 expect calls |
| `bun run typecheck` | typecheck raíz (ein-pi + cc-ein) | PASS |
| `(cd installer && bun run typecheck)` | typecheck instalador | PASS |

## Fallo preexistente, ajeno al cambio

`tests/mode.test.ts > inspectMode records a known default when both authorities
are missing` falla en `main` y sigue fallando aquí. `ein-pi/agent/lib/mode.ts`
no está modificado en el árbol y su grafo de imports (`./lang.ts`, `node:fs`,
`node:os`, `node:path`, el SDK de Pi) no toca ninguno de los cinco ficheros de
este cambio. No se arregla aquí: es otro trabajo.

## Residual risks

- Un valor de la rejilla tiene 18 columnas antes de recortarse, no 49. Hoy caben
  todos (`preguntar` es el más largo). Un modo o una persona con nombre largo se
  recortaría antes que ahora.
- El splash de Pi y el banner del instalador también pierden antena y patas. Es
  deliberado — el aparato es una sola marca — pero es un cambio visible fuera del
  banner que originó el encargo.
