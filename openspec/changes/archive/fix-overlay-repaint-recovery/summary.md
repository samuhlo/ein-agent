# Summary — fix-overlay-repaint-recovery

status: complete
change: fix-overlay-repaint-recovery
work_groups: 4
verification_status: pass

## Resultado

La superficie persistente de subagentes se fijó encima del editor, el widget async heredado quedó desactivado y TODO pasó a la región inferior sin perder repaint inicial, deduplicación, identidad estable ni el guard de contextos sin UI. La corrección se entregó en la release `installer-v0.92.0-alpha.1`.

## Decisiones

- Una sola superficie async visible: fleet activa y widget legacy desactivado.
- Fleet y TODO ocupan regiones distintas para que el orden no dependa del registro de widgets.
- La generación del corpus usa IDs de commit de siete caracteres independientes de `core.abbrev`.

## Verificación

- Contratos focalizados de layout, repaint y corpus verdes.
- Suite completa y typecheck raíz verdes en la entrega.
- El artefacto oficial del installer se construyó y contenía la política esperada.
- verify: `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts`
- verify: `bun test tests/apply-corpus-frozen.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`

## Cierre del residuo

Las tareas de despliegue e inspección interactiva que mantenían el registro como `blocked` eran aceptación manual de una instalación local, no trabajo de producto pendiente. La entrega ya fue fusionada y publicada; esas tareas residuales se descartan para que no sigan apareciendo como cambio activo.
