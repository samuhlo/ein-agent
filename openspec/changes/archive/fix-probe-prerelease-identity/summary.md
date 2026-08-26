## // 000. RESUMEN
`ein-install update` no podía saltar nunca a una release alpha: la sonda que
verifica el binario descargado leía la versión con un patrón que exigía fin de
línea tras `X.Y.Z`, así que cualquier prerelease devolvía `null` y la
actualización abortaba en `verifying`.

## // 001. QUÉ CAMBIÓ
- `installer/src/core/binary-probe.ts`: patrón SemVer completo, capturado entero.
- `installer/src/core/transaction.ts`: las dos rutas de fallo de `verifying`
  descartan candidato y snapshot.
- `spec_delta: none`.

## // 002. CÓMO FUNCIONA POR DENTRO
- La sonda arranca el binario descargado con `--version` y parsea dos líneas
  etiquetadas. Ese es el paso que impide reemplazar el binario por algo que no
  dice quién es, y corre ANTES de tocar nada.
- El patrón viejo capturaba `[0-9]+\.[0-9]+\.[0-9]+` y exigía `\s*$` detrás. Con
  `0.90.0-alpha.1` casaba `0.90.0` y se topaba con el `-alpha.1`: sin match.
- Capturar solo el núcleo tampoco valía: `verifyBinaryIdentity` compara con la
  versión del release seleccionado, y `0.90.0` nunca es `0.90.0-alpha.1`. El
  síntoma habría pasado de `identity-missing` a `identity-mismatch`.
- La fuga: al abortar en `verifying` se devolvía el fallo sin borrar el candidato
  ni el snapshot, mientras que el fallo inmediatamente siguiente sí limpiaba. Un
  binario de ~100 MB huérfano en el PATH por cada intento.

## // 003. DECISIONES
- Patrón SemVer explícito, no un comodín hasta fin de línea: la sonda existe para
  rechazar lo que no es una identidad.
- Una función de descarte compartida por las dos rutas: es el mismo fallo con dos
  causas.
- El formato de `--version` no se toca: lo fija el contrato de release y lo
  consume también la continuación del hijo.

## // 004. VERIFICACIÓN
- `bun test` — 2674 pass, 0 fail. Los dos typechecks, PASS.
- Ciclo estricto en dos contratos, con el defecto reproducido antes contra la
  release real publicada.

## // 005. PENDIENTE / RIESGOS
- El arreglo no alcanza a la instalación que lo necesita: quien sondea es el
  binario ya instalado. Hace falta reinstalar una vez para entrar.
- Los candidatos huérfanos de intentos anteriores siguen en disco.
