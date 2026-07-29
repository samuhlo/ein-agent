---
status: complete
scope_status: bounded
change: candidate-receipt-retirement-hardening
phase: map
skill_resolution: paths-injected
budget_source: default
budget: { max_tokens: 15000, max_reads: 30 }
ledger:
  reads:
    - path: /home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md
      lines: 101
      estimated_tokens: 1450
    - path: /home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md
      lines: 124
      estimated_tokens: 1900
  webfetch_used: false
  budget_consumed: { tokens: 3350, reads: 2 }
---

# Mapa final: candidate-receipt-retirement-hardening

## Alcance cerrado

Conservar el endurecimiento histórico de recibos candidatos, restaurar el archivo original y la línea base del spec canónico con bytes exactos, completar la cobertura focalizada del adaptador remoto y producir evidencia nueva para el HEAD final. No hay rollback de código fuente ni expansión a un harness general de `ExtensionAPI`.

## Estado y hechos resueltos

- `ein-pi/agent/extensions/ein-ai.ts` ya realiza la limpieza correcta para `retired` y `already-retired`: llama a `reportRetirementCleanup(result, clearVerifiedDeliveryAttempt(...))`.
- La transición de persistencia de bajo nivel devuelve deliberadamente el resultado terminal; el adaptador de herramienta es dueño de la limpieza de sesión/durable y de `cleanupPending`.
- `candidate-receipt-retirement-remote.ts` separa la resolución de URL única de push y la observación de `gh` con timeout y `AbortSignal`.
- La persistencia durable de intentos liga `repositoryId`, `worktreeId`, `fingerprint` y `validatedDeliveryHead`.
- Se conservan el lock PID/token, la publicación inmutable mediante hard-link, el `fsync` del directorio y `cleanupPending`.
- El árbol de recibos activo (`1c3138ed`) no coincide con el árbol del HEAD actual (`595f589f`) y no existe intento durable; la evidencia final debe generarse de nuevo.

## Seams de implementación

### Código de producto retenido

| Archivo | Responsabilidad | Delta histórico |
| --- | --- | ---: |
| `ein-pi/agent/extensions/ein-ai.ts` | Adaptador de herramienta y limpieza posterior al retiro. | +29/-61 |
| `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts` | Resolución de remoto y observación de PR con `gh`, timeout y cancelación. | +86/-0 |
| `ein-pi/agent/lib/candidate-receipt.ts` | Persistencia durable, transición de retiro y publicación/lock endurecidos. | +246/-35 |

El retenido de producción suma **+361/-96**: **457 líneas modificadas** y **+265 netas**.

### Pruebas retenidas y cobertura a completar

| Archivo | Cobertura | Delta histórico |
| --- | --- | ---: |
| `tests/candidate-receipt-retirement-remote.test.ts` | URLs de push única/múltiple y fallos por timeout/abort; añadir fixture de JSON válido de PR fusionado y comprobar todos los campos normalizados exactos. | +35/-0 |
| `tests/candidate-receipt-retirement-tool.test.ts` | Cableado estático de la herramienta. No constituye prueba de ejecución conductual. | +13/-0 |
| `tests/candidate-receipt.test.ts` | Persistencia y transición de recibos. | +134/-10 |
| `tests/delivery-gate.test.ts` | Integración con la puerta de entrega. | +8/-5 |

Las pruebas listadas suman **205 líneas modificadas**. No se crea un harness general de ejecución de `ExtensionAPI`: no existe uno en la suite actual y queda fuera de este cambio; el riesgo residual queda acotado al cableado estático del adaptador.

### Restauración histórica exacta

Restaurar primero desde `git show 1f89b0f:<path>` los bytes exactos de:

1. `openspec/changes/archive/candidate-receipt-retirement/apply-progress.md`
2. `openspec/changes/archive/candidate-receipt-retirement/design.md`
3. `openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md`
4. `openspec/changes/archive/candidate-receipt-retirement/summary.md`
5. `openspec/changes/archive/candidate-receipt-retirement/sync-report.md`
6. `openspec/changes/archive/candidate-receipt-retirement/verify-report.md`
7. `openspec/specs/sdd-lifecycle/spec.md` (línea base canónica)

No se modifica código fuente durante esta restauración. El `sync-report.md` original no se usa como evidencia de cierre.

### Artefactos de evidencia del cambio hermano

Después de restaurar el spec canónico, actualizar únicamente los artefactos nuevos del cambio hermano:

- `openspec/changes/candidate-receipt-retirement-hardening/design.md`
- `openspec/changes/candidate-receipt-retirement-hardening/tasks.md`
- `openspec/changes/candidate-receipt-retirement-hardening/apply-progress.md`
- `openspec/changes/candidate-receipt-retirement-hardening/verify-report.md`
- `openspec/changes/candidate-receipt-retirement-hardening/summary.md`

La sincronización posterior incorpora solamente el delta de **seis escenarios** que pertenece al cambio hermano. La verificación se ejecuta contra el HEAD final y emite un recibo candidato nuevo para ese HEAD.

## Orden de diseño/aplicación

1. Restaurar bytes históricos de los seis archivos archivados y la línea base canónica.
2. Conservar el endurecimiento de los tres seams de producción sin rollback.
3. Añadir la prueba de respuesta JSON válida de PR fusionado en el adaptador remoto, con aserciones de normalización exactas.
4. Sincronizar exclusivamente los seis escenarios nuevos en el spec canónico ya restaurado.
5. Actualizar los cinco artefactos de evidencia del cambio hermano.
6. Ejecutar verificación fresca y emitir el recibo candidato para el HEAD final.

## Restricción de entrega

La carga final ya medida es de **1733 líneas de producción/documentación** y **392 líneas de pruebas** antes de los artefactos hermanos. Supera el presupuesto de revisión de 400 líneas de producción; antes de entrega se requiere una decisión renovada entre PR único y PRs encadenados.

## Handoff a sdd-design

Diseñar la restauración como grupo histórico atómico, la cobertura happy-path como grupo separado y la evidencia/sincronización hermana como tercer grupo. Mantener los seams enumerados, preservar la propiedad de limpieza en `ein-ai.ts`, y definir las seis adiciones de escenario sin alterar la base restaurada fuera de ese delta.
