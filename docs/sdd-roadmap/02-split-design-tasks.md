# // 000. Plan: Split design.md and tasks.md

**Problema actual:** `sdd-design` hace propuesta + spec + escenarios + task slicing en una sola fase de modelo barato. Eso esta bien para cambios pequenos, pero para cambios complejos el artefacto `design.md` crece demasiado y mezcla dos responsabilidades distintas.

**Objetivo:** separar `design.md` (propuesta + spec) de `tasks.md` (tareas accionables con estado).

---

## // 001. DOLOR ACTUAL

El flujo actual:

```
init → explore → design → apply → verify → archive
                 ↑
          design.md = proposal + spec + scenarios + task slices
```

`design.md` contiene:
- Proposito y contexto
- Spec (RFC 2119 + Given/When/Then)
- Escenarios de prueba
- Lista de tareas actionables (checklist)

El problema: cuando la spec es grande, las tareas se pierden. Y el agente que ejecuta `sdd-apply` tiene que leer todo para encontrar la lista de tareas.

---

## // 002. FLUJO PROPUESTO

```
init → explore → design → tasks → apply → verify → close
```

**Fase `design`:** produce `design.md` = proposal + spec. Sin tareas.

**Fase `tasks`:** produce `tasks.md` = lista de tareas accionables con estado.

**Mapeo a lenguaje humano:**

| Fase interna | Lenguaje humano |
|--------------|-----------------|
| init | scope |
| explore | map |
| design | design |
| tasks | tasks |
| apply | apply |
| verify | verify |
| close | close |

---

## // 003. NUEVO ARTEFACTO: `tasks.md`

```md
# Tasks — {change}

## // 000. ESTADO GENERAL

status: ready | blocked
blocked_by: <reason if blocked>

---

## // 001. TAREA 001

- **status:** ready | blocked
- **description:** <descripcion corta de la tarea>
- **artifact:** <archivo o carpeta que modifica>
- **blocked_by:** <reason if blocked>

### Checklist

- [ ] paso 1
- [ ] paso 2
- [ ] paso 3

---

## // 002. TAREA 002

...
```

**Campo `status`:**
- `ready`: la tarea puede ejecutarse.
- `blocked`: la tarea tiene un bloqueador (dependencia, informacion faltante).

**Campo `artifact`:** ayuda a saber que archivos tocar sin leer toda la descripcion.

---

## // 004. CAMBIOS EN EL CHAIN (`ein-sdd.chain.md`) Y ORCHESTRATOR

El chain ya conoce el flujo `init → explore → design → apply → verify → archive`. Se agrega `sdd-tasks` entre `design` y `apply`:

```
## sdd-tasks

reads: design.md
output: tasks.md
outputMode: file-only
progress: true

Genera la lista de tareas accionables a partir del design.md.
El contenido de cada tarea debe poder ejecutarse sin nueva planificacion.
```

Tambien se actualiza la referencia del orchestrator.md para reflejar el nuevo flujo.

---

## // 005. CAMBIOS EN sdd-apply.md

`sdd-apply` actualmente lee `design.md` y extrae las tareas de ahi. Con la separacion, `sdd-apply` leera `tasks.md` directamente.

Cambio en el frontmatter del agente:

```
## sdd-apply

reads: tasks.md    # antes: design.md
output: apply-progress.md
```

Tambien se actualiza el hard-stop del orchestrator: antes de invocar `sdd-apply` verificar que `tasks.md` existe.

---

## // 006. CAMBIOS EN ein-sdd.chain.md

Agregar paso `sdd-tasks` entre `sdd-design` y `sdd-apply`:

```yaml
## sdd-tasks

reads: design.md
output: tasks.md
outputMode: file-only
progress: true
```

---

## // 007. ESTRATEGIA DE COMPATIBILIDAD

- El chain original `ein-sdd` sigue funcionando para cambios pequenos (sin `tasks` separada).
- Se agrega un guardrail en `sdd-apply`: si `tasks.md` no existe, leer las tareas de `design.md` (compatibilidad hacia atras).
- Una vez que todos los changes activos tengan `tasks.md`, se puede remover el fallback.

---

## // 008. TESTS

```
[ ] Crear un change de prueba: init → explore → design
[ ] Ejecutar sdd-tasks y verificar que genera tasks.md con el formato esperado
[ ] Ejecutar sdd-apply con tasks.md y verificar que sigue el formato
[ ] Verificar que sdd-apply funciona con design.md cuando tasks.md no existe (compatibilidad)
[ ] Verificar que el chain ein-sdd completo sigue funcionando
```

---

## // 009. RIESGOS

- **Riesgo medio.** Cambia el contrato entre fases. Hay que verificar compatibilidad hacia atras.
- **Riesgo bajo en operacion normal:** el guardrail de compatibilidad evita que se rompa.
- **Riesgo de confusion:** si un change tiene `design.md` con tareas y otro tiene `tasks.md` separado, puede ser confuso. La migracion gradual mitiga esto.

---

## // 010. NOMBRE DE COMMIT

```
feat(sdd): split design.md and tasks.md into separate phases
```

---

## // 011. NOTAS

- La fase `tasks` es pequena. Si `design.md` esta bien escrito, `tasks` es casi un parseo directo de la lista de verificacion.
- No se debe confundir `tasks.md` con `apply-progress.md`. `tasks.md` es el plan; `apply-progress.md` es el registro de ejecucion.