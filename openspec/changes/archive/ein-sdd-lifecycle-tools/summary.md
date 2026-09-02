## // 000. RESUMEN

La validación de artefactos y el cierre determinista salen de `ein-ai.ts`. La fachada ya no contiene ninguna implementación de herramientas SDD: solo compone dueños con responsabilidades nombradas.

## // 001. QUÉ CAMBIÓ

- `ein-sdd-lifecycle-tools.ts`: registra `ein_sdd_check`, `/ein:sdd-close` y `ein_sdd_close`.
- `ein-ai.ts`: delega el ciclo de vida y elimina check, close y el binding de invalidación local.
- Los contratos de alias, recibos, agentes y flujo siguen el nuevo dueño.

## // 002. CÓMO FUNCIONA POR DENTRO

Check valida los artefactos y registra el recibo de memoria opcional. Close comparte una única función entre comando y herramienta: archiva mediante el motor neutral, invalida el foco de sesión, intenta guardar memoria y refresca un `EIN.md` existente. Ninguna de esas responsabilidades queda duplicada.

## // 003. DECISIONES

- Mantener check y close juntos porque son las dos puertas del ciclo de vida que producen recibos de memoria.
- Hacer que el módulo emita directamente el evento de invalidación; la fachada no necesita conocerlo.
- Conservar el comando y la herramienta de cierre sobre una sola operación interna.

## // 004. VERIFICACIÓN

- 159 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La fachada sigue siendo dueña de los hooks de sesión, preflight, delegación y reconciliación. Es el último grupo arquitectónico relevante antes de la auditoría final.
