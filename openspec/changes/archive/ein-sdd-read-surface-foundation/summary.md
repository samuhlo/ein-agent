## // 000. RESUMEN

Se prepara un dueño explícito para las consultas, auditorías y navegación SDD de Pi. La nueva superficie registra dos herramientas de lectura y cinco comandos humanos, pero todavía no sustituye el cableado de la fachada.

## // 001. QUÉ CAMBIÓ

- `ein-sdd-read-surface.ts`: agrupa estado, auditoría, forecast, foco de sesión y siguiente paso.
- `ein-sdd-read-surface.test.ts`: fija el inventario completo de herramientas y comandos.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo consulta el router, los guardarraíles y Git; convierte sus resultados mediante la presentación extraída en la PR anterior. Solo el foco de sesión publica un evento de binding y `sdd-next` entrega al orquestador la ruta ya calculada. No escribe artefactos SDD.

## // 003. DECISIONES

- Separar “mirar y orientar” de “cambiar el flujo o el disco”.
- Mantener esta PR como cimiento revisable: la siguiente retirará la copia antigua y delegará desde `ein-ai.ts`.
- Fijar el inventario como contrato para que ninguna superficie desaparezca durante el traslado.

## // 004. VERIFICACIÓN

- Test de inventario: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Hasta la PR de delegación, el módulo nuevo no se carga en producción. Es una etapa deliberada de una cadena apilada, no una segunda implementación permanente.
