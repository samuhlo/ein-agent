# Menos coordinación del padre — 2026-09-09

El objetivo es reservar los modelos caros para decisiones y dar a los ejecutores baratos rutas cortas con contexto fresco. La referencia es #398 (`78c1cd2`), que ya incluye la reducción inicial del orquestador y las mejoras de apply/verify. Esta comparación mide el incremento de la nueva PR, no lo vuelve a atribuir al trabajo anterior.

## Resultado conjunto

Cuatro comparaciones: dos módulos reales copiados y dos repeticiones por módulo, con los mismos modelos, fuente inicial, scope, map, configuración y petición en cada caso. Las cuatro candidatas finales terminan con verify pass y cobertura declarada verified. La referencia termina con un PASS/verified, un PASS/partial y dos FAIL/partial. Se mide una pasada hasta el primer veredicto independiente, no el coste de remediar las referencias hasta que pasen.

| Medida | Antes | Después | Reducción |
|---|---:|---:|---:|
| Turnos del padre, suma de cuatro flujos | 92 | 58 | 37,0% |
| Tokens del padre, suma | 2.923.439 | 1.720.908 | 41,1% |
| Tokens de padre + cuatro fases, suma | 3.641.735 | 2.440.495 | 33,0% |
| Coste estimado del flujo, suma USD | 6.6608 | 4.9133 | 26,2% |
| Tiempo medio por flujo, segundos | 412.4 | 370.5 | 10,1% |
| Mayor entrada del padre por flujo, media | 37.230 | 33.073 | 11,2% |

El coste estimado baja en las cuatro comparaciones. La latencia baja en tres; `progress 1` sube ligeramente por más trabajo de las fases. No se presenta una mejora universal de tiempo.

| Caso | Turnos padre | Tokens totales | USD estimados | Segundos |
|---|---:|---:|---:|---:|
| stun 1 | 23 → 14 | 890.924 → 581.083 | 1.615 → 1.245 | 375 → 357 |
| stun 2 | 23 → 14 | 931.427 → 564.011 | 1.603 → 1.152 | 424 → 330 |
| progress 1 | 23 → 15 | 897.207 → 668.020 | 1.840 → 1.222 | 396 → 409 |
| progress 2 | 23 → 15 | 922.177 → 627.381 | 1.603 → 1.294 | 456 → 386 |

Las consultas `ein_sdd_status` pasan de 20 a 4 en los cuatro flujos. Todos los hijos se lanzan explícitamente con `context: fresh`; no heredan la conversación del padre. Su mayor entrada observada en la candidata es 14.464 tokens. El padre no edita código ni artefactos en ninguna de las ocho ejecuciones de la comparación final.

**Cómo leer los números:** los tokens procesados suman entrada no cacheada, salida y cache read/write; no son el máximo simultáneo. El pico de entrada se mide aparte, como el mayor input+cache de una petición de cada padre. El arranque medio pasa de 22.935 a 23.096: esta PR reduce principalmente la coordinación posterior, y añade una pequeña instrucción inicial. El coste procede del SDK, no de una factura. Los procesos compartieron máquina/proveedor y la caché varía; los tiempos son indicativos.

## Cambios pequeños sobre herramientas existentes

1. `ein_sdd_check` conserva el informe completo del gate en `details` y devuelve también la siguiente ruta del router existente, la postura registrada y el plan cuando toca apply. Los errores o la ausencia del artefacto solicitado no entregan navegación; un informe válido con status fail conserva los bloqueos del router. No se cachea la ruta entre invocaciones ni se sustituye la verificación de comportamiento por el lint.
2. `ein_sdd_status` muestra la postura TDD/carril registrada, evitando otra consulta para leer la misma decisión. La ausencia o ambigüedad no se convierte en TDD OFF.
3. El padre usa la ruta del check en vez de consultar estado otra vez; se refresca tras cambios intermedios. No redescubre el inventario conocido y deja las skills de implementación al ejecutor. Conserva lecturas de diseño para mecanismo/riesgos y preguntas ante decisiones reales.
4. El resumen del plan reutiliza la frontera declarada existente (`edit:` y etiquetas v1 reconocidas). Separa producción y tests y conserva los campos `verify:` completos. Las rutas de `read:`/prosa y los nombres de skills no se convierten en archivos a modificar ni comandos. Los formatos legacy sin frontera explícita se muestran sin rutas declaradas; no se inventa certeza.

No hay nuevos agentes, herramientas, runner, DSL ni motor de caché. Los contratos de los cuatro agentes y sus modelos/thinking se mantienen. Se retira prosa histórica del contrato para respetar el presupuesto de contexto existente.

## Pruebas y defectos encontrados

- **3.212 tests locales pasan**, typecheck y bundle correctos. Tras corregir una incompatibilidad de tipos en dos aserciones, las cinco pruebas de navegación vuelven a pasar. La CI se exige antes de entregar la PR.
- Pruebas del callback nativo de check: paridad con el router, informe original conservado, plan correcto, artefactos ausentes/incorrectos, verify fail, PASS obsoleto, selección ambigua y postura registrada.
- Sobre una copia de una implementación real de la evaluación: PASS permite recomendar close; FAIL vuelve a verify; informe malformado no produce ruta; eliminar la guarda STUN después del PASS vuelve a verify. No se ejecuta cierre ni se modifica el fixture medido. Esto conserva la frescura del router; no introduce un binding criptográfico nuevo.
- Batería independiente: **19 casos STUN** y **23 casos de progreso**, todos pasan en las diez implementaciones (ocho finales y dos exploratorias). El oráculo de progreso se escribió fuera de los proyectos antes de las implementaciones; el de STUN procede del trabajo anterior. Después se añadió un caso a cada uno para contrastar las lagunas señaladas por verify: hechos fraccionarios negativos y STUN malformado con credenciales. Esas ampliaciones son post hoc, no un holdout preregistrado. No se compara el código solo con sus propios tests generados.
- La referencia produjo dos FAIL por lagunas de cobertura; uno también atribuyó a la implementación el `.gitignore` que el runtime había actualizado al arrancar. Otra referencia produjo PASS/partial. Las fuentes pasan el oráculo independiente, pero eso no convierte sus informes originales en PASS ni mide la remediación pendiente. No se afirma superioridad general de calidad a partir de cuatro muestras.
- El primer candidato hizo aflorar un defecto previo del preview: incluía `EIN.md` desde `read:` y extraía «Bun test» desde `skills:`. El padre tuvo que contrastar tareas, scope y hasta el contrato del agente. Esas dos ejecuciones quedan registradas como exploratorias. Tras corregir el preview se ejecutaron cuatro candidatos finales; ninguno necesita corregir ese resumen.
- El endurecimiento final evita que un `verify:` vacío absorba la línea siguiente y cubre CRLF. Dos ejecuciones candidatas ya habían arrancado antes de ese ajuste defensivo; sus previews sobre las tareas evaluadas son idénticos a los del código final, comprobado por script. Se conservan los hashes por ejecución.
- No se ocultan fallos de apply: hubo lecturas opcionales de `apply-progress.md` todavía ausente y algunos checks fallidos durante implementación, corregidos dentro de la misma ejecución. En `progress 1` candidato hubo un fallo de comportamiento y otro de tipado; su coste/tiempo permanecen en la comparación. No hubo sustitución de modelo ni un segundo agente para maquillar resultados.
- La primera CI encontró una incompatibilidad de sobrecargas de `expect` con los tipos nuevos de Bun. Se corrigió la aserción de test; no se relajó el gate ni se cambió el runtime.

## Alcance y reproducción

Son dos módulos TypeScript pequeños, no una prueba de todos los proyectos ni un óptimo matemático. Se mide design → tasks → apply → verify con scope/map dados, no cierre/entrega ni una conversación con muchos cambios consecutivos. El contexto puede seguir creciendo en sesiones largas. No se ha probado un modelo local. Los MCP externos están desactivados igual en ambos brazos; ambos padres conservan 57 herramientas.

El JSON publicado contiene las parejas, todas las ejecuciones, coste y picos por padre, llamadas y lecturas, comandos/errores por fase, resultados del oráculo, checks del gate e integridad. Los scripts y los fixtures completos se conservan en el archivo local `lean-parent-2026-09-09.tar.gz`, con manifest de SHA-256 verificado, sin credenciales ni dependencias. Se preparan con `prepare.py`, se ejecutan mediante `run.py` y se resumen con `summarize.py`; `integrity.py`, `oracle.ts`, `preview-parity.ts` y `check-native-gates.ts` verifican entradas y resultados. Repetir los modelos requiere autenticación propia en homes aislados y el mismo runtime.
