---
title: "Qué es Ein"
description: "Pensar bien para ejecutar con menos coste y mantener el trabajo revisable."
sources: ["runtime/assets/orchestrator-core.md", "docs/adr/0006-remove-runtime-compressors.md", "README.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

**Hacer que pensar bien permita ejecutar de forma más sencilla, barata y local, manteniendo las exigencias de calidad.**

Ein es un arnés de agentes sobre Pi Coding Agent, con Claude Code como relevo opcional. El modelo capaz aclara la petición y toma decisiones; los ejecutores reciben encargos concretos con criterios de terminación. Lo que se puede calcular —estado del cambio, contratos, progreso— se deja a herramientas.

Puedes usar modelos baratos alojados como ejecutores. El uso local es futuro y opcional: no necesitas una GPU ni un modelo local para usar Ein. Tampoco se da por demostrado que cualquier modelo cumpla el contrato; se comprueba sobre trabajo real antes de confiarle más.

## Un flujo proporcionado al trabajo

Una edición pequeña y clara puede pasar por apply y una verificación independiente sin crear un expediente SDD. Para cambios que necesitan diseño, continuidad entre sesiones o un flujo SDD solicitado expresamente, las fases dejan su estado en `openspec/`.

El padre dirige y explica. `design` decide cómo resolver el problema; `tasks` convierte esas decisiones en grupos ejecutables; `apply` implementa; `verify` revisa el código y ejecuta las comprobaciones por su cuenta. Una respuesta optimista de apply no sustituye ese resultado.

## Ahorrar sin ocultar pruebas

El orquestador carga el detalle del flujo a demanda. Los hijos reciben contexto fresco y las skills pertinentes, y devuelven resultados breves con referencias a los artefactos. Verify puede recibir vistas acotadas de logs correctos, conservando el original para inspeccionarlo.

Ein retiró Hypa y Headroom: la evaluación no justificó mantener esas integraciones para el ahorro del flujo completo. La prioridad está en mejores encargos y menos trabajo repetido, no en añadir otro compresor.

## Qué significa «verificado»

Significa que hay comprobaciones y una evaluación del contrato declarado. No garantiza que los requisitos sean perfectos ni que no queden errores. El informe debe identificar cobertura insuficiente, pruebas bloqueadas y riesgos materiales.

Empieza por [instalación](/ein-agent/00-start/getting-started/), sigue con [tu primer cambio](/ein-agent/00-start/first-run/) y consulta las [limitaciones](/ein-agent/05-debug/known-limitations/). Las [notas de release](https://github.com/samuhlo/ein-agent/releases) indican qué contiene cada versión publicada; `main` puede incluir correcciones pendientes de release.
