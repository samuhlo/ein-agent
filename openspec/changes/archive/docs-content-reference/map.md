status: ready
scope_status: bounded
change: docs-content-reference
phase: map
verified_rev: "2f67c73"

# Map — docs-content-reference (SLICE 2 de 2)

Mapeo página → fuentes concretas (TypeScript + markdown). Las 11 páginas heredan el contrato de SLICE 1; este map detalla procedencia, secciones y dependencias.

---

## A. Síntesis de 11 páginas

| Área | Página | Fuentes principales | Lineas aprox. | Nota |
|------|--------|-------------------|--------------|------|
| 03-runtimes | runtime-overview.md | README.md, cc-ein/README.md, pi-ein/README.md, openspec/specs/installer-runtime/spec.md | 40+40+39+60 | intro comparativo |
| 03-runtimes | pi-coding-agent.md | pi-ein/README.md, README.md, openspec/specs/installer-runtime/spec.md | 39+instalación aislada | launcher + migración |
| 03-runtimes | claude-code.md | cc-ein/README.md, README.md, openspec/specs/installer-runtime/spec.md | 40+instalación aislada | launcher + gaps honestos |
| 03-runtimes | runtime-matrix.md | README.md, cc-ein/README.md, openspec/specs/installer-runtime/spec.md | table | comparación defensible |
| 04-reference | cli.md | README.md (§05), installer/src/cli/*.ts (~1500 líneas) | comandos: install, update, doctor, restore, uninstall, menu | referencia CLI |
| 04-reference | filesystem.md | installer/src/core/paths.ts (~150 líneas), README.md (§01) | PiInstallPaths, PiInstallContext | estructura directorios |
| 04-reference | optional-tooling.md | installer/src/core/engram.ts, deps.ts, secrets.ts, cc-ein/README.md (§MCP) | integración opcional | Engram, Linear, Context7, Codegraph, Hypa |
| 05-debug | troubleshooting.md | installer/src/core/verify.ts, docs/roadmap-beta.md | categorías de fallos | patrones comunes |
| 05-debug | doctor.md | installer/src/cli/doctor.ts (~57 líneas), installer/src/core/verify.ts | grupos/checks, niveles | interpretación resultados |
| 05-debug | known-limitations.md | docs/roadmap-beta.md + feat/shared-project-state-contract | BLOQUEADO | ver §E |
| 05-debug | uninstall-recovery.md | installer/src/cli/uninstall.ts, restore.ts, backup.ts (~280 líneas) | backup/restore/recovery | flujo reversible |

---

## B. Mapeo detallado página → secciones fuente

### 03-runtimes/runtime-overview.md

**Introducción y diferenciación de runtimes:**
- README.md:11 → definición de "harness de coding-agent con dos adaptadores"
- README.md:30-38 → tabla de launchers, homares, runtimes vanilla
- cc-ein/README.md:1-2 → qué es cc-ein (config aislado)
- pi-ein/README.md:1-4 → qué es pi-ein (config aislado)

**Instalación y selección:**
- README.md:21-26 → menú de selección (Pi, Claude, Both)
- README.md:106-115 → CLI commands (ein, ein install, ein doctor)

**Mecanismos de aislamiento:**
- pi-ein/README.md:14-19 → PI_CODING_AGENT_DIR override
- cc-ein/README.md:14 → CLAUDE_CONFIG_DIR override
- README.md:40-41 → exporta variables (function-scoped)

**Estado de runtimes:**
- openspec/specs/installer-runtime/spec.md scenarios: cross-platform, noninteractive, pi-runtime-isolated, runtime-menu, safe-secret
- docs/roadmap-beta.md → estado beta general

### 03-runtimes/pi-coding-agent.md

**Uso y launching:**
- pi-ein/README.md:8-9 → comando `pi-ein`
- README.md:23-26 → instalación con menú
- pi-ein/README.md:26 → instalación directa `cp pi-ein/pi-ein.fish`

**Configuración aislada:**
- pi-ein/README.md:16-19 → PI_CODING_AGENT_DIR, EIN_PI_AGENT_HOME
- installer/src/core/paths.ts:44-56 → derivePiInstallPaths (legacy vs isolated)
- installer/src/core/paths.ts:81-111 → resolvePiInstallContext, markers

**Migración desde legacy:**
- pi-ein/README.md:21-29 → migrate.ts flow, backup, rewrite de rutas
- README.md:42-53 → migración legacy Pi
- installer/src/core/pi-migration.ts (existe, ~X líneas)

**Simetría con Claude:**
- pi-ein/README.md:5-12 → tabla comando|config|qué es (vs claude/cc-ein)
- README.md:30-38 → tabla ELECCIÓN|LAUNCHER|HOGAR|RUNTIME VANILLA

### 03-runtimes/claude-code.md

**Uso y launching:**
- cc-ein/README.md:8-12 → comandos cc-ein, cc-ein -c, sync.ts
- README.md:23-26 → instalación con menú (Both option)

**Configuración aislada:**
- cc-ein/README.md:14 → CLAUDE_CONFIG_DIR=~/.claude-ein
- cc-ein/README.md:18-24 → traductor de herramientas, symlink credenciales
- installer/src/core/paths.ts no mapea Claude paths (fuera de scope Pi)

**Compilación y sync:**
- cc-ein/README.md:17-24 → sync.ts: mini-compilador, traduce Pi→CC, symlinkea login
- cc-ein/README.md:27-31 → cinco incrementos de funcionalidad (aislamiento, SDD, gate, MCP)

**Huecos honestos vs Pi:**
- cc-ein/README.md:36-40 → inyección proactiva de skills NO tiene 1:1
- cc-ein/README.md:40 → re-ejecución de acceptance no existe en CC (cubierta por verify + hooks)

### 03-runtimes/runtime-matrix.md

**Comparación de capacidades:**
- README.md:30-38 → tabla bootstrap/launchers/homes
- cc-ein/README.md:36-40 → gaps explícitos
- openspec/specs/installer-runtime/spec.md → scenarios verificables

**Decisión sobre filas defendibles:**
Conforme a `openspec/changes/archive/core-parity/verify-report.md:88`, solo se pueden presentar como equivalentes:
- ✓ Bootstrap, instalación, launchers (código + spec)
- ✓ Config isolation (paths.ts prueba mecanismo)
- ✗ MCP external (verify-report: "Optional external Claude MCP setup was not exercised against live services")

Corolario: tabla solo muestra installer-side capabilities (bootstrap, CLI, paths), NO MCP/service parity.

### 04-reference/cli.md

**Comandos y flags:**
- README.md:106-118 → ein, ein install, ein update, ein doctor, ein uninstall, ein restore (y flags)
- installer/src/cli/install.ts:54-63 → InstallFlags definición (yes, noEngram, noSecrets, noLinear, noHypa, noCodegraph, dryRun, runtime)
- installer/src/cli/menu.ts → menú interactivo (3 opciones: Pi, Claude, Both)
- installer/src/cli/doctor.ts:47-56 → runDoctorCommand (detecta AGENT_DIR, renderiza report)

**install — flujo completo:**
- installer/src/cli/install.ts:1-10 comentario → detect → check deps → install missing → deploy → secrets → context7 → marker → doctor
- openspec/specs/installer-runtime/spec.md scenarios: noninteractive-runtime-flag, pi-runtime-isolated, claude-code-runtime-installation, installer-bootstrap-mandatory-checksum

**update, doctor, restore, uninstall:**
- README.md:56-68 → ein update (Pi vs Ein updaters separados)
- installer/src/cli/update.ts (~X líneas)
- installer/src/cli/restore.ts (~X líneas)
- installer/src/cli/uninstall.ts (~X líneas)

### 04-reference/filesystem.md

**Estructura de directorios y paths:**
- installer/src/core/paths.ts:14-56 → tipos, funciones de resolución
- installer/src/core/paths.ts:113-136 → constantes exportadas (AGENT_DIR, SECRETS_DIR, ENGRAM_DIR, LOCAL_SKILLS_DIR, etc.)

**Mapeo concreto:**
- AGENT_DIR → donde vive Ein (aislado o legacy)
- SECRETS_DIR → ~/.config/opencode-secrets (Linear, Context7, Minimax keys)
- ENGRAM_DIR → ~/.engram-pi
- LOCAL_SKILLS_DIR, DOWNLOADED_SKILLS_DIR → bajo AGENT_DIR
- BACKUP_DIR → AGENT_DIR/backups/installer
- BUN_BIN_DIR, LOCAL_BIN_DIR, MISE_SHIM_DIR → para binarios globales

**Aislamiento Pi:**
- README.md:31-38 → tabla ELECCIÓN|LAUNCHER|HOGAR|RUNTIME
- pi-ein/README.md:16-19 → PI_CODING_AGENT_DIR, rutas absolutas reescritas en migration

### 04-reference/optional-tooling.md

**Integraciones opcionales:**
- README.md:116-117 → flags: --no-engram, --no-secrets, --no-linear, --no-hypa, --no-codegraph
- installer/src/core/deps.ts → installEngramDep(), installHypa(), installCodegraph(), etc.

**Engram:**
- installer/src/core/engram.ts (PATH_ENGRAM_PI en paths)
- README.md no menciona directamente; docs/roadmap-beta.md referencia

**Linear:**
- installer/src/core/secrets.ts → LINEAR_KEY_PATH
- README.md:116 → --no-linear flag
- CLAUDE.md: "Linear applies only in Team mode"

**Context7:**
- installer/src/core/secrets.ts → CONTEXT7_KEY_PATH
- installer/src/core/launcher.ts → ensureContext7Export()
- cc-ein/README.md:30 → Context7 y Engram en `.claude.json` a scope user

**Codegraph, Hypa:**
- installer/src/core/deps.ts → installCodegraph(), installHypa()
- README.md:116-117 → flags para controlar

### 05-debug/troubleshooting.md

**Categorías de fallos:**
- installer/src/core/verify.ts → grupos de checks (platform, dependencies, paths, markers, deployments, etc.)
- installer/src/cli/doctor.ts:22-44 → renderReport, estructura de grupos y checks

**Interpretación de doctor:**
- installer/src/cli/doctor.ts:36-42 → decisión (revisar FAIL, usable con WARN, baseline estable)
- docs/roadmap-beta.md → estado beta, capacidades sin evidencia

**Patrones de error comunes:**
- installer/src/core/verify.ts → qué falla (falta Bun, falta Pi binary, paths inválidas, marker dañado, etc.)

### 05-debug/doctor.md

**Qué comprueba doctor:**
- installer/src/cli/doctor.ts:22-44 → renderReport, grupos y checks
- installer/src/core/verify.ts → DoctorReport, grupos de comprobaciones

**Niveles OK/WARN/FAIL:**
- installer/src/cli/doctor.ts:12-20 → GLYPH mapping, colores por nivel

**Cómo interpretar:**
- installer/src/cli/doctor.ts:36-42 → decision text (FAIL bloqueante, WARN recomendado, OK listo)

### 05-debug/known-limitations.md [BLOQUEADA]

**Bloqueador explicado en §E.**

### 05-debug/uninstall-recovery.md

**Desinstalación:**
- installer/src/cli/uninstall.ts (~X líneas) → qué elimina
- README.md:112 → ein uninstall
- Restricción: conserva auth, secrets, sesiones (per docs)

**Backup y restore:**
- installer/src/core/backup.ts:1-6 comentario → snapshot, list, restore
- installer/src/core/backup.ts:29-46 → BACKUP_EXCLUDE list (auth.json, sessions, npm NO se copian)
- installer/src/core/backup.ts:45 → KEEP_COUNT = 5 (auto-prune oldest)
- installer/src/cli/restore.ts (~X líneas) → restoreBackup()

**Reversión:**
- pi-ein/README.md:28-29 → reversión de migración (mv ~/.pi-ein/agent ~/.pi/agent o restaurar .tar.gz)
- installer/src/core/backup.ts:48-68 → tipos BackupEntry, SnapshotResult

---

## C. Solapamientos y autoridades

| Solapamiento | Fuentes en conflicto | Autoridad | Aplicación |
|---|---|---|---|
| **Paths en cli vs filesystem** | cli.md nombra comandos, filesystem.md especifica destinos | installer/src/core/paths.ts | cli.md referencia filesystem.md en "Ver también"; cada ### bajo "Detalles" es independiente por objetivo |
| **Doctor en troubleshooting vs doctor** | troubleshooting.md categoriza fallos, doctor.md explica herramienta | installer/src/cli/doctor.ts | troubleshooting.md = guía de patrones; doctor.md = referencia de herramienta; troubleshooting enlaza a doctor |
| **Runtime intro vs runtimes específicas** | runtime-overview da intro, pi-coding-agent + claude-code profundizan | README.md:11 (autoridad de runtimes) | overview nombra ambos, específicas repiten detalles aislados; overview enlaza a específicas |
| **Isolation en pi-coding-agent vs filesystem** | pi-ein describe isolation, paths.ts lo implementa | installer/src/core/paths.ts (código) + pi-ein/README.md (documentación) | pi-coding-agent explica usuario-visible (PI_CODING_AGENT_DIR), filesystem.md explica estructura interna (AGENT_DIR, aislado vs legacy) |

---

## D. Afirmaciones sin evidencia de código

Búsqueda de docs que aserten capacidades no implementadas (ya sancionadas en SLICE 1, más nuevas aquí):

### Hallazgo D1: README.md version drift (ya en SLICE 1 gap-inventory)
- **Línea:** README.md:121
- **Defecto:** "La última release de Ein es **[EIN v0.40.0]**"
- **Evidencia:** installer/package.json = `0.42.0` (actual)
- **Propietario:** fuera de alcance (README es fuente, no página)
- **Acción:** cambio de mantenimiento posterior

### Hallazgo D2: MCP parity not defensible
- **Línea:** cc-ein/README.md:30 afirma "Context7 y Engram... configurados"
- **Evidencia:** core-parity/verify-report.md:88 declara "Optional external Claude MCP setup was not exercised against live services"
- **Corolario:** runtime-matrix.md MUST NOT presentar MCP como equivalente
- **Acción:** aclaración en gap-inventory de SLICE 2

### Hallazgo D3: Engram sin flujo en SLICE 2
- **Línea:** optional-tooling.md mencionaría Engram, pero sin sources.md
- **Evidencia:** installer/src/core/engram.ts existe pero alcance es SLICE 1 (00-start/01-concepts)
- **Acción:** tomar fuentes de SLICE 1, enlazar desde SLICE 2

---

## E. Runtime Matrix: filas defendibles vs bloqueadas

Norma del cambio (scope.md §1): "Solo capacidades evidentes sin marketing; jamás presentar como equivalentes si no lo son."

**Filas defendibles (código + spec):**
- ✓ Bootstrap e instalación (openspec/specs/installer-runtime/spec.md scenarios)
- ✓ Launchers y isolation (pi-ein/README.md, cc-ein/README.md, installer/src/core/paths.ts)
- ✓ Config isolation mechanics (CLAUDE_CONFIG_DIR, PI_CODING_AGENT_DIR)
- ✓ SDD lifecycle (core-parity verify-report:32-35: sync, CLI, gate, guard defensibles)

**Filas NO defendibles (fuera de scope offline):**
- ✗ MCP external (Context7, Linear, Codegraph live services no ejercitadas)
- ✗ Performance (sin benchmarks)
- ✗ Skill injection parity (cc-ein/README.md:36-40 admite gap explícito)

**Corolario:** runtime-matrix.md tabla será 2×N donde N ≤ {bootstrap, install, launcher, isolation, SDD}. Nunca MCP/services.

---

## F. Known Limitations: bloqueador explícito

**Confirmado bloqueado:**
- Rama `feat/shared-project-state-contract` existe (git branch -a), no mergeada
- `docs/roadmap-beta.md` en esta rama NO menciona `feat/shared-project-state-contract` (0 coincidencias): es la versión anterior del documento, y por eso no sirve como fuente de Known Limitations. El desbloqueante lo fija el summary de SLICE 1, no este fichero. [corregido por el parent: la redacción original citaba `roadmap-beta.md:51-60` como declarante del desbloqueante, y esas líneas tratan de carencias de `sync.ts`]
- Fuente autoritaria está en rama sin mergear (NO CONSULTAR per scope.md §2)

**Tratamiento en SLICE 2:**
- known-limitations.md: solo esqueleto con bloque PENDIENTE-D
- gap-inventory.md: entrada con `estado: bloqueado`, `desbloqueante: merge de feat/shared-project-state-contract`
- No se crea artefacto wrapper: Known Limitations queda pendiente hasta desbloqueo

---

## G. Orden de escritura por dependencias

```
Fase 1 (foundation - runtimes)
├─ runtime-overview.md          # intro a ambos runtimes
├─ pi-coding-agent.md           # usa patterns de overview
└─ claude-code.md               # usa patterns de overview

Fase 2 (matrix & cli foundation)
├─ runtime-matrix.md            # usa runtimes 1-3
└─ cli.md                        # foundation reference

Fase 3 (reference details)
├─ filesystem.md                # usado por troubleshooting
├─ optional-tooling.md          # complementa cli
└─ doctor.md                     # foundation debug

Fase 4 (debug aplicado)
├─ troubleshooting.md           # usa doctor + filesystem
└─ uninstall-recovery.md        # usa filesystem + backup

Fase 5 (independiente, bloqueada)
└─ known-limitations.md         # espera merge
```

**Cadena de `## Siguiente paso`:**
`runtime-overview` → `pi-coding-agent` → `claude-code` → `runtime-matrix` → `cli` → `filesystem` → `optional-tooling` → `doctor` → `troubleshooting` → `uninstall-recovery` → (texto plano: Known Limitations, bloqueada)

---

## H. Gap Inventory de SLICE 2

Extiende vocabulario de SLICE 1 para reflejar dependencias entre cambios (recordatorio: SLICE 1 tenía 5 huecos; SLICE 2 contribuye 1 nuevo, reutiliza 1, y el bloqueado es de SLICE 2).

**Nuevo en SLICE 2:**
- MCP Parity (no defensible en offline verify) → decisión en `runtime-matrix.md`

**Heredado de SLICE 1, referenciado aquí:**
- Runtime Matrix row selection → implementación en SLICE 2
- Known Limitations blocker → confirmado desbloqueante

**Valores de `estado:` permitidos:**
- `esqueleto-en-A` — página pendiente prosa
- `bloqueado` — espera merge/cambio externo
- `bloqueado-por-merge` — especial para Known Limitations (merge requerido)

---

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/docs-content-reference/scope.md", lines: 165, estimated_tokens: 4200 }
    - { path: "ein-pi/core/skills/local/cognitive-doc-design/SKILL.md", lines: 82, estimated_tokens: 2100 }
    - { path: "openspec/changes/archive/docs-content-inventory/design.md", lines: 272, estimated_tokens: 7000 }
    - { path: "docs-site/src/content/docs/00-start/overview.md", lines: 102, estimated_tokens: 2600 }
    - { path: "README.md", lines: 151, estimated_tokens: 3900 }
    - { path: "cc-ein/README.md", lines: 40, estimated_tokens: 1100 }
    - { path: "pi-ein/README.md", lines: 39, estimated_tokens: 1200 }
    - { path: "installer/src/cli/doctor.ts", lines: 57, estimated_tokens: 1500 }
    - { path: "installer/src/core/paths.ts", lines: 150, estimated_tokens: 3800 }
    - { path: "installer/src/cli/install.ts", lines: 100, estimated_tokens: 2500 }
    - { path: "installer/src/core/backup.ts", lines: 100, estimated_tokens: 2400 }
    - { path: "docs/roadmap-beta.md", lines: 80, estimated_tokens: 2000 }
    - { path: "openspec/specs/installer-runtime/spec.md", lines: 59, estimated_tokens: 1500 }
    - { path: "openspec/changes/archive/docs-content-inventory/gap-inventory.md", lines: 72, estimated_tokens: 1800 }
    - { path: "openspec/changes/archive/core-parity/verify-report.md", lines: 100, estimated_tokens: 2600 }
  budget_consumed:
    tokens: 39800
    reads: 15
  budget_source: packets-injected
  webfetch_used: false
