# Scope: docs-content-inventory (SLICE 1 de 2)

## Overview

Producir documentación de las tres áreas iniciales de la estructura pública de EIN en español (formato markdown) extrayendo, organizando y estructurando contenido disperso en el repositorio para ubicarlo en `docs-site/src/content/docs/` con trazabilidad de fuentes en frontmatter. Este cambio cubre **tres áreas temáticas de seis**; el trabajo completo se divide en dos cambios encadenados. Cada página declara sus fuentes derivadas en frontmatter (title, description, sources, verified_rev) e identifica explícitamente huecos de contenido que requieren redacción original, consolidados en un inventario de decisiones de gap (`gap-inventory.md`).

## Scope packet

```
scope: Extracción y organización de documentación existente de EIN en tres áreas temáticas (00-start, 01-concepts, 02-workflow), con trazabilidad de fuentes en frontmatter, cinco huecos de contenido identificados y decisiones consolidadas en gap-inventory.md. Cambio hermano (docs-content-reference) cubrirá 03-runtimes, 04-reference, 05-debug.

budget_allocated:
  max_tokens: 45000
  max_reads: 40
  max_runtime_ms: 180000
```

## Inclusiones explícitas (SLICE 1)

### 1. Tres áreas de contenido

**00-start/**: Primer contacto, instalación, primer uso
- `overview.md` — Qué es EIN, por qué, para quién, visión general de capacidades
- `getting-started.md` — Instalación, requisitos, verificación
- `first-run.md` — Ejemplo real mínimo: un cambio SDD pequeño completo (scope → close)

**01-concepts/**: Conceptos arquitectónicos fundamentales
- `orchestrator.md` — Rol, flujo de decisiones, autoridad de decisión
- `sdd-openspec.md` — Qué es SDD, qué es OpenSpec, relación, artefactos
- `context.md` — Context windows, token budgets, presupuestos de lectura, horizonte de decisión
- `deterministic-boundaries.md` — Modelo vs herramienta, qué es observable, qué es garantía, límites explícitos

**02-workflow/**: Ciclo de vida de un cambio
- `workflow-overview.md` — El flujo SDD end-to-end: fases, artefactos, roles
- `artifacts.md` — Definición de cada artefacto (scope, map, design, tasks, apply-progress, verify-report)
- `real-workflow-example.md` — Walkthrough completo: instalador-beta desde openspec/changes/archive/

### 2. Mapa página → fuente

Cada página declara en frontmatter YAML: `title`, `description`, `sources` (rutas reales del repo de donde se extrae), `verified_rev` (SHA corto del commit actual: 0ae709d).

### 3. Esqueletos de contenido

Cada página recibe un **esqueleto** (no prosa inventada):
- Estructura de secciones (títulos, placeholders de párrafos)
- Lista de fuentes candidatas reales (rutas o conceptos)
- Declaración explícita: qué evidencia/contenido falta, qué se investiga en fases posteriores

**Ninguna afirmación, ejemplo ni narrativa redactada sin fuente identificable.**

### 4. Inventario de huecos internos

Archivo de artefacto: **`openspec/changes/docs-content-inventory/gap-inventory.md`** (kebab-case, ubicación interna, fuera de `docs-site/src/content/`).

Este artefacto consolida decisiones sobre **cinco huecos de contenido**, incluyendo los que pertenecen al cambio hermano, porque las decisiones se toman una sola vez:

| Hueco | Área | Decisión | Fuentes | Estado |
|-------|------|----------|---------|--------|
| **First Run** | 00-start | Redactar como nueva (didáctica) | README.md, EIN_OPERATING_SYSTEM.md, installer/install.sh | Esqueleto en A; redacción en D |
| **Deterministic Boundaries** | 01-concepts | Incorporar como sección (crítico) | orchestrator.md, sdd-lifecycle/spec.md, PI_AGENTS_ARQUITECTURA.md | Esqueleto en A; redacción en D |
| **Runtime Matrix** | 03-runtimes (hermano) | Crear tabla visual (comparación Pi vs Claude) | cc-ein/README.md, PI_AGENTS_ARQUITECTURA.md, installer-runtime/spec.md | Esqueleto en A; redacción en D |
| **Real Workflow Example** | 02-workflow | Usar change archivado `installer-beta` | openspec/changes/archive/installer-beta/* | Walkthrough acotado en A; narrativa en D |
| **Known Limitations** | 05-debug (hermano) | Frenado: pendiente merge de `feat/shared-project-state-contract` | NO LEER rama no mergeada | Esqueleto+declaración en A; redacción bloqueada |

### 5. Aplicación de skills

**cognitive-doc-design**: Estructuración con patrones de cognición (lead with answer, progressive disclosure, chunking, signposting, checklist). Cada página: título orientado a resultado, párrafo introductorio (qué, para quién, por qué), quick path, detalles, checklist, next step.

**file-naming**: Archivos markdown en kebab-case (p.ej. `00-start/overview.md`, `01-concepts/orchestrator.md`), estructurados bajo `docs-site/src/content/docs/`.

## Exclusiones explícitas

### Este cambio (SLICE 1)

- **03-runtimes/**, **04-reference/**, **05-debug/** → cambio hermano `docs-content-reference`
- Instalación y configuración de Astro/Starlight → fase C
- Diseño visual, componentes, overrides Starlight → fase C
- Script generador de bloques automáticos, detector de drift → fase B
- Redacción pulida y final de huecos → fase D

### Cambio hermano `docs-content-reference` (declarado explícitamente)

Portará:
- **03-runtimes/**: Overview, Pi Coding Agent, Claude Code, Runtime Matrix (hueco)
- **04-reference/**: CLI, Filesystem, Optional Tooling
- **05-debug/**: Troubleshooting, Doctor, Known Limitations (hueco, frenado), Uninstall & Recovery

Fuentes adicionales de ese cambio:
- `pi-ein/README.md` (38 líneas) — superficie del adaptador Pi, reservada para cambio hermano
- `openspec/specs/installer-runtime/spec.md`
- Instalador CLI + core source (`installer/src/`)

## Restricción de honestidad (roadmap-beta.md)

`docs/roadmap-beta.md` es la autoridad canónica del estado beta. Registra que **fases B, C, D, E no tienen evidencia de implementación**. Corolario:
- No documentar launcher, shared-project-state, runtime-session-adapters ni E2E como existentes
- **Known Limitations** (cambio hermano) debe derivarse explícitamente de `roadmap-beta.md`, no redactarse en paralelo
- Si una página menciona capacidades futuras, debe marcarse explícitamente como **[BETA-EXCLUDED]** o derivar de matriz de alcance beta

## Decisiones validadas (conservadas del map)

1. **gap-inventory.md vive en `openspec/changes/docs-content-inventory/`**, en kebab-case, NUNCA bajo `docs-site/src/content/docs/` (sería una página pública).

2. **`00-start/` incluye `first-run.md`** como página obligatoria.

3. **Frontera A↔D**: En este cambio cada hueco recibe un **esqueleto** (estructura de secciones + fuentes candidatas + declaración de qué evidencia falta). Sin prosa inventada ni afirmaciones sin fuente. La redacción completa es de fase D posterior.

4. **Real Workflow Example usa el change archivado `installer-beta`** (`openspec/changes/archive/installer-beta/`), no `core-parity`. Razón: muestra cambios concretos de CLI reconocibles por un lector, frente a sincronización interna de coordinador.

5. **Known Limitations es hueco frenado**: Su fuente autoritativa (la matriz beta de `feat/shared-project-state-contract`) está en rama no mergeada. NO la leas ni la copies. Su decisión va en `gap-inventory.md` aunque la página pertenezca al cambio hermano.

6. **verified_rev**: `0ae709d`, confirmado contra HEAD.

7. **Frontmatter de cada página**: `title`, `description`, `sources` (rutas reales), `verified_rev`.

8. **Defecto del map corregido**: `pi-ein/README.md` (38 líneas) será anotado como fuente reservada para `docs-content-reference`, no será perdido ni duplicado.

## Volumen de fuente y presupuesto realista

**Volumen de fuente para SLICE 1**:
- README.md (150), installer/README.md (81), EIN_OPERATING_SYSTEM.md (222)
- orchestrator.md (234), PI_AGENTS_ARQUITECTURA.md (165)
- scout-routing/spec.md (73), sdd-lifecycle/spec.md (213), SDD_ARTIFACT_GRAMMAR.md (110), GUIA_PI_WORKFLOW.md (128)
- Los siete `ein-pi/core/agents/sdd-*.md` (~700)
- Artefactos de `openspec/changes/archive/installer-beta/` (scope, map, design, tasks, apply-progress, verify-report)

**Total**: ~2100 líneas de fuente propia + artefactos archivados.

**Presupuesto**:
- **max_tokens**: 45000 (lectura de múltiples fuentes, inventario de decisiones, esqueletos estructurados)
- **max_reads**: 40 (3 áreas × 4–6 archivos c/u, + gap-inventory, + validación)
- **max_runtime_ms**: 180000 (3 minutos)

Este presupuesto es suficiente para extracción completa de SLICE 1, decisión explícita sobre cada página y cada hueco, y no requiere re-exploración abierta del repositorio.

## Contexto del proyecto

- **Stack**: Node.js/TypeScript, Bun, monorepo con instalador + core EIN + documentación.
- **Rama actual**: `feat/docs-site` (worktree aislado desde `origin/main` en 0ae709d)
- **Contenido existente**: Disperso en READMEs, `ein-pi/core/docs/`, `openspec/specs/`, `installer/README.md`
- **Destino**: Estructura Astro Starlight bajo `docs-site/src/content/docs/`
- **Brief de producto autoritativo**: `docs/EIN_DOCUMENTATION_BRIEF.md`
- **Decisiones fijas**: Español, `docs-site/` en este monorepo, Astro Starlight muy personalizado

## Artefactos esperados

**Producidos en esta fase (scope)**:
- `openspec/changes/docs-content-inventory/scope.md` (este archivo)

**Producidos en fases posteriores (design → tasks → apply → verify → close)**:
- `docs-site/src/content/docs/00-start/{overview,getting-started,first-run}.md`
- `docs-site/src/content/docs/01-concepts/{orchestrator,sdd-openspec,context,deterministic-boundaries}.md`
- `docs-site/src/content/docs/02-workflow/{workflow-overview,artifacts,real-workflow-example}.md`
- `openspec/changes/docs-content-inventory/gap-inventory.md` (inventario de huecos y decisiones, creado en apply)
- Actualización de `openspec/config.yaml` si es necesaria (tbd en design)

## Spec delta declaration
spec_delta: none
spec_delta_reason: Este cambio produce contenido de documentación estática (extracción y organización); no altera el comportamiento observable de EIN ni modifica su especificación funcional.
