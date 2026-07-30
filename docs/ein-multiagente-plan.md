# Plan: EIN multi-agente (Pi → OpenCode → Claude Code)

> Estado: **plan aprobado, sin implementar**. Decisiones tomadas: el core canónico vive **dentro de `ein-agent`**; `oc-ein`/`cc-ein` nacen como **tier support** (sin gates de código). Fase 0 = sandbox local aislado.

> **Precondición de secuenciación (2026-07-29):** este trabajo espera al **freeze de la beta pública** (`docs/public-beta-plan.md`). Motivo: la Fase 1 extrae `core/` como fuente canónica, pero la beta todavía reforma esa misma costura (slices 01–06 reescriben orquestador/`ein-discipline`/agentes SDD; slice 11 arregla sync de skills locales, `EIN.md` y `core/docs/`). Extraer ahora congela un blanco en movimiento y multiplica el mantenimiento sobre un ein-pi inestable — lo contrario del principio de aislamiento. Único solapamiento seguro mientras tanto: la **Fase 0 (sandbox)**, desechable y sin tocar repo ni ein-pi. La Fase 1+ arranca solo cuando la beta esté congelada.

## 1. Objetivo

Convertir EIN —hoy un harness acoplado a Pi— en **un solo cerebro portable a varios runtimes**: Pi (full, daily driver), OpenCode (`oc-ein`, support) y más adelante Claude Code (`cc-ein`, support). Modelo de referencia: [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) — una fuente canónica que se compila a cada herramienta.

Requisito duro del usuario: **darle caña diaria a ein-pi NO debe poder romper oc-ein/cc-ein**, y viceversa. Los de apoyo son más simples a propósito.

## 2. Diagnóstico: EIN tiene dos capas

| Capa | Contenido | Portabilidad |
|---|---|---|
| `ein-pi/core/` | agents (prompts SDD), skills, prompts, docs, persona | **~80% agnóstico**. Solo el frontmatter (`tools`, `budget`, `completionGuard`) es de Pi. |
| `ein-pi/agent/` (extensions + `lib/`) | TypeScript contra `@earendil-works/pi-coding-agent`: candidate receipts, delivery gate, `ein-git` contract, guardrails, sdd-router, hypa, doctor | **~0% portable**. Es la API de runtime de Pi. |

**Consecuencia:** la prosa se copia; los gates deterministas hay que reescribirlos por runtime o **degradarlos a disciplina de prompt**. Como `oc-ein`/`cc-ein` son "de apoyo", nacen sin reimplementar gates (tier support). Reimplementarlos como plugins de OpenCode/hooks de Claude es opcional y posterior.

## 3. Cuatro principios

1. **Un solo cerebro, muchos cuerpos.** `core/` deja de ser "de Pi" y pasa a canónico/agnóstico. Pi, OpenCode y Claude Code son *adaptadores*.
2. **Dos tiers explícitos.** `ein-pi` = **full** (gates de código). `oc-ein`/`cc-ein` = **support** (subset de skills, gates como disciplina de prompt, sin receipts/delivery).
3. **Aislamiento por perfil + pin de versión.** Cada `oc-*` es una función fish con su `OPENCODE_CONFIG_DIR` propio (`~/.config/opencode-<x>`) → no comparte estado físico con `.pi/`. Además, cada adaptador **fija un hash/versión del core**: sube cuando el usuario decide, no cuando ein-pi cambia.
4. **Promoción, no acoplamiento.** Se experimenta en sandbox aparte; algo entra al repo/instalador solo al promocionarlo.

## 4. Arquitectura objetivo (dentro de `ein-agent`)

```
ein-agent/
  core/                         # FUENTE CANÓNICA, agnóstica (extraída de ein-pi/core)
    agents/  skills/  prompts/  persona/  sdd/
    manifest.yaml               # frontmatter NEUTRO + tier por pieza (full|support)
  adapters/
    pi/          → ein-pi actual (full: consume core + gates en lib/)
    opencode/    → build: core → opencode.json + agents/*.md + skills/ + plugin ligero
    claude-code/ → (más adelante) core → .claude/
  build/         → compilador core → cada target (mapea frontmatter, filtra por tier)
```

**El compilador** es la pieza nueva clave: lee `core/` + `manifest.yaml` y por cada target traduce el frontmatter neutro al esquema real
(Pi `budget/tools` ↔ OpenCode `mode/prompt` con `{file:./agents/x.md}` ↔ Claude `.claude/agents`) y **descarta lo `tier: full`** al compilar para support.

### Cómo mapea a OpenCode (observado)

- Perfil = `~/.config/opencode-ein/` con `opencode.json` (`$schema`, `instructions: [AGENTS.md]`, `skills.paths`, `mode`, `mcp`, `compaction`).
- Agents = `agents/*.md` referenciados desde `mode` vía `{file:./agents/<x>.md}`.
- Skills = carpetas con `SKILL.md` bajo `skills/`.
- Plugins = JS/TS con la API de plugins de OpenCode (distinta a la de Pi).
- Lanzador = función fish (patrón `oc-trabajo`): fija `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `GH_CONFIG_DIR`.

## 5. Rollout por fases (menor → mayor riesgo)

### Fase 0 — Sandbox local, riesgo CERO (empezar aquí)
No se toca `ein-pi/` ni el repo. Playground aparte, p.ej. `~/Documentos/01_Code/ein-adapters-lab/`:
- Perfil `~/.config/opencode-ein/` + `oc-ein.fish` (clon de `oc-trabajo`).
- Portar a mano una **rebanada fina**: persona de Ein + 2-3 skills + flujo SDD como agents/prompts de OpenCode (sin gates).
- Objetivo: aprender el formato de OpenCode y ver qué se pierde sin los gates.

### Fase 1 — Extraer el contrato del core
Factorizar `ein-pi/core` → `core/` canónico + `manifest.yaml` (frontmatter neutro + `tier`). Escribir el mini-compilador `core → opencode`. ein-pi sigue consumiendo el **mismo** core (sin deriva). Nace el pin de versión.

### Fase 2 — Al instalador
`oc-ein` (y luego `cc-ein`) como *targets* instalables en el installer actual, cada uno a su propio perfil.

### Fase 3 — Claude Code
Mismo core → adaptador `.claude/`. Reaprovecha el compilador.

## 6. Riesgos / notas abiertas

- **Frontmatter neutro:** hay que diseñar el esquema mínimo común y su mapeo por target (es el corazón del compilador).
- **Pérdida de gates en support:** documentar explícitamente qué garantías de ein-pi NO tiene oc-ein (delivery gate, receipts, `ein-git`). Que sea una decisión consciente, no una sorpresa.
- **Deriva del core:** el pin protege a los adaptadores, pero exige un ritual de "bump" deliberado; conviene un test que verifique que cada adaptador compila contra el hash pineado.
