# Recuperar Ein: trabajo útil, pensamiento capaz y ejecución barata

Fecha: 23 de septiembre de 2026. Estado: recuperación en curso mediante PRs independientes.

## Objetivo y criterio de decisión

Ein debe terminar trabajo autorizado con calidad y un coste razonable. El modelo
capaz entiende, decide y prepara tareas; el ejecutor barato implementa tareas
acotadas. Las herramientas calculan hechos y ejecutan comprobaciones. Una regla
que obliga a reparar el arnés para poder trabajar tiene que justificar su coste
con un fallo real que evita.

La recuperación se considera terminada cuando Claude vuelve a resolver los casos
que funcionaban antes de alpha.10 y Pi completa esos mismos trabajos sin rescates
humanos por burocracia. Tener miles de tests verdes no acredita ese resultado.

## Diagnóstico comprobado y límites

Se han leído los tags locales alpha.9, alpha.10 y alpha.12, los cambios posteriores,
los hooks instalados y las fuentes instaladas relevantes. Se consultaron también
los metadatos de las PR #451, #452, #462 y #468 en GitHub.

- Alpha.9 corresponde a `3b9fa420`; alpha.10 a `d749c83e`; alpha.12 a `39f3a85c`.
  El salto alpha.9 → alpha.10 modifica 253 archivos, con 14.756 líneas añadidas y
  2.036 eliminadas, contando código, pruebas y documentación. El tamaño por sí solo
  no demuestra la causa, pero dificulta aislar regresiones y revertirlas.
- **Claude sufrió un bloqueo nuevo en cada operación.** Alpha.10 añadió un
  `PreToolUse` para Write/Edit/Bash/Task: si no conseguía registrar la operación
  por IPC o faltaba identidad nativa, devolvía `permissionDecision: deny`.
  La corrección `9ff338c0` (#470) lo retiró. Los settings instalados ya reflejan
  esa retirada; no basta recomendar instalar ese arreglo para resolver lo actual.
- **Pi conserva esa clase de bloqueo.** La fuente instalada de
  `extensions/ein-continuity.ts` coincide con alpha.10/11/12. Su `tool_call`
  devuelve `block: true` si falla el inicio de registro o la identidad de la
  operación. Es un mecanismo confirmado, todavía no una reproducción del último
  atasco relatado por Samu.
- **Hay instrucciones incompatibles con el contrato ejecutable.**
  `runtime/assets/orchestrator.md:119` en alpha.12 recomienda el campo `chain`.
  `delegation-admission.ts:314` lo rechaza. Una llamada directa al validador
  instalado con una cadena mínima devolvió `legacy-delegation-reissue-required`.
  El mismo prompt contiene instrucciones distintas sobre quién fija
  `maxRuntimeMs` y una explicación de reconciliación que requiere revisarse frente
  al nuevo recibo de finalización.
- **El reparto económico está desdibujado.** El orquestador, línea 128, recomienda
  por defecto un modelo capaz con razonamiento bajo para apply, generalizando un
  incidente de 135 turnos. Claude instalado asigna Opus a scope/design/tasks,
  Sonnet a apply y Haiku a map/verify/scout/git. Hay que evaluar ese reparto por
  resultados; no se ha medido aquí su coste ni se han comprobado todas las
  asignaciones efectivas de Pi.
- **El manifiesto existe.** Su nombre canónico es `MANIFIESTO.md`; aparece en
  alpha.9, alpha.10 y alpha.12 y no hay diferencias entre esos tags. El archivo
  local tiene cambios previos. No hay evidencia en esas revisiones de una pérdida
  física; sí hay decisiones que contradicen su sección «Arneses sí, burocracia no».
- **Hay varias capas de versión.** Pi declara alpha.12. El `CLAUDE.md` instalado
  coincide con alpha.12, pero el marcador `.claude-ein/.ein-install.json` conserva
  0.91.0-alpha.3. Eso exige identificar el contenido efectivo; el marcador antiguo
  no demuestra que Claude esté ejecutando esa versión.
- Este workspace está en una rama basada en 0.96.0-alpha.3 con numerosos cambios
  locales. Cualquier implementación se prepara en un checkout aislado de la base
  actual. No usar este árbol como si fuese alpha.12 ni resetearlo.

No se han ejecutado sesiones completas con modelos, medido latencias ni aislado
todos los fallos actuales de Claude. Los cambios propuestos abajo son decisiones
de diseño para validar; no se presentan como arreglos ya probados.

### Incidente prioritario aportado por Samu: apply → verify → resume

El log describe una corrección del migrador restringida a `scripts/db/` y sus
pruebas. Apply supera 117 pruebas focales y tipos, pero verify descubre que falta
leer SQLSTATE desde `error.code` y sus causas. Al reanudar apply, el ejecutor se
bloquea por TDD. Samu elige «TDD estricto»; la siguiente reanudación vuelve a
bloquearse porque la decisión no llega al hijo. No se realizan nuevas ediciones.

La revisión independiente aportó valor: detectó un error que 117 pruebas no
cubrían. El fallo del arnés está en transportar una decisión ya tomada durante
la corrección. El aviso de límite de turnos no disponible es ruido en esta
secuencia; el log no lo identifica como causa del bloqueo.

### Incidente aportado por Samu: Claude ejecuta tres piezas en el coordinador

El segundo log muestra tres comportamientos nuevos en el planificador didáctico:
recorte de anexos por módulos, creación de un curso propio con alcance y creación
de un curso del centro. Claude escribió pruebas, composables y páginas desde el
coordinador; hizo casi todas las lecturas con Bash y no delegó ni recorrió SDD.
Terminó con 3.136 pruebas correctas, cuatro omitidas y typecheck correcto, sin
probar el flujo en navegador. Las pruebas aportaron evidencia útil, pero el
modelo coordinador absorbió la ejecución. No consta la petición original completa,
así que no se infiere de este log si debía hacerse una única entrega o varias.

La adaptación de Claude solo decía «delegate substantial work», sin un criterio
concreto para elegir el flujo. La recuperación fija el criterio por comportamiento
y frontera compartida; no añade un veto de herramientas al coordinador.

La inspección del código instalado descubre una ruta compatible con ese fallo:

1. `admitDelegation({action: "resume", id: "fixture", tdd: "strict"})` devuelve
   `{kind: "management", action: "resume"}`. Comprobado ejecutando el validador.
2. `ein-tool-call-gate.ts:114` retorna inmediatamente para `management`, antes de
   resolver y adjuntar el contrato TDD que sí prepara para un lanzamiento normal.
3. El hook del hijo busca el contrato transportado; si falta, vuelve a resolver
   desde tarea/configuración. En modo `ask` puede terminar exigiendo decisión.
4. Intentar añadir `task` a esa forma de resume devuelve otro rechazo:
   `management actions cannot be mixed with execution fields`, también comprobado.

Esto acredita un hueco en el gateway, no la traza completa del runner de aquella
sesión: quedan por comprobar su payload exacto y cómo revive el hijo. La prueba
de integración debe atravesar esa frontera real y no quedarse en el parser.

## Qué conservar de las 18 PR y qué cambiar

Conservar una garantía no obliga a conservar su implementación completa. Antes
de un revert, comprobar dependencias y formatos persistidos: la cadena integrada
no equivale a 18 cambios independientes.

| PR / contenido | Decisión propuesta | Resultado exigido |
|---|---|---|
| #451, citas de Scout | Conservar | Una cita inválida no tira el resto de la investigación. |
| #452, recuperación de Scout | Conservar y medir | Reutilizar evidencia parcial sin repetir el rastreo completo. |
| #453, resultado de verify | Conservar | Un ejemplo o un PASS aislado no convierte un fallo real en éxito. |
| #454, frescura de verify | Conservar la garantía y simplificar su consumo | Verificar el código actual; generar la evidencia desde herramientas, sin ceremonias del modelo. |
| #455, rollback del instalador | Conservar | Recuperar archivos y permisos si una actualización falla. |
| #456, update dry-run | Conservar | Simular no modifica ni termina una recuperación. |
| #457, contrato de delegación | Simplificar | Una llamada válida, documentada y construida por Ein debe ejecutarse. Normalizar compatibilidad inequívoca en el adaptador. |
| #458, reconciliación de fases | Simplificar | Recuperar trabajo terminado sin repetirlo; un recibo ausente no demuestra ni éxito ni fracaso del trabajo. |
| #459, tareas terminadas | Conservar | Router y checklist coinciden; no volver a ejecutar tareas completas. |
| #460, decisión TDD | Prioridad inmediata: conservar y transportar también en resume | Resolver una vez por trabajo; aplicar en el cwd correcto sin preguntar de nuevo. |
| #461, presupuestos | Rediseñar la respuesta al agotamiento | Detener bucles caros preservando avances; devolver el control al planificador sin reiniciar ni bloquear todo el trabajo. |
| #462, compatibilidad SDK | Conservar y verificar el paquete real | El runner instalado acepta exactamente las llamadas que Ein genera. |
| #463, objetivo persistente | Simplificar | Conservar qué se estaba haciendo; no exigir llamadas administrativas en cada interacción. |
| #465, operaciones inciertas | Retirar su veto global; acotar al efecto relevante | Una caída de telemetría no impide editar localmente. Un efecto externo incierto se inspecciona antes de repetirlo. |
| #466, entrevista persistente | Hacerla opcional y ajena al camino normal | Una orden clara empieza a trabajar sin entrevista. Mantener el arreglo de #472 y comprobar todos los consumidores. |
| #467, tamaño de entrega | Conservar el cálculo; acotar el coste | Medir nuevos archivos y entrega real al preparar/publicar; evitar reconstrucciones repetidas sin cambios. |
| #468, archivo de auditoría | Mantener como historia | El plan viejo no gobierna el runtime ni se confunde con trabajo pendiente. |
| #469, release agregada | Cambiar el proceso de entrega | Cada corte futuro demuestra una mejora de uso y tiene una reversión entendible. |

## Secuencia de recuperación

### 1. Fijar una referencia que realmente funcione

Preparar hogares y repositorios temporales para comparar alpha.9, alpha.10 y
alpha.12 con los mismos casos. Registrar versiones de Ein, Pi, Claude, runner,
prompts y asignaciones efectivas. Mantener el runtime externo constante cuando
sea compatible; si alpha.9 necesita otra versión, registrar esa diferencia como
factor de la comparación. No actualizar dependencias durante la comparación.

Comenzar con el caso real que estaba funcionando en Claude: petición, resultado
esperado, primer bloqueo, mensajes y estado del trabajo. Comparar también un
arreglo pequeño y una tarea con varios archivos. Identificar tiempo hasta la
primera edición y quién está consumiendo llamadas antes de producirla.

**Salida:** un caso reproducible por atasco prioritario y una referencia utilizable.
Alpha.9 es candidata a recuperación de Claude, no una cura asumida para Pi ni una
orden de sobrescribir toda la instalación. Si es necesario volver temporalmente,
hacerlo con payload coherente, backup y comprobación de lectura de estado nuevo.

### 2. Recuperar el camino corto en ambos runtimes

**Primer arreglo: la reanudación TDD del log.** Distinguir las consultas de gestión
(`status`, `get`, etc.) de una operación que vuelve a ejecutar un hijo (`resume`).
Recuperar la identidad del trabajo, agente, cwd y decisión efectiva desde los
metadatos existentes de esa ejecución. Transmitirlos mediante la interfaz real
del runner en lanzamiento, reanudación en memoria y recuperación de un async.

La elección explícita de Samu debe actualizar el estado de ese trabajo y llegar
al hijo antes de permitir sus escrituras. No cambiar el modo global del proyecto,
depender de una frase literal en inglés ni desactivar TDD para desbloquear. Comprobar
que no se heredan decisiones de otra tarea o de otro cwd. Si el runner no admite
actualizar la reanudación, lanzar una continuación acotada con el contrato válido,
el diff y el pendiente concreto; conservar el avance sin reiniciar el cambio.

Probar el recorrido completo: apply inicial → verify detecta `error.code` → resume
con TDD estricto → prueba roja → corrección → prueba verde → verify independiente.
Incluir la variante ad hoc sin directorio SDD y una elección `off` para evitar
que el arreglo fuerce strict a todo el mundo. El éxito requiere cero preguntas
repetidas y ninguna modificación fuera del alcance del migrador. No ejecutar
migraciones reales como parte de este ensayo.

Siguiente modificación: corregir prompt, esquema y adaptador de delegación para que
usen la misma llamada; probar esa llamada en el runner distribuido. Retirar ejemplos
obsoletos. Adaptar las formas antiguas solo cuando su significado sea inequívoco.
No ampliar el parser ni crear otro lenguaje de workflows para arreglarlo.

Después, sacar el registro de continuidad del permiso para realizar
ediciones locales. Fallar al guardar un checkpoint degrada la continuidad y avisa
una vez; no convierte Write/Edit en acciones prohibidas. Para Bash o herramientas
con efectos desconocidos se conserva la política real de ejecución: no declarar
que todo Bash es inocuo ni que todo fallo del registro es un riesgo externo.

Separar tres resultados en los consumidores existentes:

- Acción no autorizada o peligrosa: detener esa acción.
- Verificación incompleta: continuar el trabajo permitido, sin darlo por verificado.
- Registro auxiliar no disponible: continuar y comunicar la limitación pertinente.

Una operación externa incierta requiere inspección antes de reintentar ese efecto;
no bloquea investigar, editar otras partes o preparar pruebas. Aprovechar permisos
nativos y guards existentes. Evitar crear una nueva capa universal de políticas.

**Salida:** corregir un bug pequeño y pasar su prueba en Claude y Pi sin entrevistas,
recibos manuales ni reparación de documentos del arnés.

### 3. Hacer proporcional el flujo

El padre elige la profundidad por ambigüedad, riesgo y dependencias:

- Consulta o investigación: respuesta y evidencia, sin crear un cambio SDD.
- Cambio acotado con solución clara: encargo breve, ejecutor y comprobación focal.
- Cambio con decisiones relevantes: plan suficiente, tareas y verificación; usar
  las fases existentes solo cuando aporten información o control real.

En Claude, varios comportamientos independientes o un contrato que cruza cliente
y servidor requieren planificación por fases y ejecución delegada. Para un único
comportamiento acotado, `Task` ejecuta apply y verify. El coordinador usa las
herramientas nativas de lectura; Bash sirve para checks y el CLI de Ein.

La autorización vigente sigue siendo válida entre pasos. TDD usa la elección del
trabajo o su valor configurado, sin preguntar de nuevo por razones administrativas.
Los defectos inequívocos de formato se normalizan; una ambigüedad semántica vuelve
al planificador. Los recibos que sigan siendo necesarios los emite el runtime con
datos reales, sin pedir al ejecutor que reconstruya su contabilidad.

Para reanudar, conservar tareas terminadas, diff y comprobaciones. Si falta un
recibo, inspeccionar el trabajo y validar lo necesario; no repetir automáticamente
scope/map/design/apply. Solo volver a verificar lo afectado y los checks obligatorios.

**Salida:** los escenarios sencillos no necesitan el ciclo completo y una
interrupción no obliga a rehacer trabajo terminado.

### 4. Restablecer «los caros piensan, los baratos ejecutan»

| Responsabilidad | Dueño | Qué entrega |
|---|---|---|
| Comprender intención, resolver ambigüedad y diseñar | Modelo capaz con razonamiento suficiente | Decisiones, alcance y criterios observables. |
| Localizar archivos y extraer evidencia | Herramientas y Scout barato | Referencias concretas; sin decidir arquitectura. |
| Preparar la ejecución | Planificador capaz | Archivos/anclas, cambio esperado, pruebas y límites. |
| Implementar y ejecutar checks | Ejecutor barato por defecto | Diff, resultados y discrepancias concretas. |
| Revisar resultado | Checks deterministas y revisor independiente | Evidencia actual; revisión capaz cuando el riesgo requiera juicio. |
| Entrega mecánica autorizada | Herramientas o ejecutor barato | Commit/PR correspondiente al trabajo comprobado. |

El encargo debe explicar qué cambiar, dónde, cómo comprobarlo y qué discrepancia
devolver. No necesita un nuevo esquema extenso. El ejecutor puede resolver detalles
locales normales; no se le exige descubrir arquitectura ni rediseñar el plan.

Ante una discrepancia material o un atasco repetido, conservar el avance y devolver
la decisión al capaz. Este corrige el encargo o divide la tarea. Subir a un ejecutor
más capaz es una excepción explícita y medible, no el valor predeterminado oculto.
No aumentar razonamiento ni reiniciar al barato indefinidamente.

Evaluar coste total por tarea aceptada, incluyendo planificación, intentos fallidos,
verificación y rescates. Si el trabajo es muy pequeño, preparar su encargo también
debe ser muy pequeño. No declarar que un modelo ahorra solo por su tarifa.

**Salida:** los casos mecánicos del piloto los resuelven ejecutores baratos con
calidad equivalente, sin que el padre acabe implementando para rescatarlos.

### 5. Publicar solo después de demostrar trabajo terminado

Entregar los arreglos en cortes independientes cuando sea posible: transporte TDD
en resume; coherencia de delegación; continuidad sin bloqueo local; flujo proporcional y recuperación;
reparto económico. Revisar cada corte antes de acumular el siguiente. Evitar otra
release cuyo primer ensayo de uso completo sea la sesión habitual de Samu.

Para cada corte ejecutar pruebas focales del fallo y del permiso que debe conservarse.
En la integración, suite y ambos typechecks conforme a `EIN.md`; empaquetado y
prueba desde hogar temporal cuando cambie el contenido distribuido. No repetir toda
la suite por cada ajuste de prosa ni confundir cobertura de fixtures con uso real.

La publicación necesita un piloto de sesiones completas con modelos en ambos
arneses y casos nuevos/resumidos. Las pruebas negativas verifican también que
permanezca bloqueada la acción realmente insegura.

## Pruebas de aceptación y métricas

| Caso | Resultado exigido |
|---|---|
| Consulta y lectura | Respuesta útil sin estado SDD nuevo. |
| Bug pequeño autorizado | Edición y check focal; cero preguntas administrativas. |
| Cambio de varios archivos | Plan suficiente, ejecución barata, verificación del comportamiento. |
| Llamada de delegación generada por Ein | El runner instalado la admite y entrega resultado. |
| Resume tras verify con TDD ya elegido | El hijo recibe esa decisión, corrige `error.code` y verifica sin volver a preguntar. |
| Checkpoint/registro no disponible | Continúa el trabajo local permitido; limitación visible, sin falso éxito. |
| Ejecutor interrumpido | Recupera diff y progreso; no repite tareas completadas. |
| Cambio de runtime Pi ↔ Claude | Recupera objetivo y estado; expresa cualquier laguna concreta. |
| Código cambiado tras verificar | Invalida la evidencia afectada; no declara frescura inexistente. |
| Efecto externo incierto | Inspecciona antes de repetirlo; el trabajo independiente sigue disponible. |
| Acción externa no autorizada | Se bloquea esa acción sin bloquear lectura ni preparación. |
| Actualización fallida y dry-run | Restaura archivos/permisos; la simulación no modifica el estado. |

Registrar por caso y runtime: terminó correctamente, intervención humana por
defecto del arnés, primer bloqueo, tiempo hasta primera edición, duración total,
llamadas dedicadas a artefactos/reglas, reintentos, tokens/coste cuando el proveedor
los ofrezca y modelo efectivo de cada fase. Un dato ausente se deja ausente.

Criterios de salida: todos los casos críticos pasan; cero rescates humanos por
burocracia en el corpus; la verificación detecta los fallos sembrados; Claude no
empeora frente a alpha.9 en casos equivalentes; Pi mejora frente a su base actual.
Repetir los casos pequeños y de reanudación tres veces por runtime para detectar
fluctuación, sin convertirlo en otra batería interminable. Registrar medianas y
rangos de tiempo/coste; acordar cualquier tolerancia de regresión antes de publicar,
con la referencia medida a la vista. Estos son criterios propuestos, no resultados.

## Manifiesto y mantenimiento posterior

Conservar `MANIFIESTO.md` como autoridad y comprobar que README, EIN.md y documentación
lo enlazan. Si la pérdida observada era una instalación, otra rama o una superficie
de UI, localizar ese caso sin crear una segunda copia normativa.

Resolver dos tensiones en sus reglas: que haya un consumidor mecánico no basta
para justificar bloquear, y «fail-closed» no convierte un fallo de observabilidad
en una prohibición universal. Se puede conservar «desconocido» y seguir trabajando
con honestidad. El criterio es el daño concreto que evita detener esa acción.

Retirar prompts, validaciones, tests y documentos que solo sostengan ceremonias
eliminadas. Conservar los tests de calidad, seguridad, recuperación e instalación.
Cada bloqueo restante debe tener un fallo concreto que evita y una condición de
retirada, documentados junto a su código o prueba; sin crear otro registro obligatorio.

Los primeros cortes están separados para revisión: [#474](https://github.com/samuhlo/ein-agent/pull/474)
recupera TDD al reanudar apply; [#475](https://github.com/samuhlo/ein-agent/pull/475)
alinea la delegación con el runner y retira un aviso inútil;
[#476](https://github.com/samuhlo/ein-agent/pull/476) deja editar localmente
cuando falla el registro auxiliar de continuidad; y
[#477](https://github.com/samuhlo/ein-agent/pull/477) devuelve a los agentes
la ejecución de cambios sustanciales en Claude. Quedan pendientes el piloto con
modelos y la revisión humana de estas PRs. No se han modificado las instalaciones
personales.
