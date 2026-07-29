## // 000. RESUMEN

Corrección de documentación contractual: el prompt de `sdd-apply` ahora refleja fielmente el default de runtime `acceptance: none`. El trabajo normal de apply no requiere ni emite `acceptance-report`; `acceptance: verified` se mantiene como vía excepcional con re-ejecución fresca y evidencia obligatoria; `sdd-verify` conserva su autoridad independiente como gate final de comportamiento y frescura.

## // 001. QUÉ CAMBIÓ

- **`ein-pi/core/agents/sdd-apply.md`** (+12/−4): Reescrita la sección `## Runtime Acceptance Verification` — distingue el path normal (`acceptance: none`, sin informe) del override excepcional (`acceptance: verified`, re-ejecución del runner, evidencia en cercado, rechazo ante fallo). Conserva `sdd-verify` como gate independiente y de frescura.
- **`tests/sdd-phase-runtime-contract.test.ts`** (+14/−4): Reemplazada la aserción de fragmento universal por 8 marcadores semánticos sobre el slice `[## Runtime Acceptance Verification .. ## Ad-hoc apply]` que cubren ambos modos, el comportamiento de fallo bloqueado, y la autoridad final de `sdd-verify`.

## // 002. CÓMO FUNCIONA POR DENTRO

**El contrato de aceptación tiene dos ramas, nunca una sola:**

| Rama | Cuándo se activa | Qué exige |
|---|---|---|
| `acceptance: none` | Delegaciones `sdd-apply` sin override explícito (inyectado por `ensureApplyAcceptance()` en `ein-pi/agent/lib/sdd-preflight.ts`) | Ningún `acceptance-report`; apply reporta solo sus artefactos ordinarios y envelope |
| `acceptance: verified` | Override explícito en la delegación (`acceptance: { level: "verified", verify: [...] }`) | Re-ejecución fresca del runner, evidencia honesta en cercado, fallo bloquea/rechaza — no se fabula éxito |

**Cadena de control:**

1. `ein-pi/agent/extensions/ein-ai.ts` — hook `tool_call` para `subagent` invoca `ensureApplyAcceptance()` antes de delegar.
2. `ein-pi/agent/lib/sdd-preflight.ts` — `ensureApplyAcceptance()` inyecta `level: "none"` solo para `sdd-apply` directo sin `acceptance` y preserva cualquier valor explícito.
3. `ein-pi/core/agents/sdd-apply.md` — ahora dice: "normal → none, sin informe" y "explícito → verified, con evidencia y runner fresco".
4. `tests/sdd-phase-runtime-contract.test.ts` — aserciones semánticas sobre el prompt para detectar deriva en cualquier dirección.
5. `tests/sdd-cost-block-e.test.ts` — unit test directo: `acceptance` omitido → `none` (E1 pas), override explícito preservado (E1 pas).
6. `sdd-verify` — sigue siendo el gate independiente final y autoridad de frescura tras apply, sin importar la rama usada.

**Lo que NO cambió:** runtime de inyección (`ensureApplyAcceptance`), orquestador (`orchestrator.md`), cobertura de planning, higiene de build, o cualquier comportamiento de `sdd-verify`/close/frescura.

## // 003. DECISIONES

1. **Documentación y regresión, no runtime.** `ensureApplyAcceptance()` ya implementaba el comportamiento solicitado. El defecto era deriva contractual en el prompt, no un bug de normalización. Cambiar el runtime habría ampliado el radio de explosión sin necesidad.

2. **Dos modos explícitos en el prompt, no ninguno completo.** Eliminar toda referencia a `acceptance-report` habría borrado la obligación de evidencia para `verified`. Mantener ambas ramas preserva la separación de concerns: apply executor reporta por modo; runner re-ejecuta para `verified`; `sdd-verify` owns verificación final y frescura.

3. **Aserciones semánticas sobre fragmentos.** En lugar de buscar la cadena `acceptance-report` en cualquier parte, el test slicea entre los dos H2 estables y corre 8 marcadores. Esto detecta deriva en ambas direcciones (promedio universal o pérdida del override excepcional) y no degrada silenciosamente si cambia el wording menor.

4. **Orquestador como superficie de validación, no de edición.** Ya describe `none` como default, `verified` como override excepcional, y `sdd-verify` como gate dedicado. No se encontró contradicción semántica que justificara cambiarlo.

**Alternativas descartadas:** cambiar runtime de normalización (ya correcto); borrar toda referencia a informe (rompe `verified`); hacer que apply acceptance sea el gate final (viola separación de ciclo de vida); agregar schema/helper compartido (sobreingeniería para corrección de prompt).

## // 004. VERIFICACIÓN

**Comando ejecutado:**
```bash
timeout 120 bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts
```

**Resultado: 54 pass, 0 fail, 135 expect() calls, 58 ms.**

Destacados relevantes:
- `tests/sdd-phase-runtime-contract.test.ts > P3 > sdd-apply distingue none normal de verified explícito y conserva sdd-verify` — 8 expect() calls, PASS. Cubre: default none, sin claim de informe, verified explícito con runner fresco, evidencia cercada, fallo bloqueado, y `sdd-verify` como gate final y de frescura.
- `tests/sdd-cost-block-e.test.ts > E1 — ensureApplyAcceptance > una delegación sdd-apply sin acceptance → none` — PASS (inyección probada).
- `tests/sdd-cost-block-e.test.ts > E1 — ensureApplyAcceptance > respeta un acceptance explícito (p.ej. verified)` — PASS (override preservado).
- Tests de planning y build-hygiene — PASS, no regresión.

**Cobertura de comportamiento:**
- Rama `none` (runtime-inyectado, sin informe): prompt + unit runtime ✓
- Rama `verified` (override explícito, runner fresco, evidencia): prompt (4/8 expect) ✓
- Autoridad final de `sdd-verify`: prompt + orquestador ✓

**Dif sobre paths en-scope:** `git diff --check` — clean (sin advertencias de whitespace o conflicto en ambos archivos).

## // 005. PENDIENTE / RIESGOS

- **Acoplamiento de bounds del slice en el test:** el test de contrato de prompt acopla los límites del slice a los H2 `## Runtime Acceptance Verification` y `## Ad-hoc apply` adyacentes. Si se renombran, el test lanza en `indexOf` en lugar de degradar silenciosamente — modo de fallo honesto, pero acoplamiento a rastrear en reestructuraciones futuras.
- **Deriva futura:** el riesgo residual identificado en scope.md (prompts y runtime pueden volver a divergir si los tests assertúan fragmentos independientes) se mitiga con las aserciones semánticas de 8 marcadores sobre un slice estable. Re-volatilizar los bounds del slice o agregar aserciones tautológicas lo restauraría.
- **Ninguno restante:** no quedan tareas según `apply-progress.md`; los tests cubren ambos modos; `sdd-verify` retiene autoridad; el change-local spec delta está alineado con el diseño.
