# Headroom en Ein — resultado del piloto

Fecha: 2026-09-09. Rama: `experiment/pi-headroom`. Base: `b9e6959`.

**Hay una compresión útil para JSON repetitivo; no hay evidencia suficiente para
sustituir Hypa ni para activar Headroom por defecto en Ein.** La extensión queda
funcional y optativa, con verificación de datos antes de modificar un resultado.
El experimento encontró dos problemas de integración y conserva sus evidencias.

## Qué está implementado

Una extensión Pi intercepta resultados nuevos de `bash`, consulta al servicio
local de Headroom y conserva el original en disco. No cambia el proveedor, los
prompts, el esfuerzo, las herramientas ni los permisos del agente. Está apagada
por defecto. El SDK npm no es necesario: utiliza directamente `/v1/compress`.

El perfil final admite únicamente arrays JSON cuya representación tabular pueda
comprobarse íntegramente: mismas columnas, tipos, filas, valores, orden y número
de apariciones. Soporta un subconjunto de strings simples, enteros seguros y
booleanos; el resto pasa intacto. Los archivos siguen siendo JSON en disco,
aunque la vista de la herramienta sea una tabla.

Logs, fuentes, diffs, salidas truncadas, errores, contratos SDD y resultados ya
envueltos por Hypa no se comprimen. Hay timeout, circuito de fallos, archivo por
sesión con límite de espacio y recuperación mediante la herramienta `read` de
Pi. Las condiciones exactas están en [la guía de prueba](README.md).

Además se corrigió una diferencia entre el instalador y el runtime de Hypa:
el resolvedor del runtime no consultaba PATH y no encontraba la instalación
Homebrew de esta máquina. Ahora respeta `HYPA_BIN`, consulta rutas absolutas de
PATH y conserva las ubicaciones históricas como fallback. No se cambia su modo
automático ni la lista de comandos que envuelve.

## Compresión: medición sobre salidas reales de Pi

Los números siguientes cuentan tokens con `o200k_base` sobre el texto realmente
entregado, incluido el aviso de recuperación. No son el porcentaje que anuncia
el compresor ni una previsión sobre sesiones completas.

| Salida | Origen | Tokens Pi | Con Headroom final | Reducción | Wrapper Hypa |
| --- | --- | ---: | ---: | ---: | ---: |
| Inventario de 139 archivos | Metadatos del checkout | 5.563 | 3.610 | 35,11 % | 0 % |
| 180 diagnósticos, uno fallido | Caso sintético | 4.151 | 2.478 | 40,30 % | 0 % |
| 320 líneas de log | Caso sintético | 8.958 | 8.958 | 0 %: protegido | 0 % |
| Salida de tests de Ein | Ejecución real | 3.145 | 3.145 | 0 %: protegido | 0 % |
| Fuente TypeScript | Archivo real | 2.631 | 2.631 | 0 %: protegido | 0 % |
| Diff de Git | Historial real; Pi ya lo truncó | 14.733 | 14.733 | 0 %: protegido | 63,61 % |
| Historial de Git | Historial real | 3.027 | 3.027 | 0 %: protegido | 28,61 % |

Hypa se probó con su binario resuelto explícitamente y el mismo `buildHypaCommand`
que utiliza Ein. No se le atribuye soporte para los `cat` del experimento: ese
wrapper no los intercepta. También se ensayó `hypa compress` como brazo separado,
porque Ein no usa hoy esa API. No mostró ahorro en los JSON del corpus. Esta
comparación mide tamaño; no audita exhaustivamente la fidelidad de los reducers
de Hypa.

El encaje demostrado es complementario: Headroom actúa en las dos salidas JSON;
Hypa aporta reducción en Git. La extensión evita comprimir otra vez una salida
que ya pasó por Hypa. No hay motivo demostrado para reemplazarlo.

## Tareas completas con modelo real

Se ejecutaron tres versiones del piloto, 12 sesiones por versión. Cada versión
comparó las mismas tres tareas dos veces, con y sin extensión, alternando el
orden. Se utilizó Pi 0.84.4 y gpt-5.6-luna con thinking low. Los directorios y
sesiones eran nuevos, con el contrato real de `sdd-apply` en modo ad-hoc.

Las tareas fueron reparar una función pequeña, calcular un inventario completo
y extraer datos exactos de un log. La reparación se comprobó con tests reservados
que el modelo no recibió; las respuestas del inventario y log se compararon con
valores calculados fuera del modelo. Se inspeccionaron cambios dentro de cada
árbol de trabajo. No es una prueba de confinamiento ni del SDD completo.

La versión final pasó las 12 ejecuciones:

| Medida de las seis tareas por brazo | Sin extensión | Con extensión |
| --- | ---: | ---: |
| Tareas verificadas | 6/6 | 6/6 |
| Tokens totales, incluida salida y caché | 206.155 | 199.846 |
| Coste reportado por Pi, USD | 0,02323396 | 0,02090256 |
| Tiempo acumulado de las ejecuciones, segundos | 110,871 | 137,640 |
| Turnos | 29 | 32 |

Observado: **3,06 % menos tokens, 10,03 % menos coste reportado y 24,14 % más
tiempo**. No se ha demostrado una mejora causal consistente en coste o latencia.
La caché no se normalizó; las ejecuciones del modelo variaron. Incluso el control
de logs, que el perfil final deja idéntico, produjo diferencias de turnos y
coste. Esa variación muestra por qué no debemos convertir el 10 % en una promesa.

En las tareas de reparación hubo 8,94 % menos tokens, pero el coste reportado
subió 10,12 %. En el inventario hubo 3,60 % menos tokens y 29,57 % menos coste,
pero más tiempo. El ahorro de un bloque no se traslada automáticamente al coste
por tarea correcta. [Datos completos](metrics.json).

## Fallos encontrados y correcciones

**Primera versión: 11/12 ejecuciones correctas.** La compresión del log cambió
la representación de una línea de error. La integración añadió esa línea
original como diagnóstico adicional; la vista mostraba dos representaciones del
mismo suceso. Una ejecución contó dos errores en vez de uno, incluso después
de recuperar el archivo original mediante `read`. Se retiró la compresión de
logs. No se ocultó el fallo ni se declaró que CCR garantiza respuestas correctas.

**Segunda versión: 12/12 correctas, con reparaciones internas y mayor coste
agregado.** El inventario tabular llegó como string JSON escapado y el agente
intentó interpretar el archivo original como CSV. Un comando falló y hubo pasos
adicionales para descubrir el formato. Se normalizó esa vista y se aclaró que
los archivos conservan su formato JSON. El conjunto de esta versión consumió
3,30 % más tokens y tuvo 14,99 % más coste reportado que su control.

**Versión final: 12/12 correctas.** La comparación íntegra de tablas está activa,
los logs permanecen intactos y la presentación explica la diferencia entre
vista y archivo. Las repeticiones del inventario no reprodujeron el intento
de parsear el archivo como CSV. No implica que nunca pueda volver a ocurrir.

Se reutilizaron los mismos casos para ajustar la integración: esto es un piloto
de ingeniería, no una evaluación confirmatoria sobre tareas no vistas.
[Resumen de las iteraciones anteriores](iterations.json).

## Coste de operación y verificación

- Entorno aislado: 537 MiB instalados y 92 distribuciones Python. No se instalaron
  dependencias Headroom en el runtime normal de Ein ni en su package.json.
- El proceso conservador mostró aproximadamente 40–100 MiB de RSS en las
  observaciones realizadas; no es una medición exhaustiva del pico de memoria.
- Diez peticiones calientes: mediana 7,95 ms, máximo 12,49 ms. Una primera
  petición de investigación tardó 4,8 s: con el timeout normal de 1,5 s se
  conserva la salida original. No se evalúa aquí el coste del perfil ML.
- Una sesión Pi con servicio no disponible conservó el resultado byte a byte.
  La salida del fallo local no sustituyó la salida de la herramienta.
- La herramienta `read` nativa de Pi recuperó el original de 18.091 bytes sin
  diferencias, también después de apagar Headroom.
- Suite completa: 3.190 pass, 0 fail. Tras el último cambio de presentación:
  59 pruebas enfocadas pass, 0 fail y typecheck correcto.
- El paquete host se reconstruyó y sus cuatro archivos de runtime modificados
  coinciden byte a byte con las fuentes. No se desplegó en el Ein habitual.
- Los tres servicios de ensayo se apagaron y se eliminaron las copias de
  autenticación del hogar Pi temporal.

La primera ejecución de la suite tenía errores porque el worktree aún no tenía
generado `installer/src/assets/template.tar.gz`. Tras construirlo, la suite
completa pasó. Se conservan ambos registros para distinguir preparación de
entorno y regresiones del cambio.

## Decisión para Ein

Mantener esta integración como **experimento opcional**, sin activar compresión
general, añadirla al instalador ni sustituir Hypa. Es adecuada para investigar
sesiones con respuestas JSON grandes. No ha demostrado ser una mejora general
del recorrido habitual de Ein.

Headroom tiene mucha más adopción visible: la consulta de GitHub registró 70.890
estrellas frente a 180 de Hypa y actividad más reciente. Eso justifica mirarlo;
no demuestra fiabilidad para los contratos de Ein. [Snapshot](repository-metadata.json),
[Headroom](https://github.com/headroomlabs-ai/headroom),
[Hypa](https://github.com/Hypabolic/Hypa).

El beneficio verificado procede de representar tablas con menos redundancia.
Antes de asumir el coste permanente de un servicio de 537 MiB, también merece
compararse con una representación tabular local sencilla. El siguiente paso
proporcional es observar sesiones habituales de Ein y medir cuánto JSON elegible
aparece realmente. La promoción dependería de ahorro repetido por tarea correcta
en casos nuevos, contando relecturas, errores, caché, tiempo y mantenimiento.

## Evidencia

La evidencia local contiene corpus, salidas de cada brazo, prompts, sesiones,
tests reservados, resultados fallidos, fuentes de las tres versiones, comprobaciones
del paquete y manifiesto SHA-256 por archivo. Excluye credenciales y dependencias.

[Archivo completo](../../.pi/ein/evidence/headroom-2026-09-09.tar.gz).
Los JSON resumidos quedan versionados; el archivo completo es local y no forma
parte de Git. Las instrucciones para repetir están en [README.md](README.md).
