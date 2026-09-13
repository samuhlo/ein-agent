---
title: "Pi Coding Agent"
description: "El runtime principal de Ein y sus controles."
sources: ["ein-pi/README.md", "runtime/assets/orchestrator-core.md", "ein-pi/agent/extensions/internal/ein-general-commands.ts", "ein-pi/agent/extensions/ein-intent.ts"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

Pi es el núcleo. Abre `ein` desde el proyecto y elige Pi. `ein-pi` ofrece acceso directo avanzado en Fish y fija el hogar `~/.pi-ein/agent` solo para esa ejecución.

## Coordinación y ejecución

El padre carga un contrato pequeño y lee detalle cuando lo necesita. Los agentes de Ein se delegan con contexto fresco: no se copian conversaciones largas a apply o verify. Pi selecciona las skills pertinentes y les entrega las rutas; cada hijo lee sus instrucciones.

Los grupos compatibles de tasks se compilan para apply. Verify mantiene inspección y comprobaciones independientes; el índice de evidencia y las vistas acotadas de checks evitan repetir grandes logs en el padre. No se integran Hypa ni Headroom.

## Ajustes

`/ein:settings` muestra los ajustes del proyecto. `/ein:models` configura modelos y esfuerzo por rol; `/ein:skills` muestra el estado de skills. El proyecto comparte sus ajustes en `.pi/ein/`, pero las credenciales y sesiones pertenecen al hogar del runtime.

`/ein:intent` entra explícitamente en el protocolo de intención. No es obligatorio escribir un comando para cada petición: el padre reconoce cuándo hay trabajo nuevo y qué decisiones faltan. Las solicitudes completas autorizadas pueden registrarse directamente.

TDD y el carril se resuelven por cambio. Linear y Codegraph son integraciones opcionales; sus ajustes de ejecución son distintos de los flags que omiten su instalación. Consulta [integraciones](/ein-agent/04-reference/optional-tooling/).

## Modelos baratos y locales

Asigna capacidad de razonamiento a quienes deciden y prueba ejecutores más baratos con encargos bien cerrados. No hay un preset universal ni una garantía de calidad por tamaño del modelo. El uso local es futuro y opcional: necesita evaluación con el modelo y hardware elegidos antes de recomendarlo como ruta validada.

## Actualización y aislamiento

Usa `ein-install update` y abre después una sesión nueva. La sesión anterior puede conservar extensiones ya cargadas. La migración de hogares legacy corresponde al instalador y requiere reconocer propiedad de Ein; no muevas directorios completos sobre un hogar vanilla.

Consulta los [comandos](/ein-agent/04-reference/cli/) y [recuperación](/ein-agent/05-debug/uninstall-recovery/).
