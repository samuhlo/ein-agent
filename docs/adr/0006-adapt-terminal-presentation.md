# 0006 — Adaptar la presentación del terminal

Ein muestra el trabajo en curso con un destello junto al editor. El indicador usa
el temporizador y el ciclo de vida nativos de Pi: desaparece al terminar o cancelar
el turno. `ein-pi --ein-no-motion` mantiene una estrella estática. No modifica
el editor, sus atajos, selección ni pegado.

Los bloques de pensamiento ocultos no ocupan filas en la conversación. La opción
nativa de mostrar pensamiento sigue disponible y los datos de sesión se conservan.
Cuando el resultado de un subagente ya identifica al mismo agente, su cabecera
sustituye a la cabecera de la llamada. Las llamadas de gestión y los errores sin
resultado identificado conservan la cabecera original.

La extensión usa las APIs públicas de Pi para el indicador y la etiqueta de
pensamiento. Para eliminar filas, aplica un adaptador reversible al método
`render` de los dos componentes exportados por Pi; no modifica archivos del
paquete ni accede a campos privados. El adaptador se retira al cerrar la sesión y
no se instala en modo sin UI. Las pruebas de compatibilidad ejecutan el
renderizador de `pi-subagents@latest` para detectar cambios de formato.

Validación local:

```sh
bun test tests/terminal-activity.test.ts
bun run typecheck
NODE_PATH="$PWD/node_modules" bun tooling/verify-terminal-transcript-runtime.ts /ruta/a/pi-subagents
```
