---
title: "El orquestador"
description: "Dónde se toman decisiones y qué se delega."
sources: ["runtime/assets/orchestrator-core.md", "runtime/assets/orchestrator.md"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

El orquestador mantiene la conversación, aclara decisiones, elige el siguiente paso y explica los resultados. El código de aplicación lo modifica apply. La investigación extensa se delega a scout para que vuelva con hallazgos y fuentes, sin llenar la conversación principal de lecturas.

## Pensar antes de ejecutar

El trabajo de razonamiento se reparte entre el padre, scope, design y tasks. El objetivo es que apply reciba una ruta corta: qué cambiar, dónde, qué conservar, cómo comprobarlo y cuándo parar. Si el encargo carece de una decisión, se corrige arriba; no se compensa pidiendo al ejecutor que improvise arquitectura.

La elección de modelos y esfuerzo respeta la configuración del usuario. Un modelo barato alojado puede ejecutar hoy; la ejecución local sigue siendo futura y opcional. Abaratar no elimina criterios de aceptación ni convierte una comprobación estructural en prueba de comportamiento.

## Contexto inicial y detalle a demanda

El padre arranca con un núcleo de coordinación. Carga los tramos detallados de investigación, SDD o entrega cuando la operación lo requiere. Para las skills usa descripciones y rutas; lee su contenido cuando gobierna una decisión propia y entrega al ejecutor las pertinentes para su trabajo.

Los hijos parten de contexto fresco y devuelven estado, resultado breve, artefactos y riesgos. El padre consulta detalles cuando afectan a su siguiente decisión; no tiene que releer cada archivo ni pegar todos los logs para dirigir.

## Estado y comunicación

En SDD, las herramientas calculan estado y validan cada fase. El padre sigue la navegación devuelta y vuelve a consultar cuando cambia el estado, se retoma el trabajo o se pierde contexto. No sustituye estos resultados por su recuerdo de la conversación.

Antes de actuar explica el propósito; durante el trabajo comunica hallazgos, bloqueos o esperas observadas. No inventa progreso ni narra cada lectura. Si un hijo falla, revisa lo que dejó antes de reintentarlo para no duplicar mutaciones.

Consulta [contexto y coste](/ein-agent/01-concepts/context/) y [límites de las herramientas](/ein-agent/01-concepts/deterministic-boundaries/).
