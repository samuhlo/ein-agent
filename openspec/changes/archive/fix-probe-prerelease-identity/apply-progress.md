status: complete

## Completed

- `binary-probe.ts`: el patrón pasa a un SemVer completo, con sufijo de
  prerelease y metadatos de build, capturado entero.
- `transaction.ts`: las dos rutas de fallo de `verifying` descartan candidato y
  snapshot por una función compartida.

## Files changed
`installer/src/core/binary-probe.ts`
`installer/src/core/transaction.ts`
`tests/release-update-exec.test.ts`
`tests/release-update-integration.test.ts`

## TDD Cycle Evidence

Postura registrada en `preflight.json`: strict TDD ON.

| Contrato | RED | GREEN / TRIANGULATE / REFACTOR | Comando final |
|---|---|---|---|
| La identidad se lee entera | `bun test ./tests/release-update-exec.test.ts` — 3 fallos: la prerelease se leía como `null`. | GREEN con el patrón completo. TRIANGULATE: la versión entera casa con su release y NO con otra alpha; los metadatos de build viajan; `0.90`, una línea sin versión y texto suelto siguen rechazándose con `identity-missing`. | `bun test ./tests/release-update-exec.test.ts` — 9 pass. |
| Un fallo en verifying no deja restos | `bun test ./tests/release-update-integration.test.ts` — 2 fallos: quedaba un candidato en el directorio tras el desajuste y tras la sonda muda. | GREEN con el descarte compartido. TRIANGULATE: cubre las dos causas —identidad ilegible e identidad que no corresponde— y en ambas el binario instalado queda intacto. | `bun test ./tests/release-update-integration.test.ts` — 13 pass. |

### Evidencia de campo

El defecto se reprodujo antes de tocar código, contra la release real:
`ein-install update` abortó con `Actualizacion fallida en verifying: Binary probe
did not report installer and template versions`, mientras el binario candidato
respondía correctamente `ein-installer 0.90.0-alpha.1` al ejecutarlo a mano. Y
ese candidato —96 MB— seguía en `~/.local/bin/` después del fallo, que es la
fuga que cierra el segundo contrato.

## Verification
- `bun test` — 2674 pass, 0 fail.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
