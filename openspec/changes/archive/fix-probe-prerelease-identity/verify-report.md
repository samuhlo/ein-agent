# Verify Report: fix-probe-prerelease-identity

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Scope and coverage

- Verificado lo declarado: el patrón de la sonda y las dos rutas de fallo de
  `verifying`.
- Los dos requisitos de `design.md // B` quedan cubiertos por contratos que se
  ejecutan, uno puro y otro de extremo a extremo con capacidades reales.
- `spec_delta: none` declarado y aceptado.
- Carril micro: `map.md` y `tasks.md` ausentes por diseño.

## Independent focused command plan

1. `bun test ./tests/release-update-exec.test.ts ./tests/release-update-integration.test.ts`
   - seams: prerelease leída entera; correspondencia con su release y desajuste
     con otra alpha; metadatos de build; rechazo de líneas malformadas; sin
     candidato en disco tras identidad ilegible y tras desajuste
   - resultado: PASS, 22 tests

2. Reproducción de campo previa al arreglo, contra la release publicada.
   - resultado: fallo reproducido y candidato huérfano confirmado en disco

## Global-check disposition and results

| comando normalizado | rol / origen | resultado |
|---|---|---|
| `bun test` | unit + integration; raíz | 2674 pass, 0 fail |
| `bun run typecheck` | typecheck raíz | PASS |
| `(cd installer && bun run typecheck)` | typecheck instalador | PASS |

## Residual risks

- **El arreglo no alcanza a la instalación que lo necesita.** Quien sondea es el
  binario ya instalado, y el que lleva la corrección es el nuevo: solo surte
  efecto a partir de la primera instalación que la contenga. Para entrar en esa
  primera hay que reinstalar.
- El candidato huérfano de los intentos anteriores sigue en disco; este cambio
  evita los futuros, no borra los pasados.
- La sonda acepta ahora cualquier sufijo de prerelease válido en SemVer, no solo
  `alpha`. Es correcto por gramática, pero la elegibilidad por canal —que sí
  exige `alpha`— vive en `release-resolver.ts` y no en la sonda.
