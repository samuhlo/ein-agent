# Ein Harness Audit

> **Documento histórico.** Auditoría puntual del workbench. Para el estado vigente ver `AGENTS.md`, `EIN_OPERATING_SYSTEM.md` y `PI_AGENTS_ARQUITECTURA.md`. Flujo actual: único `ein-sdd` (init → explore → design → apply → verify); eliminados Full SDD, `ein-design` y el review-workload gate; skill-injection automática en `ein-ai`.

Auditoria del sistema Ein Pi Workbench. Compara el estado actual de `~/.pi/agent` contra la guia de referencia de Pi Agents de 30 harnesses.

## Snapshot Actual

Componentes encontrados:

| Area | Ruta | Estado |
| --- | --- | --- |
| Reglas globales | `~/.pi/agent/AGENTS.md` | OK |
| Settings Pi | `~/.pi/agent/settings.json` | OK |
| Modelos | `minimax/MiniMax-M2.7`, `gpt-5.5` | OK |
| Prompts | `~/.pi/agent/prompts` | OK |
| Skills locales | `~/.pi/agent/skills/local` | OK |
| Skills descargadas | `~/.pi/agent/skills/downloaded` | OK |
| Extensiones | `~/.pi/agent/extensions` | OK |
| Docs | `~/.pi/agent/docs` | OK |
| Backups | `~/.pi/agent/backups` | OK |
| Memoria Pi | `~/.engram` via `mcp.json` (MCP stdio) | OK |
| Rollback | OpenCode intacto | OK |

Extensiones activas conocidas:

| Extension | Funcion |
| --- | --- |
| `ein-orchestrator.ts` | Routing, modelos y pi-subagents visibles |
| `ein-workflows.ts` | Comandos `/ein:sdd:*`, `/ein:linear:*`, `/ein:github:*`, `/ein:design:image` |
| `ein-engram.ts` | Bridge Engram basico |
| `ein-guardrails.ts` | Bloqueo de comandos y rutas peligrosas |
| `ein-linear.ts` | Bridge Linear por API key |
| `ein-context7.ts` | Bridge Context7 |
| `ein-minimax-mcp.ts` | Bridge MiniMax web/image |
| `ein-doctor.ts` | Diagnostico del workbench |
| `ein-brand.ts` | Branding fijo de Ein + prefijo configurable |

## Matriz De 30 Harnesses

| # | Harness | Estado | Lectura |
| --- | --- | --- | --- |
| 1 | SDD Orchestrator Harness | OK | Pi tiene orquestador y regla de no ejecutar directamente trabajo serio. |
| 2 | Delegation Harness | OK | `ein-orchestrator.ts` decide entre directo, agente visible y chain. |
| 3 | SDD Init Harness | OK | Existe `/ein:sdd:init`, pero se endurecera en Fase 2. |
| 4 | Execution Mode Harness | Parcial | Existe bypass `directo:`, pero no hay modo interactivo/automatico formal. |
| 5 | Artifact Store Harness | OK | `.sdd` se usa como fuente de verdad del trabajo interno. |
| 6 | Phase DAG Harness | Parcial | Hay init/new/apply/verify, pero falta `spec/design` explicito. |
| 7 | Artifact Dependency Harness | Parcial | Los prompts piden leer artefactos previos, pero no hay checker real. |
| 8 | Result Contract Harness | Parcial | Hay formatos de respuesta, pero no contrato validable por herramienta. |
| 9 | SDD Artifact Grammar Harness | Falta | No existe una gramatica formal SDD/Open Spec para Pi. |
| 10 | Engram Memory Harness | OK | Pi tiene memoria separada en `/Users/samu/.engram-pi`. |
| 11 | Strict TDD Harness | Parcial | Existe como intencion, pero no como gate real. Debe ser pragmatico. |
| 12 | Verify Harness | OK | `/ein:sdd:verify` enruta a `ein-sdd-apply-verify` con checks reales. |
| 13 | Apply Continuity Harness | OK | `apply.md` esta definido como log de continuidad. |
| 14 | Skill Registry Harness | OK | `ein_skill_registry` indexa skills locales y descargadas. |
| 15 | Skill Digestion Harness | OK | `ein_skill_digest` resume reglas aplicables por tarea. |
| 16 | Skill Resolution Feedback Harness | OK | `ein_skill_feedback` audita aplicacion esperada de skills. |
| 17 | Subagent Isolation Harness | OK | La delegacion visible queda en `pi-subagents`; el padre Ein conserva autoridad. |
| 18 | Review Warlock Harness | Falta | No hay aviso automatico por cambios grandes o dificiles de revisar. |
| 19 | Delivery Strategy Harness | Parcial | GitHub/Linear existen, pero no hay estrategia formal por riesgo. |
| 20 | Chain Strategy Harness | No prioritario | Stacked PRs no son necesarios ahora por tu flujo actual. |
| 21 | Model Routing Harness | OK | MiniMax base, gpt-5.3 heavy y gpt-5.5 orquestacion. |
| 22 | Profile Isolation Harness | Parcial | Hay Pi separado de OpenCode, pero no perfiles por proyecto. |
| 23 | Permission Security Harness | OK | Guardrails bloquean comandos destructivos y rutas sensibles. |
| 24 | MCP Injection Harness | Parcial | Hay bridges, pero no inyeccion dinamica por fase. |
| 25 | Backup Harness | OK | Hay backup automatico y `/ein:backup`. |
| 26 | Rollback Harness | Parcial | OpenCode sirve como rollback externo; falta rollback interno Pi. |
| 27 | Component Dependency Graph Harness | Falta | No hay grafo de dependencias para ordenar ediciones. |
| 28 | Command Wrapper Harness | Parcial | Las extensiones envuelven algunos comandos, pero no hay wrapper comun. |
| 29 | Per Agent Adapter Harness | Parcial | La arquitectura es adaptable, pero no hay adaptador formal multi-agente. |
| 30 | Session Summary / Compaction Recovery Harness | Parcial | Hay compaction y Engram, pero falta recovery protocol explicito. |

Resumen:

| Estado | Conteo |
| --- | ---: |
| OK | 14 |
| Parcial | 10 |
| Falta | 4 |
| No prioritario | 1 |

## Huecos Prioritarios

1. Faltan contratos validables entre fases SDD.
2. Full SDD existe como opt-in para proposal/spec/design antes de aplicar cambios complejos.
3. Falta un recovery protocol claro despues de compaction o sesion larga.
4. Falta un gate de review para avisar cuando el diff sea demasiado grande.
5. Falta decidir ciclo de vida de aliases legacy.

## Decisiones De Fase 1

- No se toca OpenCode; sigue como rollback.
- No se lee ni se copia contenido de `auth.json`.
- El bloque 5 queda en segundo plano porque Linear/GitHub ya estan personalizados.
- El bloque 4 pasa a ser la prioridad tecnica mas importante despues de endurecer SDD basico.
- Strict TDD se aplicara de forma pragmatica: obligatorio en logica de negocio y bugs reproducibles, flexible en UI pequena.

## Siguiente Batch Recomendado

El siguiente batch debe validar el flujo real interactivo, no seguir puliendo solo documentacion.

Orden recomendado:

1. Probar `/ein:orchestrate` con tarea compleja real.
2. Probar `/ein:sdd:new -> /ein:sdd:apply -> /ein:sdd:verify` en un proyecto pequeno.
3. Validar `/ein:doctor-output` despues de cambios de extensiones.
4. Decidir si se mantienen o eliminan aliases legacy.
5. Convertir recovery protocol en checklist operativo.
