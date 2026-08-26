# Design: fix-probe-prerelease-identity

## A. Proposal

### Intent

`ein-install update` no ha podido saltar nunca a una release alpha. La sonda que
verifica el binario descargado antes de reemplazarlo pedía la versión con este
patrón:

```
(?:^|\n)ein-installer\s+([0-9]+\.[0-9]+\.[0-9]+)\s*$
```

Con `0.90.0-alpha.1` casa `0.90.0`, se topa con el `-alpha.1` donde exigía fin de
línea, y devuelve `null`. La transacción aborta en `verifying` con
`identity-missing`. Con una estable el patrón funciona, y por eso el defecto
llevaba escondido desde que existe la sonda: las alphas se instalaban
reinstalando, no actualizando.

Al abortar ahí, además, ni el candidato ni el snapshot del template se borran —
un binario de ~100 MB huérfano junto al bueno, en el PATH del usuario, por cada
intento fallido. La ruta de fallo inmediatamente siguiente sí limpia.

### Scope

**In:** el patrón de la sonda y las dos rutas de fallo de `verifying`.

**Out:** el formato de `--version`, la comparación de identidad, el journal y el
resto de la transacción. El carril micro no lleva `map.md` ni `tasks.md`.

### Affected areas

- `binary-probe.ts` — un patrón SemVer completo.
- `transaction.ts` — descartar candidato y snapshot en los dos retornos que no lo
  hacían.

### Risks

- **Capturar el core en vez de la versión entera** haría fallar la comparación en
  silencio hacia el otro lado: `0.90.0` nunca es `0.90.0-alpha.1`, así que
  `identity-mismatch` sustituiría a `identity-missing` y el síntoma sería el
  mismo.
- **Aflojar el patrón de más** aceptaría como identidad una línea que no lo es.
  La sonda existe justo para no reemplazar un binario por algo que no dice quién
  es.
- **El arreglo no se arregla a sí mismo.** Quien verifica es el binario YA
  instalado; el que lo lleva dentro es el nuevo. Esta corrección solo surte
  efecto a partir de la primera instalación que la contenga.

### Rollback

Revertir los dos ficheros de producción y los dos de test juntos. Sin migración
ni estado persistido.

### Success criteria

- Una identidad de prerelease se lee entera y casa con el release que dice ser.
- Una alpha distinta sigue siendo un desajuste.
- Una línea malformada sigue rechazándose.
- Ningún intento fallido en `verifying` deja un candidato en disco.

## B. Spec

### Requirement 1 — La identidad se lee entera

La sonda **MUST** leer la versión SemVer completa, incluidos el sufijo de
prerelease y los metadatos de build. **MUST NOT** truncarla a su núcleo
`X.Y.Z`, porque la comparación posterior es contra la versión del release
seleccionado. Una línea que no contenga una versión **MUST** seguir
rechazándose con `identity-missing`.

**Given** un binario que responde `ein-installer 0.90.0-alpha.1`, **When** se
sondea, **Then** la identidad leída es `0.90.0-alpha.1`, casa con ese release y
no casa con `0.90.0-alpha.2`.

### Requirement 2 — Un fallo en verifying no deja restos

Cuando la sonda no puede leer una identidad, o la leída no corresponde al
release, la transacción **MUST** descartar el candidato preparado y el snapshot
del template antes de devolver el fallo, igual que hace la ruta de fallo
siguiente.

**Given** un binario que no reporta identidad y otro que reporta una que no
corresponde, **When** la actualización falla, **Then** el binario instalado sigue
intacto y no queda ningún candidato junto a él.

## C. Decisions

- **Un patrón SemVer explícito y nombrado**, no un `.*` hasta fin de línea:
  aflojarlo del todo convertiría cualquier basura en identidad, y la sonda existe
  precisamente para eso.
- **Una función de descarte compartida por las dos rutas** en vez de repetir la
  llamada: son el mismo fallo con dos causas.
- **No se toca el formato de `--version`.** El contrato de release lo fija y lo
  consume también la continuación del hijo.

## D. Success Criteria

Los de la sección A, verificados por los contratos de la sección B.
