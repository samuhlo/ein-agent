# Ein

**Ein** es un workbench de desarrollo de software construido sobre [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent). Combina agentes especializados, una cadena SDD estructurada, skills y guardrails propios para un flujo de trabajo autónomo y controlado.

---

## Estructura del repositorio

```
ein-agent/
├── ein-pi/                     # Workbench Ein (se despliega en ~/.pi/agent/)
│   └── agent/
│       ├── agents/             # 7 agentes (5 SDD + 2 delivery)
│       │   ├── sdd-init.md
│       │   ├── sdd-design.md
│       │   ├── sdd-explore.md
│       │   ├── sdd-apply.md
│       │   ├── sdd-verify.md
│       │   ├── ein-linear.md
│       │   └── ein-github.md
│       ├── chains/
│       │   └── ein-sdd.chain.md  # Cadena de trabajo principal
│       ├── extensions/         # 8 extensiones del runtime de Pi
│       │   ├── ein-ai.ts       # Modelos, persona, status, help
│       │   ├── ein-doctor.ts   # Diagnóstico del entorno (/ein:doctor)
│       │   ├── ein-banner.ts   # Banner gold animado al iniciar Pi
│       │   ├── ein-brand.ts    # Identidad de marca
│       │   ├── ein-linear.ts   # Integración Linear
│       │   ├── ein-paths.ts    # Rutas canónicas del workbench
│       │   ├── ein-skill-registry.ts
│       │   └── sdd-init.ts
│       ├── skills/
│       │   ├── local/          # 13 skills propios de Ein
│       │   └── downloaded/     # 41 skills del ecosistema Pi
│       ├── prompts/            # Prompts del sistema
│       ├── docs/               # Documentación interna
│       ├── lib/                # Utilidades compartidas
│       ├── assets/             # Assets de agentes
│       ├── brand.json          # { agentName: "Ein", author: "samuhlo" }
│       ├── models.json         # Asignación de modelos por agente
│       ├── mcp.json            # Servidores MCP (engram, context7)
│       └── AGENTS.md           # Contrato de agentes
│
└── installer/                  # Instalador cross-platform (macOS + Linux)
    ├── src/
    │   ├── main.ts             # Entry: menú TUI o subcomando
    │   ├── cli/                # install, update, uninstall, restore, doctor
    │   ├── core/               # platform, paths, exec, deploy, engram, secrets, backup, verify...
    │   └── tui/                # banner gold #FFCA40, theme, prompts
    ├── scripts/
    │   ├── bundle-template.ts  # Empaqueta ein-pi/agent → src/assets/template.tar.gz
    │   └── build-all.ts        # Cross-compila 4 binarios (darwin/linux × arm64/x64)
    ├── install.sh              # Bootstrap curl|bash
    └── dist/                   # Binarios compilados (gitignored)
```

---

## Instalación

### Via bootstrap (cuando haya release publicada)

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
ein install
```

### Desde el repo (desarrollo / Linux sin release)

```bash
git clone https://github.com/samuhlo/ein-agent
cd ein-agent/installer
bun install
bun run bundle-template
bun run build:all linux-x64    # o darwin-arm64, linux-arm64, darwin-x64
./dist/ein-installer-linux-x64 install
```

---

## Comandos `ein`

El binario `ein` gestiona el workbench (el runtime diario sigue siendo `pi`):

| Comando | Descripción |
|---|---|
| `ein` | Menú TUI interactivo |
| `ein install` | Instala/repara Ein: deps → deploy → secrets → doctor |
| `ein update` | Backup → redeploy → actualiza pi → doctor |
| `ein doctor` | Diagnóstico del entorno sin lanzar pi |
| `ein uninstall` | Elimina Ein preservando auth.json, secrets y sesiones |
| `ein restore` | Restaura desde un backup anterior |

**Flags:** `--yes`, `--no-engram`, `--no-secrets`, `--verbose`

---

## Comandos `/ein:*` (dentro de Pi)

| Comando | Descripción |
|---|---|
| `/ein:status` | Estado completo del workbench (SDD, skills, proyecto, MCP, diagnóstico) |
| `/ein:doctor` | Smoke test del entorno (44 checks, 8 grupos) |
| `/ein:doctor-output` | Versión sin async, solo FS (para usar en contextos síncronos) |
| `/ein:help` | Referencia de todos los comandos `/ein:*` |
| `/ein:models` | Ver o cambiar el modelo asignado a cada agente |
| `/ein:persona` | Alternar persona entre `samuhlo` y `neutral` |
| `/ein:ai:install-sdd` | Instalar la cadena SDD en el proyecto actual |
| `/ein:ai:sdd-preflight` | Preflight de Linear + repositorio antes de una sesión SDD |

---

## Flujo SDD

Ein organiza el trabajo en la cadena **SDD** (Software Design Driven):

```
sdd-init → sdd-design → sdd-explore → sdd-apply → sdd-verify
              ↓
         ein-linear (issues) + ein-github (PRs)
```

Cada agente tiene un rol acotado. La cadena se activa con `/ein:ai:install-sdd` en el proyecto y se ejecuta con `/sdd`.

---

## Desarrollo del workbench

Los cambios al workbench se hacen en `ein-pi/agent/` y se despliegan al entorno local con el instalador o manualmente:

```bash
# Despliegue manual (solo el árbol Ein-owned, nunca toca auth.json)
rsync -av --delete \
  --exclude=auth.json --exclude=sessions/ --exclude=backups/ \
  ein-pi/agent/ ~/.pi/agent/

# O via instalador (con backup previo automático)
ein update
```

Para regenerar el template del instalador después de cambios:

```bash
cd installer
bun run bundle-template
```

---

## Requisitos

- **macOS** (arm64/x64) o **Linux** (arm64/x64)
- **Bun** ≥ 1.3 — [bun.sh](https://bun.sh)
- **Pi Coding Agent** — `bun install -g @earendil-works/pi-coding-agent`
- **Engram** (recomendado) — macOS: `brew install engram`; Linux: el instalador lo gestiona

---

## Release

Un push de tag `installer-v*` dispara el workflow de GitHub Actions que:
1. Empaqueta `ein-pi/agent/` como tarball tokenizado
2. Cross-compila los 4 binarios (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`)
3. Genera `checksums.txt` y publica la release con todos los assets

```bash
git tag installer-v0.1.0
git push origin installer-v0.1.0
```
