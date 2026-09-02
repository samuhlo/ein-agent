## // 000. RESUMEN

La `0.93.0-alpha.3` completa la reparación de Omarchy para instalaciones que ya
quedaron interrumpidas por el fallo de `0.93.0-alpha.1`.

## // 001. QUÉ CAMBIÓ

- El diario admite un reinicio nuevo únicamente cuando una instalación Pi
  gestionada completó todas sus escrituras previas, falló exactamente en
  `pi.verify-doctor` y no ejecutó ningún paso posterior.
- La admisión exige que la observación fresca pruebe un marker gestionado y un
  destino existente; árboles ausentes, ajenos, ambiguos, interrumpidos o con
  otras formas de fallo continúan bloqueados.
- La nueva transacción vuelve a observar dependencias, toma backup y despliega
  desde cero en vez de fingir que el plan antiguo y el nuevo son idénticos.

## // 002. VERIFICACIÓN

- Tests de política prueban admisión y rechazo de las formas vecinas.
- Tests de ejecución prueban que cambia el ID de transacción, se ejecuta el plan
  fresco completo y el diario final queda cerrado.
- Docker descarga el binario público `0.93.0-alpha.1`, reproduce Pi `0.84.4`, el
  fallo de `doctor` y el diario bloqueado; el candidato lo repara a `0.84.3`, se
  reinstala y termina con cero fallos.
- El smoke post-publicación actualiza desde `installer-v0.93.0-alpha.2`.

## // 003. RIESGO RESIDUAL

Los demás fallos posteriores a una mutación siguen requiriendo recuperación
explícita: esta excepción no convierte un diario genérico en permiso de
sobrescritura.
