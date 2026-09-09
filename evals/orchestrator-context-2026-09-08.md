# Orquestador bajo demanda — evidencia del 2026-09-08

Resultado: el arranque pasa de unas 41.100 a 23.800 tokens de entrada en el
runtime probado, con las mismas 57 herramientas. El flujo real
`design → tasks → apply → verify` terminó y el verificador rechazó una regresión
sembrada después. Datos completos de la muestra en
[orchestrator-context-2026-09-08.json](orchestrator-context-2026-09-08.json).

## Qué cambia

- El padre recibe un núcleo breve. El contrato canónico sigue en
  `runtime/assets/orchestrator.md`; las rutas, offsets y límites de lectura de
  sus secciones se calculan desde los encabezados actuales. No se mantiene una
  segunda copia de las reglas detalladas. Claude conserva su contrato completo.
- Las descripciones del catálogo nativo se sustituyen por nombres y acceso al
  resolver existente. Las skills siguen instaladas; no se cambia su selección,
  contenido, comandos explícitos ni prioridad del proyecto. Solo se sustituye
  el bloque exacto y único generado por el renderizador público de Pi; contenido
  ajeno, catálogos modificados o eventos sin metadatos quedan intactos.
- Identidad y voz dejan de repetir el contrato. El padre no recibe el bloque de
  convenciones de quien edita código. El presupuesto existente se amplía al
  texto de persona y se comprueba que el núcleo renderizado cabe en 8 KiB.
- Si falta el núcleo o no puede referenciar el contrato, se conserva el contrato
  completo: se pierde ahorro, no instrucciones. El paquete incluye ambos archivos.
- Verify usa el timeout nativo de la herramienta bash, que funciona en este
  Mac sin el ejecutable GNU `timeout`.

## Prueba del arranque real

Se desplegó el mismo tarball en dos hogares Pi temporales y se repuso el código
base en uno. Pi 0.85.1, pi-subagents 0.66.0, mismos modelos, skills, configuración,
57 herramientas y paquetes instalados. Los servidores MCP externos se desactivaron
por igual; no se afirma reproducir cada integración privada del usuario.
La observación se hizo en `before_provider_request`, después de construir el
payload real. Tokens y coste proceden del usage del proveedor. Se alternó el
orden de las variantes. No se borró la caché del proveedor.

| Caso | Entrada inicial antes | Después | Entrada acumulada antes | Después |
| --- | ---: | ---: | ---: | ---: |
| Identidad | 41.058 | 23.800 | 41.058 | 23.800 |
| Cambio pequeño, consulta de routing | 41.081 | 23.823 | 41.081 | 23.823 |
| Descubrir y leer skill de accesibilidad | 41.063 | 23.805 | 208.606 | 121.892 |

Las tres reducciones iniciales rondan el 42 %. La consulta de skills usó cinco
turnos en cada variante y leyó la misma guía. La latencia fue 47,68 s antes y
50,38 s después: menor contexto no equivale automáticamente a menor tiempo.
Las respuestas mantuvieron identidad, idioma, delegación acotada y ausencia de
SDD/TDD innecesarios. El catálogo de instrucciones del sistema pasó de 99.755 a
29.246 bytes; los esquemas de herramientas siguen ocupando contexto.

## Flujo real, sin sustituir design ni verify

Fixture: constructor ICE y tests copiados de BERRO, con scripts de test y
TypeScript estricto. El requisito era rechazar TURN en el slot STUN preservando
el parser compartido y el resto de TURN. Scope/map son entradas del ensayo;
el padre no escribió design ni implementó el arreglo.

| Fase real | Modelo configurado | Thinking | Entrada inicial del hijo | Turnos |
| --- | --- | --- | ---: | ---: |
| design | gpt-6-astra | high | 2.175 | 5 |
| tasks | gpt-5.6-sol | high | 2.013 | 3 |
| apply, grupo 1 | gpt-5.6-luna | low | 4.071 | 15 |
| apply, grupo 2 | gpt-5.6-luna | low | 4.075 | 11 |
| verify | gpt-5.6-luna | low | 3.369 | 5 |

Design eligió la restricción en la rama STUN; tasks declaró cambios concretos y
checks en dos grupos. Apply implementó y actualizó el progreso. Verify ejecutó
`bun run test` y `bun run typecheck` de nuevo: 9 tests y tipos correctos. El padre
leyó solo los tramos de investigación/SDD del contrato, no el archivo entero.
Los hijos ya arrancan con poco contexto en este runtime; no se añadieron reglas
ni mecanismos de poda a sus prompts.

Después se retiró únicamente la nueva condición de esquema en la copia de
prueba. Se pidió verify de nuevo sin anunciarle la respuesta esperada: ejecutó
los checks y detectó 1 test fallido de 9. El estado determinista devolvió
`verify: fail` y bloqueó el cierre. El padre normalizó la sintaxis del status
fallido, sin arreglar código ni tests. Tras restaurar la corrección, una nueva
verificación dio pass. En esa última ejecución, todos los comandos usaron el
parámetro nativo `timeout`; no hubo intento de ejecutar GNU `timeout`.

## Límites y comprobaciones

La muestra acredita este recorrido y sus controles positivos/negativos; no
certifica todos los cambios, un modelo local ni ausencia universal de errores.
El primer intento con Pi 0.84.4 falló antes de design por falta de `chord`, que
exige la versión instalada de pi-subagents. Se reparó el entorno de ensayo usando
Pi actual, conservando el fallo en la evidencia. La instalación del usuario no
se cambió. Los modelos concretos proceden de su configuración.

Suite local completa: 3.192 pruebas correctas; después de añadir el fallback de
instalación parcial se ejecutaron sus pruebas enfocadas. Typecheck y empaquetado
host correctos. CI vuelve a ejecutar las comprobaciones sobre los commits de PR.
Los tests cubren rutas de lectura que se desplazan al editar el contrato,
preservación de prompts ajenos, skills desactivadas, catálogos ambiguos y fallback.

Los scripts, fuentes de fixture, comandos, snapshots positivos/negativos y
transcripts quedan en el archivo local de evidencia enlazado en la entrega.
El JSON versionado conserva modelos, usage, llamadas bash del verificador y
hashes de transcripts. No se añadió un runner al producto ni un servicio de
telemetría. Para repetir el ensayo se requieren credenciales propias y se
consume cuota de los modelos elegidos.
