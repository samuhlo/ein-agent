## // 000. RESUMEN

Crear un delta y sincronizarlo con los specs canónicos ya no son detalles enterrados en `ein-ai.ts`. La superficie Pi tiene un dueño OpenSpec explícito que reutiliza exactamente los mismos escritores que Claude.

## // 001. QUÉ CAMBIÓ

- `ein-openspec-write-tools.ts`: registra `ein_openspec_sync` y `ein_openspec_delta_write`.
- `ein-ai.ts`: delega esas escrituras y elimina su implementación local.
- Los contratos de herramientas, flujo y recibos siguen la composición real.

## // 002. CÓMO FUNCIONA POR DENTRO

El adaptador Pi valida los parámetros y presenta el resultado, mientras `openspec-delta-write.ts` y `openspec-spec-sync-fs.ts` conservan la semántica compartida. Un conflicto sigue devolviendo `ok: false`; un delta inválido sigue sin escribir nada.

## // 003. DECISIONES

- Agrupar los dos pasos de transformación OpenSpec: escribir el delta y materializarlo en el registro canónico.
- No reimplementar el motor en la extensión; Pi y Claude continúan llamando a los mismos dueños.
- Reforzar los tests de ubicación para que no puedan pasar con bloques vacíos después de una extracción.

## // 004. VERIFICACIÓN

- 184 tests enfocados: pass tras corregir los contratos de composición.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

El payload instalado se verificará al final de la cadena, cuando estén presentes todos los módulos nuevos. Check y cierre siguen en la fachada porque comparten el ciclo de vida opcional de memoria.
