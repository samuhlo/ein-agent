status: ready
change: docs-content-reference
phase: scope
verified_rev: "2f67c73"

# Scope — docs-content-reference (SLICE 2 de 2)

## Propósito

Segunda mitad de la documentación pública de EIN (SLICE 2). Produce **11 esqueletos de página** en las áreas `03-runtimes`, `04-reference` y `05-debug`, más `gap-inventory.md` que corrige y extiende el vocabulario del de SLICE 1.

---

## Scope

Crear esqueletos de página que cumplen el **contrato heredado exacto** de SLICE 1 (`docs-content-inventory`), aplicado a tres áreas nuevas con fuentes mayormente TypeScript. El gap-inventory de este cambio extiende el vocabulario de estados y registra el bloqueo explícito de Known Limitations. Ningún cambio en observables de comportamiento.

---

## Budget

```
budget_allocated:
  max_tokens: 95000
  max_reads: 60
  max_runtime_ms: 300000
```

---

## Contrato heredado (no rediseñable)

Del `design.md` de SLICE 1, las restricciones que este cambio hereda íntegras:

- **Frontmatter**: cuatro claves en orden (`title`, `description`, `sources`, `verified_rev` = HEAD actual)
- **Estructura**: siete encabezados `##` fijos, sin ninguno adicional
- **Contenido pendiente**: un bloque `:::caution[PENDIENTE-D]` por sección con claves `falta:`, `fuentes:`, `lineas:`
- **Pureza (SK-3)**: tras filtrar estructura permitida, cero líneas residuales
- **Sin literales de versión (CT-8)**: enlazan a `releases/latest`
- **Marcado `[BETA-EXCLUDED]`**: capacidades sin evidencia según `docs/roadmap-beta.md`
- **Tabla canónica de rutas** (C1 de SLICE 1): rutas relativas al repo, todas existentes

Referencia completa: `openspec/changes/archive/docs-content-inventory/design.md`

---

## Artefactos esperados

Eleven ficheros markdown nuevos bajo `docs-site/src/content/docs/`:

### 03-runtimes/ (4 páginas)
- `runtime-overview.md` — capacidades comparables, sin marketing
- `pi-coding-agent.md` — cómo usar EIN con Pi
- `claude-code.md` — cómo usar EIN con Claude Code
- `runtime-matrix.md` — tabla comparativa de capacidades

### 04-reference/ (3 páginas)
- `cli.md` — referencia de comandos del instalador
- `filesystem.md` — estructura de directorios de EIN
- `optional-tooling.md` — integraciones opcionales (Engram, Linear, Context7, etc.)

### 05-debug/ (4 páginas)
- `troubleshooting.md` — categorías de fallos y soluciones
- `doctor.md` — qué comprueba y cómo interpretar resultados
- `known-limitations.md` — **BLOQUEADA** (ver restricciones)
- `uninstall-recovery.md` — desinstalación y restauración

Más: `openspec/changes/docs-content-reference/gap-inventory.md` (decisiones de hueco + defectos de fuente)

---

## Restricciones especiales de este cambio

### 1. Runtime Matrix — capacidades comprobables

Tabla sencilla comparando Pi vs Claude Code. **Solo capacidades evidentes** sin marketing; jamás presentar como equivalentes si no lo son. La fuente autoritativa de límites es `openspec/changes/archive/core-parity/verify-report.md`.

### 2. Known Limitations — BLOQUEADA

La fuente autoritativa es `docs/roadmap-beta.md` y `docs/roadmap-features-ein.md` en la rama **sin mergear** `feat/shared-project-state-contract`. **No consultar esa rama.** En este cambio:
- Crear esqueleto con bloque `PENDIENTE-D`
- Declarar en `gap-inventory.md` con `estado: bloqueado`
- Agregar clave `desbloqueante:` nombrando el merge necesario

### 3. Restricción de honestidad

`docs/roadmap-beta.md` es autoridad del estado beta. Ninguna página puede describir como existentes:
- El launcher (fase pendiente)
- El estado compartido de proyecto (rama sin mergear)
- Los adaptadores de sesión (rama sin mergear)

Esta restricción pesa especialmente en `04-reference` y `05-debug` donde se describe código TypeScript real del instalador.

### 4. Gap-inventory de este cambio

Corrige el defecto anotado en SLICE 1 (GI-3, Runtime Matrix con estado incorrecto). Extiende el vocabulario de `estado:` más allá de `esqueleto-en-A | bloqueado` (que solo SLICE 1 admitía) para incluir valores como `bloqueado-por-merge` para Known Limitations.

---

## Fuentes confirmadas

### Runtimes
- `README.md` — definición de EIN y runtimes
- `cc-ein/README.md` — adaptador Claude Code (40 líneas)
- `pi-ein/README.md` — adaptador Pi (38 líneas, única documentación de la superficie Pi)
- `openspec/specs/installer-runtime/spec.md` — especificación de runtimes

### Reference
- `installer/src/cli/*.ts` — comandos: install, update, doctor, restore, uninstall, menu (~1500 líneas)
- `installer/src/core/paths.ts` — estructura de directorios
- `installer/src/core/engram.ts` — integración Engram
- `installer/src/core/secrets.ts` — manejo de secrets
- `installer/src/core/deps.ts` — dependencias
- `ein-pi/agent/extensions-manifest.json` — capacidades del runtime Pi
- `ein-pi/agent/mcp.json` — configuración MCP

### Debug
- `installer/src/cli/doctor.ts` — diagnóstico (57 líneas)
- `installer/src/core/backup.ts` — backups y snapshots (~280 líneas)
- `installer/src/core/pi-migration.ts` — migración Pi (si existe)
- `docs/roadmap-beta.md` — estado de capacidades beta
- `e2e/` — ejemplos de pruebas end-to-end
- `docs/roadmap-features-ein.md` — (rama sin mergear, NO CONSULTAR)

**Nota sobre volumen:** gran parte de las fuentes son TypeScript (~6000 líneas), más densa que SLICE 1 (mayormente markdown). Presupuesto refleja densidad mayor por línea.

---

## Diferencias vs SLICE 1

1. **Volumen de fuentes:** SLICE 1 fue ~2100 líneas markdown; SLICE 2 es ~6000 líneas con 70% TypeScript (más densa)
2. **Artefactos:** 11 páginas vs 10, más un gap-inventory mejorado
3. **Contrato de página:** **idéntico**, sin rediseño
4. **Huecos bloqueados:** uno (Known Limitations); SLICE 1 tenía uno (Same)
5. **Vocabulario de gap-inventory:** se extiende para reflejar realidad de dependencias entre cambios

---

## Skills a cargar antes de trabajo

- `ein-pi/core/skills/local/cognitive-doc-design/SKILL.md`
- `ein-pi/core/skills/local/file-naming/SKILL.md`

---

## Configuración de strict_tdd

`openspec/config.yaml` declara `strict_tdd: true` sin runner de test. Como en SLICE 1, markdown sin comportamiento ejecutable no puede ciclar RED/GREEN. El tratamiento será idéntico: **gate mecánico sustitutivo** con comandos `find`/`grep`/`test` (19 criterios de verificación), registrado en `apply-progress.md` como `tdd: not-applicable` con causa concreta.

---

## Canonical spec context

`spec_delta: none` — ningún cambio de comportamiento. Las páginas son esqueletos declarativos sin prosa. No se cargan specs porque es cambio puramente documental.

---

## Siguiente paso

Delegar a `sdd-map` cuando scope.md esté verificado. El map definirá lotes ejecutables de las 11 páginas siguiendo el orden de `docs-site/src/content/docs/` (00→01→02→03→04→05).

## Spec delta declaration
spec_delta: none
spec_delta_reason: Produce esqueletos de documentación declarativos sin prosa; no altera el comportamiento observable de EIN ni su especificación funcional.
