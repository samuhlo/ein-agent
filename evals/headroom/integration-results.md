# Headroom como integración de Ein-Pi

Fecha: 2026-09-09. Worktree: `experiment/pi-headroom`, sobre el piloto `1a15c79`.

Este informe conserva la evaluación del runtime. La integración posterior del
instalador opcional, Python 3.14 y sus medidas se documentan en
[Tamaño e instalación](size-and-installation.md); no se recalculan estos ensayos
del modelo a partir de las pruebas de empaquetado.

**La conversión del runtime está implementada y es publicable con el alcance
descrito aquí.** Headroom sustituye el wrapper de Hypa, dispone de configuración,
servicio gestionado, actualización comprobada y recuperación. La mejora más
clara es entregar informes completos con menos texto. No se promete ahorro fijo
en cualquier tarea ni se sustituye la verificación SDD por el compresor.

## Resultado medido

La evaluación final ejecutó **40 sesiones reales de Pi**: cuatro clases de
trabajo, cinco repeticiones por clase y dos brazos, con/sin Headroom. Pasaron
20/20 tareas en cada brazo. Se conservaron todas las ejecuciones, incluidas las
dos iteraciones anteriores y sus fallos.

En las 14 salidas donde se aplicó compresión:

| Medida | Bytes |
| --- | ---: |
| Originales completos | 1.315.585 |
| Vista que Pi iba a entregar | 665.804 |
| Vista final con Headroom, incluido su aviso | 421.991 |

La vista final ocupó **36,62 % menos que la vista de Pi**, y además **nueve
resultados recuperaron el informe completo** que Pi había recortado. Esos nueve
casos contienen informes de 900–1.000 registros. La comprobación de todas las
filas y valores precede a la entrega. El ahorro frente a los originales completos
fue 67,92 %, pero ese porcentaje no se presenta como ahorro respecto a Pi: Pi
ya había truncado parte de los datos.

Las tareas completas dieron estos resultados:

| Clase: cinco pares | Tokens sin/con | Variación con Headroom | Tareas correctas sin/con |
| --- | ---: | ---: | ---: |
| Reparación guiada por informe de 1.000 checks | 437.076 / 468.162 | +7,11 % | 5/5 — 5/5 |
| Consulta de respuesta API de 900 registros | 260.578 / 219.265 | −15,85 % | 5/5 — 5/5 |
| Recuento exacto de logs y duplicados | 241.749 / 238.757 | −1,24 % | 5/5 — 5/5 |
| Cambio pequeño, sin salida elegible | 116.322 / 117.920 | +1,37 % | 5/5 — 5/5 |
| **Total** | **1.055.725 / 1.044.104** | **−1,10 %** | **20/20 — 20/20** |

El tiempo acumulado pasó de 436,179 a 392,478 segundos (−10,02 %); los turnos,
de 118 a 109. El coste **estimado por Pi**, no una factura, pasó de 0,09674776 a
0,09177896 USD (−5,14 %). En la clase API hubo 14,79 % menos tiempo.

La interpretación es deliberadamente limitada: el transporte mejora de forma
comprobable, mientras que el efecto sobre tareas completas depende también de
relecturas, decisiones del modelo y caché. Incluso el control pequeño, donde no
se comprimió nada, varió entre brazos. No puede atribuirse toda diferencia al
compresor. [Mediciones y ejecuciones](integration-metrics.json).

## Qué cambió en el producto

- El gate de comandos mantiene sus comprobaciones y deja de llamar a
  `maybeWrapBashInput`. Headroom no altera el comando ni toma posesión del shell.
- El catálogo de ajustes, onboarding, banner y doctor muestran Headroom. Se
  respeta un Hypa previamente apagado. La configuración inválida conserva la
  salida normal; `/ein:hypa` explica la transición sin ejecutar el binario.
- `/ein:headroom` ofrece on, observe, off, status, start, stop, retry, update y
  rollback. La preferencia es por proyecto y los overrides de entorno se muestran.
- Ein interactivo inicia un binario instalado en segundo plano. Los workers
  reutilizan el servicio; no compiten por iniciar otro. El cierre termina solo
  el proceso propio. Un servicio externo nunca se detiene por esta vía.
- Las actualizaciones preparan otra instalación y otro puerto, comprueban la
  identidad del proceso y ejecutan casos de compatibilidad reales. Solo entonces
  cambian la selección. Se conserva una versión gestionada anterior para rollback.
- La cancelación y los fallos no sustituyen los resultados de Pi ni cambian sus
  flags de error. El servicio no recibe las credenciales del proveedor por entorno.
- El original se archiva con permisos privados y un ignore propio. Sigue siendo
  accesible con `read` después de detener Headroom. Las mediciones sobreviven al
  historial de la sesión y no se convierten en evidencia SDD.

La selección de dependencias en el instalador se dejó para la fase indicada por
el usuario. Se aclararon los textos de Hypa para no anunciar un wrapper que ya
no ejecuta Ein-Pi. No se añadió una elección entre motores ni una dependencia
obligatoria de Headroom al instalador.

## Verificación de datos

La extensión consulta `/v1/compress` únicamente con el resultado nuevo. Acepta
una representación cuando puede compararla completamente con el original.

En tablas comprueba todas las columnas, tipos, valores, filas y orden. Incluye
comas, comillas y saltos dentro de strings. Rechaza claves duplicadas, números
cuya precisión no puede conservar y la ambigüedad entre null y string vacío.
Un pie añadido por el shell se conserva fuera de la tabla, íntegro y una vez.

En logs reconstruye el prefijo temporal de cada línea y compara la secuencia
original, con duplicados. Expande las líneas de diagnóstico **en su misma
posición** para que su fecha esté visible sin generar una segunda ocurrencia.

Las formas no admitidas pasan intactas. No se pretende verificar resúmenes
semánticos arbitrarios, código comprimido por ML o todo formato que pueda emitir
Headroom. Los límites y comandos están en [la guía](README.md).

## Problemas que el ensayo encontró

La primera iteración tuvo 38/40 tareas correctas: una por brazo perdió un ID
temprano de un informe recortado. En la ejecución con Headroom el modelo añadió
un pie al JSON y la extensión no lo consideró elegible. Se amplió el tratamiento
de pies conservándolos completos. Los logs también provocaron relecturas costosas;
se pasó a mostrar las fechas completas de los diagnósticos en su línea original.

La segunda tuvo 39/40: el código reparado pasó, pero una ejecución escribió IDs
numéricos como strings. Se hizo explícito en la vista que los tipos de columna
deben conservarse al escribir JSON. No se normalizó la respuesta para convertir
ese fallo en un pass ni se relajó el verificador.

La última tuvo 40/40. Son iteraciones sobre las mismas clases de casos, con
datos y expectativas registrados antes de cada tanda; **no son una evaluación
ciega sobre clases nunca vistas**. La diferencia respecto a las primeras tandas
sirve para depurar la integración, no para anunciar una mejora estadística
general. [Historial de iteraciones](integration-iterations.json).

## Alcance de las pruebas

- Pi 0.84.4, Bun 1.3.14, Headroom 0.37.0, Python 3.13.14; macOS arm64.
- Modelo real: gpt-5.6-luna con thinking low, proveedor openai-codex. Orden de
  brazos alternado. No se normalizó la caché ni se forzó la misma secuencia de
  herramientas del modelo: los desvíos y sus costes se conservaron.
- Los informes se generan ejecutando código; las respuestas API y los logs son
  datasets controlados, no tráfico de clientes. El control pequeño no comprime.
- El contrato de `sdd-apply` se usó en modo ad-hoc. Las reparaciones tienen tests
  reservados; los JSON se comparan fuera del modelo, incluidos tipos y duplicados.
- Se inspeccionaron cambios dentro de cada árbol. No se afirma confinamiento del
  modelo ni una prueba completa del orquestador SDD en proyectos de producción.
- **Suite final: 3.204 pass, 0 fail; typecheck correcto.** Incluye migración,
  ausencia de doble wrapper, conservación del spool real de Pi, cancelación,
  corrupción de respuestas, límites, permisos, symlinks, git ignore, actualización,
  bloqueo concurrente, recuperación de dueño muerto y rollback.
- Prueba real con **todas las extensiones de Ein**: 40 comandos, Headroom y alias
  registrados una vez, ajustes persistidos, update nativo, arranque/parada propia,
  reinicio y cierre. Otra prueba confirmó el arranque en segundo plano. Cero
  llamadas al modelo en estas comprobaciones de control.
- El paquete host contiene los módulos y manifiesto finales, comprobados byte
  a byte. Las pruebas no desplegaron esta rama sobre el Ein habitual del usuario.

## Decisión de publicación

Publicar como integración optativa y verificada de Ein-Pi, centrada en resultados
grandes que puede conservar íntegramente. La mejora de cobertura y tamaño está
comprobada y hay una señal favorable en la clase API; el ahorro global es pequeño
y variable en esta muestra. No anunciar un porcentaje universal ni que todo
resultado de herramientas pasa por Headroom.

El instalador de motores, la ampliación a MCP y otros formatos, y la compresión
semántica con pérdida quedan fuera de esta entrega. Tampoco se sustituye la
verificación independiente del trabajo del modelo.

## Evidencia y reproducción

`headroom-acceptance-pilot.ts` congela el corpus y conserva todas las ejecuciones.
`headroom-acceptance-summary.py` cuenta vistas y resultados sin descartar fallos.
`verify-headroom-runtime.ts` utiliza el mismo comprobador que el mantenimiento
nativo. Las instrucciones están en [README.md](README.md).

El archivo local incluye las tres tandas, comandos, sesiones, verificaciones,
fuentes, pruebas RPC, resultados de mantenimiento, logs de checks y manifiesto
SHA-256. Excluye credenciales y entornos de dependencias.

[Evidencia completa](../../.pi/ein/evidence/headroom-integration-2026-09-09.tar.gz).
Los resúmenes y código quedan versionados; el archivo completo es local.
