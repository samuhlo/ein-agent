---
title: "Límites deterministas"
description: "Qué calcula una herramienta y qué sigue requiriendo revisión."
sources: ["runtime/assets/orchestrator-core.md", "shared/sdd/sdd-change-validation.ts", "shared/sdd/sdd-summary-write.ts", "ein-cc/sdd-cli/cli.ts"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Ein usa herramientas para los hechos calculables y modelos para interpretarlos. La distinción evita gastar razonamiento en contar tareas o reconstruir estado, pero no convierte las herramientas en infalibles.

| Mecanismo | Qué aporta | Qué no demuestra |
| --- | --- | --- |
| Estado y validación SDD | Artefactos requeridos, señales, tareas pendientes y navegación. | Que los requisitos sean adecuados o el diseño correcto. |
| Acuerdo de intención | Estado del acuerdo y vinculación de artefactos a su material vigente. | Que el modelo haya entendido perfectamente al usuario. |
| Apply Packet | Encargo de grupo validado y detección de cambios en sus fuentes. | Completitud semántica o confinamiento universal de shell. |
| Evidencia de comandos | Comando, directorio, resultado y referencia al original. | Que ese comando pruebe todo el comportamiento. |
| Gate de shell | Reglas para patrones reconocidos y confirmaciones protegidas. | Una interpretación completa de cualquier programa de shell. |
| Cierre | Requisitos del cierre, resumen estructurado y conservación de evidencia. | Ausencia de errores futuros. |

## Verificación independiente

Verify lee las fuentes cambiadas y ejecuta comprobaciones frescas. El índice de evidencia permite localizar la procedencia de ejecuciones y eventos de la sesión; no emite el veredicto de calidad por el agente.

Tener tipos, lint y build correctos no prueba necesariamente el comportamiento. El informe distingue cobertura `verified`, `partial`, `none` o `n-a`. Las pruebas obligatorias bloqueadas y las evidencias requeridas ausentes se reportan como fallo, no como éxito con una nota al pie.

## Cierre y permisos

La herramienta de resumen puede derivar los campos terminales de apply completo y verify vigente. El agente aporta explicación; la herramienta no inventa resultados. El cierre conserva los informes antes de compactar los archivos intermedios.

Las operaciones de entrega requieren autorización válida del usuario. Pi y Claude aplican esa política con mecanismos diferentes; el hook de Bash de Claude no intercepta todas las ediciones directas. Consulta la [matriz](/ein-agent/03-runtimes/runtime-matrix/) para conocer el alcance de cada runtime.
