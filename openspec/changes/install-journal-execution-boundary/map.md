# Map — install-journal-execution-boundary

status: complete
scope_status: accepted
change: install-journal-execution-boundary
phase: map

ledger:
  reads:
    - { path: installer/src/core/install-journal.ts, lines: 169, bytes: 11585 }
    - { path: installer/src/cli/install.ts, section: 645-669 }
    - { path: installer/src/core/install-journal-contract.ts, lines: 59 }
    - { path: installer/src/core/install-journal-reachability.ts, lines: 111 }
    - { path: installer/src/core/install-journal-shape.ts, lines: 124 }
    - { path: installer/src/core/install-journal-store.ts, lines: 177 }
    - { path: installer/src/core/install-executor.ts, lines: 84 }
    - { path: tests/install-journal.test.ts, lines: 298 }
    - { path: tests/install-completed-journal-reentry.test.ts, lines: 69 }
    - { path: openspec/specs/installer-runtime/spec.md, role: canonical-domain }
  webfetch_used: false
  webfetch_urls: []

## // 001. Mecanismo actual

La fachada valida forma y alcanzabilidad, codifica JSON con un salto final, inspecciona el almacén y traduce cualquier parseo dudoso a `invalid`. Al publicar valida otra vez, codifica y traduce cualquier fallo de almacenamiento a `journal-write-failed`.

El coordinador inspecciona, admite sólo dos formas especiales de reanudación, crea un diario nuevo cuando procede y envuelve cada handler. Antes de una mutación persiste `pending`; después persiste `completed` o `failed`. Un callback de señal intenta registrar `interrupted`. El resultado global finaliza o revierte la retirada legacy exactamente una vez.

## // 002. Duplicación real

`install-journal.ts` posee `supportsPreMutationRetry` y `supportsRetirementRetry`. `installer/src/cli/install.ts` repite ambas decisiones como `supportsPreMutationRecovery` y `supportsRetirementRecovery` para decidir el plan antes del banner.

Las copias no son textualmente equivalentes: una consulta constantes globales de entradas y la otra el inventario del plan. La política debe tener un único dueño y ambos consumidores deben recibir la misma clasificación pura.

## // 003. Fronteras

- Contrato: vocabulario persistido, digest, equivalencia y error estable.
- Forma: objeto hostil y propiedades exactas.
- Alcanzabilidad: historia posible de estados.
- Codec: validación compuesta y bytes canónicos.
- Store: filesystem seguro y publicación atómica de bytes.
- Persistencia: unir codec y store, traduciendo estados `missing|valid|invalid` y errores públicos.
- Política: admisión y transformación inmutable del diario.
- Ejecución: handlers, señales y lifecycle; no decide reglas de estado por su cuenta.
- Fachada: reexports estables, sin lógica.

## // 004. Consumidores

La API pública de `install-journal.ts` es consumida por `installer/src/cli/install.ts`, `tests/install-journal.test.ts` y `tests/install-completed-journal-reentry.test.ts`. La política nueva tendrá dos consumidores productivos: el CLI y el coordinador. Codec y persistencia son internos y se prueban directamente para hacer visible su contrato.

## // 005. Corte de PRs

1. `install-journal-codec`: mueve validación/encode/parse y añade pruebas directas. La fachada conserva inspección, publicación y ejecución.
2. `install-journal-policy`: centraliza los dos retries, creación y transiciones. El CLI y el coordinador dejan de duplicar o construir estados a mano.
3. `install-journal-persistence`: separa inspección/publicación del coordinador y del codec.
4. `install-journal-execution`: mueve el bucle, deja la fachada fina, sincroniza spec, verifica y cierra el cambio.

## // 006. Comprobaciones críticas

- Roundtrip canónico exacto y rechazo de JSON válido pero no canónico.
- Clasificación idéntica en CLI y ejecución para retry de backup, retry de retirada y todos los casos bloqueados existentes.
- Transiciones puras válidas para pending, completed, failed, interrupted y complete.
- Fallos de escritura conservan `journal-write-failed` o `recovery-write-failed` según el momento.
- Señales se registran y retiran una vez; rollback/finalize no se duplican.
- Reentrada sobre diario `complete` conserva el comportamiento actual.

## // 007. Presupuesto

Cada PR se mide contra 400 líneas y 20.000 bytes de producción. Si el cuarto corte excede cualquiera, se separa el adaptador de handlers del lifecycle sin comprimir el código ni declarar una excepción estética.
