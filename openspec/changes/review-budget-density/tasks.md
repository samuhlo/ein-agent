# Tasks — review-budget-density

status: ready
blocked_by: none

## // 001. Medir volumen sin cambiar la puerta — PR 1

- [x] 1.1 Añadir pruebas RED para bytes UTF-8 no blancos, adiciones y borrados, múltiples rutas, espacios, Unicode y exclusiones; implementar la medición aditiva y las métricas por fichero en `review-forecast.ts`.
  - skills: `none`
  - why: la primera entrega debe demostrar que el volumen se calcula bien antes de usarlo para bloquear.
  - learn: Git sigue siendo dueño de qué cambió; Ein solo suma el contenido revisable del patch.
  - architecture: `review-forecast.ts` posee pathspec, parsing y contrato de medición; ninguna extensión vuelve a interpretar Git.
  - avoid: inferir bytes desde `--shortstat`, leer ficheros completos o parsear nombres desde cabeceras humanas del patch.
  - verify: `bun test tests/review-workload-guard.test.ts`

## // 002. Presentar la medida aditiva — PR 1

- [x] 2.1 Añadir pruebas RED del formato y recibo; mostrar líneas, bytes y ficheros en la tool manteniendo `overBudget` exclusivamente lineal, y convertir la placa TypeScript en recomendación de autoría.
  - skills: `none`
  - why: la medida nueva tiene que ser visible sin cambiar todavía ninguna decisión de entrega.
  - learn: telemetría y política se entregan separadas para poder revisar cada una por su propio riesgo.
  - architecture: `ein-ai.ts` publica el resultado; `tool-receipts.ts` lo traduce; `runtime/docs/STYLE.md` no es una puerta mecánica.
  - avoid: activar un byte budget sin calibración o introducir un máximo por longitud de línea.
  - verify: `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts`

## // 003. Calibrar y evaluar la puerta — PR 2

- [ ] 3.1 Medir PRs mergeadas mediante sus dos padres, registrar la distribución y fijar valores reproducibles para presupuesto de bytes y aviso de densidad.
  - skills: `none`
  - why: el límite debe proceder de revisiones reales, no de un número elegido a ojo.
  - learn: OpenSpec explica los outliers; el diff mergeado es lo que la persona tuvo que revisar.
  - architecture: la evidencia efímera se resume en el ADR; los límites ejecutables viven junto al forecast.
  - avoid: tratar los 86 cambios archivados como si cada uno fuera una PR o escoger el máximo histórico como presupuesto.
  - verify: `repetir el comando de calibración documentado y comparar sus percentiles con el ADR`

- [ ] 3.2 Escribir pruebas RED para exceso solo por bytes, exceso solo por líneas, fallo cerrado y aviso no bloqueante; implementar una evaluación pura con límites explícitos.
  - skills: `none`
  - why: la decisión combinada es el comportamiento central del cambio.
  - learn: líneas o bytes bloquean; densidad y número de ficheros solo explican dónde mirar.
  - architecture: el núcleo devuelve una decisión estructurada; el formato y los adaptadores no recalculan política.
  - avoid: mezclar el umbral de aviso con `overBudget` o retirar el presupuesto lineal existente.
  - verify: `bun test tests/review-workload-guard.test.ts`

## // 004. Transportar la decisión — PR 2

- [ ] 4.1 Añadir pruebas RED del detalle y recibo; hacer que `ein-ai.ts` y `tool-receipts.ts` publiquen presupuestos, causas de exceso y avisos localizados sin perder los campos compatibles.
  - skills: `none`
  - why: la interfaz debe explicar por qué el cambio cabe o no cabe.
  - learn: una decisión determinista es útil solo si conserva sus causas al cruzar el adaptador.
  - architecture: la extensión transporta la evaluación del núcleo y el recibo se limita a presentarla.
  - avoid: volver a comparar cifras dentro del recibo o renombrar campos existentes sin compatibilidad.
  - verify: `bun test tests/review-workload-guard.test.ts tests/tool-receipts.test.ts`

## // 005. Actualizar a quienes actúan — PR 2

- [ ] 5.1 Añadir pruebas RED del contrato textual; sustituir la instrucción lineal en preflight, orquestador y `ein-git` por el resultado combinado y el reenvío de ambas medidas, sin segunda ejecución de Git ni crecimiento neto del prompt presupuestado.
  - skills: `none`
  - why: un exceso solo por bytes debe llegar hasta la misma decisión humana que un exceso por líneas.
  - learn: el núcleo calcula una vez; los agentes transportan y obedecen el resultado.
  - architecture: el orquestador coordina y `ein-git` confía; ninguno posee la métrica.
  - avoid: duplicar el pathspec, pedir a `ein-git` que vuelva a medir o liberar prompt mediante compresión ilegible.
  - verify: `bun test tests/review-workload-guard.test.ts tests/prompt-budget.test.ts tests/sdd-preflight-tdd-gate.test.ts`

## // 006. Documentar y cerrar el contrato — PR 2

- [ ] 6.1 Actualizar ADR y roadmap con valores, método, condiciones de retirada y resultado; sincronizar el delta y dejar el cambio listo para verificación independiente.
  - skills: `none`
  - why: el código posee la puerta y los documentos conservan únicamente el porqué y el trabajo vivo.
  - learn: una cifra duradera necesita procedencia y una forma explícita de dejar de existir.
  - architecture: ADR para decisión estable, spec canónica para comportamiento y roadmap solo para trabajo pendiente.
  - avoid: guardar la tabla histórica completa como documentación permanente o dejar números completados en el roadmap.
  - verify: `bun ein-cc/sdd-cli/cli.ts check review-budget-density`
