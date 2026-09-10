---
title: "Tu primer cambio"
description: "De una petición concreta a una entrega comprobada."
sources: ["runtime/assets/orchestrator-core.md", "runtime/agents/sdd-verify.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Abre `ein` desde el proyecto y expresa qué debe cambiar y cómo reconocerás que funciona. Por ejemplo:

> En el formulario de registro, los errores de email deben mostrarse junto al campo. Conserva las reglas de validación y el envío actuales. Comprueba los casos válidos e inválidos con los tests existentes.

## Acordar lo necesario

Ein comprueba si la petición ya define el resultado, los límites y los criterios de terminación. Si está completa y autorizada, puede registrar el acuerdo directamente. Si falta una decisión —por ejemplo, cuándo mostrar el error— pregunta antes de editar. No hace falta volver a aprobar lo que ya quedó claro.

Una conversación o una consulta de solo lectura no necesita abrir SDD ni crear un acuerdo de modificación.

## Aplicar y verificar

Si el cambio está suficientemente acotado, el padre delega la edición en apply con archivos, resultado y checks pertinentes. Después lanza verify con contexto fresco: inspecciona el código modificado y ejecuta las comprobaciones independientemente.

Esta ruta ad-hoc no crea `openspec/changes/` ni exige un informe artificial en disco. La respuesta debe explicar qué cambió, qué se comprobó y qué queda sin confirmar. Si aparece una decisión nueva, se devuelve al padre; el ejecutor no amplía el encargo por su cuenta.

## Cuando sí necesitas SDD

Puedes pedirlo expresamente. Para trabajo que necesita diseño y seguimiento, Ein usa [el flujo SDD](/ein-agent/02-workflow/workflow-overview/): intención, alcance, mapa, diseño, tareas, aplicación, verificación y cierre. Cada fase deja información en disco para poder retomar el cambio en otra sesión.

La postura TDD se decide para el cambio. Tener tests existentes no activa por sí solo TDD estricto. En cualquier postura se conserva la exigencia de pruebas pertinentes y revisión independiente.

## Revisar la entrega

Comprueba el diff, los resultados y las limitaciones que presenta Ein. Un build correcto no demuestra por sí solo que el formulario funcione. Una comprobación bloqueada se declara; no se transforma en un éxito por omitirla.

Commit, push, PR y publicación siguen la autorización que hayas dado. Terminar una edición no concede permiso para publicar. Una autorización ya válida tampoco exige otra confirmación ritual.

Si algo no encaja, consulta [diagnóstico](/ein-agent/05-debug/troubleshooting/).
