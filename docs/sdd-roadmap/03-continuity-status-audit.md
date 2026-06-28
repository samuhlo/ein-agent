# // 000. Plan: Continuity and Status Audit

**Comando:** `/ein:sdd-status`, `/ein:sdd-audit`, `/ein:status`
**Objetivo:** que cualquier agente, sesion nueva, o el usuario pueda continuar un change sin necesidad de leer todos los artefactos.

---

## // 001. POR QUE

Cuando un change lleva dias o semanas, la memoria de donde se quedo se pierde. El orchestrator usa `ein_sdd_status` (funcion que lee artefactos) pero:

- No muestra que tareas especifica estan pendientes.
- No indica si una tarea tiene bloqueadores.
- No dice cuanto seavio el budget en explore.

Con continuity enriquecido, otra sesion puede llamar `/ein:sdd-status` y saber exactamente que sigue.

---

## // 002. SALIDAS ESPERADAS

### `/ein:sdd-status {change}`

```
## // 000. STATUS — {change}

**Fase actual:** design
**Siguiente:** apply
**Artefactos presentes:** init.md, exploration.md, design.md
**Artefactos faltantes:** tasks.md, apply-progress.md, verify-report.md

**Tareas (3):**
  [1] ready  — Crear endpoint /api/tasks
  [2] ready  — Agregar validacion Zod
  [3] blocked — Depende de SAM-234 (Linear)

**Budget usado:**
  tokens: 12000 / 15000
  reads: 28 / 30
```

### `/ein:sdd-audit {change}`

```
## // 000. AUDIT — {change}

**Consistencia de artefactos:**
  init.md          OK
  exploration.md   OK
  design.md        OK
  tasks.md         FALTANTE
  apply-progress.md FALTANTE

**Señales requeridas:**
  scope:           OK
  budget_allocated: OK (15000 tokens, 30 reads)
  budget_consumed: OK (12000 tokens, 28 reads)
  scope_status:    OK (valid)

**Problemas encontrados:**
  - tasks.md no existe (la fase design aún no se procesó)
  - El change esta fuera de secuencia: design existe pero tasks no
```

### `/ein:status` (comando global)

```
## // 000. EIN STATUS

**Active changes (3):**
  improve-sdd-check-ux      → apply (2/5 tareas ready)
  improve-sdd-status-ux     → design (bloqueado por Linear)
  harden-sdd-apply-state    → verify (listo para cerrar)

**SDD budget global:**
  tokens: 45000 / 60000
  reads: 95 / 120
```

---

## // 003. ARCHIVOS A TOCAR

| Archivo | Cambio |
|---------|--------|
| Funcion `ein_sdd_status` (lib/) | Enriquecer salida con tareas y budget |
| Funcion `ein_sdd_audit` (lib/) | Verificar señales requeridas en cada artefacto |
| `orchestrator.md` | Actualizar documentacion de `/ein:status` si corresponde |
| `sdd-tasks.md` (cuando exista, plan 02) | Leer campo `status` y `blocked_by` para mostrar en status |

---

## // 004. LOGICA REQUERIDA

### `ein_sdd_status`

```
function ein_sdd_status(change: string): StatusReport {
  const artifacts = read_dir(`.sdd/changes/${change}`)
  const phase = infer_phase(artifacts)  // igual que ahora
  const tasks = read_tasks_md(change)   // null si no existe
  const budget = read_ledger(change)    // null si no existe

  return {
    phase,
    nextRecommended: next_phase(phase),
    artifactsPresent: artifacts,
    artifactsMissing: expected_artifacts(phase),
    tasks: tasks ? parse_task_list(tasks) : null,
    budget
  }
}
```

### `ein_sdd_audit`

```
function ein_sdd_audit(change: string): AuditReport {
  const signals = {
    scope: check_signal('scope', init_md),
    budget_allocated: check_signal('budget_allocated', init_md),
    budget_consumed: check_signal('budget_consumed', exploration_md),
    scope_status: check_signal('scope_status', exploration_md),
    status: check_signal('status', verify_report_md)  // si existe
  }

  return {
    artifactConsistency: check_artifacts(phase),
    requiredSignals: signals,
    problems: signals.filter(s => s.missing || s.invalid)
  }
}
```

---

## // 005. TESTS

```
[ ] Crear un change de prueba con todos los artefactos
[ ] Llamar ein_sdd_status y verificar que devuelve tareas y budget
[ ] Llamar ein_sdd_audit y verificar que detecta artefactos faltantes
[ ] Verificar que /ein:sdd-status y /ein:sdd-audit funcionan desde la linea de comandos
[ ] Verificar que /ein:status muestra la lista de changes activos
[ ] Verificar que un change sin tasks.md no rompe la salida (muestra null)
```

---

## // 006. RIESGOS

- **Riesgo bajo.** Los cambios son en funciones de lectura, no en logica de flujo.
- **Riesgo de informacion incompleta:** si el budget ledger no se actualiza correctamente, los numeros seran inexactos. Eso ya existe hoy; este plan no empeora ni mejora ese problema.
- **Riesgo de rendimiento:** leer todos los artefactos en cada status podria ser lento en cambios con muchos archivos. No se anticipan cambios significativos.

---

## // 007. NOMBRE DE COMMIT

```
feat(sdd): enrich ein_sdd_status with task-level continuity and budget tracking
```

---

## // 008. RELACION CON OTROS PLANES

- Depende de plan 02 (`sdd-tasks.md`) para mostrar estado de tareas individuales.
- Si plan 02 no se implementa, `tasks` siempre sera null en la salida, pero el resto funciona.
- No tiene dependencia con plan 01 ni plan 04.