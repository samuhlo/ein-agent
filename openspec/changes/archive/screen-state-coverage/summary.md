## // 000. RESUMEN
"Lo que la pantalla afirma tiene que salir de un cálculo" deja de ser prosa del manifiesto y pasa a ser un test. Antes de terminar de escribirlo ya había encontrado una mentira real: una verificación fallida se pintaba como fase hecha. Suite en 2539 verde.

## // 001. QUÉ CAMBIÓ
- `tests/fixtures/screen-state-coverage.ts` (nuevo, puro): recorre el espacio de estados declarado de una superficie y devuelve colisiones, vacíos sin declarar y declaraciones de vacío obsoletas.
- `tests/screen-state-coverage.test.ts` (nuevo): cinco contratos sobre superficies falsas rotas a propósito, y cuatro sobre el overlay real.
- `ein-pi/agent/lib/sdd-overlay.ts`: `PhaseState` gana `failed`; `phaseStates` mira el veredicto antes de dar la fase por hecha; `railLine` lo pinta en rojo con su glifo.
- `ein-pi/agent/lib/chrome.ts`: glifo `×` para lo que se comprobó y salió mal, distinto del `?` de lo que no se sabe.

## // 002. CÓMO FUNCIONA POR DENTRO
El guardián no compara contra una captura. Una captura te dice que el dibujo cambió; no te dice que dos verdades distintas se vean igual, que es exactamente el defecto. Lo que hace es recorrer los estados declarados de una superficie, renderizar cada uno y exigir que ninguno se confunda con otro.

El color se retira antes de comparar. Una diferencia que solo existe como código ANSI no la lee nadie en un log, una captura o un terminal monocromo, así que no cuenta como distinguir.

Y el vacío no está prohibido: está prohibido el vacío que nadie declaró. El overlay calla a propósito cuando no hay cambio activo, y eso se declara con su razón. La comprobación va en los dos sentidos: un estado declarado vacío que empieza a pintar también falla, porque así es como una declaración se queda obsoleta y deja de proteger sin que nadie se entere.

## // 003. LA MENTIRA QUE ENCONTRÓ
`phaseStates` marcaba la fase `verify` como desconocida si el informe estaba obsoleto o ilegible, y como **hecha** en cualquier otro caso. Un informe que decía `fail` caía por ese hueco: una verificación suspendida se pintaba igual que una aprobada.

`sdd-overlay.test.ts` llevaba todo ese tiempo en verde. Fija el aspecto del widget, y el aspecto era correcto; lo que estaba mal era la correspondencia entre el dibujo y el estado. El comentario de la propia función decía "un informe obsoleto o ilegible no es un aprobado" y se había olvidado del caso más obvio.

## // 004. VERIFICACIÓN
`bun test`: 2539 pass, 0 fail (baseline 2530). Ambos typechecks en verde. Evidencia estricta RED → GREEN → TRIANGULATE → REFACTOR en los tres grupos.

Durante la triangulación el guardián me pilló a mí: mi fixture emparejaba `verify: absent` con el informe presente, un estado inalcanzable. Una colisión entre estados imposibles es ruido del fixture, no una mentira, así que el espacio de estados deriva la presencia del artefacto del propio veredicto.

## // 005. PENDIENTE / RIESGOS
- `formatSddStatus` no entra: vive en `ein-ai.ts`, que registra tools de Pi al importarse. Sigue cubierto por el contrato de fuente del cambio anterior. Es un hueco real, escrito en vez de tapado.
- El instalador y la app de terminal tampoco: su estado no es una unión pequeña y enumerable.
- La cobertura es por eje, no el producto cartesiano de todos los campos. La exhaustividad combinatoria no es el objetivo.
- Dos colisiones quedan **aceptadas y afirmadas**, no arregladas: `only` contra `explicit` (al overlay no le incumbe de dónde salió la elección) y los cinco valores de `ApplyOutcome` (el overlay no proyecta el veredicto de apply). Afirmarlas exactamente es lo que hace visible una colisión nueva.
