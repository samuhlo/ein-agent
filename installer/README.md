# Ein installer

Instalador cross-platform (macOS + Linux) de **Ein**. Pi Coding Agent es siempre el núcleo; Claude Code puede añadirse como relevo aislado.
Bun + TypeScript, compilado a binarios standalone, con TUI brutalista (paleta plana de marca: Carbon, Concrete, Structure, Yellow `#FFCA40`).

## Instalación del núcleo y complemento

El instalador siempre despliega Ein sobre Pi. La única elección es añadir o no el complemento Claude Code:

```bash
ein install --runtime pi
ein install --runtime both
```

`pi` instala el núcleo. `both` instala el núcleo y después Claude. `claude` solo se conserva en los formatos internos V1 para leer recuperaciones antiguas; una instalación nueva Claude-only se rechaza antes de modificar el sistema.

## Instalación

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bootstrap detecta tu plataforma, descarga inicialmente el instalador y lo ejecuta. La instalación conserva ese binario como `ein-install` y promociona la aplicación terminal como `ein` en `~/.local/bin` (o `/usr/local/bin` si es escribible). Luego:

```bash
ein            # menú interactivo
ein install    # instala/repara Ein (deps + deploy + secrets + doctor)
ein update     # actualiza Ein y los runtimes instalados (con backup previo)
ein doctor     # diagnóstico del despliegue (sin lanzar runtimes)
ein uninstall  # elimina Ein (conserva auth.json/secrets/sessions)
ein restore    # restaura desde un backup
```

Flags: `--yes` (no interactivo), `--dry-run` (muestra el plan sin ejecutar nada),
`--runtime <pi|both>` (Ein o Ein + Claude), `--no-engram`,
`--no-secrets`, `--no-linear`, `--no-hypa`, `--no-codegraph`.

## Backups

Cada `install` (sobre un árbol existente), `update`, `uninstall` y `restore` crea
antes un directorio snapshot `.snapshot` con manifest, metadata y contenido en
`~/.pi-ein/agent/backups/installer/` por defecto (o en el hogar Pi legacy si
una instalación gestionada válida sigue activa allí):

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
2. Comprueba e instala las dependencias del núcleo Pi y, si se selecciona, del
   complemento Claude. Pi requiere Node `>=22.19.0`; si falta o es antiguo, el
   instalador se detiene con un diagnóstico accionable. El host Pi y sus
   extensiones administradas se resuelven siempre desde el tag npm `latest`;
   Ein no conserva una versión antigua conocida. Claude, `engram` y `gh` no
   forman parte del núcleo.
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
bun run bundle-template   # compone ../runtime + ../vendor/skills + ../ein-pi/agent
bun run build:all         # compila los 4 binarios en dist/
bun run build:all linux-x64   # un solo target
./e2e/docker-test.sh      # matriz de ciclo de vida en hogares Ubuntu desechables
```

`./e2e/docker-test.sh` instala dos veces y prueba Ein, Ein + Claude y uninstall
recuperable. Además ejecuta la matriz determinista de update/rollback,
preservación de estado privado y el launcher beta con PTY. Para comprobar la
ruta pública entre releases, ejecuta `./e2e/release-update-test.sh
<tag-origen> <tag-destino>`: descarga el asset anterior y actualiza mediante la
API y los assets reales de GitHub dentro de Docker.

El contenido de Ein se empaqueta componiendo `../runtime` (contenido propio),
`../vendor/skills` (fuentes externas) y `../ein-pi/agent` (adaptador Pi) con una
allowlist. No entran secrets, estado de ejecución ni `node_modules`. Un
`template-manifest.json` generado describe el contenido exacto para `ein doctor`
y `--dry-run`. Todo se embebe en el binario vía `bun build --compile`.

## Propiedad del instalador

La instalación, actualización, release y `doctor` del despliegue son
responsabilidad de `ein-install`. La aplicación `ein` delega esos verbos en él,
de modo que una interfaz rota no elimina la vía de reparación.

## Release

La publicación canónica vive en GitHub Actions; no hay publicación local ni en npm.

1. Actualiza `installer/package.json`, `src/core/version.ts` y `CHANGELOG.md` con la
   misma versión SemVer.
2. Ejecuta los checks definidos para la release.
3. Crea y sube el tag `installer-v<semver>`.
4. `.github/workflows/installer-release.yml` compila los cuatro targets, genera
   `checksums.txt` y publica la GitHub Release con los binarios e `install.sh`.
5. Ya publicada, el workflow instala la alpha anterior en un hogar desechable,
   actualiza a la nueva y comprueba versión, marker, `doctor` y datos privados.

El bootstrap y `ein update` consumen esos assets de GitHub Release. Las notas de
una prerelease incluyen el comando con canal y tag exactos; las de una release
final conservan el bootstrap del canal estable.
