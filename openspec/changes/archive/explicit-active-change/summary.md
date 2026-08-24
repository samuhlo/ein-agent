## // 000. RESUMEN
Con dos cambios abiertos, Ein elegía uno por orden de directorio y trabajaba sobre él sin decirlo. Ahora no elige: nombra los candidatos y espera. Suite en 2530 verde y los dos typechecks pasan.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/sdd-router.ts`: nace `SddSelection` y con ella `resolveActiveSelection`, `selectedChange`, `ambiguousChangeBlocker` y `changeUnavailableMessage`. `SddChangeStatus` gana el campo `selection`.
- `resolveSddPlanPreview` y `resolveActiveChange` (preflight) dejan de repetir la elección y llaman al resolutor compartido.
- `cc-ein/sdd-cli/cli.ts`: `resolveCommandChange` para `lane`, `preflight`, `delta`, `summary`, `check` y `close`.
- `ein-pi/agent/extensions/ein-ai.ts`: los siete puntos equivalentes de Pi dicen lo mismo que Claude; la tool de delta se para antes de tocar disco.
- `sdd-overlay.ts` y `formatSddStatus`: la ambigüedad se pinta, en vez de desaparecer o presentarse como repo limpio.
- Contratos nuevos en `tests/cli-ambiguous-change.test.ts` y ampliados en router, overlay y status.

## // 002. CÓMO FUNCIONA POR DENTRO
La elección deja de ser un `??` repetido y pasa a ser un dato. `resolveActiveSelection` devuelve una de cuatro formas —`none`, `only`, `explicit`, `ambiguous` con sus candidatos— y `selectedChange` la traduce a un nombre o a `null`. Todo lo demás consume eso.

Bajo ambigüedad `change` es `null`, y eso no es un detalle: un aviso al lado de un cambio ya elegido seguiría dejando que cada consumidor trabajara sobre él, que es exactamente el fallo. Con `null` la ambigüedad es imposible de ignorar, y reutiliza el camino que todos los consumidores ya tenían para "no hay cambio activo" —el que produce un repositorio limpio, que está bien cubierto—.

Los candidatos van ordenados porque `listActiveChanges` devuelve el orden de `readdirSync`: sin ordenar, el mismo repositorio daría mensajes distintos en dos máquinas.

## // 003. DECISIONES
- Un solo resolutor. El comentario de `resolveActiveChange` ya prometía que "cuál es el cambio activo" tenía una sola implementación; era falso mientras tres sitios repetían el `[0]`.
- La CLI se niega, no elige y avisa: seis de esos subcomandos escriben, y un aviso se lee después de la escritura.
- Nada de un "cambio actual" persistido. Es una segunda fuente de verdad sobre un estado que ya vive en disco; pasar el nombre cuesta una palabra, y un puntero obsoleto es una respuesta equivocada que sobrevive a los reinicios.

## // 004. VERIFICACIÓN
`bun test`: 2530 pass, 0 fail (baseline 2508). Ambos typechecks en verde. Evidencia estricta RED → GREEN → TRIANGULATE → REFACTOR en los cinco grupos.

Lo que más valor tiene de los tests nuevos no es el código de salida: es que cada uno comprueba que **no se escribió nada** en ninguno de los dos candidatos.

## // 005. PENDIENTE / RIESGOS
- Se arreglaron dos mentiras, no una. La segunda solo apareció al arreglar la primera: con `change` nulo, tres superficies decían "no hay cambio activo" habiendo dos. La ambigüedad no es un repositorio vacío.
- `tests/sdd-status-output.test.ts` replica el handler de `/ein:sdd-status` en vez de importarlo, porque `ein-ai.ts` registra tools de Pi al cargarse. La réplica queda atada al original por un contrato de fuente en la rama de ambigüedad; el resto puede seguir derivando.
- La vista de ambigüedad del overlay son dos líneas: dice cuántos y cuáles, no ofrece un selector. Un selector es otra forma de guardar estado.
