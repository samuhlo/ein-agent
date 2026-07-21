# 05. Pruebas de resiliencia de entrega

**Estado inicial:** planned

## Resultado
Las transiciones de entrega fallan de forma cerrada ante estados inesperados y mutaciones.

## Problema actual
Las garantías de recibo requieren pruebas deterministas en fronteras Git y de cancelación.

## En alcance
- Pruebas deterministas de recibos ausentes, corruptos, de repo o worktree incorrectos; cambios post-verify; staging parcial; untracked previsto; suciedad ajena; hook que muta índice; cancelación durante publicación atómica; resultado ambiguo de commit; rama de push/cabeza PR errónea; grant expirado.
- Pruebas de transiciones y fallo cerrado.

## No objetivos
- Objetivos de líneas de código.
- Esperas temporales o pruebas frágiles.

## Mecanismo interno
Fixtures controladas simulan estados Git y fronteras de proceso; las pruebas observan estado publicado y decisión de transición, no temporización. Ante un resultado ambiguo de commit, la política es detenerse, inspeccionar el estado Git en solo lectura y exigir verificación nueva si no puede probarse la aplicabilidad exacta del recibo; no hay journal ni recuperación automática.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Tests de utilidades de recibo, entrega y fixtures Git aisladas.

## Criterios de aceptación

- [ ] Cada estado enumerado DEBE tener prueba determinista.
- [ ] Las pruebas NO DEBEN usar sleeps ni depender del reloj de carrera.
- [ ] Cada fallo DEBE demostrar bloqueo y transición segura.
- [ ] Un untracked previsto DEBE poder entrar; suciedad ajena NO DEBE entrar.
- [ ] Ante un commit ambiguo, el proceso DEBE detenerse e inspeccionar Git en solo lectura; si no prueba la aplicabilidad exacta del recibo, DEBE exigir verificación nueva sin journal ni recuperación automática.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Integridad | Ausente, corrupto, repo/worktree erróneos bloquean. |
| Mutación | Cambios, staging parcial y hook mutado bloquean. |
| Entrega | Un commit ambiguo detiene el proceso, permite solo inspección Git de lectura y exige verificación nueva si no se prueba la aplicabilidad exacta del recibo; push/PR erróneos y grant expirado bloquean. |
| Atomicidad | Cancelación no publica recibo parcial. |

## Riesgos
Los fixtures Git pueden acoplarse a detalles de la implementación; deben expresar contratos observables.

## Dependencias
04.

## Límite de reversión
Revertir fixtures y pruebas junto con la puerta que cubren si impiden aislar el problema.

## Checklist de finalización

- [ ] Casos de recibo cubiertos.
- [ ] Casos de mutación cubiertos.
- [ ] Casos de entrega cubiertos.
- [ ] Sin esperas temporales.
