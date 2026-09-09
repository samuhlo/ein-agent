# Traspaso fiable entre fases — 2026-09-09

Primer corte del plan aprobado: que los agentes reciban sus herramientas y que
verify pueda localizar la evidencia sin reconstruirla mediante conversación.

## Resultado de integración

- Scope carga explícitamente el escritor determinista de deltas en un hijo
  aislado. No recibe la herramienta de sincronización canónica.
- Los roles SDD con bash cargan el guard existente también sin extensiones
  ambientales. Si ambos proveedores están presentes, una invocación idéntica
  se comprueba una vez; un comando modificado se vuelve a comprobar.
- Apply conserva un índice privado de comandos, directorio, resultado observado,
  referencia nativa y hash de la salida guardada. El progreso devuelve la ruta
  del índice para incorporarla a la evidencia. Las vistas truncadas permanecen
  marcadas como parciales. No se modifica el contenido de bash para añadirlo.
- El router distingue una declaración de intent ausente, malformada o duplicada
  de una clave antigua. Los encabezados sin tareas dejan de figurar como grupos
  vacíos del plan de apply.
- La prohibición observada «ni hagas commits/push/PR» deja de activar una
  confirmación de entrega. Las peticiones afirmativas y los comandos protegidos
  conservan sus controles.

## Pruebas

**3.252 tests pasan, cero fallos**, sobre el corte `808995d`. Typecheck y
empaquetado host correctos. El probe del paquete extraído carga los siete roles
SDD con el SDK real de Pi, comprueba sus herramientas declaradas y llama a los
hooks nativos antes/después de bash. Los cinco roles que tienen bash bloquean el
comando protegido del probe. Scope escribe un delta válido en un fixture.

Las regresiones incluyen cabeceras informativas, claves defectuosas, negaciones
de entrega, guard duplicado, cambios de comando, salida completa recuperada del
spool, errores, vista parcial y almacenamiento mediante un symlink rechazado.

La primera pasada encontró dos fixtures que requerían adaptación: el mock de
progreso carecía del evento de resultados y una aserción dependía de una frase
del contrato. Se corrigieron sin relajar la verificación. Se amplió a 20 segundos
el timeout del probe de empaquetado que ahora arranca siete roles.

## Alcance de la evidencia

El índice registra invocaciones observadas; no demuestra por sí solo cobertura
conductual ni que el código actual sea correcto. Verify sigue ejecutando sus
checks independientes. El shell no se presenta como confinado a una allowlist.

Estas pruebas acreditan el traspaso y sus fallos controlados. La comparación
económica con modelos pertenece a la evaluación conjunta del siguiente corte;
no se atribuye un porcentaje de ahorro a esta PR por separado.
