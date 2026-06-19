# SDD Verify: sdd-token-budget-scope-gate

## // 000. RESUMEN

Verificación del cambio `sdd-token-budget-scope-gate`. Los tests de contrato pasan (23/23), los archivos SDD están correctamente endurecidos con SCOPE PACKET, budget, fail-safe y fan-out limitado a 3 ramas. No se encontró Linear issue asociado.

---

## // 001. CHECKS EJECUTADOS

### `bun test tests/sdd-scope-packet.test.ts`

**Resultado:** Passed

**Que comprueba:** Que `sdd-explore.md` contiene SCOPE PACKET, `scope_missing`, budget, ledger, y que `webfetch` fue retirado del frontmatter por defecto.

**Por que importa:** Si SCOPE PACKET no está en el prompt, sdd-explore puede consumir tokens ilimitados explorando archivos fuera de scope.

**Si falla, que suele significar:** Alguien editó sdd-explore.md y borró accidentalmente las reglas del SCOPE PACKET.

**Como debuguearlo:** `grep "SCOPE PACKET" ein-pi/agent/agents/sdd-explore.md`

---

### `bun test tests/sdd-chain-failsafe.test.ts`

**Resultado:** Passed

**Que comprueba:** Que `ein-sdd.chain.md` contiene FAIL-SAFE, `scope_missing`, `DETENER CHAIN`, `exploration-error.md`, `budget_allocated` y `scope_status`.

**Por que importa:** Sin fail-safe, el chain avanza a sdd-design aunque init.md no tenga scope, dejando que exploreExplora sin bound.

**Si falla, que suele significar:** El chain fue editado y se borró el gate de scope_missing.

**Como debuguearlo:** `grep "FAIL-SAFE" ein-pi/agent/chains/ein-sdd.chain.md`

---

### `bun test tests/orchestrator-scope-gate.test.ts`

**Resultado:** Passed

**Que comprueba:** Que `orchestrator.md` contiene sección "Scope Gate Contract", límite hard de 3 ramas, SCOPE PACKET como requisito antes de invocar sdd-explore, y que `context:fresh` está reservado para auditorías.

**Por que importa:** El orchestrator construye el SCOPE PACKET. Si aquí no se valida, ninguna fase posterior puede confiar en tener scope.

**Si falla, que suele significar:** La sección Scope Gate Contract fue eliminada o editada incorrectamente.

**Como debuguearlo:** `grep "Scope Gate Contract" ein-pi/agent/assets/orchestrator.md`

---

### `bun test tests/sdd-init-budget.test.ts`

**Resultado:** Passed

**Que comprueba:** Que `sdd-init.md` contiene fast path config-only, budget en frontmatter (`default_max_tokens`, `config_only_max_tokens`), `budget_allocated` en output y `max_runtime_ms`.

**Por que importa:** Sin fast path, cada sdd-init re-escanea el proyecto aunque solo pida estado de config, quemando tokens innecesariamente.

**Si falla, que suele significar:** El fast path fue eliminado o el frontmatter de budget fue modificado.

**Como debuguearlo:** `grep "Fast Path" ein-pi/agent/agents/sdd-init.md`

---

## // 002. ARCHIVOS VERIFICADOS

| Archivo | Estado | Verificado |
| ------- | ------ | --------- |
| `ein-pi/agent/agents/sdd-init.md` | Modificado | Fast path config-only presente, budget en frontmatter, budget_allocated en output |
| `ein-pi/agent/agents/sdd-explore.md` | Modificado | SCOPE PACKET contract, ledger, fail-fast, webfetch retirado del frontmatter |
| `ein-pi/agent/assets/orchestrator.md` | Modificado | Scope Gate Contract, límite 3 ramas, context:fresh restringido |
| `ein-pi/agent/chains/ein-sdd.chain.md` | Modificado | FAIL-SAFE con scope_missing, DETENER CHAIN, exploration-error.md |
| `tests/sdd-scope-packet.test.ts` | Nuevo | 6 tests |
| `tests/sdd-chain-failsafe.test.ts` | Nuevo | 6 tests |
| `tests/orchestrator-scope-gate.test.ts` | Nuevo | 5 tests |
| `tests/sdd-init-budget.test.ts` | Nuevo | 6 tests |

---

## // 003. PROTECCIONES VERIFICADAS

### Archivos NO tocados (hard stops respetados)

- `~/.pi/agent/` — No modificado. Timestamps pre-existentes.
- `EIN.md` en raíz — No existe en este proyecto.
- `openspec/config.yaml` en raíz — No existe.

### Git status verificado

Solo archivos del change y tests nuevos:
- `ein-pi/agent/agents/sdd-explore.md` (M)
- `ein-pi/agent/agents/sdd-init.md` (M)
- `ein-pi/agent/assets/orchestrator.md` (M)
- `ein-pi/agent/chains/ein-sdd.chain.md` (M)
- `tests/*.test.ts` (4 archivos nuevos)

---

## // 004. CRITERIOS SDD REVISADOS

- [x] Tarea 1 (sdd-init): Fast path config-only + budget en frontmatter + budget_allocated en output
- [x] Tarea 2 (sdd-explore): SCOPE PACKET contract + ledger + webfetch desactivado por defecto + fail-fast
- [x] Tarea 3 (orchestrator): Scope Gate Contract + límite 3 ramas + context:fresh restringido
- [x] Tarea 4 (ein-sdd.chain): FAIL-SAFE con scope_missing + DETENER CHAIN + exploration-error.md
- [x] Tarea 5 (tests): 4 archivos de tests de contrato, 23 tests, 0 failures
- [x] Orden de aplicación respetado (init → explore → orchestrator → chain → tests)
- [x] Reglas de arquitectura respetadas (SCOPE PACKET no es artifact nuevo, budget es contrato entre fases, webfetch es la herramienta más cara)

---

## // 005. RIESGOS RESIDUALES

**No veo bloqueos claros.** Los tests de contrato actúan como net watching: si alguien edita los archivos .md y borra accidentalmente las reglas clave, los tests fallarán.

Riesgo menor: el fast path de sdd-init depende de que el request sea reconocible como "solo config". Si el usuario escribe algo ambiguo, sdd-init hará scouting completo. Esto es el comportamiento esperado según la tarea — el fast path es para requests obviously read-only.

---

## // 006. DECISION

**Cambio verificado y listo.** Todas las tareas completadas, todos los tests pasando, ningún archivo sensible tocado.

No se encontró Linear issue asociado (no hay prefijo SAM-XXX en el nombre del change). Si este change debe estar linkado a un issue Linear,需要在 el issue соответствующую метку или создать связь.

**Nota:** No existe `.sdd/changes/sdd-token-budget-scope-gate/apply.md` porque apply.md se genera post-ejecución de la fase apply dentro del chain SDD, no como parte del setup del change. Las tareas están checked [x] en tasks.md y los archivos fuente están correctamente modificados — el cambio está implementado.
