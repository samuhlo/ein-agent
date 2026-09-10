# Pensar bien para ejecutar más barato: implementación y evaluación

> Registro histórico. La [decisión vigente](../docs/adr/0006-remove-runtime-compressors.md) retira ambos compresores de Ein.

2026-09-09. Alcance aprobado: reparar el traspaso entre fases, entregar encargos cerrados, medir el conjunto y evaluar Headroom como opción. **La ejecución local sigue siendo futura y opcional.** No se han probado Qwen ni una GPU local, ni cambiado los modelos instalados del usuario.

## Decisión

Las PR #403 y #404 son un paso positivo para el piloto supervisado de pensantes caros y ejecutores baratos. Conservan la arquitectura y los controles de calidad. Hay ahorro observado en comparaciones equivalentes, aunque no en todas las clases. **No se promociona el diagnóstico con obligaciones históricas como recorrido barato fiable. Headroom queda opcional y no se recomienda activarlo para ahorrar dinero con estos resultados.**

No se afirma un resultado universalmente óptimo ni la estabilidad exigida por el ADR 0005. Tres pares por escenario no sustituyen sus veinte grupos por clase ni garantizan que un modelo siga cada instrucción.

## Qué cambia

**#403 — Traspaso fiable.** Los hijos foreground reciben explícitamente sus proveedores: scope puede escribir el delta OpenSpec y los cinco roles con bash conservan el control del comando efectivo. La evidencia de bash se registra desde eventos nativos, con comando, cwd, resultado observado, sesión, salida recuperable y SHA-256. El índice conserva hechos; no acredita comportamiento ni confina el shell. Un error de registro permanece visible. Se distinguen claves de intent malformadas, duplicadas y obsoletas; se evita interpretar encabezados sin tareas como grupos y prohibiciones con «ni» como autorización de entrega.

**#404 — Menos trabajo para el ejecutor.** Una petición humana observada, completa y autorizada puede formar el acuerdo sin una pregunta ritual. Una duda, cancelación o cambio material no queda confirmado por silencio. El grupo existente de packet v2 llega a apply con sus instrucciones literales, notas y subpasos; el runtime comprueba fuentes y grupo antes del lanzamiento y otra vez en el hijo. La vía antigua permanece disponible para planes no compatibles: no se convierte un parser experimental en un bloqueo universal.

Las skills explícitas y las convenciones del proyecto se conservan. Las descripciones genéricas dejan de obligar a cargar frameworks ajenos. Las fases reciben el acuerdo vigente y el runtime coloca su clave al producir un artefacto completo; no retoca documentos anteriores para fingir que incorporan una decisión nueva. Un acuerdo cambiado durante la fase bloquea la mutación. La corrección pequeña usa apply y verify independientes sin producir SDD.

Dos hallazgos de las pruebas quedaron corregidos: el packet conserva `||` y uniones `A | B` dentro de una instrucción, y verify puede consultar el registro nativo de escrituras sin exigir un duplicado documental. La instrucción final también exige resolver cada obligación histórica y cada bloqueo anterior con evidencia concreta. Verificar el código actual no demuestra retrospectivamente que se siguió un procedimiento.

**#401 — Headroom.** Se conecta explícitamente a apply/verify foreground. La vista breve de comprobaciones tiene prioridad en ambos órdenes de registro; los datos elegibles pueden pasar por compresión reversible. Se conservan los errores, el original y los metadatos. No se comprime por segunda vez una vista de comprobación.

No se incorporaron pi-lens, nuevos roles de agente, packet v3, un segundo orquestador, otra máquina de estados ni un sistema de memoria. El trabajo se hizo en worktrees independientes; el checkout original, con cambios de otros agentes, se dejó intacto. No se hicieron resets ni merges de PR.

## Preparación y versiones

- Referencia: `3c5231b`; candidata de la matriz completa: `5c954cd`. Pi **0.85.1**, pi-subagents **0.66.0**, Bun **1.3.14**, host macOS arm64. Headroom **0.37.0** en un servicio local propiedad de la prueba.
- Padre/design: Astra con thinking high; scope/tasks: Sol high; map/apply/verify/close: Luna low. Se mantuvieron los perfiles por comparación. Los nombres y consumos reales están en las sesiones, no inferidos de la configuración.
- Quince pares: tres correcciones pequeñas foreground, tres CSV con decisión de producto, tres cambios de progreso de varios archivos, tres reparaciones STUN y tres diagnósticos de mil registros. Los cuatro últimos usan SDD completo y background. Cada hijo comienza fresh y las escrituras son secuenciales dentro de su proyecto.
- Fuentes iniciales, criterios, modelos, paquetes y archivos gestionados se verificaron antes/después. Se normalizó únicamente el orden de campos de routing que reescribe Pi, conservando sus valores y el cuerpo de los agentes. Los scripts/oráculos están fuera del alcance del ejecutor.
- El guard defensivo `fb8e7ab` rechaza preguntas pendientes en `record`: las veinte llamadas observadas no contienen preguntas, por lo que no altera esos traspasos. La instrucción final de verify (`4e8d3b7`) y la reparación del parser (`fa48bbd`) tienen pruebas reales específicas. **La matriz económica completa no se repitió sobre la última revisión.** Sus cifras describen la revisión medida, no una promesa económica de cada byte final.

Los costes son estimaciones declaradas por el SDK, no factura. Se incluyen las reparaciones, continuaciones y fallos observados del flujo; se excluye el trabajo de desarrollo y auditoría de esta PR. Cuotas, errores de WebSocket y arranques sin una sola llamada de modelo se conservan. El uso no comunicado sigue marcado como parcial. Hubo ejecuciones concurrentes, por lo que la latencia se conserva como dato descriptivo y no como efecto causal demostrado.

## Resultado del flujo completo

Las comprobaciones funcionales primarias pasan en **30/30 implementaciones**. Eso no equivale a treinta flujos correctamente acreditados.

Fuera del diagnóstico histórico, la candidata termina **12/12** con el protocolo evaluado; la referencia, **10/12**. La referencia deja un archivo SDD en una corrección que lo excluía y archiva otro caso con cobertura declarada parcial. La candidata necesita una reparación de cobertura en CSV y una recuperación de coordinación en STUN; sus consumos están incluidos.

Para valorar ahorro se excluyen los pares sin calidad equivalente, con facturación parcial y **todos los diagnósticos históricos**, después de la auditoría descrita abajo. Quedan siete pares comparables:

| Medida, suma de siete pares | Referencia | Candidata | Cambio |
|---|---:|---:|---:|
| Coste total estimado | USD 18,6002 | USD 17,0639 | **−8,3 %** |
| Tokens procesados, incluida caché | 10.893.424 | 10.199.669 | −6,4 % |
| Entrada no cacheada | 1.532.834 | 1.453.766 | −5,2 % |
| Lecturas de caché | 9.248.128 | 8.631.040 | −6,7 % |
| Salida | 112.462 | 114.863 | +2,1 % |
| Coste del padre | USD 13,3839 | USD 12,0772 | −9,8 % |
| Turnos del padre | 213 | 186 | −12,7 % |

Los pares son small 1/3, CSV 1/2, progress 2 y STUN 1/2. Las dos correcciones pequeñas comparables ahorran aproximadamente 54 % y 61 %. CSV y progreso incluyen regresiones de coste; no se les atribuye ahorro uniforme. Los datos completos, incluidas las exclusiones y los intentos sin éxito, están en [el JSON de resultados](closed-cheap-flow-2026-09-09.json).

**Arranque y contexto son otra medida.** La mediana de entrada del primer turno apenas cambia: 23.927 → 23.901 tokens. En los doce casos no históricos, la mediana del pico del padre baja 44.283 → 42.560, pero el máximo sube 51.416 → 55.740. Esta entrega reduce trabajo repetido; **no demuestra que el padre nunca se llene ni una gran reducción adicional del arranque**. Estos valores incluyen entrada cacheada del turno, no el acumulado de todos los turnos, y no se traducen a VRAM ni a una ventana local disponible.

## Mismo encargo cerrado: caro frente a barato

Se ejecutaron **doce pares, veinticuatro recorridos apply + verify**, con un plan congelado común por caso. Apply usa Astra low o Luna low; Verify independiente conserva Luna low. Las doce parejas tienen exactamente el mismo digest del primer packet. No hay padre de modelo en este experimento: mide la ejecución una vez preparado el trabajo, no el precio completo de planificarlo.

| Tres repeticiones por clase | Astra apply + Luna verify | Luna apply + Luna verify | PASS completo inicial |
|---|---:|---:|---:|
| CSV | USD 1,4157 | USD 0,0524 | 3/3 en ambos |
| Progreso | USD 1,7155 | USD 0,0542 | 3/3 en ambos |
| STUN | USD 1,3515 | USD 0,0567 | 3/3 en ambos |
| Diagnóstico histórico | USD 3,5668 | USD 0,0785 | 3/3 frente a 1/3 declarados; clase no promovida |

En las tres clases ordinarias, el barato completa **9/9**, con **96,4 % menos coste de ejecución y revisión en esta muestra**. No se aplica ese porcentaje a la planificación ni al conjunto. Las comprobaciones externas ampliadas pasan en **24/24** implementaciones.

Dos limitaciones de preparación son relevantes. El plan de progreso escribía el formato como `<hechos>/<total> (<porcentaje>%)`, que el guard existente interpreta como pendiente. Antes de cualquier modelo se sustituyó esa notación por la concatenación equivalente en los seis brazos; se conserva el original y se declara preparación supervisada. El plan STUN era válido pero contenía `||`: se corrigió el parser y sus seis brazos se ejecutaron con el paquete final, sin modificar ese plan. No se presenta esta preparación como éxito autónomo del planificador.

## Qué impidió aprobar el diagnóstico histórico

La petición exigía ejecutar el diagnóstico antes de editar y consultar sus mil registros completos. Los oráculos funcionales comprueban el resultado y los IDs históricos `[13,991]`, pero no demuestran cómo se obtuvieron.

La revisión de eventos nativos encontró que varios PASS solo disponían de la cola visible de 438 registros y un parseo/resumen. En report-2-before hay recuperación por fragmentos; en report-3-after aparecen los mil identificadores en tres lecturas, pero el diseño había exigido cuarenta rangos pequeños y otro orden de escrituras. **No se equipara presencia de mil identificadores con cumplimiento de todos los campos, pasos y requisitos de procedencia.** Se conserva esta distinción y se excluye la clase del ahorro aceptado.

La primera aclaración de verify aprobó un caso sin resolver el procedimiento histórico exigido. Esa revisión no se entrega como resultado válido. La instrucción final se probó con dos defectos de código conocidos y tres repeticiones del caso con el plan histórico incumplido: **5/5 quedan bloqueados**, con el código intacto. Tres controles positivos aprueban. Persisten dos bloqueos que requieren valoración: una revisión cara confirma un incumplimiento histórico real y resuelve el otro consultando la sesión original. Es evidencia para reservar razonamiento suficiente a estas revisiones, no para abaratar verify indiscriminadamente.

También se ejecutó una comprobación adicional fuera del dominio solicitado: 29/30 implementaciones conservan ese comportamiento. report-1-after cambia fracciones/infinitos, que su diseño había dejado expresamente sin garantías de compatibilidad. No se añade ese requisito a posteriori al oráculo primario ni se oculta el resultado; refuerza que esta clase necesita un encargo mejor delimitado antes de promoverla.

La lección de simplicidad es concreta: no inventar ceremonias históricas, pero tampoco sustituir por un resumen una evidencia que sí era obligatoria. Las referencias nativas permiten revisar lo sucedido sin pedir al ejecutor que fabrique otro historial.

## Headroom: menos bytes, sin ahorro total acreditado

Tres pares foreground con el mismo plan y modelos, sobre la candidata con Headroom:

- Los tres casos `on` producen una compresión verificada y recuperan el original completo. Cada representación ahorra **31.880 bytes frente a la vista nativa de Pi**, aproximadamente 62 %, y 97.323 frente al original. No hay pérdida de registros acreditada por el verificador reversible.
- El coste observado de apply + verify suma **USD 0,0761 off → 0,0996 on**. Un primer verify de `on` bloquea por el registro de escrituras y precisa revisión; incluirla aumenta su coste. Por tanto no se atribuye ahorro equivalente al conjunto ni una mejora de latencia.
- El servicio añade 1,46 s acumulados en esas tres compresiones. Una lectura final de RSS da unos 100 MiB; no es memoria máxima ni coste de instalación/mantenimiento completo.
- Con el SDK nativo, ambos órdenes de extensiones convierten una vista de comprobación de **43.449 → 1.371 bytes**, conservando el original de 151.573 bytes y sus metadatos, con **cero llamadas de compresión**. Este ahorro es del preview de verify, no se suma al de Headroom.

Se mantienen las pruebas de servicio ausente, formatos no elegibles, rechazo de transformaciones inválidas y conservación de errores. La recomendación es mantener Headroom apagado salvo un caso concreto donde compense su servicio y sus lecturas posteriores.

## Continuidad, herramientas habituales y controles

Dos sesiones realizaron tres cambios sucesivos, compactación manual real y reapertura del proceso sobre la misma sesión. Ambas conservan las reglas y pasan trece comprobaciones cada una. Ni compactar ni la consulta de solo lectura modifica source/tests. Los doce hijos son fresh. La referencia abre tres rondas de preguntas; la candidata, cero. Los turnos del padre bajan **42 → 15** en este par. No se publica un coste completo de compactación porque el SDK no lo expone íntegro.

Se añadió un par con los paquetes habituales y los conectores Engram/Context7 configurados: sesenta y dos herramientas disponibles. El código correcto y el menor número de turnos se conservan. La candidata omite el campo literal `behavior_coverage` aunque declare cobertura verificada en prosa; este smoke no entra en la comparación económica aceptada. Los diálogos de preparación y los arranques fallidos sin modelo también se conservan.

Validación final:

- **3.303 tests, cero fallos** en la combinación con Headroom; typecheck raíz/instalador y empaquetado host correctos.
- CI de #403 y #404 en Linux/macOS y documentación. Un intento de CI falló descargando un índice APT con hash inconsistente y canceló macOS; el reintento pasó. No se disfrazó como fallo del código ni se modificó CI para ocultarlo.
- Proveedor nativo del paquete extraído: siete fases y guard de los cinco roles con bash. Pruebas de intención cambiada/cancelada, fuente obsoleta, claves inválidas, TDD estricto y evidencia incompleta se mantienen.
- Compatibilidad con #402: **42 tests**, conservando sus avisos y comprobando las obligaciones de comunicación, no una redacción antigua exacta.
- En la matriz no se detectan archivos de implementación fuera del alcance en el diff final, ni escrituras nativas de source/tests desde otro rol. No se observan comandos de entrega/reset. Esto no equivale a confinamiento de bash ni prueba por sí solo que nunca existiera una escritura transitoria.

## Evidencias y revisión

Los resultados numéricos públicos acompañan este documento. El archivo privado duradero conserva scripts, fixtures, planes, resultados, logs y trazas saneadas sin bloques privados de pensamiento, firmas ni credenciales. Su ruta y SHA-256 se registran en `closed-cheap-flow-2026-09-09-evidence.json`. Las sesiones originales de prueba se conservan aparte para auditoría; las copias de autenticación y el servicio propiedad de la prueba se retiran al terminar.

Orden de revisión: **#403 → #404**. #401 conserva su revisión separada como opción, sobre esa base. #402 sigue siendo la PR de comunicación de su autor. No se ha hecho merge de ninguna.

El principio tomado de [gentle-pi](https://github.com/Gentleman-Programming/gentle-pi/tree/f1dcbff9e1ed9c314503aebcd9210bb6c344d595) es seleccionar rutas pertinentes y cargar después la skill completa; no recortar semánticamente sus reglas ni trasladar un catálogo entero al ejecutor. Ein reutiliza su registro y su packet existentes. Esta evaluación compara Ein antes/después; no midió el coste de ejecutar gentle-pi.
