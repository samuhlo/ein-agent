---
title: "De Ein a n_ein"
description: "Qué enseñó Ein y cómo cambió el diseño del proyecto nuevo."
sources: ["README.md", "docs/legacy-retrospective.md", "docs/roadmap.md"]
verified_rev: "f220788c1da2f77afac21cb37af154621aa05cce"
---

**Ein es un proyecto legado.** Esta web conserva la documentación de su última versión, [`installer-v0.99.0`](https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.99.0). El trabajo activo se desarrolla en **[n_ein](https://github.com/samuhlo/n_ein)**, un repositorio nuevo con instalación, evaluaciones y documentación propias.

## Qué hizo Ein

Ein reunió un flujo de cambios en OpenSpec, agentes especializados, estado verificable por herramientas, continuidad entre Pi y Claude Code, una aplicación de terminal y un instalador con recuperación. Su [arquitectura](/ein-agent/01-concepts/orchestrator/) y su [ejemplo real](/ein-agent/02-workflow/real-workflow-example/) enseñan tanto el diseño como los errores que aparecieron al probarlo.

El [ensayo de contexto](https://github.com/samuhlo/ein-agent/blob/main/evals/orchestrator-context-2026-09-08.md) redujo la entrada inicial observada de unas 41.100 a 23.800 tokens en el entorno probado. El mismo informe registra una consulta con más latencia tras la reducción. Las [limitaciones](/ein-agent/05-debug/known-limitations/) explican por qué una mejora en una métrica no equivale a una mejora general del producto.

## Por qué cambió el rumbo

El sistema de siete fases detectaba fallos y conservaba decisiones, pero también añadía pasos y controles al trabajo pequeño. La comparación económica completa del ejecutor barato —incluyendo preparación, revisión y rescates— quedó sin demostrar. La [retrospectiva completa](https://github.com/samuhlo/ein-agent/blob/main/docs/legacy-retrospective.md) vincula estas conclusiones a ensayos, ADR y código.

`n_ein` mantiene lo que resultó útil: launcher, instalador, identidad visual, voz docente, tareas visibles y continuidad Pi↔Claude. Su flujo permite resolver directamente un encargo claro y delegar cuando el coste y la calidad observados lo justifican. **Es una dirección nueva, no una actualización compatible de Ein.** Sus capacidades efectivas y su release vigente se consultan en el [README de n_ein](https://github.com/samuhlo/n_ein#readme).

## Si ya usas Ein

Puedes conservar su último paquete o seguir la [guía de desinstalación y recuperación](/ein-agent/05-debug/uninstall-recovery/). Los hogares, credenciales y sesiones de Ein y `n_ein` están separados; no hay migración automática. Para consultar el comportamiento final de Ein, empieza por [instalación](/ein-agent/00-start/getting-started/), [CLI](/ein-agent/04-reference/cli/) y [matriz de runtimes](/ein-agent/03-runtimes/runtime-matrix/).
