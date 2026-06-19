# Review Workload Guard — análisis y plan de re-integración

> Doc de trabajo. Origen: comparación del orchestrator de Ein contra `gentle-pi`
> (`pi-agent-system/npm-packages/gentle-pi/assets/orchestrator.md`).
> Fecha: 2026-06-19. Estado del repo en ese momento: `main @ a1ed618`.
>
> **ESTADO: RESUELTO (2026-06-19) — Opción C implementada.** Gate determinista
> en `ein-git` (mide `git diff --stat` real contra el budget; STOP+report si
> excede; `auto` no lo salta). La preflight inyecta la regla determinista en vez
> del "forecast" muerto, y se arregló el straggler "Gentle AI". Tests:
> `tests/review-workload-guard.test.ts`. La incoherencia #2 (support files de TDD)
> se cerró por la vía B (quitar la referencia colgante): `tests/tdd-support-refs.test.ts`.
> El resto del doc queda como registro del análisis.

---

## // 000. TL;DR

El **Review Workload Guard** es el mecanismo que protege al revisor (humano o
agente) de PRs gigantes e irrevisables: estima/mide las líneas cambiadas y, si
superan un presupuesto (por defecto **400 líneas**), pausa antes de implementar
o de abrir PR y obliga a decidir entre un solo PR o partirlo en **chained PRs**.

**Hallazgo clave:** Ein **no lo eliminó limpiamente**. La refactorización de SDD
de 9→5 fases **desmontó la maquinaria que producía y hacía cumplir** el guard,
pero **dejó colgando** la captura de datos en la preflight y las skills que lo
referencian. Resultado: Ein hoy **pregunta al usuario** por estrategia de
chained-PR y presupuesto de revisión, inyecta una línea que habla de un
"workload forecast"… **que ninguna fase genera ya**. Es deuda técnica con UI
incluida: fricción sin función.

Por tanto esto no es "re-añadir una sección al orchestrator". Es **decidir** entre
limpiar los restos o re-cablear el guard al nuevo flujo, y hacerlo coherente de
punta a punta.

---

## // 001. QUÉ ES (referencia: gentle-pi)

En `gentle-pi`, el guard es un sistema de 3 piezas conectadas:

### A. Preflight captura 4 ejes (gentle-pi)

```
- execution mode: interactive | auto
- artifact store: openspec | engram | both
- chained PR strategy: auto-forecast | ask-always | single-pr-default | force-chained
- review budget in changed lines   (default 400)
```

### B. La fase `sdd-tasks` PRODUCE un "Review Workload Forecast"

En el flujo de 9 fases de gentle-pi (`init → explore → proposal → spec → design
→ tasks → apply → verify → archive`), la fase **`tasks`** estimaba si la
implementación superaría las 400 líneas y, si el riesgo era alto, recomendaba
chained PRs y partía las tareas en work-units autónomos.

### C. El orchestrator HACE CUMPLIR el guard (sección "Review Workload Guard")

Texto literal de gentle-pi (`orchestrator.md`):

```md
## Review Workload Guard

After `sdd-tasks` and before `sdd-apply`, inspect the task output for review workload risk.

If estimated changed lines exceed 400, chained PRs are recommended, or a decision
is needed, pause and ask unless the user already approved a delivery strategy.

Automatic mode does not override reviewer burnout protection.
```

La frase clave es la última: **el modo `auto` NO desactiva la protección.** Es un
gate de seguridad, no una preferencia de velocidad.

---

## // 002. QUÉ TIENE EIN HOY (estado real, verificado)

Repo: `main @ a1ed618`. Verificado con grep en `ein-pi/agent/`.

### Lo que SOBREVIVE (datos + skills, sin enforcement)

| Pieza | Archivo | Estado |
|---|---|---|
| Captura `chainedPrStrategy` | `ein-pi/agent/lib/sdd-preflight.ts:21,55,267,283-288` | **Vivo** — la preflight lo pregunta (`ui.select`) |
| Captura `reviewBudgetLines: 400` | `ein-pi/agent/lib/sdd-preflight.ts:22,56,219,273-274,289` | **Vivo** — la preflight lo pregunta (`ui.input`) |
| Inyección en el bloque preflight | `ein-pi/agent/lib/sdd-preflight.ts:320-323` | **Vivo** — inyecta "Chained PR strategy", "Review budget", y la línea "If task/workload forecasts conflict…" |
| Notify al usuario | `ein-pi/agent/lib/sdd-preflight.ts:355-356` | **Vivo** — muestra "PR chaining" y "Review budget" |
| Skill `chained-pr` | `ein-pi/agent/skills/local/chained-pr/SKILL.md` | **Vivo** — trigger en ">400 líneas" y "SDD forecasts 400-line budget risk: High" |
| Skill `work-unit-commits` | `ein-pi/agent/skills/local/work-unit-commits/SKILL.md:32,64` | **Vivo** — "SDD workload guard" + "When sdd-tasks produces a Review Workload Forecast" |
| Skill `ein-discipline` | `ein-pi/agent/skills/local/ein-discipline/SKILL.md:28` | **Vivo** — "Forecast review workload before large changes" |

### Lo que se DESMONTÓ (la maquinaria que generaba/cumplía el guard)

| Pieza | Antes (backup `2026-06-07_ein-pre-migration`) | Ahora |
|---|---|---|
| Fase `sdd-tasks` que produce el forecast | `agents/sdd-tasks.md:30-60` ("Required Review Workload Forecast") | **Eliminada** — fusionada en `design`, que tiene PROHIBIDO generarlo |
| `design` genera forecast | — | **Bloqueado explícitamente**: `sdd-design.md:47` "Do NOT include Review Workload Forecast, line budget, or chained PR recommendations" |
| Gate en `sdd-apply` | `backups/.../agents/sdd-apply.md:26` ("Review Workload Gate") | **Eliminado** |
| Verificación en `sdd-verify` | `backups/.../agents/sdd-verify.md:43` ("Review Workload Verification") | **Eliminada** |
| Sección "Review Workload Guard" en orchestrator | (gentle-pi la tiene) | **Nunca existió / se soltó** en Ein |
| `chains/ein-sdd.chain.md` | `sdd-full.chain.md:57` incluía las "guard lines" | **Limpio**: `ein-sdd.chain.md:50` dice "Do not include a review workload forecast" |

### La inconsistencia concreta (el bug de coherencia)

```
sdd-preflight.ts:323  inyecta →  "If task/workload forecasts conflict with these
                                   preferences, pause before sdd-apply and ask…"
                                          ▲
                                          │  referencia un artefacto…
                                          ▼
sdd-design.md:47      prohíbe →  "Do NOT include Review Workload Forecast…"
ein-sdd.chain.md:50   prohíbe →  "Do not include a review workload forecast…"
```

**Nadie genera el forecast**, así que la condición "if forecasts conflict" nunca
se evalúa de verdad. El usuario paga fricción (dos preguntas en la preflight)
por una salvaguarda que no se dispara.

### Bonus: straggler de marca

`sdd-preflight.ts:352` → el notify dice **"Gentle AI SDD preflight complete."**
Resto del rebrand. Debería decir "Ein". (Línea aparte de este guard, pero está
en el mismo archivo que vas a tocar.)

---

## // 003. POR QUÉ IMPORTA

- **Coste y calidad con modelos baratos.** El gran riesgo del flujo SDD con
  ejecutores baratos es que `sdd-apply` se desboque y produzca un diff enorme.
  Tienes el **Scope Gate** (budget de *tokens/lecturas* en exploración) pero NO
  un gate de **líneas cambiadas de salida**. Son cosas distintas: uno limita lo
  que el agente *lee*, el otro lo que *escribe*. Hoy falta el segundo.
- **Protección del revisor.** Un PR de 1.500 líneas no se revisa, se aprueba a
  ciegas. El guard fuerza slices revisables.
- **Coherencia.** Aunque decidas NO tener el guard, hoy el producto miente:
  pregunta por algo que no usa.

---

## // 004. OPCIONES DE RESOLUCIÓN

Tres caminos. No son excluyentes (C es el recomendado y absorbe lo bueno de B).

### Opción A — Limpiar los restos (aceptar que no hay guard)

Quitar de `sdd-preflight.ts`: `chainedPrStrategy`, `reviewBudgetLines`, las dos
preguntas de UI, las líneas inyectadas 320-323, y el notify 355-356. Revisar las
skills (`chained-pr`, `work-unit-commits`) para que no referencien un forecast
inexistente (o dejarlas como skills *manuales* que el usuario invoca a mano).

- **Pro:** mínimo esfuerzo, mata la incoherencia, preflight más corta (alinea con
  la decisión de Ein de capturar solo 2 ejes).
- **Contra:** pierdes de verdad la protección del revisor. Quedas solo con el
  Scope Gate de entrada.

### Opción B — Re-cablear el guard "a la gentle-pi" (forecast por el modelo)

Revertir `sdd-design.md:47` y `ein-sdd.chain.md:50` para que `design` SÍ emita un
"Review Workload Forecast" (estimación de líneas + recomendación de chained PR),
añadir una sección "Review Workload Guard" al orchestrator que pause antes de
`apply` si supera budget, y un check en `sdd-verify` de que se respetó el slice.

- **Pro:** paridad con gentle-pi; guard en planificación.
- **Contra:** vuelve a meter ceremonia en `design` (justo lo que la refacto 9→5
  quitó); y un "forecast" estimado por un modelo barato es **poco fiable** — las
  estimaciones de líneas pre-implementación fallan mucho.

### Opción C — Guard determinista en delivery (RECOMENDADA)

En vez de que un modelo *estime* líneas antes de escribir, que **`ein-git` mida
las líneas reales** (`git diff --stat`) en el momento de la entrega y haga
cumplir el budget. El número es exacto, no estimado.

Flujo:

1. La preflight sigue capturando `reviewBudgetLines` (default 400) y
   `chainedPrStrategy` — **esto ya existe, se reutiliza tal cual.**
2. Arreglar la línea inyectada 323 para que no hable de "forecast": cambiarla por
   una regla de delivery real (ver abajo).
3. **`ein-git`**, antes de abrir PR, ejecuta `git diff --stat base..HEAD`, suma
   `additions + deletions`, y:
   - si `≤ budget` → PR único, adelante;
   - si `> budget` y strategy ≠ `single-pr-default` → **para y reporta**: propone
     partir en chained PRs (puede apoyarse en la skill `chained-pr`), y pide
     decisión vía `ask_user_question`.
   - `auto` NO salta este gate (regla de gentle-pi: "Automatic mode does not
     override reviewer burnout protection").
4. Opcional: `sdd-verify` reporta el tamaño real del diff como dato informativo.

- **Pro:** determinista y fiable; reutiliza los datos que YA capturas; pone el
  gate en el punto correcto (delivery, donde el diff ya existe); no re-mete
  ceremonia en `design`; encaja con que `ein-git` ya es el dueño de la entrega.
- **Contra:** el guard actúa "tarde" (tras implementar). Mitigación: el Scope
  Gate de entrada ya acota el tamaño de un slice; este gate es la red de
  seguridad de salida. Para trabajo realmente grande, la decisión de slicing la
  toma el orchestrator en el Scope Gate ("decompose broad requests"), no aquí.

---

## // 005. RECOMENDACIÓN

**Opción C**, porque:

1. Aprovecha la infraestructura que ya sobrevive (no tiras la preflight).
2. Mide en vez de estimar → cero falsos forecasts.
3. Respeta la decisión arquitectónica de Ein de mantener `design` lean.
4. Pone la responsabilidad en `ein-git`, que ya es el único que ve el diff
   completo en delivery.

El Scope Gate (entrada, tokens) + Review Workload Guard determinista (salida,
líneas) serían las **dos mitades** del control de tamaño: una limita lo que se
lee, otra lo que se entrega. Hoy solo tienes la primera.

Si quieres el mínimo absoluto y cerrar la incoherencia ya: **Opción A** y listo.
La C es la que recupera valor real.

---

## // 006. CHECKLIST DE IMPLEMENTACIÓN (si eliges C)

- [ ] `sdd-preflight.ts:323` — reemplazar la línea del "forecast" por una regla de
      delivery: *"Before opening a PR, ein-git measures real changed lines
      (`git diff --stat`); if they exceed the review budget and the strategy is
      not single-pr-default, pause and ask for a chained-PR decision. Auto mode
      does not bypass this."*
- [ ] `ein-pi/agent/agents/ein-git.md` — añadir sección "Review Workload Gate":
      medir `additions + deletions` contra el budget inyectado, y el
      comportamiento de pausa + `ask_user_question` + apoyo en skill `chained-pr`.
- [ ] (Opcional) `sdd-verify.md` — reportar tamaño real del diff como dato.
- [ ] Revisar skills `chained-pr` / `work-unit-commits` para que el trigger sea
      "diff real > budget en delivery", no "sdd-tasks forecast" (fase muerta).
- [ ] `sdd-preflight.ts:352` — arreglar "Gentle AI" → "Ein" (straggler de marca).
- [ ] Tests de contrato nuevos:
      - `ein-git.md` contiene la Review Workload Gate y referencia el budget.
      - `sdd-preflight.ts` ya no inyecta la frase "task/workload forecasts".
- [ ] Verificar: `bun test` + `cd installer && bun run typecheck`.
- [ ] Deploy a live (`~/.pi/agent/...`) + `/ein:doctor`.
- [ ] Si decides en cambio la Opción A, el checklist es solo: borrar los campos de
      `sdd-preflight.ts`, las 2 preguntas de UI, líneas 320-323 y 355-356, y
      degradar las skills a invocación manual.

---

## // 007. PUNTEROS RÁPIDOS (archivos:línea)

- `ein-pi/agent/lib/sdd-preflight.ts` — captura + inyección + notify (líneas
  17,21-22,55-56,219,267-289,320-323,355-356; straggler marca: 352).
- `ein-pi/agent/agents/sdd-design.md:47` — prohibición del forecast.
- `ein-pi/agent/chains/ein-sdd.chain.md:50` — prohibición del forecast.
- `ein-pi/agent/agents/ein-git.md` — donde iría el gate determinista (Opción C).
- `ein-pi/agent/skills/local/chained-pr/SKILL.md` — skill de slicing (400 líneas).
- `ein-pi/agent/skills/local/work-unit-commits/SKILL.md:32,64` — referencias al
  "workload guard" / "sdd-tasks forecast".
- Referencia externa: `…/gentle-pi/assets/orchestrator.md` — sección "Review
  Workload Guard" + "Lazy SDD Preflight" (4 ejes).
- Backups con la maquinaria original (por si quieres copiar texto):
  `ein-pi/agent/backups/2026-06-07_ein-pre-migration/agents/{sdd-tasks,sdd-apply,sdd-verify}.md`.
