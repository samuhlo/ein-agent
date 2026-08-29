## // 000. RESUMEN

La fase 0 deja la beta sobre una política neutral de modelos y proveedores, recomendaciones exclusivamente de esfuerzo y una línea base arquitectónica que impide aumentar el acoplamiento antes de reestructurar carpetas.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/settings.json` ya no distribuye proveedor, modelo ni allowlist por defecto.
- El instalador interactivo ya no solicita una credencial de MiniMax implícitamente; Context7 y Linear conservan su comportamiento opcional.
- `/ein:models` ya no clasifica modelos como baratos/capaces. Recomienda esfuerzo y solo alerta con dos o más niveles de distancia.
- Un guardián AST congela los 32 accesos actuales de producción desde `installer`/`ein-cc` hacia `ein-pi/agent`.
- Las pruebas inspeccionan el tar real y el panel real, además de las funciones puras.

## // 002. DECISIONES

- Una elección explícita del usuario no es un default de Ein: se preservan los campos de settings y las escrituras desde `/ein:models`.
- La escala de distancia es `off → minimal → low → medium → high → xhigh`; una diferencia adyacente no es alerta.
- El baseline arquitectónico es exacto y decreciente, no se regenera automáticamente.
- La reestructuración física queda para fase 1 para no mezclar política y migración de rutas.

## // 003. VERIFICACIÓN

- Suite completa: 2.877/2.877 pruebas, 205 archivos.
- Typecheck raíz e installer: PASS.
- Bundle host: PASS; settings empaquetado sin `defaultProvider`, `defaultModel` ni `enabledModels`.
- `git diff --check`: PASS.

## // 004. PENDIENTE

- Fase 1: extraer un core compartido, rediseñar carpetas y reducir el baseline de 32 reach-ins.
- No se hizo deploy sobre la instalación activa, commit, tag, push ni publicación.
