---
title: "Resolver problemas"
description: "Diagnóstico, actualización, fases bloqueadas y documentación."
sources: ["installer/src/cli/doctor.ts", "installer/src/cli/update.ts", "installer/src/cli/uninstall.ts", "ein-cc/README.md", "docs/adr/0006-remove-runtime-compressors.md"]
verified_rev: "abe4ee268ab553398fdc08cf57f93a4e236551e4"
---

Empieza con `ein-install doctor`. Revisa el diagnóstico antes de reparar; un problema de autenticación, PATH o dependencia no se resuelve siempre reinstalando.

## No se encuentra `ein`

Comprueba `command -v ein` y `command -v ein-install`. El bootstrap suele instalar en `~/.local/bin` o `/usr/local/bin`. Si falta el directorio en el PATH, añádelo a la configuración de tu shell y abre una terminal nueva.

Si `ein-install` funciona, puedes reparar desde él aunque la aplicación no arranque:

```bash
ein-install install
```

## No aparecen `ein-pi` o `ein-cc`

Son funciones Fish de acceso avanzado. Abre una nueva sesión Fish y comprueba que instalaste el runtime correspondiente. La entrada habitual es `ein`; no necesitas copiar funciones a mano para usar la aplicación desde otro shell.

## Hypa aparece al actualizar

En un salto desde una versión antigua a `0.97.0-alpha.1`, el proceso del actualizador viejo puede mostrar una última revisión de Hypa después de instalar los archivos nuevos. Reemplazar el ejecutable en disco no sustituye el proceso que ya está corriendo.

El runtime de esa alpha ya no integra Hypa. Comprueba la versión con `ein-install --version`, ejecuta `ein-install doctor` y abre una sesión nueva de Ein para cargar el runtime actualizado. No hace falta repetir la actualización para retirar sus archivos ni desinstalar herramientas globales que uses por tu cuenta.

La [PR #407](https://github.com/samuhlo/ein-agent/pull/407), integrada después de publicar esa alpha, delega el mantenimiento de herramientas externas en el binario de destino verificado. Protege las actualizaciones iniciadas con el instalador corregido; no modifica retroactivamente los instaladores publicados.

## La versión coincide, pero la evidencia aparece pendiente

El número de versión instalado, la identidad del artifact y su frescura son comprobaciones distintas. `verification-pending`, `unknown` o `alpha-expiration-evidence-unavailable` no equivalen a una identidad verificada. Conserva la salida completa y revisa el diagnóstico; no conviertas la coincidencia del número de versión en una prueba de todo lo demás.

## Cambié fuentes y no cambia el runtime

Editar el checkout no actualiza la instalación. Para desplegarlo, consulta [desarrollo local](https://github.com/samuhlo/ein-agent/blob/main/installer/README.md#desarrollo). En Claude, `bun ein-cc/sync.ts` reconstruye el adaptador y el CLI. Abre una sesión nueva después.

`ein-cc/CLAUDE.md` es generado. Edita `CLAUDE.adapter.md` o las fuentes compartidas y vuelve a sincronizar.

## Una fase está bloqueada

Lee el bloqueo concreto. Puede faltar una decisión, un artefacto vigente, una evidencia o una comprobación. También puede ser un defecto del flujo; estar bloqueado no demuestra por sí solo que todo funcione correctamente.

En Claude, desde el proyecto:

```bash
ein-cc-sdd status
ein-cc-sdd check nombre-del-cambio
```

En Pi consulta el estado SDD. Corrige la causa en la fase correspondiente; no cambies `fail` por `pass` ni relajes criterios para avanzar.

## Los tests fallan

Comprueba dependencias y compara con una base limpia en otro checkout o worktree. Conserva intacto el árbol con tu trabajo. No des por hecho que un fallo es preexistente ni uses un stash automático como primer diagnóstico.

## Actualización incompleta o desinstalación

Sigue [recuperación](/ein-agent/05-debug/uninstall-recovery/). No borres hogares completos ni secretos para reparar el despliegue. Si hay recuperación pendiente, conserva sus archivos y resuelve ese estado antes de repetir operaciones.

## La documentación parece antigua

Desde la raíz del repositorio:

```bash
bun ein-pi/agent/lib/docs-site-drift-detector.ts --check-sources
bun ein-pi/agent/lib/docs-site-drift-detector.ts
```

El primer comando comprueba rutas declaradas; el segundo detecta cambios desde la revisión documentada. Un resultado limpio no sustituye revisar el significado del texto. Las guías del checkout pueden describir código aún pendiente de release.

Si persiste el problema, abre un [issue](https://github.com/samuhlo/ein-agent/issues) con versión, plataforma, pasos y diagnóstico. Revisa que la salida no incluya credenciales antes de publicarla.
