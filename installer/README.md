# Ein installer

Instalador cross-platform (macOS + Linux) del workbench **Ein**, con superficies aisladas para Pi Coding Agent y Claude.
Bun + TypeScript, compilado a binarios standalone, con TUI brutalista (paleta plana de marca: Carbon, Concrete, Structure, Yellow `#FFCA40`).

## Selección de runtime

El instalador permite seleccionar qué superficie desplegar, sin mezclar los runtimes:

```bash
ein install --runtime pi
ein install --runtime claude
ein install --runtime both
```

El selector contractual acepta `pi`, `claude` o `both`: `pi` y `claude` seleccionan un runtime aislado; `both` despliega ambos. Esta selección,
igual que el estado del despliegue, pertenece al instalador y no implica que el launcher
beta esté implementado.

## Instalación

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bootstrap detecta tu plataforma, descarga el binario `ein` de la última release
y lo deja en `~/.local/bin/ein` (o `/usr/local/bin` si es escribible). Luego:

```bash
ein            # menú interactivo
ein install    # instala/repara Ein (deps + deploy + secrets + doctor)
ein update     # actualiza Ein y los runtimes instalados (con backup previo)
ein doctor     # diagnóstico del despliegue (sin lanzar runtimes)
ein uninstall  # elimina Ein (conserva auth.json/secrets/sessions)
ein restore    # restaura desde un backup
```

Flags: `--yes` (no interactivo), `--dry-run` (muestra el plan sin ejecutar nada),
`--runtime <pi|claude|both>` (selecciona la superficie del instalador), `--no-engram`,
`--no-secrets`, `--no-linear`.

## Backups

Cada `install` (sobre un árbol existente), `update`, `uninstall` y `restore` crea
antes un directorio snapshot `.snapshot` con manifest, metadata y contenido en
`~/.pi/agent/backups/installer/`:

- **Dedup**: si el árbol no cambió desde el último backup, no se crea otro.
- **Poda**: se conservan los 5 más recientes; `ein restore --pin <nombre>` protege
  uno de la poda (`--unpin` lo libera).
- **Restore exacto**: valida hashes, tamaños, modos y contenido antes de reemplazar
  el árbol gestionado. El original queda como `.recovery-*` privado y pineado.
- Los backups excluyen estado regenerable y de usuario (`auth.json`, `sessions/`,
  `npm/`, `skills/downloaded/`): restaurar nunca pisa tus credenciales.
- Los `.tar.gz` legacy se detectan, pero este instalador no los extrae: usa una
  versión antigua compatible o recuperación manual. WU4B/repair definirá la
  limpieza explícita de `.recovery-*`; no se podan automáticamente.

## Qué hace `ein install`

1. Detecta OS/arch/distro/shell.
2. Comprueba e instala las dependencias de las superficies seleccionadas, incluyendo los
   runtimes Pi/Claude; `engram` y `gh` son opcionales.
3. Despliega las superficies seleccionadas desde el template de Ein (embebido en el
   binario), manteniéndolas aisladas y **templando las rutas** (`mcp.json`, `settings.json`)
   según tu `$HOME` y la ubicación real de `engram`.
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
./e2e/docker-test.sh      # installer E2E: install → doctor en un Ubuntu limpio (Docker)
```

`./e2e/docker-test.sh` es evidencia de despliegue del **installer E2E** únicamente.
No prueba el launcher beta: la futura E2E del launcher deberá cubrir flujo de proyecto,
sesiones y frescura del estado.

El contenido de Ein se empaqueta componiendo `../ein-pi/core` (assets portables) y
`../ein-pi/agent` (runtime Pi) con una allowlist (sin secrets, runtime ni
node_modules), más un `template-manifest.json` generado que describe el contenido
exacto (lo consumen `ein doctor` y `--dry-run`). Todo se embebe en el binario vía
`bun build --compile`.

## Propiedad del instalador

La instalación, actualización, release y `doctor` del despliegue siguen siendo
responsabilidad del instalador. El launcher beta futuro no absorbe estas tareas ni
convierte la E2E del instalador en evidencia de launcher.

## Release

La publicación canónica vive en GitHub Actions; no hay publicación local ni en npm.

1. Actualiza `installer/package.json`, `src/core/version.ts` y `CHANGELOG.md` con la
   misma versión SemVer.
2. Ejecuta los checks definidos para la release.
3. Crea y sube el tag `installer-v<semver>`.
4. `.github/workflows/installer-release.yml` compila los cuatro targets, genera
   `checksums.txt` y publica la GitHub Release con los binarios e `install.sh`.

El bootstrap y `ein update` consumen esos assets de GitHub Release.
