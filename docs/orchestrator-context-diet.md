# Fuga de contexto del orquestador EIN — diagnóstico y plan

> **Para:** agente que vaya a revisar/continuar la solución.
> **Estado de implementación:** esta rama implementa **Fix A** (envelope de retorno compacto en los 7 `sdd-*`) y **Fix B** (cablear `ein-scout` en el orquestador + evitar lecturas pesadas en el padre). **Fix C** (backstop `maxOutput`, requiere upstream `pi-subagents`) y **Fix D** (verificar compactación viva) quedan **diferidos** — ver §004.
> **Repo:** `ein-agent`. **Runtime de subagentes:** paquete externo `pi-subagents` (instalado en `~/.pi/agent/npm/node_modules/pi-subagents/`).

---

## 000. Síntoma observado

El contexto del **orquestador** (la sesión padre de Pi) se llena muy rápido durante un flujo SDD, pese a que cada fase se delega a un subagente con `context: "fresh"`. La expectativa del dueño del repo era: *"si todo es fresh y el padre solo despacha, su contexto no debería crecer casi nada"*.

Esa expectativa es **falsa** por dos motivos que se explican abajo.

---

## 001. Causa raíz #1 — el envelope de retorno de cada fase se inyecta ENTERO en el padre

### El malentendido
`context: "fresh"` solo resetea el contexto de **arranque del hijo**. **No afecta a lo que el hijo DEVUELVE al padre.** El mensaje final del hijo (el "envelope" de la fase) se añade íntegro al contexto del padre como resultado del tool `subagent`.

### El mecanismo exacto (verificado)
En `pi-subagents`:

1. `runs/background/subagent-runner.ts:791` — `const finalOutput = getFinalOutput(messages)` toma **el último mensaje de asistente completo del hijo**.
2. Línea `1378`: `const rawOutput = finalResult?.finalOutput ?? ""` → se propaga a `outputForSummary`.
3. `runs/shared/single-output.ts:211` `finalizeSingleOutput(...)`:
   - Si `outputMode === "file-only"` **y** hay `savedPath` → devuelve solo `outputReference.message` (un puntero corto). **Barato.**
   - En cualquier otro caso (incluido el modo `inline`, que es el **default**) → `displayOutput = fullOutput` (el envelope entero). **Caro.**
   - Con delegación directa por fase **no se pasa `output`**, así que no hay `outputPath` ni `savedPath` → cae en `return { displayOutput }` con `displayOutput = fullOutput` (línea `234`).
4. El único recorte es `DEFAULT_MAX_OUTPUT = { bytes: 200*1024, lines: 5000 }` (`shared/types.ts:1510`). Está tan alto que **nunca recorta un envelope** (que ronda 4–10 KB).

### Por qué se delega sin `output`/`outputMode`
Es una decisión deliberada documentada en `ein-pi/agent/assets/orchestrator.md:88`:

> *"do NOT pass `output`/`outputMode` when delegating a phase directly: a relative `output` path resolves inside the runner's `.pi-subagents/` sandbox, never the repo, and forces a parent-side copy."*

O sea: se evita `output` para que el artefacto lo escriba la propia fase en `openspec/changes/<change>/…`. **Correcto para los inputs**, pero como efecto colateral deja el retorno en modo `inline` → el envelope completo drena al padre.

La frase de `orchestrator.md:88` *"This keeps token cost flat across long flows"* se refiere **solo a lo que BAJA al hijo** (inputs pasados por referencia, no por contenido). **No cubre lo que SUBE de vuelta.** Ese es el agujero.

### Medición real
Los ficheros `*_output.md` en `.pi-subagents/artifacts/` son literalmente ese `fullOutput` devuelto. Tamaños medidos:

| Fase        | Envelope devuelto inline |
| ----------- | ------------------------ |
| sdd-verify  | ~9.6 KB                  |
| ein-git     | ~9.6 KB                  |
| sdd-tasks   | ~8.9 KB                  |
| sdd-apply   | ~7.5 KB                  |
| sdd-map     | ~5.0 KB                  |

Ejemplo real (envelope de `sdd-verify`, ~9.6 KB): un JSON con `status`, `executive_summary` (párrafo largo), `commands_run` (lista), `next_recommended`, `risks` (lista), y `acceptance_report` con la **evidencia entera en prosa** por criterio. **Todo eso entra en el padre**, aunque:

- El `verify-report.md` ya está en disco.
- El orquestador enruta por `ein_sdd_check` / `ein_sdd_status`, que **leen disco de forma determinista**, no el envelope.
- Al padre le bastaría: veredicto de aceptación + `next` + un resumen de ≤5 líneas.

**Impacto agregado:** un flujo SDD lanza ~19 subagentes (scope, map, design, tasks, apply×N, verify, close, ein-git, reintentos). A 4–10 KB cada uno ≈ **~100 KB ≈ ~30k tokens solo de envelopes de retorno**.

---

## 002. Causa raíz #2 — el orquestador hace demasiado trabajo propio entre despachos

El padre **no "solo despacha"**. En un flujo típico también acumula en su propio contexto:

- Lecturas de artefactos completos: `read map.md:1-180`, `read tasks.md:1-220`, `read design.md`, `read spec.md`, `read openspec-spec-parser.ts`.
- Varios `rg` de depuración de 80–120 líneas para inspeccionar salida/errores de subagentes.
- `ein_sdd_check` ×~15 (cada uno pequeño, pero suma).
- `ein_sdd_status` ×3 (~30 líneas cada uno).
- `ein_candidate_receipt` ×2 (listas largas de rutas).
- Varios `ask_user_question` verbosos.

Esto contradice la propia doctrina de `orchestrator.md:94` (*"Resuming across sessions is free: call `ein_sdd_status` — no context dump, no re-reading the change"*). En la práctica el padre **sí** relee artefactos enteros para "verificar a ojo" y corre greps de investigación en su propio hilo.

---

## 003. Conclusión del diagnóstico

El contexto del padre crece de forma **monótona** por dos sumandos:

```
crecimiento_padre  =  Σ(envelope de retorno de cada fase)     ← causa #1 (dominante)
                    +  Σ(lecturas/greps/checks propios)         ← causa #2
```

`fresh` no toca ninguno de los dos. La compactación de Pi (si está activa) mitiga, pero es mejor **no generar** los tokens.

---

## 004. Plan de solución (ordenado por impacto)

### A. Adelgazar el envelope de retorno de cada `sdd-*` — DOMINANTE (~70% de la fuga)
**Qué:** el último mensaje del hijo es lo que drena. Cambiar el contrato de retorno para que ese mensaje final sea **compacto**:

- `acceptance` / `status`
- `next_recommended`
- resumen humano de ≤5 líneas
- ruta del artefacto en disco

**Todo el detalle verboso** (`executive_summary`, `commands_run`, evidencia por criterio, `risks`) debe vivir **solo en el artefacto en disco** (`verify-report.md`, `apply-progress.md`, etc.), **no** en el mensaje de retorno.

**Dónde:** las secciones de "output / return contract" de cada agente en `ein-pi/core/agents/sdd-*.md` (y `ein-git.md`). Nota: `ein-pi/core/agents/` es el core canónico bundleado por el instalador; probablemente haya que re-generar el template (`installer/scripts/bundle-template.ts`) tras editarlos.

**Por qué es seguro:** el runner **re-evalúa la aceptación desde el artefacto en disco**, no desde la prosa del envelope (ver `subagent-runner.ts:1414-1426`, `evaluateAcceptance` con `fileOutput`). Así que reducir el `acceptance_report` a `id`+`status` no rompe el gate. El orquestador enruta por `ein_sdd_check`/`ein_sdd_status` (disco), así que tampoco depende del envelope.

**Riesgo a vigilar:** no recortar señales que el padre sí consume del retorno (p.ej. `authored_by: parent-fallback`, o el `status: blocked` con causa). Mantenerlas en la versión compacta.

### B. Sacar la exploración read-only del padre → `ein-scout`
**Qué:** el padre no debe leer artefactos de fase completos ni correr `rg` de investigación en su propio hilo. Cualquier lectura/grep de investigación se delega a **`ein-scout`** (el agente read-only recién añadido en el slice `readonly-scout-contract`), que devuelve solo la conclusión.

**Dónde:** endurecer la doctrina en `ein-pi/agent/assets/orchestrator.md`:
- Prohibir lecturas completas de artefactos de fase para "verificar a ojo"; fiarse de `ein_sdd_check`.
- Solo leer un tramo acotado del artefacto **cuando `ein_sdd_check` reporte error concreto**.
- Rutar greps/exploración a `ein-scout` en vez de ejecutarlos en el padre.

### C. Backstop mecánico `maxOutput` — SECUNDARIO (requiere upstream)
**Hallazgo:** `maxOutput` **no está expuesto** ni por llamada del tool `subagent` ni en la config de la extensión; es un default fijo (`DEFAULT_MAX_OUTPUT`, 200 KB) enterrado en el runner. Para un recorte duro del retorno (p.ej. 50 líneas / 4 KB) habría que **parchear `pi-subagents` (PR upstream)** o envolver el tool en EIN.
**Recomendación:** dejarlo como opción secundaria. A + B resuelven la fuga sin depender de esto.
**Descartado:** `outputMode: "file-only"` por llamada es posible pero exige un `output` path y chocaría con que cada fase escribe su propio artefacto canónico (doble escritura / copia en sandbox). No es limpio.

### D. Confirmar que la compactación está activa en la sesión viva — MITIGACIÓN
`ein-pi/agent/settings.json` trae `compaction.enabled: true` con `keepRecentTokens: 24000`, **pero ese fichero es la plantilla bundled** (rutas `/Users/samu`, macOS). Verificar que el `~/.pi/agent/settings.json` **real** de la máquina la tiene encendida. Es mitigación, no cura.

---

## 005. Recomendación de arranque

1. **A primero** (envelopes compactos en los 7 `sdd-*.md` + `ein-git.md` + re-bundle del template). Es el grueso y está 100% bajo control de EIN.
2. **Luego B** (rutar exploración a `ein-scout` + prohibir lecturas completas de artefacto en el padre).
3. Con A+B, el contexto del orquestador debería crecer de forma casi plana, como se esperaba.
4. C y D solo si hace falta apretar más.

Sugerencia de empaquetado: un cambio SDD tipo `orchestrator-context-diet`. Antes de tocar los 8 agentes, conviene redactar el **envelope compacto de UNA fase (p.ej. verify)** como referencia y validarlo, luego replicar el patrón al resto.

---

## 007. `file-only` entre fases vs. envelope corto — por qué el envelope corto gana

Pregunta natural: *"¿Y por qué no poner `file-only` entre `sdd-map` → `sdd-design` → `sdd-tasks`? Ahorraría bastante, ¿no?"*

**Respuesta corta:** sí, mecánicamente ahorraría. Pero `file-only` es "la herramienta con un pero", y hay otra (envelope corto, fix A) que llega al mismo ahorro sin el pero.

### El pero de `file-only` en delegación directa
`file-only` **no es un flag suelto**: exige una ruta `output: <path>` donde el runtime guarda el informe (`single-output.ts:141-142` — `file-only` sin `output` es error). Y ahí hay dos caminos, ambos malos:

1. **Ruta relativa** → el runtime la guarda dentro de su carpeta temporal `.pi-subagents/` (el sandbox), **no en el repo**. Esa carpeta se limpia sola, así que el puntero apunta a algo efímero y **fuerza una copia extra** para llevarlo al repo (esto es exactamente lo que avisa `orchestrator.md:88`).
2. **Ruta absoluta al repo** (p.ej. `openspec/changes/<change>/map.md`) → **choca con que la fase YA escribe ese mismo `map.md` ella misma**. Riesgo de que el informe de estado **pise el artefacto real**, o de crear un duplicado que ensucia el árbol.

Raíz del conflicto: `file-only` fue diseñado para agentes que **NO escriben su propio archivo** (el runtime se lo guarda por ellos). Las fases de EIN son al revés: **ya escriben su artefacto canónico solas**. `file-only` encima es un segundo guardado redundante que se pisa con el primero.

### El detalle que lo decide
**`sdd-design` no consume el envelope de `sdd-map`.** El orquestador le pasa a design una **referencia** (*"tu input está en `map.md`, léelo tú"*) y design **lee `map.md` del disco directamente** (`orchestrator.md:88`, "passing artifact references, not their content"). El contenido gordo del envelope de map **no lo relee nadie**: solo sirve para que el orquestador sepa "aprobado" + "siguiente fase". Todo lo demás ya está en disco.

### Conclusión
No hace falta redirigir el envelope a un archivo (`file-only`); basta con que el envelope **sea corto de entrada**. Mismo ahorro, sin ruta que gestionar, sin sandbox efímero, sin pisar el artefacto, sin copias.

| Enfoque | Ahorra contexto | Limpio |
| ------- | --------------- | ------ |
| `file-only` entre fases | ✅ sí | ❌ necesita ruta; se pisa con el artefacto que la fase ya escribe |
| Envelope corto (**fix A**) | ✅ sí (igual) | ✅ el contenido largo ya está en disco, sin conflicto |

> El **chain** sí puede usar `file-only` porque allí ese archivo **es** el mecanismo de traspaso entre pasos (no un segundo archivo redundante). En delegación directa por fase, no.

---

## 008. Decisión abierta — ¿retirar el SDD chain?

**Esto es una decisión de producto del dueño del repo, NO parte del fix de contexto. No borrar como parte de este cambio.**

### Aclaración importante (para no borrar lo que no toca)
El **chain NO es la causa de la fuga de contexto.** Es justo lo contrario: es la única vía que **ya usa `outputMode: file-only` por paso** (`ein-pi/agent/chains/ein-sdd.chain.md:8-87`) y mantiene el contexto plano. La fuga está **solo en la delegación directa fase-por-fase**. "Borrar el chain para arreglar el contexto" sería eliminar precisamente el eficiente.

### La pregunta legítima
Si el fase-por-fase se vuelve igual de eficiente (fix A), ¿el chain sigue aportando algo? Su **único valor propio** es ejecutar el flujo entero **de un tiro, sin paradas intermedias** (`/run-chain ein-sdd -- <task>`; es el fallback documentado en `orchestrator.md:98`). Eso es ortogonal a la eficiencia de contexto.

### Pros / contras de retirarlo
- **A favor de retirar:** menos superficie que mantener; una sola vía canónica (fase-por-fase); el propio `orchestrator.md:98` ya dice "Prefer the phase-by-phase loop — the chain has no mid-flow gate".
- **En contra de retirar:** se pierde el fallback de "flujo completo en una llamada" (útil para scripts/`/run-chain` o para quien no quiere gates); y el chain es la **implementación de referencia de `file-only` bien hecho** — borrarlo elimina ese ejemplo.

### Recomendación
Desacoplar esta decisión del trabajo de dieta de contexto. Hacer primero A + B (§004), medir, y **luego** decidir sobre el chain por separado. Si se retira: quitar `ein-pi/agent/chains/ein-sdd.chain.md`, las referencias en `orchestrator.md:98` y `/run-chain ein-sdd`, y los tests que lo cubran (`tests/sdd-flow-contract.test.ts` valida router/chain — revisar antes).

---

## 006. Referencias de código (para verificación independiente)

- `pi-subagents/src/runs/background/subagent-runner.ts:791` — `getFinalOutput(messages)` (el envelope = último mensaje del hijo).
- `.../subagent-runner.ts:1378` — `rawOutput = finalResult.finalOutput`.
- `.../subagent-runner.ts:1414-1426` — `evaluateAcceptance` re-evalúa desde `fileOutput` (artefacto en disco), no desde el envelope.
- `pi-subagents/src/runs/shared/single-output.ts:211-234` — `finalizeSingleOutput`; `file-only`→puntero, resto→`fullOutput` inline.
- `pi-subagents/src/shared/types.ts:1510` — `DEFAULT_MAX_OUTPUT = { bytes: 200*1024, lines: 5000 }`.
- `ein-pi/agent/assets/orchestrator.md:88` — regla de "no pasar `output`/`outputMode`" en delegación directa (origen del modo inline).
- `ein-pi/agent/assets/orchestrator.md:94` — doctrina "resuming is free / no re-reading" (que en la práctica se incumple → causa #2).
- `ein-pi/agent/chains/ein-sdd.chain.md:8-87` — el **chain** SÍ usa `outputMode: file-only` por paso (contraste: ahí el retorno es un puntero; el problema solo aparece en la delegación **directa** por fase).
- `ein-pi/core/agents/sdd-*.md`, `ein-pi/core/agents/ein-git.md` — contratos de output a adelgazar (fix A).
- `.pi-subagents/artifacts/*_output.md` — evidencia de tamaños de envelope reales.
