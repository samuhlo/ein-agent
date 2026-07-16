# Plan: bajar el coste por cambio del SDD (right-sizing)

Objetivo original de Ein: **ahorrar tokens**. El proceso pesado (7 fases + TDD)
tiene valor para trabajo grande/ambiguo, pero hoy se aplica a todo y **apply
razona cuando solo debería ejecutar**. Este plan invierte el default: barato
primero, pesado solo bajo demanda. Guardarraíl transversal: **pocos knobs,
defaults sensatos, un gate** — no volver a sobre-ingeniar.

## Evidencia (runs reales)
- Cambio trivial (`<DownloadMenu>`→`<UiDownloadMenu>`) con 7 fases: **$8.59 · 1.67M in**.
- Cambio de "2 ficheros, 1 línea cada uno" con **TDD OFF**: **$1.86 · 557k in · 27min · 10 runs**, y verify sin empezar.
  - `sdd-apply` **431k** acumulado; `MiniMax-M3 · thinking high`, hasta **⟳47 turnos** por un grupo de 1 línea.
  - 3 rechazos de aceptación (informe malformado / `tests-added` faltante) + 1 abort → ~195k tokens tirados.
  - `sdd-apply` corrompió `tasks.md` (`status: complete` inválido) → retry extra.
  - Sobre-descomposición: 4 grupos para 2 ediciones.

## Diagnóstico raíz
El dinero se quema en **apply**, no en TDD. Causas:
1. **Apply razona** (`thinking high` heredado del default del modelo; el routing nunca lo fija bajo).
2. **Peaje del `acceptance: verified`**: exige un `acceptance-report` que los modelos baratos rompen, y `tests-added` que un grupo de verificación no puede dar.
3. **Corrupción de `tasks.md`** por apply → retries.
4. **Sobre-descomposición** y **thrashing** sin tope de turnos.

---

## Bloque E — Matar los sumideros de apply (PRIORIDAD MÁXIMA)

- **E0 — Apply ejecuta, no razona.** Fijar `sdd-apply` a `thinking: low` (default por-agente en `model-config.ts` + presets). Solo razonan orchestrator/design (y map medio). *Determinista. El mayor ahorro por tamaño de cambio.*
- **E1 — Apply con `acceptance: none`; `sdd-verify` es el gate.** Inyección determinista en el hook `tool_call`: una delegación `sdd-apply` sin `acceptance` explícito recibe `none`. Quita el peaje del informe (subsume E3). El orquestador puede pedir `verified` explícito si lo quiere. `sdd-verify` (fase dedicada) re-ejecuta la suite como gate real; el guard de cierre (v0.19.8) impide cerrar sin verify fresco.
- **E2 — Integridad de `tasks.md`.** (a) `sdd-apply.md`: NUNCA reescribir la línea `status:` (es `ready|blocked`, de sdd-tasks); solo marcar checkboxes. (b) Lint tolerante: un `tasks.md` con TODAS las casillas cerradas es válido aunque el status resbale. *Determinista.*
- **E3 — (subsumido por E1).** pi-subagents ata el informe al nivel de aceptación; no se puede "verify sin informe". Con apply→none el informe desaparece; el gate pasa a `sdd-verify`.
- **E4 — Tope al thrashing.** Inyectar `turnBudget` por defecto en delegaciones `sdd-apply` (backstop contra runaway). *Determinista.*

## Bloque B — TDD off por defecto, una pregunta, sin doble-ask
- Preflight fija SIEMPRE el override de sesión tras preguntar (incluido el caso `auto`) → `gateTddForDelegation` nunca re-pregunta. Fin del doble-ask.
- `DEFAULT_TDD` → `off`. Preguntar off/strict al arrancar (default off). Strict solo opt-in.

## Bloque G — Calibrar map/verify + panel de recomendados
Tras E, el coste se movió de apply a **map (222k)** y **verify (297k)** — fases que LEEN/verifican, no diseñan.
- **G1 (hecho):** `sdd-map` y `sdd-verify` a `thinking: medium` por defecto (como apply→low en E0). Solo razonan de verdad `orchestrator` y `sdd-design` → se dejan capaces/high. El detalle que design necesita vive en `map.md` (el artefacto), no en los tokens que map gasta → bajar su thinking NO pierde detalle. map ya tiene guía de leer con codegraph.
- **G2 (hecho):** el panel `/ein:models` muestra la **recomendación por agente** (barato/capaz + thinking + por qué) para el agente enfocado. `AGENT_RECOMMENDATIONS` en model-config.
- **Decisión clave:** `sdd-design` se queda **capaz** — fue low-token (58k) y es la última compuerta de razonamiento; abaratarlo es falsa economía. El gasto caro está en map/verify (mucho token), no en design.

## Bloque A — No auto-escalar a SDD; carril Quick + gate de confirmación
- Default Quick: un `sdd-apply` ad-hoc (reporte inline, sin artefactos) o edit directo para lo trivial; check dirigido; commit. Sin las 7 fases.
- Gate determinista `gateSddEscalation`: si la delegación arranca `sdd-scope` Y la petición no fue trigger SDD explícito Y no se confirmó → preguntar "rápido vs SDD". Default rápido, bloquea scope si rápido.

## Bloque F — Right-size dentro del SDD (hecho)
- `sdd-tasks` dimensiona los grupos al impacto real: ni demasiados (2 ficheros ≠ 4 grupos) ni **grupos monstruo**. Doctrina en `sdd-tasks.md`: un grupo ≤3-4 ficheros de producción; un tipo fundacional/cross-cutting va en su **propio grupo mínimo**, nunca junto a sus consumidores; bajo TDD estricto, grupos aún más pequeños.
- Backstop determinista: `ein_sdd_check` avisa `oversized-group` cuando un grupo toca >4 ficheros de producción (`oversizedGroupWarnings`).
- **Fix de E4 (regresión):** el `turnBudget` de apply (40+3) abortaba trabajo legítimo de TDD estricto. Ahora: NO se inyecta cap en applies de TDD estricto (lo gobierna `maxRuntimeMs`), y el cap normal sube a 60.

---

## Orden de ejecución
1. **Bloque E** (E0/E1/E2/E4) — deterministas, atacan la causa raíz del coste. ← primero
2. **Bloque B** — pequeño, cierra el doble-ask.
3. **Bloque A/F** — quick default + no sobre-descomponer.

## Lo que ya funciona (no regresionar)
Reanudación por `next pending` (v0.19.9), recuperación de rechazos vía `ein_sdd_check` (v0.19.3), guard de cierre obsoleto (v0.19.8), `ein_sdd_close` tool (v0.19.10), una sola pregunta al inicio, visibilidad de coste.
