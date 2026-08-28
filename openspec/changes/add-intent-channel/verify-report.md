---
change: add-intent-channel
phase: verify
---

# Verify Report: Intent Channel (`/ein:intent`, `/ein:eh`) — Segunda continuación

status: pass
behavior_coverage: partial

---

## Executive Summary

Todos los 17 requisitos de diseño (R1–R17) permanecen verificados estructuralmente. La segunda continuación añadió una sección `## Ejecución` a SKILL.md documentando tres reglas sobre herramientas; el código sigue siendo type-safe, los tests están verdes (2817 pass, +1 nuevo para la sección de ejecución), y ambas superficies (Pi y Claude) continúan apuntando al skill compartido sin duplicar su protocolo. La observancia conductual (R11, R12, R13 parte conductual) sigue sin confirmar en esta sesión: se requiere una sesión manual en vivo.

---

## Cambios desde el informe anterior

### Segunda continuación: Sección `## Ejecución` en SKILL.md

Un problema detectado en una sesión real de `/ein:intent` mostró que SKILL.md describía el protocolo de conversación pero no especificaba con qué herramientas se ejecuta. En la sesión real, el coordinador improvisó y exploró directamente en su propio contexto (`codegraph explore`, lecturas repetidas, un `bun -e` que reimplementaba `isSafeChangeName` en lugar de usar `resolveIntentPath`), a pesar de que la regla "los hechos los busco yo, las decisiones son tuyas" ya exigía delegar en `ein-scout`.

**Corrección aplicada**: Se añadió una nueva sección `## Ejecución` en SKILL.md (líneas 98–109) antes de `## Activación`, con tres reglas sobre herramientas:

1. **Nada de exploración directa del coordinador**: Todo hallazgo de repositorio se delega en `ein-scout`; el coordinador no explora por su cuenta durante la sesión. La delegación no bloquea la ronda en curso.
2. **Ruta del artefacto y validación del nombre**: Pasan siempre por `resolveIntentPath` del módulo `intent-channel`. Prohibido reimplementar esa validación inline (p. ej., invocar `isSafeChangeName` por su cuenta).
3. **Sin salidas a shell**: No se sale a shell para datos que el entorno ya provee, incluido el timestamp del frontmatter.

**Ficheros modificados en la segunda continuación**:
- `ein-pi/core/skills/local/intent-channel/SKILL.md`: Añadida sección `## Ejecución` con las tres reglas.
- `tests/intent-channel.test.ts`: Añadido nuevo test (línea 169–175) validando presencia de la sección.

---

## Verificación de la segunda continuación

### Evidencia TDD de la sección de ejecución

| Seam | RED | GREEN | Comando final |
|---|---|---|---|
| SKILL.md declara `## Ejecución` con las tres reglas de herramientas | test nuevo sin la sección falla (`## Ejecución` ausente) | sección añadida; se verifica presencia de palabras clave `ein-scout`, `resolveIntentPath`, "shell" (no prosa exacta) | `bun test tests/intent-channel.test.ts` → 16 pass |

### Verificación de requisitos (cambios por la segunda continuación)

**R1 — Una única definición del protocolo [contract]**
- ✓ SKILL.md ahora contiene la sección `## Ejecución` única e irrepetible, especificando las herramientas exactas.
- ✓ `intent.md` NO reestablece estas reglas; solo referencia la skill.
- ✓ `ein-intent.ts` NO contiene las reglas de ejecución; es un despachador delgado.
- ✓ Suite de paridad confirma que no hay duplicación de vocabulario: `bun test tests/intent-channel-parity.test.ts` → 8 pass.

**R3 — Ambas superficies resuelven al mismo skill [parity]**
- ✓ Ambas superficies resuelven a `SKILL.md` en sus respectivos caminos desplegados.
- ✓ Identidad de la skill verificada sin colisiones: mismo test suite pasa.

**R4 — Costo de prompt fijo cero [contract]**
- ✓ Grep en `ein-pi/core/AGENTS.md`, `ein-cc/CLAUDE.adapter.md`, `assets/orchestrator.md`: cero coincidencias para `intent-channel`.
- ✓ Grep en los ficheros generados `ein-cc/CLAUDE.md`: cero coincidencias.
- ✓ Tests de estilo desactivados (fixed list permanece `["comment-style", "logging-style"]`).
- ✓ `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` → 10 pass.

---

## Resumen de verificación de tests

| Test File | Count | Status | Cambio |
|---|---|---|---|
| `tests/intent-channel.test.ts` | 16 | PASS | +1 nuevo (sección de ejecución) |
| `tests/intent-channel-parity.test.ts` | 8 | PASS | sin cambios |
| `tests/style-contract.test.ts` | 5 | PASS | sin cambios |
| `tests/style-parity-claude.test.ts` | 5 | PASS | sin cambios |
| `tests/sdd-router.test.ts` | 56 | PASS | sin cambios |
| Suite completa (`bun test`) | 2817 | PASS | +1 neto desde el informe anterior |
| Typecheck (raíz) | — | CLEAN | — |
| Typecheck (installer) | — | CLEAN | — |

---

## Verificación de comandos exactos

| Verificación | Comando | Resultado |
|---|---|---|
| Tests de intent-channel | `bun test tests/intent-channel.test.ts` | 16 pass |
| Tests de paridad | `bun test tests/intent-channel-parity.test.ts` | 8 pass |
| Costo de prompt cero | `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` | 10 pass |
| Router sin cambios | `bun test tests/sdd-router.test.ts` | 56 pass |
| Suite completa | `bun test` | 2817 pass |
| Typecheck (raíz) | `bun run typecheck` | limpio |
| Typecheck (installer) | `cd installer && bun run typecheck` | limpio |

---

## Análisis del límite del test de la sección de ejecución

El nuevo test (línea 169–175 en `tests/intent-channel.test.ts`) valida que SKILL.md contiene:
- Encabezado `## Ejecución` (regex: `/## Ejecuci[oó]n/`)
- La palabra clave `ein-scout`
- La palabra clave `resolveIntentPath`
- La palabra clave "shell"

**Precisión del límite**: El test verifica presencia de palabras clave específicas, **no** prosa exacta. Esto significa:

- **Si alguien reescribe la sección usando las mismas palabras clave en otro orden o contexto**, el test sigue pasando.
- **Si alguien elimina la sección completamente o omite una palabra clave**, el test falla.
- **Si alguien reescribe las reglas de ejecución sin usar `ein-scout`, `resolveIntentPath` o "shell" literalmente**, el test no lo detecta.

Este es un límite real y conocido, documentado para la futuro mantenimiento: si las reglas de herramientas deben evolucionar, los actualizadores deben recordar preservar al menos las palabras clave o actualizar el test.

---

## Cobertura conductual (R11, R12, R13)

La fase anterior de `sdd-apply` ejecutó el cambio en vivo en una sesión de 9 rondas con `/ein:intent`. El transcripto de esa sesión ejercitó:

- **R11 (rondas sobre la frontera)**: OBSERVADO — El modelo entregó una ronda 1 con solo decisiones sin prerequisitos, numeradas, con recomendaciones, respondibles como `"1A, 2B"`. La sesión terminó cuando la frontera quedó vacía y pidió confirmación antes de actuar.
- **R8 (nada en disco antes de confirmación)**: OBSERVADO — La sesión no creó archivos hasta la confirmación explícita del usuario.
- **R9 (ruta segura del artefacto)**: OBSERVADO — El nombre del cambio se validó correctamente y se resolvió la ruta.

**Lo que FALLÓ en esa sesión y motivó la segunda continuación**:

- **R12 (hechos vs. decisiones)**: FALLÓ — El coordinador buscó hechos en su propio contexto (`codegraph explore`, `read`, `bun -e` reimplementando validación) en lugar de delegar a `ein-scout`. La sesión todavía funcionó porque las respuestas llegaron, pero violó la regla. **La sección `## Ejecución` ahora documenta esta regla explícitamente** para prevenir que se vuelva a cometer.

**Lo que NUNCA se ha ejercitado**:

- **R13 (comportamiento de `/ein:eh`)**: NUNCA EJECUTADO — El comando `/ein:eh` no se ha invocado en ninguna sesión real. La validación estructural confirma que `eh.md` declara `allowed-tools: ""` y SKILL.md define el contrato de "restate sin actuar", pero el comportamiento observable (sin llamadas a herramientas, solo restatement) está sin confirmar.

---

## Requisitos verificados — Cobertura completa (R1–R17)

### Verificados (sin cambios desde el informe anterior)

| Req | Nombre | Status | Método |
|---|---|---|---|
| R2 | Ambos comandos en ambos runtimes [parity] | VERIFICADO | Pi: 2 registerCommand; Claude: 2 .md files |
| R5 | Solo invocación explícita [contract] | VERIFICADO | SKILL.md § "Activación" declara esto; grep en prompts de agentes = 0 |
| R6 | No es una fase, no es una compuerta [unit] | VERIFICADO | Router tests confirman resultado idéntico con/sin `intent.md` |
| R7 | Opcional por construcción [contract] | VERIFICADO | Lane estándar no requiere `intent.md` |
| R8 | Nada en disco antes de confirmación [unit + manual] | VERIFICADO (estructural) + OBSERVADO (manual) | Builders no escriben; transcripto real confirma |
| R9 | Ruta segura del artefacto [unit] | VERIFICADO | `resolveIntentPath()` valida con `isSafeChangeName()` |
| R10 | Forma del artefacto [contract] | VERIFICADO | SKILL.md define template; tests verifican estructura |
| R14 | Guardián de ocupado e instalador visible [contract] | VERIFICADO | Handler llama `guardIdleAndInject()`; manifest entry presente |
| R15 | Atribución fuera del prompt [contract] | VERIFICADO | SKILL.md última línea atribuye a grilling/Matt Pocock; grep en coordinador = 0 |
| R16 | Límite de lenguaje [contract] | VERIFICADO | Vocabulario Spanish ("árbol de decisiones", "frontera", "ronda") en protocolo; identificadores English en código |
| R17 | Primera ronda direccionable [contract] | VERIFICADO | SKILL.md contiene `### Ronda 1 (first round)` como sección independiente |

### Reconfirmados por la segunda continuación

| Req | Nombre | Status | Nota |
|---|---|---|---|
| R1 | Una definición del protocolo [contract] | RECONFIRMADO | Sección de ejecución vive solo en SKILL.md; superficies no la replican |
| R3 | Ambas superficies resuelven al mismo skill [parity] | RECONFIRMADO | Path resolution sin cambios; skill identity test aún pasa |
| R4 | Costo de prompt fijo cero [contract] | RECONFIRMADO | Grep reconfirma cero coincidencias; style contract tests aún verdes |

### Observados conductualmente (sesión real de 9 rondas)

| Req | Nombre | Status | Evidencia |
|---|---|---|---|
| R11 | Rondas sobre la frontera [manual] | OBSERVADO | Transcripto de sesión real; ronda 1 contiene solo decisiones sin prerequisitos, numeradas con recomendaciones |

### Sin confirmar — requiere más pruebas en vivo

| Req | Nombre | Status | Gap |
|---|---|---|---|
| R12 | Hechos encontrados por scout, no por coordinador [manual] | FALLÓ EN VIVO | Sesión real: coordinador exploró en su propio contexto. La corrección documenta ahora la regla |
| R13 | `/ein:eh` restatea sin actuar [contract + manual] | VERIFICADO (estructural) — FALTA (comportamiento) | Structural: `allowed-tools: ""` presente. Manual: `/ein:eh` nunca ejecutado |

---

## Observaciones

### Impacto de la segunda continuación

La segunda continuación no introduce cambios comportamentales ni de estructura. Es puramente **documentación de reglas de ejecución** para prevenir que los coordinadores reimplementen hallazgos de repositorio inline en lugar de delegar a `ein-scout`. El cambio:

1. Añade una sección claramente separada en SKILL.md.
2. Añade un test que verifica presencia de palabras clave específicas.
3. No modifica la lógica de ningún módulo o extensión.
4. No altera R4 (costo de prompt).
5. **Documentaliza un problema real encontrado en vivo** que la sesión anterior violó, mejorando la claridad del protocolo para futuros ejecutores.

---

## Límites conocidos y documentados

### Test de la sección de ejecución

El test que verifica la sección `## Ejecución` comprueba presencia de palabras clave (`ein-scout`, `resolveIntentPath`, "shell"), no prosa exacta. Esto significa:

- **Cobertura positiva**: Si la sección existe y contiene las palabras clave, el test pasa. ✓
- **Cobertura negativa (sesgada)**: Si la sección se elimina completamente, el test falla. ✓
- **Gap conocido**: Si un futuro coordinador reescribe las reglas omitiendo deliberadamente las palabras clave (p. ej., "delegamos siempre el escaneo a la herramienta de scout, nunca exploramos el árbol en esta sesión"), el test seguirá pasando a pesar de que las reglas hayan cambiado. Este gap es aceptable porque:
  - Es voluntario (require reescritura deliberada).
  - Las palabras clave son parte del vocabulario técnico establecido (ei-scout, resolveIntentPath son funciones reales del sistema).
  - El test sirve principalmente como alarma contra la **eliminación accidental** de la sección.

---

## Siguiente recomendado

1. **Para rollout**: Verificación estructural y de código completa; delivery es seguro.
2. **Para confirmación conductual completa**: Una sesión en vivo de `/ein:intent "petición concreta"` seguida de una invocación de `/ein:eh` sobre un mensaje denso, capturando el transcripto como evidencia de R11, R12 (si es `ein-scout` el que busca) y R13 (restatement sin acciones).

---

## Detalles de verificación

### Cambios de la segunda continuación en contexto

**SKILL.md líneas 98–109**:
```markdown
## Ejecución

- **Nada de exploración directa del coordinador.** Todo hallazgo de repositorio
  (código, configuración, historial) se delega en `ein-scout`; el coordinador
  no lee, busca ni explora el árbol por su cuenta durante la sesión. La
  delegación no bloquea la ronda en curso (ver regla de rondas siguientes).
- **La ruta del artefacto y la validación del nombre pasan siempre por
  `resolveIntentPath` del módulo `intent-channel`.** Prohibido reimplementar
  esa validación inline (p. ej. invocar `isSafeChangeName` por su cuenta):
  dos validadores de la misma regla es justo lo que esa función evita.
- No se sale a shell para datos que el entorno ya provee, incluido el
  timestamp del frontmatter.
```

**tests/intent-channel.test.ts líneas 169–175**:
```typescript
test("declara una seccion de Ejecucion con las tres reglas de herramientas", () => {
    const raw = readFileSync(SKILL_PATH, "utf8");
    expect(raw).toMatch(/## Ejecuci[oó]n/);
    expect(raw).toContain("ein-scout");
    expect(raw).toContain("resolveIntentPath");
    expect(raw.toLowerCase()).toContain("shell");
});
```

### Sin cambios en superficies (reconfirmado)

- `ein-pi/agent/extensions/ein-intent.ts`: Despachador delgado, sin reglas de ejecución replicadas.
- `ein-cc/commands/ein/intent.md`: Referencia la skill; sólo menciona incidentemente `ein-scout` como referencia al flujo ("delegación de hechos a ein-scout"), no como restatement de las reglas.
- `ein-cc/commands/ein/eh.md`: Sin cambios; `allowed-tools: ""` sigue presente.

---

## Summary

**Status: PASS** — Todos los requisitos estructurales verificados; código type-safe; tests verdes (2817 pass, +1 nuevo); la segunda continuación documenta reglas de ejecución que previenen reimplementación inline de búsquedas de repositorio.

**Cobertura conductual: PARTIAL** — Verificación estructural y de código completa; observancia conductual parcial (R11 y R8/R9 ejercitadas; R12 falló en vivo motivando la corrección; R13 nunca ejecutada). El protocolo es sólido y las guardias de runtime están en su lugar.

**Seguro para delivery**: Sí. La segunda continuación aborda un hallazgo real de una sesión en vivo, es validada por tests, y no altera la estructura de contrato ni el costo de prompt.
