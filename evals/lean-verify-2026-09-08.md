# Verify acotado y evaluación conjunta — 2026-09-08

El objetivo es que los modelos capaces decidan y los baratos ejecuten rutas cortas, con evidencia en disco. Esta PR añade una extensión pequeña de transporte a verify y precisa contratos existentes; no incorpora un runner, herramientas, agentes ni un sistema de caché de verificaciones.

## Resultado medido

| Medida | Antes | Después | Reducción |
|---|---:|---:|---:|
| Entrada inicial del padre, flujo completo | 40.313 | 22.925 | 43,1% |
| Verify aislado, 409 tests + typecheck | 65.923 | 39.128 | 40,6% |
| Flujo completo: padre + cuatro fases | 1.057.284 | 876.999 | 17,1% |

Tokens procesados = entrada no cacheada + salida + lecturas/escrituras de caché; **no es el contexto máximo simultáneo**. Coste estimado por el runtime del flujo: USD 1.683269 → 1.803208; duración 361.0 → 416.3 s. No son importes de factura ni una garantía de latencia. Ambos padres conservan 57 herramientas. **La pasada final no mejora factura ni latencia:** el coste estimado sube un 7,1% y el tiempo un 15,3%. El padre hace 23 turnos frente a 19 y tiene más entrada no cacheada; apply y verify sí bajan tanto tokens como coste estimado. El ahorro de contexto y tokens no debe presentarse como ahorro monetario garantizado.

| Fase | Tokens antes | Tokens después | Turnos |
|---|---:|---:|---:|
| sdd-design | 19.011 | 19.634 | 4 → 4 |
| sdd-tasks | 13.664 | 22.113 | 3 → 4 |
| sdd-apply | 159.047 | 78.050 | 14 → 8 |
| sdd-verify | 44.202 | 30.224 | 5 → 4 |

El padre consume 821.360 → 726.978 tokens. Los modelos configurados son Astra/high para padre y design, Sol/high para tasks, Luna/low para apply y verify. No hubo sustituciones de modelo.

## Qué cambió y por qué

- Skills: nombre/clave con límites de palabra, identificadores con `_` intactos, y afinidad de stack/workflow solo como desempate tras una señal real. `next_recommended` ya no activa Next; una tarea Nuxt no recibe todas las skills frontend/workflow por su etiqueta.
- Verify: postura TDD por cambio antes de buscar historia; en OFF no hay arqueología de sesiones, en strict se auditan referencias concretas. Lecturas por spans y reporte breve; checks frescos siguen siendo obligatorios.
- Salida: checks simples de los runners admitidos, sin error y con más de 8 KiB pueden devolver un preview de hasta 6 KiB más cabecera. Conserva inicio/final, diagnósticos (también ANSI) y su contexto; guarda el texto íntegro con permisos 0600 o reutiliza el log completo nativo. Errores, comandos compuestos/desconocidos, exceso de diagnósticos o almacenamiento no fiable quedan intactos. El preview no emite un veredicto ni cambia `isError`.
- Tasks separa los comandos canónicos. Apply escribe pares explícitos comportamiento/comando también en modo estándar. Verify no los inventa desde prosa y no considera `A && B` idéntico a `A` o `B`.
- El informe usa `status: pass|fail`, conforme al validador. Los bloqueos y las lagunas obligatorias son fail; `blocked` puede explicar la causa en el envelope. Evita que el padre repare cabeceras.
- El núcleo del padre aclara que una delegación SDD normal solo carga el tramo SDD. Investigación/recuperación se carga cuando corresponde.

## Pruebas y hallazgos durante la iteración

3.204 tests locales pasan, cero fallos; typecheck y bundle correctos. Tras los últimos ajustes de texto pasan también los 32 checks focalizados de contratos/contexto. El tarball contiene exactamente los contratos y la extensión finales.

La comparación de verify usa el mismo código, diseño, tasks y apply-progress congelados: 9 tests del módulo más 400 casos de puertos válidos, con aserciones reales, y typecheck estricto. Ambos invocan `bun run test` y `bun run typecheck` de nuevo. El listado de tests pasa de unos 21,2 KB a 2,6 KB enviados al modelo; el log íntegro se conserva. La matriz de puertos prueba volumen de salida, no diversidad de 409 requisitos.

La comparación conjunta parte de fuente, scope, map, configuración, postura y solicitud idénticos (hashes en JSON). La base usa los contratos de `225f7a9`; la candidata incluye #395–#398. Ejecuta los agentes reales design → tasks → apply → verify en contextos nuevos; no reemplaza fases por código del padre. Ambas implementaciones pasan la batería independiente de 18 casos de contrato público. No ejecuta cierre, entrega ni instalación en el home del usuario.

Casos adversos con agentes reales:

| Caso | Resultado observado |
|---|---|
| Se elimina la guarda STUN y se deja un PASS anterior | `fail`; tests frescos detectan la regresión; router permanece en verify |
| Un único test tautológico pasa sin ejercer comportamiento | `fail`, `behavior_coverage: none` |
| Strict TDD activo, tests verdes, ciclo ausente | `fail`; sin reconstruir evidencia ni reparar cabecera por el padre |
| Tests verdes sin pares explícitos comportamiento/check | `fail`; no inventa los pares |
| Cambio de código después de PASS | El router vuelve a verify; la proyección no acepta el PASS como evidencia actual |

La proyección Git del fixture positivo aparece `unbound/unknown` al no tener binding criptográfico; la prueba de frescura anterior comprueba el router SDD por cambios en archivos, no demuestra un binding que no existe.

No se han ocultado iteraciones: la primera comparación aislada dio 65.923 → 38.259 tokens, pero el primer flujo conjunto completo solo mejoró un 1,5% (1.057.284 → 1.041.871). El padre cargaba 35 KB combinando investigación y SDD. Corregir la etiqueta/indicación evita ese volcado en la ejecución final. Un caso con asociación implícita pasó inicialmente; precisar que los pares deben estar etiquetados hizo que la repetición lo rechazara. Un `blocked` inicial requirió normalización del padre; el contrato final ya emite fail. Las reverificaciones sobre informes existentes se conservan separadas de la pareja limpia. Hubo un error WebSocket y una ejecución exploratoria async que terminó antes del flujo; se retomaron sin presentarlos como pruebas completas. Un fixture exploratorio usó `tdd:on` en vez del enum `strict`; la prueba válida se repitió con `tdd:strict`.

## Límites y reproducción

Un módulo real y una ejecución final por brazo no constituyen un benchmark general. Los modelos pueden tomar decisiones distintas y el caché altera el coste. La batería de 18 casos procede de la evaluación anterior, no es un nuevo holdout preregistrado. Los MCP externos están desactivados en ambos brazos. No se ha probado un modelo local y las instrucciones no garantizan corrección semántica para cualquier código.

El JSON adjunto contiene métricas por fase, invocaciones, bytes de resultados, errores, todas las iteraciones e integridad de entradas/contratos. El archivo local de evidencia `lean-verify-2026-09-08.tar.gz` conserva fixtures iniciales/finales, scripts, logs y transcripciones; excluye credenciales y dependencias. Los scripts `prepare*.py`, `run.py`, `summarize.py`, `check-integrity.py`, `oracle.ts` y `check-state.ts` describen la preparación y validación. Repetir las llamadas a modelos requiere el mismo runtime y autenticación propia en homes aislados. El resumen publicado no contiene transcripciones de razonamiento ni credenciales.
