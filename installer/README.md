# Ein installer

Instalador cross-platform (macOS + Linux) del workbench **Ein** sobre Pi Coding Agent.
Bun + TypeScript, compilado a binarios standalone, con TUI brutalista (paleta plana de marca: Carbon, Concrete, Structure, Yellow `#FFCA40`).

## Instalación

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bootstrap detecta tu plataforma, descarga el binario `ein` de la última release
y lo deja en `~/.local/bin/ein` (o `/usr/local/bin` si es escribible). Luego:

```bash
ein            # menú interactivo
ein install    # instala/repara Ein (deps + deploy + secrets + doctor)
ein update     # actualiza Ein y pi (con backup previo)
ein doctor     # diagnóstico del despliegue (sin lanzar pi)
ein uninstall  # elimina Ein (conserva auth.json/secrets/sessions)
ein restore    # restaura desde un backup
```

Flags: `--yes` (no interactivo), `--dry-run` (muestra el plan sin ejecutar nada),
`--no-engram`, `--no-secrets`, `--no-linear`.

## Backups

Cada `install` (sobre un árbol existente), `update`, `uninstall` y `restore` crea
antes un snapshot comprimido (`.tar.gz`) en `~/.pi/agent/backups/installer/`:

- **Dedup**: si el árbol no cambió desde el último backup, no se crea otro.
- **Poda**: se conservan los 5 más recientes; `ein restore --pin <nombre>` protege
  uno de la poda (`--unpin` lo libera).
- **Rollback automático**: si el deploy falla a medias, `install`/`update` restauran
  solos el snapshot previo.
- Los backups excluyen estado regenerable y de usuario (`auth.json`, `sessions/`,
  `npm/`, `skills/downloaded/`): restaurar nunca pisa tus credenciales.

## Qué hace `ein install`

1. Detecta OS/arch/distro/shell.
2. Comprueba e instala dependencias: `bun`, `pi` (obligatorias), `engram`, `gh` (opcionales).
3. Despliega el template de Ein (embebido en el binario) en `~/.pi/agent`, **templando
   las rutas** (`mcp.json`, `settings.json`) según tu `$HOME` y la ubicación real de `engram`.
4. Wizard de secrets opcional (`context7`, `linear`, `minimax`) en `~/.config/opencode-secrets/`.
5. Añade el export de `CONTEXT7_API_KEY` a tu shell rc (idempotente).
6. Corre el doctor y reporta el estado.

Nunca toca `auth.json`, `sessions/` ni `backups/`.

## Desarrollo

```bash
bun install
bun run dev               # ejecuta sin compilar
bun run typecheck
bun run bundle-template   # genera src/assets/template.tar.gz desde ../ein-pi/{core,agent}
bun run build:all         # compila los 4 binarios en dist/
bun run build:all linux-x64   # un solo target
./e2e/docker-test.sh      # e2e real: install → doctor en un Ubuntu limpio (Docker)
```

El contenido de Ein se empaqueta componiendo `../ein-pi/core` (assets portables) y
`../ein-pi/agent` (runtime Pi) con una allowlist (sin secrets, runtime ni
node_modules), más un `template-manifest.json` generado que describe el contenido
exacto (lo consumen `ein doctor` y `--dry-run`). Todo se embebe en el binario vía
`bun build --compile`.

## Release

Push de un tag `installer-v*` dispara `.github/workflows/installer-release.yml`, que
empaqueta, compila los 4 targets, genera `checksums.txt` y publica la release con los
binarios + `install.sh`.
