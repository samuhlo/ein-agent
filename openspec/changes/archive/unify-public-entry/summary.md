## // 000. RESUMEN
`ein` pasa a ser la única puerta: los verbos de ciclo de vida se ejecutan en vez de anunciarse, el segundo menú del instalador desaparece y las tres superficies cuentan la misma historia. Suite en verde (2503) y los dos typechecks pasan.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`: el caso `moved` se convierte en `delegate` y `runTerminalApp` ejecuta la delegación por el seam `run` que ya existía; `productionRun` devuelve 127 cuando el proceso no arranca.
- `ein-pi/agent/lib/terminal-app.ts`: arrancar Pi y Claude suben a las dos primeras filas del dashboard, sin tocar teclas.
- `installer/src/cli/runtime-prompt.ts` (nuevo) sustituye a `menu.ts` (borrado): queda la pregunta de runtime, se va el menú de acciones.
- `installer/src/main.ts`: sin argumentos instala; la ayuda se llama `ein-install` y deja de presentarse como `ein`.
- `README.md`, ayuda de la app y outro del dry-run: una sola jerarquía contada igual en todas partes.
- `tests/public-entry-story.test.ts` (nuevo) más contratos reescritos en `terminal-app-driver`, `terminal-app` e `installer-runtime-menu`.

## // 002. CÓMO FUNCIONA POR DENTRO
`parseTerminalAppArgs` sigue siendo pura: ante un verbo de ciclo de vida devuelve `{kind:"delegate", command:"ein-install", argv}` con el argv completo, sin ejecutar nada. El borde —`runTerminalApp`— toma esa decisión y la pasa al seam `run`, el mismo que la vista de Sistema ya usaba para lanzar `ein-install`; no hay una segunda ruta de spawn. El código del hijo se propaga tal cual, y las dos formas de fallo (el spawn que lanza y el hijo que devuelve 127) convergen en 127 con el nombre del comando en pantalla: una operación de ciclo de vida que no se puede ejecutar se reporta como no disponible, nunca como hecha.

En el instalador, `main.ts` sin argumentos ya no abre un menú de acciones: llama a `runBootstrapInstall`, que pregunta solo el runtime —decisión real del arranque— y sin TTY explica qué flag pasar en vez de colgarse esperando una tecla.

## // 003. DECISIONES
- La decisión de delegar es pura y la ejecución vive en el borde: mantiene la frontera `[CORE]` del repositorio y deja el parser testeable sin proceso.
- 127 en vez de 1 cuando el proceso no arranca: distingue "falta el comando" de "el comando corrió y falló", y la vista de Sistema hereda la honestidad.
- `menu.ts` se borra, no se esconde: un fichero llamado `menu.ts` sin menú dentro es el mismo defecto que este cambio existe para quitar.
- El rename C1 se queda fuera a propósito: va al final del programa 0.90, cuando la mesa esté despejada.

## // 004. VERIFICACIÓN
`bun test`: 2503 pass, 0 fail, 12248 assertions (baseline 2493), re-ejecutado tras escribir el delta OpenSpec para que la evidencia sea posterior a lo que certifica. `bun run typecheck` en raíz e `installer`: pass. `git diff --check`: pass. Evidencia estricta RED → GREEN → TRIANGULATE → REFACTOR por grupo en `apply-progress.md`.

## // 005. PENDIENTE / RIESGOS
- `@clack/prompts` sigue declarado en `installer/package.json` sin un solo import vivo; retirarlo es una edición aparte y demostrable.
- Quien teclee `ein-install` esperando la lista de acciones ahora recibe el prompt de instalación. Es la retirada buscada y la ayuda lo dice.
- La suite de raíz exige `cd installer && bun run bundle-template:host` antes de correr; sin eso da 16-19 rojos ajenos al cambio. No está documentado en `EIN.md`.
