# SDD Verify: ein-linear-known-ids-budget

## // 000. RESUMEN

Verificación final post-regex-fix del change `ein-linear-known-ids-budget`. Los tests de contrato pasan en su totalidad (19/19 para `ein-linear-budget.test.ts`, 49/49 en la suite completa). El typecheck del installer también pasa. Los archivos de contrato (`ein-linear.md`, `orchestrator.md`) reflejan correctamente las 5 tareas implementadas. Ningún archivo externo al scope fue modificado.

---

## // 001. RESULTADO

- **Estado:** Passed
- **Cambio:** `ein-linear-known-ids-budget`
- **Tests ein-linear-budget.test.ts:** 19 pass, 0 fail
- **Tests suite completa (6 archivos):** 49 pass, 0 fail
- **Typecheck installer:** Passed

---

## // 002. COMANDOS Y CHECKS

### `bun test tests/ein-linear-budget.test.ts`

**Resultado:** Passed (19 pass, 0 fail)

**Que comprueba:** Tests de contrato que leen `ein-linear.md` y `orchestrator.md` como strings y verifican patrones con regex. Son guardrails permanentes contra ediciones accidentales del contrato. Verifica:
- Frontmatter tools: sin `bash`, `read`, `grep`, `glob`, `write`, `edit`; solo `linear_*`
- Known Issue IDs Mode: sección presente, `max 4 per issue`, `+ 2 overhead`, `no_shell`, `no_discovery`, `no_broad_search`
- Pragmatic state resolution: sin regla rígida UUID; sí contiene fallback y stop-on-error
- LINEAR OPERATION PACKET: sección presente con `mode: known_ids`, constraints

**Por que importa:** Si alguien edita `ein-linear.md` y elimina el Known Issue IDs Mode o restaura `bash` en tools, estos tests deben fallar. Actúan como guardrails permanentes.

**Si falla, que suele significar:** Una edición accidental violó el contrato. Debug: verificar cual test falla y сравнить con el contenido original del archivo.

**Nota sobre regex fix:** Los patrones fueron corregidos para usar flag `i` (case-insensitive). Por ejemplo, el patrón de `no_discovery` ahora es `/no_discovery|no.*discovery|do\s+not.*(?:discovery|list)/i` — captura tanto `no discovery` como `Do NOT... discovery` sin importar mayúsculas/minúsculas.

---

### `bun test tests/ein-linear-budget.test.ts tests/sdd-scope-packet.test.ts tests/sdd-chain-failsafe.test.ts tests/orchestrator-scope-gate.test.ts tests/sdd-init-budget.test.ts tests/legacy-paths-veto.test.ts`

**Resultado:** Passed (49 pass, 0 fail en 6 archivos)

**Que comprueba:** Suite completa de 6 archivos de tests de contrato. Los otros 5 archivos no fueron tocados por este change y siguen pasando.

**Por que importa:** Confirma que el regex fix no rompió tests preexistentes.

---

### `cd installer && bun run typecheck`

**Resultado:** Passed (sin output = sin errores)

**Que comprueba:** TypeScript compiler (`tsc --noEmit`) corre sin errores en el installer. Verifica que cambios en `ein-pi/agent/` no afectan al typecheck del installer.

**Por que importa:** El installer es la pieza que se deploya a `~/.pi/agent`. Si tiene errores de tipos, el deployment fallaría.

**Si falla, que suele significar:** Dependencies desincronizadas o errores de tipo en el codigo del installer. Solución: `cd installer && bun install && bun run build:all`.

---

## // 003. CONFIRMACIONES DE ARCHIVOS NO TOCADOS

### `ein-skill-registry.ts` / skill injection

**Estado:** Confirmado no tocado

**Explicacion:** El archivo existe en `ein-pi/agent/extensions/ein-skill-registry.ts`. `git diff` no muestra cambios. Este archivo es el registry de skills del agente y no tiene relación con los cambios del contrato de Linear.

---

### `~/.pi/agent` no tocado

**Estado:** Confirmado no tocado

**Explicacion:** `~/.pi/agent` existe con fecha de modificación Jun 19 18:09. Git status no reporta cambios en ningún archivo bajo esa ruta. SDD `config.md` indica explícitamente que `~/.pi/agent` es el destino deployado y no debe tocarse desde el workspace. Los cambios solo viven en el workspace (`ein-pi/agent/`, `tests/`).

---

### git status resumido

```
M  ein-pi/agent/agents/ein-linear.md
M  ein-pi/agent/assets/orchestrator.md
?? .sdd/changes/ein-linear-known-ids-budget/
?? tests/ein-linear-budget.test.ts
```

**Solo 4 items:** Los 2 archivos de contrato modificados (ein-linear.md, orchestrator.md), la carpeta SDD del change, y el archivo de tests. Sin sorpresas — ningún archivo fuera del scope.

---

## // 004. CRITERIOS REVISADOS

- [x] `ein-skill-registry.ts` no modificado
- [x] `~/.pi/agent` no modificado
- [x] Git status limpio (solo archivos esperados)
- [x] `cd installer && bun run typecheck` pasa
- [x] Tests ein-linear-budget.test.ts: 19/19 pass
- [x] Suite completa (6 archivos): 49/49 pass
- [x] Todos los tests de contrato de las 5 tareas pasan

---

## // 005. ANALISIS DE CONTRATO CUMPLIDO

### ein-linear.md — herramientas y gates

- ✅ **Tools limpias**: `bash`, `read`, `grep`, `glob`, `write`, `edit`, `linear_viewer` eliminados. Solo quedan 12 `linear_*` tools.
- ✅ **Known Issue IDs Mode**: sección插入ada con trigger, max 4 calls per issue + 2 overhead, recipe determinista, y Forbidden list completa.
- ✅ **Pragmatic state resolution**: Hard Gate #6 reemplazado. Ya no fuerza UUID lookup antes de intentar nombre directo. Contiene fallback y stop-on-error.
- ✅ **Metadata completeness**: actualizada para reflejar `name or UUID per tool schema`.
- ✅ **Recipe determinista**: step 4 actualizado — ya no hace `linear_get_team_states` por defecto.

### orchestrator.md — LINEAR OPERATION PACKET

- ✅ **Sección insertada** después de "Scope Gate Contract" (~línea 125).
- ✅ **Formato textual** con `mode: known_ids`, `issues`, `protected`, `budget`, `constraints` (`no_shell`, `no_discovery`, `no_broad_search`).
- ✅ **Reglas de uso** que activan Known Issue IDs Mode y diferencian de Scope Gate.
- ✅ **Subagent Inventory**: tabla actualizada con tools limpias para `ein-linear`.

---

## // 006. RIESGOS

**No veo bloqueos claros.** El contrato está correctamente implementado, los tests pasan, y no se detectaron efectos secundarios en archivos no relacionados.

---

## // 007. DECISION

**Passed — Verification completa, listo para closure.**

El change `ein-linear-known-ids-budget` implementa correctamente las 5 tareas especificadas:
1. Limpieza de tools (Tarea 1) ✅
2. Pragmatic state resolution替换 stateId gate rígido (Tarea 2) ✅
3. Known Issue IDs Mode (Tarea 3) ✅
4. LINEAR OPERATION PACKET en orchestrator (Tarea 4) ✅
5. Tests de contrato (Tarea 5) ✅

Los tests de contrato actúan como guardrails permanentes. Cualquier futura edición que viole el contrato (por ejemplo, restaurar `bash` en tools o eliminar el Known Issue IDs Mode) será detectada automáticamente.

**No se requiere acción adicional.**
