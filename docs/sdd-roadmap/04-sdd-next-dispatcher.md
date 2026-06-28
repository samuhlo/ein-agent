# // 000. Plan: /ein:sdd-next Dispatcher

**Comando:** `/ein:sdd-next {change}`
**Objetivo:** mostrar el siguiente paso recomendado para un change, de forma conservadora (sin delegacion automatica).

---

## // 001. POR QUE

El orchestrator ya tiene logica para inferir el siguiente paso (`nextRecommended` de `ein_sdd_status`). Pero:

- El usuario no tiene un comando directo para pedir "que sigue?".
- La logica vive en el codigo, no es visible ni auditable.
- Un dispatcher visible es mas Gentle-like: el usuario pide siguiente paso y ve exactamente que se hara.

---

## // 002. ALCANCE — VERSION CONSERVADORA

**Primera version:** solo muestra el siguiente paso. No delega automaticamente.

**No se hace en esta version:**
- Delegacion automatica a subagentes
- Ejecucion directa de fases
- Modificacion de archivos

**Razon:** la delegacion automatica requiere que el command handler evalué si es seguro delegar sin confirmacion del usuario. Eso tiene riesgos (ejecutar apply automaticamente en lugar de mostrar lo que hara). La version conservadora muestra y pregunta.

---

## // 003. FLUJO

### Modo `interactive` (default)

```
USER: /ein:sdd-next improve-sdd-check-ux

// 000. SIGUIENTE — improve-sdd-check-ux

**Fase actual:** design
**Siguiente recomendado:** tasks
**Razon:** design.md existe pero tasks.md no existe

**Accion sugerida:**
  Delegar a sdd-tasks con el change "improve-sdd-check-ux"

¿Deseas continuar? (si/no)
```

### Modo `auto`

```
USER: /ein:sdd-next improve-sdd-check-ux --auto

// 000. SIGUIENTE — improve-sdd-check-ux

**Fase actual:** design
**Siguiente recomendado:** tasks
**Razon:** design.md existe pero tasks.md no existe

[Ejecutando sdd-tasks...]
```

---

## // 004. LOGICA

```
function ein_sdd_next(change: string, mode: 'interactive' | 'auto'): NextReport {
  const status = ein_sdd_status(change)
  const next = status.nextRecommended

  const reasons = {
    init:       'init.md no existe',
    explore:    'init.md existe, exploration.md no existe',
    design:     'exploration.md existe, design.md no existe',
    tasks:      'design.md existe, tasks.md no existe',
    apply:      'tasks.md existe, apply-progress.md no existe o incompleto',
    verify:     'apply-progress.md indica completitud, verify-report.md no existe',
    archive:    'verify-report.md indica PASS, summary.md no existe',
    done:       'Todos los artefactos presentes y verify PASS'
  }

  return {
    currentPhase: status.phase,
    nextRecommended: next,
    reason: reasons[next],
    action: build_action_suggestion(next, change),
    mode
  }
}
```

---

## // 005. RELACION CON GENTLE-LIKE DISPATCHER

Este plan es la base para un dispatcher Gentle-like. La version conservadora establece:

1. Logica de inferencia de siguiente paso.
2. Presenteacion legible del siguiente paso.
3. Interaccion pregunta/respuesta en modo interactivo.

Una vez que esta base funciona, la version completa podria:

- En modo `auto`, invocar directamente la fase recomendada.
- Pasar el `{task}` y el change al subagente correspondiente.
- Reportar el resultado inline.

Esa version completa requiere evaluacion de seguridad adicional (el command handler tiene que estar seguro de que la delegacion es apropiada). Este plan se limita a la version conservadora.

---

## // 006. ARCHIVOS A TOCAR

| Archivo | Cambio |
|---------|--------|
| `ein-pi/agent/lib/ein-sdd-status.ts` (o donde viva `ein_sdd_status`) | Agregar funcion `ein_sdd_next` |
| `ein-pi/agent/agents/sdd-next.md` (nuevo) | Agente que muestra siguiente paso |
| `orchestrator.md` | Registrar `/ein:sdd-next` y su comportamiento |
| `AGENTS.md` | Agregar a tabla de comandos |

---

## // 007. TESTS

```
[ ] Crear change de prueba en cada fase y verificar que ein_sdd_next devuelve el paso correcto
[ ] Verificar que /ein:sdd-next sin argumentos muestra ayuda
[ ] Verificar que /ein:sdd-next {change} --auto intenta ejecutar (o al menos no falla)
[ ] Verificar que el modo interactivo pregunta antes de ejecutar
[ ] Verificar que un change inexistente devuelve error legible
```

---

## // 008. BLOQUEADORES

- Dependencia del plan 02 (tasks) para que `nextRecommended` sea preciso en la fase `tasks`.
- Si plan 02 no esta implementado, `sdd-apply` seguira leyendo de `design.md` y la inferencia de `tasks` a `apply` no sera precisa.
- No hay bloqueadores criticos para la version conservadora.

---

## // 009. RIESGOS

- **Riesgo medio en modo auto:** la delegacion automatica sin confirmacion podria ejecutar fases no deseadas. Por eso la version 1 es conservador (solo muestra).
- **Riesgo bajo:** el comando es lectura pura en modo interactivo, no muta nada sin confirmacion.

---

## // 010. NOMBRE DE COMMIT

```
feat(sdd): add /ein:sdd-next command for visible next-step dispatcher
```