---
title: "Troubleshooting"
description: "Los fallos más frecuentes y cómo salir de ellos."
sources: ["installer/src/cli/doctor.ts", "installer/src/core/deps.ts", "installer/src/core/backup.ts", "README.md"]
verified_rev: "29861f5"
---

Empieza siempre por aquí:

```bash
ein doctor
```

Casi todo lo de esta página se detecta ahí. Lo que sigue son los casos concretos
y su salida.

## `ein: command not found`

El binario está en `~/.local/bin` y esa ruta no está en tu `PATH`.

```bash
echo $PATH | tr ':' '\n' | grep -q "$HOME/.local/bin" && echo "está" || echo "falta"
```

Si falta, añádelo a la configuración de tu shell y abre una terminal nueva.

## `pi-ein` o `cc-ein` no existen

Son funciones de shell que instala `ein install`. Si el comando no aparece:

1. Comprueba que instalaste ese runtime: `ein doctor` te lo dice.
2. Abre una terminal nueva — las funciones se cargan al arrancar el shell.
3. Si sigue sin estar: `ein install --runtime pi` (o `claude`).

## El doctor da FAIL

Antes de investigar:

```bash
ein install
```

Repara sobre lo existente y crea backup antes. Resuelve la mayoría de los FAIL,
que suelen ser ficheros que faltan o una sincronización a medias.

## Cambié el código y el comportamiento no cambia (Claude Code)

El CLI `cc-ein-sdd` está **compilado**, no interpretado. Un cambio en el código
del repositorio no llega al binario instalado hasta que sincronizas:

```bash
bun cc-ein/sync.ts
```

Es la causa más habitual de "lo he arreglado pero sigue igual".

## Edité `cc-ein/CLAUDE.md` y se perdió

Es un fichero **generado**. Se compone de la política compartida más la
adaptación de Claude, y `sync.ts` lo reescribe entero.

Edita `cc-ein/CLAUDE.adapter.md` o la fuente compartida, y vuelve a sincronizar.

## Una actualización salió mal

```bash
ls ~/.pi-ein/agent/backups/installer/
ein restore
```

`ein update` crea un backup antes de tocar nada. `restore` te devuelve al estado
anterior.

## Una fase SDD se queda bloqueada

Es comportamiento correcto, no un fallo. La causa está en el mensaje:

```bash
cc-ein-sdd check <cambio>
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
ein uninstall     # conserva auth, secrets y sesiones
ein install
```

Si quieres una limpieza total, borra además
`~/.config/opencode-secrets/`. Perderás las claves de las integraciones.

## Nada de esto funciona

Abre un issue con la salida completa de `ein doctor`, tu sistema operativo y qué
runtime usas:

[github.com/samuhlo/ein-agent/issues](https://github.com/samuhlo/ein-agent/issues)

## Siguiente

[Uninstall & Recovery](/ein-agent/05-debug/uninstall-recovery/) — cómo volver
atrás del todo.
