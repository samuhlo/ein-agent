# Roadmap de calidad de Ein

Resultado: Ein podrá demostrar de forma trazable qué se verificó, qué bytes se entregan y qué riesgos de revisión quedan abiertos.

## Modelo de calidad

`OpenSpec dice qué → sdd-verify prueba el comportamiento → el recibo de candidato verificado identifica los bytes exactos → ein-review busca riesgos omitidos → ein-git prueba que entrega los mismos bytes`.

## Decisiones congeladas

| Decisión | Aplicación futura |
|---|---|
| Unidad de entrega | Un slice equivale a un SDD futuro y a un PR. |
| Fuente de verdad | OpenSpec es canónico; la memoria opcional nunca lo sustituye. |
| Cierre seguro | Las identidades de contenido no coincidentes fallan de forma cerrada. |
| Revisión | `ein-reviewer` es de solo lectura y su activación inicial es manual. |
| Plataformas | macOS se añade a CI; Docker E2E permanece en Ubuntu; no se afirma soporte nativo de Windows. |

## No objetivos

- No existe vigilancia automática de cambios aguas arriba.
- No hay material de comparación externa en la documentación del repositorio.
- No se añaden demonios, binarios nativos, bloqueos ni recuperación automática.
- No se automatiza una revisión antes de cada PR.

## Dependencias ordenadas

```text
01 macOS CI → 02 OpenSpec canónico → 03 recibo de candidato
                                      ↓
                         04 puertas de entrega → 05 pruebas de resiliencia
                                                           ↓
                                             06 ein-review → 07 integración y limpieza
```

## Estado

| Slice | Plan | Estado | Depende de |
|---|---|---|---|
| 01 | [Paridad CI macOS](./01-macos-ci-parity.md) | complete | — |
| 02 | [OpenSpec canónico](./02-canonical-openspec.md) | complete | 01 |
| 03a | Pathspec cerrado en la entrega (`lib/git-staging.ts`) | complete | — |
| 03 | [Recibo de candidato verificado](./03-verified-candidate-receipt.md) | in progress | 02 |
| 04 | [Puertas de recibo de entrega](./04-delivery-receipt-gates.md) | in progress | 03 |
| 05 | [Pruebas de resiliencia](./05-delivery-resilience-tests.md) | planned | 04 |
| 06 | [Revisión Ein](./06-ein-review.md) | planned | 05 |
| 07 | [Integración y limpieza](./07-integration-and-cleanup.md) | planned | 01–06 |

## Protocolo operativo

1. Abrir un SDD y un PR por slice, respetando el orden de dependencias.
2. Mantener OpenSpec como registro completo y acotar el diseño con las especificaciones canónicas relevantes.
3. Ejecutar la matriz de verificación definida por el slice antes de solicitar entrega.
4. No marcar un recibo como verificado cuando pertenezca al carril mecánico o no SDD.
5. Actualizar esta tabla solo cuando la evidencia del slice exista.

## Definition of Done del roadmap

- [ ] Los siete slices tienen implementación, pruebas y evidencia verificable.
- [ ] La entrega rechaza contenido distinto al candidato verificado.
- [ ] La revisión manual puede registrar hallazgos confirmados, sospechosos o contradictorios.
- [ ] Ayuda, doctor, estado y `EIN.md` describen el estado real sin vigilancia automática.
