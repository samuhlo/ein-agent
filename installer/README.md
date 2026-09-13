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

Sin opciones, el bootstrap selecciona la **release estable**, no la alpha más reciente. Para una alpha usa el comando con `--release-channel alpha` y `--release-tag` de sus [notas de release](https://github.com/samuhlo/ein-agent/releases). Ambos flags deben ir juntos.

El bootstrap detecta tu plataforma, descarga inicialmente el instalador y lo ejecuta. La instalación conserva ese binario como `ein-install` y promociona la aplicación terminal como `ein` en `~/.local/bin` (o `/usr/local/bin` si es escribible). Luego:

```bash
ein            # menú interactivo
ein install    # instala/repara Ein (deps + deploy + secrets + doctor)
ein update     # actualiza Ein, Pi y sus paquetes; Claude tiene su propio canal
ein doctor     # diagnóstico del despliegue (sin lanzar runtimes)
ein uninstall  # elimina Ein (conserva auth.json/secrets/sessions)
ein restore    # restaura desde un backup
```

Flags: `--yes` (no interactivo), `--dry-run` (muestra el plan sin ejecutar nada),
`--runtime <pi|both>` (Ein o Ein + Claude),
`--no-secrets`, `--no-linear`, `--no-codegraph`.

## Backups

Las operaciones que reemplazan un árbol gestionado existente preparan antes
un directorio snapshot `.snapshot` con manifest, metadata y contenido en
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
   Ein no conserva una versión antigua conocida. Claude y `gh` no
   forman parte del núcleo.
3. Despliega las superficies seleccionadas desde el template de Ein (embebido en el
   binario), manteniéndolas aisladas y **templando las rutas** (`mcp.json`, `settings.json`)
   según tu `$HOME`.
4. Wizard de secrets opcional (`context7`, `linear`, `minimax`) en `~/.config/opencode-secrets/`.
5. Añade el export de `CONTEXT7_API_KEY` a tu shell rc (idempotente).
6. Corre el doctor y reporta el estado.

El despliegue conserva autenticación y sesiones. Los backups sí se crean y gestionan según la política anterior; un `--dry-run` no aplica cambios. Hypa y Headroom ya no forman parte del runtime ni de los nuevos planes de instalación. Los antiguos flags y registros de Hypa solo se leen por compatibilidad, sin activar esa integración.

## Actualizar desde una instalación con Engram

Ein deja de instalar, actualizar y usar Engram. Al actualizar el despliegue se retiran solo las entradas MCP reconocidas como gestionadas por Ein; las configuraciones personalizadas, los datos de `~/.engram-ein` y el binario global se conservan. No se migran notas a otro sistema. El proyecto se retoma desde sus archivos, OpenSpec y Git; `ein-scout` puede reunir evidencia acotada cuando hace falta investigar.

## Desarrollo

Desde la raíz del repositorio puedes desplegar el checkout actual sin publicar
una alpha en GitHub:

```bash
bun run setup                       # una vez: dependencias del checkout
bun run dev:install --dry-run        # compila y previsualiza sin instalar
bun run dev:install                  # compila e instala; abre después una sesión nueva
```

El comando reconstruye el template y los binarios solo para tu plataforma,
incluidos los cambios locales sin commit. Ejecuta el instalador compilado con
el flujo habitual de backups y conservación de estado. Despliega en tu hogar
activo de Ein; no crea un segundo perfil de pruebas. Acepta `--runtime pi|both`
y las opciones habituales de `install`. `--build-only` genera los binarios sin
desplegar. Conserva la versión del checkout: no crea tags, releases ni una
versión de desarrollo nueva. Las dependencias ausentes pueden necesitar red.

Para probar una PR, cambia primero a su rama. Para volver a una release publicada,
usa `ein-install update --yes <tag>`; para probar otra rama, repite el despliegue.

Comandos internos desde `installer/`:

```bash
bun install
bun run bundle-template:host  # prepara assets y app para tu plataforma
bun run dev --help        # inspecciona la CLI desde fuente; para instalar usa dev:install
bun run typecheck
bun run build:all         # compila los 4 binarios en dist/
bun run build:all linux-x64   # un solo target
../e2e/docker-test.sh     # matriz de ciclo de vida en hogares Ubuntu desechables
```

Desde la raíz del repositorio, `./e2e/docker-test.sh` instala dos veces y prueba Ein, Ein + Claude y uninstall
recuperable. Además ejecuta la matriz determinista de update/rollback,
preservación de estado privado y el launcher beta con PTY. Para comprobar la
ruta pública entre releases, ejecuta `./e2e/release-update-test.sh
<tag-origen> <tag-destino>`: descarga el asset anterior y actualiza mediante la
API y los assets reales de GitHub dentro de Docker.

`bundle-template` es el paso interno: requiere la app compilada y los valores
`EIN_APP_BINARY` y `EIN_APP_TARGET`. Para preparar assets de desarrollo usa
`bundle-template:host`; `build:all` prepara los suyos por target.

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

1. Actualiza `installer/package.json`, `installer/src/core/version.ts` y `CHANGELOG.md` con la
   misma versión SemVer.
2. Ejecuta los checks definidos para la release.
3. Con los cambios integrados, crea y sube `installer-v<semver>` sobre el tip exacto de `main`.
4. `.github/workflows/installer-release.yml` compila los cuatro targets, genera
   `checksums.txt` y publica la GitHub Release con los binarios e `install.sh`.
5. Ya publicada, el workflow instala la alpha anterior en un hogar desechable,
   actualiza a la nueva y comprueba versión, marker, `doctor` y datos privados.

El bootstrap y `ein update` consumen esos assets de GitHub Release. Las notas de
una prerelease incluyen el comando con canal y tag exactos; las de una release
final conservan el bootstrap del canal estable.

## Transición desde instaladores anteriores

Al actualizar, el proceso antiguo puede terminar acciones de su propia versión después de reemplazar el ejecutable. Por eso el salto desde una versión con Hypa a `0.97.0-alpha.1` puede mostrar una última actualización de Hypa aunque el runtime instalado ya lo haya retirado. Una nueva sesión carga el runtime nuevo; no es necesario repetir la actualización para retirar sus archivos.

La corrección de [PR #407](https://github.com/samuhlo/ein-agent/pull/407), integrada en `main` después de publicar esa alpha, encarga el mantenimiento de herramientas externas al binario de destino verificado. No cambia retroactivamente los binarios publicados ni traslada a esa continuación la actualización de Pi y sus paquetes. Consulta la [decisión completa](../docs/adr/0006-remove-runtime-compressors.md).
