---
title: "Desinstalar y recuperar"
description: "Cómo volver atrás: backups, rollback y salir del todo sin perder nada."
sources: ["installer/src/core/backup.ts", "installer/src/cli/uninstall.ts", "installer/src/cli/restore.ts", "installer/src/core/pi-migration.ts"]
verified_rev: "29861f5"
---

Poder salir es parte de poder entrar. Si desinstalar EIN fuera complicado,
probarlo sería una decisión más grande de lo que debería.

## Volver al runtime vanilla, ya

No hace falta desinstalar nada:

```bash
pi        # tu Pi de siempre
claude    # tu Claude Code de siempre
```

Nunca dejaron de funcionar. EIN vive en `~/.pi-ein/agent` y `~/.claude-ein`; tus
runtimes originales están en `~/.pi/agent` y `~/.claude`, intactos.

## Desinstalar

```bash
ein uninstall
```

Crea un backup antes, elimina la casa de EIN y **conserva**:

- `auth.json` — tu autenticación
- `~/.config/opencode-secrets/` — las claves de las integraciones
- tus sesiones e historial

Es deliberado: reinstalar no te obliga a reconfigurar ni a volver a
autenticarte.

Para una limpieza total, borra además el directorio de secrets a mano. Perderás
las claves.

## Los backups

Van a `backups/installer/` dentro de la casa de EIN, como `.tar.gz`:

```bash
ls ~/.pi-ein/agent/backups/installer/
```

Se crea uno **automáticamente** antes de cada operación destructiva: `install`
sobre un árbol existente, `update`, `uninstall` y `restore`. No hay que
acordarse de nada.

## Restaurar

```bash
ein restore
```

Te deja elegir un backup y lo aplica. Es la salida de una actualización que dejó
algo raro.

## Una actualización falló

```bash
ein doctor      # ver qué está mal
ein restore     # volver al estado anterior
```

`ein update` verifica el payload antes de aplicarlo y crea backup, así que un
fallo a mitad no debería dejarte a medias. Si te deja, `restore` lo resuelve.

## Revertir la migración de Pi

Si el instalador movió una instalación legacy de `~/.pi/agent` a
`~/.pi-ein/agent` y quieres deshacerlo, hay dos formas:

```bash
# mover de vuelta
mv ~/.pi-ein/agent ~/.pi/agent

# o restaurar el backup que la migración creó
ls ~/.pi-ein/agent/backups/installer/
```

La migración conserva login, sesiones e historial, así que revertirla no pierde
nada.

:::note
La migración solo mueve un árbol si encuentra un marcador válido de EIN
(`.ein-install.json`). Un directorio vanilla de Pi nunca se toca, ni en la
instalación ni en la reversión.
:::

## Y en tus proyectos

`ein uninstall` no toca el código de tus proyectos. El directorio `openspec/` de
cada uno sigue donde estaba, con sus cambios y su archivo.

Si además quieres quitar EIN de un proyecto concreto, borra su `openspec/` y su
`EIN.md`. Ojo: eso borra el histórico de decisiones de los cambios archivados,
que suele ser lo más valioso que deja EIN.

## Checklist de salida limpia

```bash
ein uninstall                          # quita EIN, conserva credenciales
rm -rf ~/.config/opencode-secrets      # opcional: borra las claves
rm ~/.local/bin/ein                    # opcional: quita el binario
```

Y comprueba que todo sigue en su sitio:

```bash
pi --version
claude --version
```

## Siguiente

Vuelve al [Overview](/ein-agent/00-start/overview/), o pasa por
[GitHub](https://github.com/samuhlo/ein-agent) si algo no encaja.
