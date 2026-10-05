# Documentación del proyecto legado

El [README](../README.md) presenta Ein, la [web](https://samuhlo.github.io/ein-agent/) documenta su última versión y la [retrospectiva](legacy-retrospective.md) recoge resultados, límites y el paso a [n_ein](https://github.com/samuhlo/n_ein).

| Material | Cómo leerlo ahora |
| :--- | :--- |
| [Estado final](roadmap.md) | Alcance de la última release; sustituye el roadmap activo. |
| [ADR](adr/) | Decisiones y compromisos tomados durante el desarrollo. Un estado `accepted` describe aquella decisión, no un trabajo futuro prometido. |
| [Auditoría de garantías](audits/2026-09-16-manifiesto.md) | Hallazgos de la revisión de septiembre y sus pruebas de entonces. |
| [Plan de corrección de 13 hallazgos](plans/manifesto-hardening/README.md) | Diseño histórico y trazabilidad de la ejecución hasta alpha.10. |
| [Recuperación de los arneses](plans/2026-09-23-recuperacion-arneses.md) | Investigación de incidentes de septiembre, no instrucciones de operación vigentes. |
| [Evaluaciones](../evals/) | Ensayos con muestras, modelos, resultados negativos y límites declarados. |
| [Cambios OpenSpec](../openspec/changes/archive/) | Resúmenes de cambios cerrados; `openspec/specs/` conserva los contratos del código final. |

Se han retirado del índice de trabajo las tareas y plazos ya abandonados. Los documentos históricos permanecen para que las decisiones se puedan auditar sin convertirlos en instrucciones actuales.
Los prompts operativos de la campaña de septiembre, que ya no tenían consumidor,
se retiraron del árbol final; Git conserva su revisión original.
