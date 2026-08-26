# Verify Report: redesign-launcher-installer-shell

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Scope and coverage

- Verificado lo declarado: la composición de la marca, la cabecera de la portada,
  el agrupado del dashboard, la placa del instalador y las opciones de runtime.
- Los cuatro requisitos de `design.md // B` quedan cubiertos por contratos que se
  ejecutan: placa como líneas medibles con caída a apilado, contexto que omite la
  línea del cambio cuando no hay cambio, filas y atajos intactos tras el
  agrupado, y etiquetas sin ANSI con pistas que nombran el launcher.
- `spec_delta: none` declarado y aceptado.
- Carril micro: `map.md` y `tasks.md` ausentes por diseño. `apply-progress.md`
  reporta `complete` con la evidencia RED/GREEN/TRIANGULATE/REFACTOR.

## Independent focused command plan

1. `bun test ./tests/ein-tv.test.ts ./tests/terminal-chrome.test.ts ./tests/terminal-app.test.ts ./tests/installer-runtime-options.test.ts`
   - seams: composición de la placa y su caída a apilado; ancho invariante del
     chrome; contexto con y sin cambio activo; umbral de altura de la portada;
     filas y atajos del dashboard; opciones de runtime sin color propio
   - resultado: PASS, 123 tests

2. Render de la portada con los módulos reales a 40 y a 24 filas.
   - seams: la placa aparece con altura y desaparece sin ella; el contexto se
     queda en los dos casos; ninguna línea desborda
   - resultado: PASS

## Global-check disposition and results

| comando normalizado | rol / origen | resultado |
|---|---|---|
| `bun test` | unit + integration; raíz | 2501 pass, 15 fail, 10 errors |
| `bun run typecheck` | typecheck raíz (ein-pi + cc-ein) | PASS |
| `(cd installer && bun run typecheck)` | typecheck instalador | PASS |

## Fallos preexistentes, ajenos al cambio

Los 15 fallos y 10 errores son EXACTAMENTE los de `origin/main` sin tocar:
lista capturada antes y después con `git stash`, comparada con `diff`, idéntica.
Vienen de suites que piden el template empaquetado (`installer/assets/template.tar.gz`),
que solo existe tras un build completo del binario de la app. No se arreglan
aquí: es otro trabajo, y arreglarlo obliga a construir.

## Residual risks

- La portada de `ein` no conoce su versión: el modelo de la app no la lleva, así
  que la placa muestra el lema sin la línea de versiones. Cablearla obliga a
  tocar el controlador y sus puertos, y eso es otro cambio.
- El umbral de 34 filas es un número elegido: por debajo el aparato desaparece de
  la portada. Es la decisión correcta para no ahogar el menú, pero es un salto
  visible al redimensionar la ventana.
- `installer/src/cli/runtime-prompt.ts` y `installer/src/tui/banner.ts` siguen sin
  poder ejecutarse en un test aquí. Lo verificable se extrajo a módulos puros
  (`runtime-options.ts`, `placaRows`); lo que queda en ellos es cableado.
