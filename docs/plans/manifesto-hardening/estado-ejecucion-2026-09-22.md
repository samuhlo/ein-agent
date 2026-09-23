# Revisión e integración del 22 de septiembre

Estado de trabajo, no cierre definitivo. El usuario autorizó revisar, corregir y
completar las PRs del plan, dejándolas listas para revisión humana. No autorizó
fusionarlas ni publicar una versión en este encargo.

## Cadena de entrega

Orden preparado: #462 (compatibilidad SDK) → #451 → #452 → #453 (01) →
#454 (02) → #455 (04) → #456 (13) → #457 (05) → #458 (03) →
#459 (09) → #460 (11) → #461 (10) → #463 (07).

Cada rama contiene su base. Las PRs se han retargeteado para que el diff muestre
su cambio, sin bases agregadas que requieran otra integración manual. Los puntos
08, 06 y 12 siguen en trabajo y se encadenarán a continuación. Se conserva todo
el historial; no se ha usado force-push ni fusionado PRs.

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

## Trabajo en curso

- 08: journal de operaciones, consumidores de continuidad, guards y recuperación
  por referencias nativas. Checkout `/private/tmp/ein-manifesto-08`.
- 06: borrador neutral, máquina compartida, publicación/recuperación y consumidores
  de cierre. Checkout `/private/tmp/ein-manifesto-06`.
- 12: snapshots de revisión y comprobación previa a publicación implementados,
  en revisión independiente antes de la integración final. Checkout
  `/private/tmp/ein-manifesto-12`.

Las rutas son ubicaciones de trabajo, no requisitos del producto. El workspace
original con cambios ajenos sigue preservado.
