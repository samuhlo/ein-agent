<div align="center">
  <img src="ein-logo.png" alt="Ein · coding-agent harness" width="440">
  <h1><code>./EIN.sh</code></h1>

**Un harness de coding-agent específico de Pi: dos runtimes aislados, una disciplina de entrega.**

</div>

---

Ein convierte trabajo ambiguo en cambios pequeños, verificados y explicados. Nace como un harness específico de **Pi Coding Agent** y ahora se despliega con dos adaptadores soportados: `pi-ein` para Pi y `cc-ein` para Claude Code.

OpenSpec, el flujo SDD y los subagentes son el centro del sistema. El core compartido no convierte a Ein en una herramienta portable para cualquier runtime: hoy la superficie soportada es Pi Coding Agent y Claude Code, cada uno con su propia casa.

> _note: aislamiento primero. `pi` y `claude` siguen siendo tus runtimes vanilla; Ein entra por launchers explícitos, no por contaminación silenciosa._

## // 00_ QUICK_START

El camino corto es instalar, abrir el menú y elegir el runtime. La instalación pública confirmada es el bootstrap de GitHub Releases:

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
ein
```

En el menú, selecciona **Pi**, **Claude Code** o **Both**. El instalador prepara únicamente los runtimes elegidos, instala sus launchers aislados y ejecuta el doctor al terminar.

Si quieres la instalación directa de Pi sin abrir el selector, ejecuta `ein install`. Para ver el resto del CLI, usa `ein --help`.

## // 01_ RUNTIME_SURFACE

Cada opción conserva intacto el runtime vanilla y coloca Ein en un hogar separado:

| ELECCIÓN | LAUNCHER | HOGAR DE EIN | RUNTIME VANILLA |
| :--- | :--- | :--- | :--- |
| **Pi** | `pi-ein` | `~/.pi-ein/agent` | `pi` → `~/.pi/agent` |
| **Claude Code** | `cc-ein` | `~/.claude-ein` | `claude` → `~/.claude` |
| **Both** | `pi-ein` + `cc-ein` | ambos hogares | ambos runtimes intactos |

`pi-ein.fish` exporta `PI_CODING_AGENT_DIR` y `EIN_PI_AGENT_HOME` solo para esa invocación. `cc-ein.fish` exporta `CLAUDE_CONFIG_DIR` y antepone `~/.claude-ein/bin` al `PATH`; los launchers viven como funciones Fish en `~/.config/fish/functions/` y no contaminan tu shell.

### Migración de una instalación Pi legacy

Si `~/.pi/agent` contiene una instalación Ein antigua, el instalador solo la mueve cuando encuentra un marcador Ein válido. Crea un backup `.tar.gz`, mueve el árbol a `~/.pi-ein/agent` y reescribe las rutas absolutas del template. Un directorio vanilla de Pi no se toca.

Desde un checkout del repositorio puedes inspeccionar o ejecutar la migración explícita:

```bash
bun pi-ein/migrate.ts --dry
bun pi-ein/migrate.ts
```

La migración conserva login, sesiones e historial. La reversión es mover `~/.pi-ein/agent` de vuelta a `~/.pi/agent` o restaurar el backup.

## // 02_ UPDATE_DECK

En una sesión de `pi-ein`, el aviso separa deliberadamente las dos actualizaciones:

```bash
pi-ein update --all    # Pi: binario, extensiones y paquetes
ein update             # Ein: instalador y template de la release publicada
```

`ein update` usa la release estable de GitHub, verifica el payload y actualiza la instalación gestionada por Ein con backup y rollback. Tras una actualización correcta puede refrescar Pi y las herramientas declaradas; `pi-ein update --all` es el comando directo para el bloque Pi.

`cc-ein` se sincroniza con el adaptador desde este repositorio mediante `bun cc-ein/sync.ts`; `ein update` no debe presentarse como un updater genérico de cualquier runtime.

> _note: el aviso de Pi no mezcla estados: `pi-ein update --all` mantiene Pi; `ein update` mantiene Ein._

## // 03_ SDD_ENGINE

Ein organiza el trabajo serio como una cadena SDD visible:

```text
sdd-scope → sdd-map → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-close
```

Los artefactos viven en `openspec/changes/<cambio>/`: alcance, mapa, diseño, checklist, progreso de apply, verificación y resumen de cierre. Los subagentes de cada fase trabajan con responsabilidades acotadas; el parent decide, enruta y explica.

OpenSpec es el registro completo y canónico del cambio. `EIN.md` aporta el contexto curado del proyecto cuando está presente; no sustituye los artefactos SDD.

## // 04_ BLUEPRINT

| LAYER | TECH | IMPLEMENTATION DETAIL |
| :--- | :--- | :--- |
| **Pi runtime** | Pi Coding Agent | `pi-ein` carga el agente desde `~/.pi-ein/agent` mediante `PI_CODING_AGENT_DIR`. |
| **Claude runtime** | Claude Code | `cc-ein` traduce el core a `~/.claude-ein` mediante `CLAUDE_CONFIG_DIR`. |
| **Core** | TypeScript + Bun | `installer/` compila el instalador standalone y compone el payload del workbench. |
| **Workflow** | OpenSpec + SDD | `ein-pi/core/agents/` contiene los agentes de fase y `ein-pi/core/skills/` sus skills. |
| **Delivery** | GitHub Actions | `.github/workflows/installer-release.yml` publica los binarios del instalador. |

La arquitectura versionada grita sus límites:

```text
ein-agent/
├── ein-pi/
│   ├── core/       # agentes, skills, docs y prompts compartidos
│   └── agent/      # extensiones, chains y runtime específico de Pi
├── pi-ein/         # launcher + migración del adaptador Pi
├── cc-ein/         # CLAUDE.md, hooks, sync y CLI SDD del adaptador Claude
└── installer/      # CLI, TUI, paths, deploy, backups y releases
```

`ein-pi/core/` (contenido portable, agnóstico del runtime) se comparte únicamente entre los dos adaptadores soportados. `ein-pi/core/` + `ein-pi/agent/` son la única fuente versionada del workbench; `installer/scripts/bundle-template.ts` los compone para el despliegue.

## // 05_ COMMAND_DECK

```bash
ein                 # menú interactivo
ein install         # instala o repara Ein; Pi es el destino directo
ein update          # actualiza Ein y su template con backup
ein doctor          # diagnostica el despliegue sin lanzar Pi
ein uninstall       # elimina Ein y conserva auth, secrets y sesiones
ein restore         # restaura desde un backup
```

Flags disponibles en el instalador: `--yes`, `--dry-run`, `--no-engram`, `--no-secrets`, `--no-linear`, `--no-hypa` y `--no-codegraph`.

## // 06_ RELEASE

La última release de Ein es **[EIN v0.40.0](https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.40.0)**. Ein usa un único SemVer: `0.40.0`; el tag de publicación es `installer-v0.40.0`.

Para preparar una publicación:

1. Mantén el mismo SemVer en `installer/package.json`, `installer/src/core/version.ts` y `CHANGELOG.md`.
2. Ejecuta `cd installer && bun run typecheck` y los tests focalizados.
3. Crea y sube el tag de publicación `installer-v<semver>`:

   ```bash
   git tag -a installer-v<semver> -m "installer-v<semver>"
   git push origin installer-v<semver>
   ```

4. `.github/workflows/installer-release.yml` se activa con `installer-v*`, compila los cuatro binarios soportados, genera `checksums.txt` y publica la GitHub Release con `install.sh` y los assets.

La publicación canónica ocurre en GitHub Actions. No hay publicación local ni publicación en npm.

## // 07_ SOURCE_OF_TRUTH

- Instalación pública: [bootstrap `install.sh`](https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh).
- Código y cambios: [samuhlo/ein-agent](https://github.com/samuhlo/ein-agent).
- Última release: [`EIN v0.40.0`](https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.40.0).

<div align="center">

<code>DESIGNED & CODED BY <a href="https://github.com/samuhlo">samuhlo</a></code>

<small>Lugo, Galicia</small>

</div>
