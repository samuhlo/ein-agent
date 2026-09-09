# Apply con una única gestión de progreso — 2026-09-08

Se simplifica el contrato existente: la herramienta de progreso actualiza el
checklist y cada tarea contiene el trabajo necesario para darse por terminada.
No se añade otro ejecutor, formato de packet, servicio ni estado de workflow.
Datos de las pruebas en [lean-apply-2026-09-08.json](lean-apply-2026-09-08.json).

## Cambios

- Se retira la instrucción contradictoria que mandaba usar
  `ein_sdd_task_progress` y además editar manualmente los mismos checkboxes.
  La operación existente escribe el marcador de inicio, completa el checkbox
  y confirma el estado persistido. El ID se documenta como el ID exacto del
  checkbox, sin número de grupo ni ruta. El backend sigue rechazando IDs
  inexistentes, tareas fuera de secuencia y dos tareas iniciadas a la vez.
- Tasks mantiene implementación, regresión y compatibilidad del mismo
  comportamiento juntas cuando caben. Cada checkbox debe poder completarse
  antes del siguiente: el código y las pruebas que necesita para terminar
  pertenecen a esa tarea, con varios campos `edit:` y subpasos cuando proceda.
  Se conserva el límite de 3–4 archivos de producción por grupo.
- Apply usa los checks declarados, sin repetir el mismo test mediante un script
  y su comando directo sobre código sin cambios. Se permiten repeticiones tras
  ediciones, correcciones de fallos o por el ciclo TDD activo. Verify mantiene
  su ejecución independiente. Los comandos usan el timeout nativo de bash.
- Se retiran instrucciones duplicadas de tasks para mantener el presupuesto
  de prompts vigente. No se eleva el techo. La adaptación Claude sigue usando
  el comando existente `ein-cc-sdd task-progress` y el núcleo compartido.

## Comparación con el mismo diseño

Pi 0.85.1, pi-subagents 0.66.0, Bun 1.3.14. Dos copias aisladas del constructor
ICE y tests de BERRO, mismas entradas de diseño y configuración. Tasks usó
`gpt-5.6-sol:high`; apply y verify, `gpt-5.6-luna:low`. El padre usó el modelo
configurado `gpt-6-astra:high`. Las fases corrieron a través de `subagent`.

| Apply, diseño original fijo | Base #396 | Primera revisión |
| --- | ---: | ---: |
| Grupos generados | 1 | 1 |
| Turnos | 12 | 8 |
| Tokens totales de apply | 137.619 | 78.779 |
| Ediciones manuales de tasks.md | 1 | 0 |
| Lecturas | 9 | 8 |
| Coste API de apply, USD | 0,0110368 | 0,00587744 |

Ambas versiones pasaron la verificación. Esta vez ambas eligieron un grupo;
no se atribuye la mejora a pasar de dos grupos a uno. La primera revisión hizo
una lectura de `apply-progress.md` aún inexistente, sin bloquearse. Los errores
de ID históricos no reaparecieron en ninguna variante de esta pareja.

Los 26 turnos del ensayo anterior son contexto histórico, no el denominador
usado para estas comparaciones. Los tokens suman entrada, salida y caché de
cada llamada; no representan el tamaño máximo de ventana ni ahorro global.

## Flujo completo y ajuste de la unidad de tarea

También se ejecutó design desde scope/map, sin que el padre escribiera el diseño.
Una desconexión WebSocket interrumpió tasks; se conservó el fallo y se reanudó
solo esa fase con el mismo modelo. No se volvió a generar design.

La primera revisión produjo un grupo con dos tareas, separando código y pruebas.
Apply intentó iniciar la segunda antes de completar la primera. El backend
rechazó la transición; el agente corrigió el orden y terminó. Se aclaró entonces
que un checkbox debe incluir el código y las pruebas necesarios para completarlo.

Se repitió tasks/apply/verify con ese mismo diseño recién generado y la
instrucción final. El diseño y las fuentes iniciales permanecieron iguales.

| Apply, nuevo diseño fijo | Primera revisión | Versión final |
| --- | ---: | ---: |
| Grupos / checkboxes | 1 / 2 | 1 / 1 |
| Turnos | 13 | 8 |
| Tokens totales de apply | 137.222 | 79.478 |
| Llamadas a progreso | 5 | 2 |
| Errores de herramientas | 1 | 0 |
| Ediciones manuales de tasks.md | 0 | 0 |

En esa repetición la entrada/salida acumulada de apply bajó un 42,08 %. Hubo
solo `start` y `complete` con el ID correcto, y un `bun run test && bun run typecheck`
con timeout nativo. Verify ejecutó sus checks de nuevo. No se promete ese porcentaje
para otros trabajos: son ejecuciones individuales sin semilla de muestreo fija.

## Calidad, límites y controles

- Verify detectó una regresión sembrada después del resultado positivo:
  9 tests pasaron y 1 falló; el estado determinista quedó `verify: fail` e impidió
  el cierre. El padre normalizó el formato del status sin cambiar su resultado.
  Tras restaurar el código, una nueva verificación dio 10 tests y tipos correctos.
- Una comprobación independiente de 18 casos del contrato público pasó en las
  cuatro implementaciones resultantes. Se escribió a partir de la especificación
  después de los runs; no se presenta como una reserva preregistrada de tests.
- Una prueba de planificación con dos resultados independientes y ocho archivos
  de producción mantuvo dos grupos de cuatro archivos, cada uno con sus tests.
  Ambos packets pasaron el compilador/validador existente. Es una prueba sintética
  de agrupación; no se ejecutaron esos cambios ficticios.
- La prueba nativa de progreso usa la firma real de Pi, comprueba que los IDs
  mal formados no escriben, que complete persiste el checkbox, que no altera el
  status del plan ni otras tareas, y que repetir complete es idempotente.
- Suite local final: 3.194 pass, incluidos el último ajuste de tasks y su
  presupuesto. Se actualizó una aserción que exigía GNU `timeout` para comprobar
  el parámetro nativo. Typecheck y empaquetado correctos; CI repite las comprobaciones.

Las mejoras son de contrato y uso del mecanismo existente; no añaden confinamiento
frente a ediciones por otras herramientas. El ahorro de apply no equivale al del
flujo completo: planificación, supervisión y verify siguen teniendo coste.
No se cambian modelos configurados ni se afirma compatibilidad probada con IA local.

Las fuentes, los planes de cada intento, los transcripts, los scripts y los
snapshots positivos/negativos se conservan en el archivo local de evidencia
entregado con la PR. Los datos versionados incluyen costes, comandos, modelos,
fallos y hashes; las credenciales y las firmas internas del proveedor no se publican.
