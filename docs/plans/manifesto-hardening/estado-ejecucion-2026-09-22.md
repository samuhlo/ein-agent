# Revisión e integración del 22–23 de septiembre

Estado de trabajo, no cierre definitivo. El usuario autorizó revisar, corregir y
completar las PRs del plan, dejándolas listas para revisión humana. El 23 de
septiembre autorizó encadenar también las PR de documentación y `alpha.10`.
Las PRs siguen abiertas para revisión y el tag de release espera a que se integren.

## Cadena de entrega

Orden preparado: #462 (compatibilidad SDK) → #451 → #452 → #453 (01) →
#454 (02) → #455 (04) → #456 (13) → #457 (05) → #458 (03) →
#459 (09) → #460 (11) → #461 (10) → #463 (07) → #465 (08) →
#466 (06) → #467 (12, pendiente de publicar).

Cada rama contiene su base. Las PRs se han retargeteado para que el diff muestre
su cambio, sin bases agregadas que requieran otra integración manual. Las PR
#465 y #466 tienen CI verde en Linux, macOS y documentación. Ninguna PR se ha
fusionado. El punto 12 está integrado localmente sobre #466, con suite completa
y verificaciones locales correctas; la publicación de #467 está en curso. Se
conserva todo el historial; no se ha usado force-push.

## Hallazgos corregidos

- 01: un veredicto dentro de código indentado o comentarios HTML podía contar
  como resultado global. Regresión reproducida y corregida.
- 02: un intent pendiente podía emitir un recibo current; un informe enlazado
  podía sobrescribir otro archivo. Finalización y escritura protegidas.
- 04: el rollback no restituía permisos de raíz/directorios overlay y devolvía
  éxito. Inventario y restauración conservan también esos permisos.
- 05: opciones públicas válidas del runner se rechazaban indebidamente.
- 03: faltaba comparar todos los IDs del recibo y revalidar prerrequisitos de
  apply/cierre; un intent ilegible podía confundirse con ausencia legacy.
- 11: la resolución TDD ignoraba el cwd efectivo del hijo.
- 10: el presupuesto del hijo podía relajar restricciones del workflow padre.
- SDK: pi-subagents 0.70 publica módulos JS; varios probes esperaban TS.
  Pi 0.87 exige normalizar el contexto del proveedor antes del smoke de timeout.
- 07: consulta/setter elegían destinos distintos en un caso de bootstrap;
  faltaba reintentar una publicación de objetivo y evitar arrastrarlo entre trabajos.

## Evidencia acumulada

- Cadena hasta 10: 3428 tests correctos, 0 fallos; tipos de raíz e installer y
  empaquetado host correctos. 178 pruebas específicas de integración también pasan.
- 02 revisado: 3335 tests correctos, 149 focalizados, ambos typechecks y bundle.
- 07: 3366 tests antes de integrar la cadena; 194 de consumidores después,
  más pruebas del CLI empaquetado y bootstrap, tipos y bundle.
- Compatibilidad: pruebas del runner instalado y smoke de proveedor con Pi 0.85/0.87.

Los números anteriores identifican ejecuciones concretas; no certifican las
ramas aún en desarrollo. El estado de CI definitivo debe releerse en cada PR.

## Puntos 08, 06 y 12

- 08: journal de operaciones, consumidores de continuidad, guards y recuperación
  por referencias nativas. PR #465. 3475 pruebas, ambos typechecks y bundle
  locales correctos; CI Linux/macOS/docs verde.
- 06: borrador neutral, máquina compartida, publicación/recuperación y consumidores
  de cierre. PR #466 sobre #465. 3505 pruebas y verificaciones focales,
  typechecks, bundle, paridad y piloto correctos; CI Linux/macOS/docs verde.
- 12: snapshots de revisión y comprobación previa a publicación. Integrado sobre
  #466 en `84a53d07`; 3529 pruebas, 77 pruebas de consumidores, ambos typechecks,
  bundle y CLI correctos. PR #467 pendiente de publicación.

Las rutas son ubicaciones de trabajo, no requisitos del producto. El workspace
original con cambios ajenos sigue preservado.
