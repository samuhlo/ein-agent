---
title: "Contexto y ahorro"
description: "Cómo Ein reduce entrada innecesaria sin perder acceso a la evidencia."
sources: ["runtime/assets/orchestrator-core.md", "ein-pi/agent/lib/apply-packet-compile.ts", "runtime/agents/sdd-verify.md", "docs/adr/0006-remove-runtime-compressors.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

El ahorro buscado es el del trabajo completo con calidad comparable. Reducir tokens en un hijo ayuda, pero puede quedar anulado si el padre necesita más turnos, más entrada no cacheada o reintentos.

## Qué recibe cada uno

| Superficie | Información necesaria |
| --- | --- |
| Padre | Núcleo de coordinación, petición, ajustes y estado; detalle del flujo cuando lo necesita. |
| Agente pensante | Encargo, intención y fuentes pertinentes para resolver decisiones. |
| Apply | Grupo ejecutable, contexto y skills pertinentes, cambios y checks definidos. |
| Verify | Criterios, cambios, plan de verificación y referencias a evidencias; ejecuta sus propias comprobaciones. |

**Contexto fresco no significa contexto vacío.** El hijo necesita instrucciones del sistema, herramientas, su rol y el contexto de su encargo. Evita heredar toda la conversación anterior; no garantiza un número fijo de tokens ni un rendimiento perfecto.

## Skills a demanda

El catálogo permite descubrir nombres, descripciones y rutas. Pi resuelve las skills pertinentes por rol, proyecto y tarea, preserva nombres pedidos expresamente y da prioridad a las reglas del proyecto. El ejecutor lee las instrucciones completas de las skills seleccionadas.

No se inyecta todo el catálogo de instrucciones al padre ni se recortan semánticamente las skills para fabricar fragmentos nuevos. Si el trabajo necesita más información, se consulta la fuente pertinente. Claude usa su adaptación y descubrimiento nativo; no tiene equivalencia completa con la inyección de Pi.

## Apply y verify acotados

En los planes compatibles, Pi compila el grupo indicado por `apply_group` con sus instrucciones, subpasos, notas y metadatos validados. Comprueba su vigencia antes del lanzamiento y al arrancar el hijo. Los planes antiguos conservan su ruta compatible: no es un sandbox universal ni una prueba de que el diseño esté completo.

Verify combina comandos exactamente duplicados cuando las asociaciones declaradas lo permiten. Las suites y builds globales pertinentes le corresponden a verify, evitando repetirlos mecánicamente en cada grupo de apply. Los checks grandes reconocidos que terminan correctamente pueden mostrar una vista breve con enlace al log original. Una salida ambigua requiere inspección; los fallos y las carencias de cobertura no se ocultan.

El padre recibe un resultado compacto, no tablas y logs enteros. En SDD la evidencia permanece en los artefactos y, al cerrar, los informes de apply y verify se conservan dentro del resumen archivado.

## Cómo interpretar una medición

Distingue tamaño de contexto, tokens procesados acumulados, entrada cacheada, entrada nueva, salida, coste y tiempo. Sumar tokens de muchos turnos no mide el máximo de contexto. Un porcentaje cacheado tampoco demuestra por sí solo ahorro de dinero.

Compara tareas equivalentes con el mismo nivel de calidad y considera reintentos, fallos y trabajo de revisión. Una ejecución por variante no demuestra ahorro universal. La ejecución local necesita pruebas con el modelo y hardware reales antes de declararse validada.

Hypa y Headroom están retirados; se conservan el manejo nativo de Pi y las vistas acotadas de verify. La [decisión](https://github.com/samuhlo/ein-agent/blob/main/docs/adr/0006-remove-runtime-compressors.md) explica la evidencia y sus límites.
