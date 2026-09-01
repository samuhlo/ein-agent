# ADR 0001 — Presupuesto de revisión

status: accepted
date: 2026-08-18

## Contexto

Una entrega muy grande puede superar la capacidad de revisión aunque sus tests estén verdes. La medida debe ser determinista y no depender de una estimación del modelo.

## Decisión

`ein_review_forecast` mide contra la base cuatro señales de producción:

- inserciones más borrados, con un presupuesto de 400 líneas;
- bytes UTF-8 no blancos dentro de esas líneas, con un presupuesto de 20.000 bytes;
- número de ficheros tocados, solo informativo;
- bytes por línea cambiada de cada fichero, con aviso a partir de 160 y sin bloqueo propio.

Tests, snapshots, lockfiles, OpenSpec y generados se informan por separado y no consumen ningún presupuesto de producción. La entrega supera la puerta cuando excede las líneas o los bytes; ficheros y densidad solo ayudan a localizar el coste.

Si se supera el presupuesto, Ein pide elegir entre una excepción explícita o PRs encadenadas. El modo automático no elimina este guard.

## Calibración

La muestra usa los 120 merges de PR más recientes de `main` hasta la PR #280. El forecast compara el primer padre de cada merge con el segundo, que reproduce el diff entregado sin mover el checkout. De 119 PRs con producción, 84 respetaban el techo de 400 líneas.

En esas 84, la densidad mediana fue 43,07 bytes no blancos por línea y el percentil 75 fue 52,09. Proyectar ese límite superior normal sobre 400 líneas da 20.836 bytes; se redondea a 20.000 para que el presupuesto sea memorable y conservador. Dos de las 84 PRs lo habrían superado, frente a una sola con 24.000.

Sobre 1.128 ficheros con cambios textuales, el percentil 95 de densidad fue 162,5 bytes por línea. El aviso se fija en 160: señala aproximadamente la cola superior sin convertir una expresión larga aislada en prohibición.

La medición es reproducible iterando los merges `--first-parent` y llamando `reviewForecast(repo, primerPadre, segundoPadre)`. Los resúmenes OpenSpec sirven para interpretar outliers, no como unidad estadística.

## Consecuencias

- Los cambios grandes siguen siendo posibles, pero la estrategia de revisión queda declarada.
- La medición vive en código y sus tests; este ADR conserva únicamente el porqué.
- Una PR de pocas líneas ya no cabe automáticamente si concentra más de 20.000 bytes de producción.
- El aviso de densidad nombra dónde mirar, pero nunca decide por sí solo.

## Condiciones de retirada

- Retirar el presupuesto de bytes si una muestra revisada demuestra que no cambia decisiones frente al presupuesto lineal.
- Retirar el aviso si veinte PRs que lo activen no provocan ninguna decisión de revisión.
- El recuento de ficheros no se convertirá en puerta sin un fallo concreto y medido.
