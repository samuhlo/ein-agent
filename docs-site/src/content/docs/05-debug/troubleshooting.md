---
title: "Troubleshooting"
description: "Los fallos más frecuentes y cómo salir de ellos."
sources: ["installer/src/cli/doctor.ts", "installer/src/core/deps.ts", "installer/src/core/backup.ts", "README.md"]
verified_rev: "eeceb7c"
---

Empieza siempre por aquí:

```bash
ein-install doctor
```

Casi todo lo de esta página se detecta ahí. Lo que sigue son los casos concretos
y su salida.

## `ein: command not found`

El binario está en `~/.local/bin` y esa ruta no está en tu `PATH`.

```bash
echo $PATH | tr ':' '\n' | grep -q "$HOME/.local/bin" && echo "está" || echo "falta"
```

Si falta, añádelo a la configuración de tu shell y abre una terminal nueva.

## `ein-pi` o `ein-cc` no existen

Son funciones de shell que instala `ein-install install`. Si el comando no aparece:

1. Comprueba que instalaste ese runtime: `ein-install doctor` te lo dice.
2. Abre una terminal nueva — las funciones se cargan al arrancar el shell.
3. Si sigue sin estar: `ein-install install --runtime pi` (o `claude`).

La entrada normal sigue siendo `ein`; estos dos comandos son accesos directos
avanzados.

## Quedó un fichero con el nombre anterior tras actualizar

El instalador solo retira un launcher antiguo cuando sus bytes coinciden con
una versión publicada por Ein. Si modificaste una función con ese mismo nombre,
la conserva y muestra un aviso: el nombre por sí solo no demuestra ownership.

Ejecuta `ein-install install` para reparar las superficies actuales. No borres
funciones ni hogares completos a ciegas; `~/.pi-ein/agent` y `~/.claude-ein`
siguen siendo los hogares vigentes y no se migran con este cambio.

## El doctor da FAIL

Antes de investigar:

```bash
ein-install install
```

Repara sobre lo existente y crea backup antes. Resuelve la mayoría de los FAIL,
que suelen ser ficheros que faltan o una sincronización a medias.

## Cambié el código y el comportamiento no cambia (Claude Code)

El CLI `ein-cc-sdd` está **compilado**, no interpretado. Un cambio en el código
del repositorio no llega al binario instalado hasta que sincronizas:

```bash
bun ein-cc/sync.ts
```

Es la causa más habitual de "lo he arreglado pero sigue igual".

## Edité `ein-cc/CLAUDE.md` y se perdió

Es un fichero **generado**. Se compone de la política compartida más la
adaptación de Claude, y `sync.ts` lo reescribe entero.

Edita `ein-cc/CLAUDE.adapter.md` o la fuente compartida, y vuelve a sincronizar.

## Una actualización salió mal

```bash
ls ~/.pi-ein/agent/backups/installer/
ein-install restore
```

`ein-install update` crea un backup antes de tocar nada. `restore` te devuelve al estado
anterior.

## Una fase SDD se queda bloqueada

Es comportamiento correcto, no un fallo. La causa está en el mensaje:

```bash
ein-cc-sdd check <cambio>
```

Los bloqueos típicos son un artefacto que falta, una señal obligatoria que no se
escribió, o una declaración de spec delta mal formada. El mensaje dice cuál.

## Los tests fallan y no son míos

Comprueba si ya fallaban antes de tu cambio:

```bash
git stash push -u -m "temp"
bun test
git stash apply
```

En este repositorio hay fallos preexistentes conocidos relacionados con
dependencias del instalador que no están instaladas en todos los árboles. No son
tuyos.

## Sospecho que la documentación no coincide con el código

Justo para eso está el detector:

```bash
bun ein-pi/agent/lib/docs-site-drift-detector.ts
```

Lista qué páginas declaran fuentes que han cambiado desde que se verificaron.

## Quiero empezar de cero

```bash
ein-install uninstall     # conserva auth, secrets y sesiones
ein-install install
```

Si quieres una limpieza total, borra además
`~/.config/opencode-secrets/`. Perderás las claves de las integraciones.

## Nada de esto funciona

Abre un issue con la salida completa de `ein-install doctor`, tu sistema operativo y qué
runtime usas:

[github.com/samuhlo/ein-agent/issues](https://github.com/samuhlo/ein-agent/issues)

## Siguiente

[Uninstall & Recovery](/ein-agent/05-debug/uninstall-recovery/) — cómo volver
atrás del todo.
