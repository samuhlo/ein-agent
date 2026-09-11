# Tarjetas de herramientas nativas

Las herramientas builtin de Pi (bash, read, edit, write, grep, find y ls) comparten la tarjeta MCP de #412. El adaptador respeta la procedencia: una extensión que sustituya un builtin conserva su presentación.

La capa de tres getters de #412 se extrae a un único registro de propietarios. Las tarjetas MCP y nativas comparten instalación, recarga y limpieza; no se registran ejecutores nuevos ni se modifica el resultado guardado. El acoplamiento interno sigue siendo el documentado en ADR 0007 y se comprueba contra latest.

Los scripts largos y diffs quedan plegados. Los errores conservan estado y resumen; solo se identifica autenticación o permisos cuando la salida lo dice. El detalle conserva argumentos, salida y diff, con la sanitización y límite de visualización de MCP. El número de líneas corresponde a la respuesta, no al archivo completo. No se infiere que un comando ejecutado correctamente haya validado el producto.

Validación:
- Suite completa: 3241 pass / 0 fail.
- Typecheck y empaquetado del host.
- 420 renderizados de componentes Pi reales: siete herramientas, seis estados, cinco anchuras y dos vistas.
- Imagen Kitty, expansión, restauración de historial, aislamiento de procedencia y coexistencia con MCP.
- Pi 0.84.4, pi-subagents 0.67.0 y pi-mcp-adapter 2.33.0 mediante latest.
- Inspección visual de una captura rasterizada de las líneas ANSI reales con el tema Ein.

La prueba inicial completa carecía del template compilado y el sandbox bloqueaba sockets. Se generó el paquete y se ejecutó la suite con acceso a sockets/PTYs locales. Las operaciones representadas en los ejemplos son fixtures; no consultan Neon.
