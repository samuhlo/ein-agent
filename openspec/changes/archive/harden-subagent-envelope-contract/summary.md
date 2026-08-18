# Summary: harden-subagent-envelope-contract

## // 000. RESUMEN

Dos piezas para cerrar un patrón de fallos: la regla del envelope de subagente escrita,
protegida por test e imposible de romper en silencio; y un canal determinista para persistir
`summary.md` en `sdd-close` bajo Claude, que no depende de que el modelo venza su propia
política.

## // 001. QUÉ CAMBIÓ

**Pieza 1 — guardarraíl del envelope**
- `ein-pi/agent/lib/subagent-envelope-contract.ts` (nuevo): regla en cabecera (MUST/SHOULD/MAY
  por modo de fallo), inventario de los 4 consumidores del handler `pi.on("tool_result")` y
  funciones puras de auditoría.
- `tests/subagent-envelope-contract.test.ts` (nuevo): 8 tests que se ponen ROJO si alguien
  añade un consumidor sin declararlo, o si desaparece una protección declarada.
- `openspec/specs/surface-wiring/spec.md`: 5 escenarios nuevos (R1–R5) con la asimetría
  Pi/Claude declarada.

**Pieza 2 — canal determinista para `summary.md`**
- `ein-pi/agent/lib/sdd-summary-write.ts` (nuevo): `writeSddSummary({ cwd, change, content })`
  rechaza change inexistente, nombre inseguro y contenido vacío; escribe en la ruta computada.
- `cc-ein/sdd-cli/cli.ts`: subcomando `summary` y su dispatch, espejo de `runDeltaCommand`.
- `ein-pi/agent/lib/sdd-remedies.ts`: rama que nombra `cc-ein-sdd summary <change>` en la
  salida de `status` cuando el runtime es Claude y la fase siguiente es `close`.
- `ein-pi/core/agents/sdd-close.md`: `tools: read, grep, find, write, bash` (+6 bytes;
  presupuesto 83.047/83.053).
- `ein-pi/agent/assets/orchestrator.md`: sincronización de la tabla de tools.

## // 002. CÓMO FUNCIONA POR DENTRO

**Guardarraíl.** El arnés asumía que el resultado vuelve en el mismo `tool_call` que lo lanzó;
`pi-subagents` corre async por defecto y rompe esa premisa. Dos consumidores
(`completeSddParticipantCall`, `acceptTrackedScoutResult`) necesitan foreground forzado y ya lo
tienen (`ensureParticipantForeground` y el normalizador del scout), pero la regla que lo
sostiene no estaba escrita. El módulo nuevo declara los cuatro consumidores clasificados por
modo de fallo y el test escanea el handler real comparando conjuntos: si aparece un quinto, el
test falla nombrando exactamente qué declarar. La triangulación —insertar un consumidor
ficticio, ver el test rojo, revertir— verifica que el guardarraíl muerde de verdad.

**Canal de persistencia.** `sdd-close` en Claude no puede usar `Write` para su propio artefacto
(el modelo lo rechaza por política). El precedente `cc-ein-sdd delta` resolvió esta misma clase
de fallo con un subcomando que lee de stdin, y aquí se replica: `writeSddSummary` valida la ruta
y rechaza lo inseguro, `runSummaryCommand` lo invoca sin depender de la iniciativa del agente, y
`sdd-remedies.ts` lo nombra en `status` solo cuando hace falta.

## // 003. DECISIONES

1. **Dónde vive el enunciado**: en el módulo que lo implementa, con el spec como respaldo. El
   test no pasa hasta declarar el consumidor nuevo, así que el fichero de la regla es el que hay
   que abrir. Descartados el prompt (presupuesto) y un catálogo nuevo (`// 008`).
2. **Eje de clasificación por MODO DE FALLO**, no por "consume envelope": dos consumidores no
   necesitan protección porque su fallo degrada a no-op. Sin ese eje, el guardarraíl obligaría a
   proteger lo que no lo necesita.
3. **La indicación del CLI va calculada desde el estado** (`sdd-remedies.ts`), no como prosa fija
   pagada en cada sesión.
4. **Sin tool de Pi nueva**: para `summary.md` no existe la prohibición que sí obligaba en el
   caso del delta. Menor cambio correcto.

## // 004. VERIFICACIÓN

- `bun test` completo: 2264 pass / 0 fail (2248 previos + 16 nuevos). `tsc --noEmit` limpio.
- `tests/prompt-budget.test.ts` verde: los 6 bytes de `, bash` entraron con margen.
- `tests/agent-tools-contract.test.ts` verde tras sincronizar la tabla del orquestador.
- Triangulación de la Pieza 1: consumidor ficticio insertado → test ROJO nombrando el id no
  declarado → revertido → verde.
- `cc-ein-sdd check`: 0 errores.

## // 005. PENDIENTE / RIESGOS

1. **La Pieza 2 NO cierra el fallo.** Que el modelo invoque el CLI en vez de rehusarse no es
   determinista ni comprobable por test. Lo garantizado es que la negativa a `Write` deja de ser
   TERMINAL: existe un canal que no depende de la iniciativa del agente. La verificación real es
   empírica y está pendiente.
2. **La primera versión del diseño era falsa.** Concluyó que `ensureParticipantForeground` no
   existía y que el cambio anterior declaraba código inexistente. El código estaba en un `git
   stash`; se recuperó y verificó. Queda escrito porque commitear artefactos SDD sin el código
   que documentan es un modo de fallo real que casi provoca rehacer trabajo bueno.
3. **Presupuesto de `core/agents/*.md` a 6 bytes del techo** (83.047/83.053). El próximo cambio a
   esos prompts tiene que empezar por ahí.
4. **La Pieza 2 no surte efecto hasta reinstalar.** El prompt que carga este runtime
   (`~/.claude-ein/agents/sdd-close.md`) es una copia generada del template del installer y no se
   regenera hasta entonces. Por eso este mismo cierre no pudo usar el canal que construye: el
   agente no tenía la tool. Estará disponible con la 0.73.0.

**Límites declarados, por diseño:** el detector cubre solo `pi.on("tool_result")` de `ein-ai.ts`
—un consumidor cableado por otro hook se escapa—, no hay cobertura en Claude (asimetría
declarada en el spec, no fingida), y la condición de retirada es que, cuando el inventario quede
vacío, el módulo y su test se borran juntos.
