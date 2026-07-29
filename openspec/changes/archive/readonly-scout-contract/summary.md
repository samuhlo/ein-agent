## // 000. RESUMEN
Ein gana `ein-scout`: un bibliotecario que puede inspeccionar y citar evidencia, pero carece demutación, delegación, autoridad arquitectónica o pertenencia al ciclo SDD de siete fases. El contrato de extensión se valida estáticamente — no existe un recibo por ejecución individual.

## // 001. QUÉ CAMBIÓ
- `ein-pi/core/agents/ein-scout.md` — contrato canónico del agente de solo lectura con frontmatter portátil (`tools: read, grep, find`, `extensions: []`, budgets).
- `ein-pi/agent/lib/scout-contract.ts` — normalizador de llamada directa (contexto `fresh`, budgets, schema de salida) y validador determinista del informe (byte cap 16 KiB, referencias resueltas, incertidumbres explícitas).
- `ein-pi/agent/extensions/ein-ai.ts` — cableado de hooks pre/post que rechaza informes malformados, múltiples, sin cita o con escape de ruta.
- `ein-pi/agent/extensions/ein-doctor.ts` — diagnóstico del scout como agente de investigación solo lectura; advertencia estática "no es una sonda ni recibo por ejecución".
- `ein-pi/agent/lib/model-config.ts` — recomendación de `ein-scout` (tier barato/low) en `AGENT_RECOMMENDATIONS`; no entra en `SDD_AGENT_NAMES`.
- `installer/src/core/verify.ts` — `NON_SDD_AGENTS` incluye `ein-scout`; installs basadas en manifest incluyen el scout sin incrementar `SDD_AGENTS`.
- `openspec/specs/sdd-lifecycle/spec.md` — dos escenarios añadidos: `readonly-scout-bounded-research-contract` y `readonly-scout-remains-outside-sdd-lifecycle`.
- 7 archivos de tests nuevos/actualizados cubriendo contrato, inventario, modelos, fase negativa y validación de informe.

## // 002. CÓMO FUNCIONA POR DENTRO
El padre (`ein-ai.ts`) intercepta cada `subagent({ agent: "ein-scout", ... })`. El normalizador fuerza `context: fresh`, `maxRuntimeMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, `toolBudget: { hard: 30, soft: 24, block: "*" }` y el `outputSchema` canónico, y elimina cualquier campo `extensions` inyectado por el llamador. Formas anidadas (chain, parallel, background, resume) se bloquean antes de tracking.

El agente se lanza desde contexto fresco con frontmatter `tools: read, grep, find` y `extensions: []`. En `pi-subagents` 0.37.2 instalado, esa lista vacía se mapea a `--no-extensions`; el schema de llamada del padre no expone `extensions`, así que ningún llamador válido puede debilitar la declaración. Esta es la frontera beta, no una sonda por ejecución.

El informe estructurado (`SCOUT_REPORT_SCHEMA`) exige `summary` (≤2000 chars), `findings` con `referenceIds`, `references` con `path/startLine/endLine/supports`, y `uncertainties` explícitas. El validador pos-ejecución rechaza payloads vacíos, múltiples, malformados, >16384 bytes UTF-8, con referencias absolutas, escapes de ruta (incluyendo symlinks vía `realpathSync`), rangos de línea inválidos, archivos faltantes, IDs duplicados/no usados o incertidumbres ausentes.

Inventario: `core/agents/ein-scout.md` es la fuente autoritativa. `bundle-template.ts` escanea ese directorio → `staging/agents/` → `staging/assets/agents/` → `template-manifest.json`. Install/verify usa el manifest; fallback legacy lista `NON_SDD_AGENTS`. Doctor diagnostica frontmatter y mapeo estático de extensiones. Model discovery expone scout como `source: "user"` con recomendación cheap/low. Scout está ausente de `PHASE_ORDER`, router, reconcile y chain — `phaseForAgent("ein-scout")` retorna `null`.

## // 003. DECISIONES
- **Frontmatter como autoridad de extensión:** el schema de llamada del padre no expone `extensions`; la declaración vacía en `ein-scout.md` es la única configuración admisible.
- **Direct foreground only:** chain/parallel/background/resume se bloquean; la asociación uno-a-uno llamada→informe es el menor límite de confianza.
- **Dependencia sin pin:** `pi-subagents` permanece sin fijar; doctor y tests estáticos diagnostican drift observable, pero no producen recibo por ejecución individual.
- **Tool-call budget ≠ read count:** `block: "*"` cubre llamadas de herramienta, no distingue `read`/`grep`/`find`; no se alega "30 lecturas".
- **Validador local como frontera de confianza:** JSON Schema valida forma; el adaptador valida tamaño en bytes, existencia de archivos citados y rangos de línea; no valida verdad semántica.

## // 004. VERIFICACIÓN
- `bun test …` — **103 pass / 0 fail / 322 expectations** (293 ms).
- `cd installer && bun run typecheck` — pass (tsc --noEmit exits 0).
- `cd installer && bun run bundle-template` — pass; `template.tar.gz` byte-identical al pre-apply.
- `git diff --check` — clean sobre el slice del contrato.
- Production churn: **226 líneas** (220 ins / 6 del), bajo el gate de 400.
- Spec sincronizado: SHA `32d43166…1d4ba` coincide con sync-report.
- Scout ausente de router (`PHASE_ORDER` = 7 fases exactas), reconcile y chains.
- Cobertura de comportamiento verificada: normalización de llamada, bloqueo de formas alternativas, validación de informe (malformado, sobredimensionado, escape symlink, ausencia de incertidumbre), cadena de inventario (source → staged → assets → manifest → install/doctor/model).

## // 005. PENDIENTE / RIESGOS
- **Dependencia sin pin (riesgo aceptado):** doctor y tests estáticos diagnostican drift observable en el paquete instalado; no pueden atestiguar aislamiento de extensión en una ejecución particular. Documentado como advertencia en doctor y en el diseño.
- **Tool budget no es contador de lecturas:** `read`, `grep` y `find` comparten un único contador de llamadas. No se alega "30 lecturas" en ningún archivo del slice.
- **Cap 16 KiB puede ser estrecho** para investigación amplia multi-área; los llamadores deben pedir investigación acotada, no relajar el límite.
- **El validador prueba existencia y rangos, no verdad:** una referencia válida y un rango de líneas existente no garantizan que el claim sea verdadero o que la cita lo respalde semánticamente. El informe es siempre evidencia consultiva.
- Ningún cambio en el flujo de siete fases; el ciclo SDD permanece byte-por-byte idéntico al baseline `release/v0.23.0`.
