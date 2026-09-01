status: complete
change: review-budget-density
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El presupuesto de revisión ya no confunde pocos renglones con poco trabajo. Ein mide también los bytes UTF-8 no blancos del diff de producción, bloquea cuando se superan 400 líneas o 20.000 bytes y señala de forma no bloqueante los ficheros especialmente densos. El comportamiento está verificado y documentado con una calibración reproducible.

## // 001. QUÉ CAMBIÓ

- `review-forecast.ts` posee una única medición Git de líneas, bytes y ficheros, admite rangos históricos explícitos y falla cerrado ante referencias o parches inseguros.
- La extensión, el recibo y los contratos de actuación transportan la decisión estructurada, sus dos presupuestos y sus causas sin recalcularla.
- El aviso localizado usa 160 bytes por línea cambiada como umbral informativo; nunca deniega por sí solo una entrega.
- El ADR conserva la muestra histórica, el método, los valores y las condiciones de retirada. El roadmap elimina esta fase ya terminada y señala el diario de instalación como siguiente frontera.
- La placa de cabecera TypeScript queda como recomendación para módulos nuevos, no como una obligación escrita que medio árbol incumple.

## // 002. CÓMO FUNCIONA POR DENTRO

Git decide qué líneas pertenecen al cambio. El forecast alinea `--numstat -z` con un patch de contexto cero, cuenta el churn de producción y suma los bytes no blancos de cada línea añadida o retirada. Una función pura compara el resultado con ambos techos. Las capas exteriores sólo presentan esa evaluación y los agentes reciben el resultado ya calculado.

## // 003. DECISIONES

- Se conservan líneas y bytes porque capturan costes distintos; número de ficheros y densidad explican la revisión, pero no bloquean.
- Los 20.000 bytes proceden de 120 merges: el p75 de densidad de los cambios que cabían en 400 líneas fue 52,09 bytes por línea, equivalente a 20.836 bytes en el techo. Se redondeó a un límite estable y ligeramente conservador.
- El aviso de 160 procede del p95 por fichero, 162,5 bytes por línea, redondeado para ser memorable y no fingir precisión.
- No se introdujo un máximo global de longitud de línea ni se descomprimieron módulos ajenos al trabajo.

## // 004. VERIFICACIÓN

- verify: `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts tests/prompt-budget.test.ts tests/sdd-preflight-tdd-gate.test.ts`
- `verify-report.md`: `status: pass`, `behavior_coverage: verified`, sin bloqueos ni hallazgos críticos, altos o medios.
- Pruebas enfocadas: 44/44 y 52/52 pasan.
- Suite completa: 2.914 pass, 0 fail, 14.206 assertions, 209 ficheros.
- Typechecks de raíz e installer: pass.
- El check SDD previo al cierre informó 0 errores y 0 avisos; los tres escenarios del delta están sincronizados en la spec canónica.

## // 005. PENDIENTE / RIESGOS

- Los avisos de densidad pueden nombrar prosa contractual legítimamente larga; son una invitación a mirar, nunca una prohibición.
- Si el historial futuro demuestra que líneas y bytes ya no representan el esfuerzo humano, el ADR exige recalibrar o retirar el límite.
- Este cambio termina la fase del metro. No modifica todavía el motor del diario, el empaquetador ni el núcleo SDD neutral; esas fases conservan sus propios criterios de salida en el roadmap.
