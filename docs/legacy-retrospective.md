# Ein: qué construí y qué aprendí

**Estado:** proyecto legado. La última versión distribuida es [`installer-v0.99.0`](https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.99.0); el desarrollo continúa en [n_ein](https://github.com/samuhlo/n_ein). Este texto evalúa decisiones de Ein, no describe una migración automática ni afirma que ambos productos sean compatibles.

## El encargo

Quería que un agente de programación dejase cambios pequeños, verificables y fáciles de retomar. Una conversación por sí sola no conservaba suficientemente bien el objetivo, las decisiones ni la procedencia de la comprobación. Construí Ein alrededor de artefactos en Git/OpenSpec, fases especializadas y herramientas que calculaban estados que el modelo podía confundir.

El proyecto creció hasta incluir dos adaptadores de runtime, un instalador con backup y restore, un launcher de terminal, contratos compartidos, documentación pública, CI en Linux y macOS y evaluaciones con modelos reales. El código de `runtime/` y `shared/` es propio; `vendor/skills/` identifica material externo.

## Tres problemas que sí resolvió

1. **Un verificador debía comprobar, no repetir una conclusión.** En el [ensayo del contrato de documentación](../docs-site/src/content/docs/02-workflow/real-workflow-example.md), el validador descubrió una fuente omitida que dos cierres anteriores no habían detectado. También destapó un filtro falso y un test que confundía un árbol de trabajo sucio con una escritura del validador. El aprendizaje fue escribir comprobaciones sobre el comportamiento y conservar los fallos intermedios.
2. **El contexto inicial estaba sobredimensionado.** Un [ensayo controlado](../evals/orchestrator-context-2026-09-08.md) bajó la entrada inicial de unas 41.100 a 23.800 tokens conservando las mismas 57 herramientas. El flujo `design → tasks → apply → verify` terminó y verify rechazó una regresión sembrada. La latencia de una consulta pasó de 47,68 a 50,38 segundos: menos tokens iniciales no equivalieron automáticamente a menos tiempo ni demuestran ahorro total.
3. **La distribución tenía que poder fallar y recuperarse.** El [workflow de release](../.github/workflows/installer-release.yml) empaqueta cuatro plataformas, ejecuta un E2E del instalador y publica checksums. El instalador mantiene `ein-install` como vía de diagnóstico y reparación aun cuando falle la aplicación `ein`. Las [limitaciones](../docs-site/src/content/docs/05-debug/known-limitations.md) acotan lo que esa matriz no prueba.

## La deuda que reveló el uso

Las siete fases y la regla de que el padre nunca implementa daban una estructura potente, pero obligaban a preparar, enrutar y revisar trabajo que a veces podía resolverse directamente. El [ADR de ejecución barata](adr/0005-make-cheap-apply-verifiable.md) dejó escrito lo que faltaba para acreditar la promesa económica: confinamiento real, receipts ligados al resultado y comparación de coste total por trabajo correcto. Los tests de contratos y los pilotos acotados no demostraron una ventaja general sobre un agente directo.

La [simplificación de apply](../evals/lean-apply-2026-09-08.md) mostró el valor de retirar una regla duplicada: en una pareja controlada, apply pasó de 12 a 8 turnos. El mismo informe explica por qué no se puede extrapolar ese resultado al flujo completo. Esta combinación de mejora local y coste sistémico fue una de las razones para cambiar de rumbo.

## La decisión siguiente

[n_ein](https://github.com/samuhlo/n_ein) es un proyecto nuevo. Conserva la identidad, launcher, instalador, TODO, voz docente y continuidad Pi↔Claude que merecían seguir. Sustituye el motor de siete fases por trabajo directo, skills activadas según la tarea y delegación cuando el coste completo lo justifica. Su README y sus propias evaluaciones son la fuente de verdad sobre lo que ya funciona allí. Ein queda como un ejemplo público de ingeniería, pruebas y corrección de rumbo; no se mantendrán dos productos en paralelo.

## Cómo revisar el trabajo

Empieza por el [README](../README.md) y la [web](https://samuhlo.github.io/ein-agent/), sigue con el [ejemplo real](../docs-site/src/content/docs/02-workflow/real-workflow-example.md), la [evaluación de contexto](../evals/orchestrator-context-2026-09-08.md), los [ADR](adr/) y los [tests](../tests/). Los informes de `evals/` declaran modelos, muestras, fallos y límites; son evidencia de escenarios concretos, no publicidad de una tasa universal de éxito o ahorro.
