# 0007 — Unificar las tarjetas MCP con la presentación de Ein

La presentación compacta del adaptador MCP mezcla la operación, los argumentos
y el resultado en una línea. Además, despliega los errores automáticamente. Ein
necesita una jerarquía estable para consultas, scripts y fallos.

La extensión `ein-mcp-cards` presenta una cabecera con servicio, operación y
estado; una vista previa acotada y un resumen de la respuesta; y el atajo nativo
de expansión. Usa los colores del tema activo, sin fondos ni marcos adicionales.
La misma tarjeta pasa de preparación a ejecución y resultado. La duración solo
aparece cuando hay dos eventos reales de ejecución en la sesión actual.

Los resúmenes son deterministas: cuentan elementos de respuestas reconocidas,
explican resultados vacíos o muestran una vista previa textual. No se pide a un
modelo que interprete la salida y no se altera el contexto del agente. Los
errores conservan su causa en la tarjeta y el detalle se abre con el mismo atajo
que el resto de herramientas. No se inventan pasos internos de `mcpScript`.

La vista expandida conserva argumentos, respuesta y enlaces, con ocultación de
campos de credenciales y formatos reconocibles como Bearer y cadenas de conexión.
Esto es una protección de presentación, no una garantía de detección de secretos
arbitrarios. La salida original no se modifica. La vista de texto expandida tiene
un límite anunciado de 256 KiB; la respuesta original sigue en la sesión.

Pi no expone una API pública para sustituir únicamente los renderizadores de una
herramienta de otra extensión. El módulo `mcp-renderer-bridge` concentra la
dependencia de compatibilidad en `toolName` y tres getters de
`ToolExecutionComponent`: `getCallRenderer`, `getResultRenderer` y `getRenderShell`.
El método público `render` invalida una sola vez las filas que Pi haya montado
antes de `session_start`, para cubrir también el historial reconstruido al recargar.
Solo adapta herramientas cuya procedencia corresponde a `pi-mcp-adapter`;
mantiene sus ejecutores, parámetros, controles de permisos y resultados intactos.
Pi sigue siendo dueño de la expansión, las imágenes, el editor y el repintado.

La adaptación se instala únicamente con UI, es reversible y soporta recarga sin
acumular wrappers. Si faltan los getters esperados, informa una vez al arrancar y
conserva la presentación nativa. No se modifica ni fija la versión de ningún
paquete externo. CI ejecuta los renderizadores de `pi-mcp-adapter@latest` dentro
del componente real de Pi y verifica anchos, estados, expansión y protocolo Kitty.

Validación local:

```sh
bun test tests/mcp-cards.test.ts
NODE_PATH="$PWD/node_modules" bun tooling/verify-mcp-cards-runtime.ts /ruta/a/pi-mcp-adapter
bun run typecheck
```
