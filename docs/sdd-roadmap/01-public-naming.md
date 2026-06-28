# // 000. Plan: Canonical Public Naming

**Comando canonico:** `/ein:sdd-audit`
**Alias legacy:** `/ein:sdd-check`
**Comando canonico:** `/ein:sdd-close`
**Alias legacy:** `/ein:sdd-archive`

---

## // 001. POR QUE

Ein ya tiene comandos `/ein:sdd-check` y `/ein:sdd-archive`. Funcionan, pero la nomenclatura no es consistente con el resto de comandos publicos (`/ein:sdd-status`, `/ein:sdd-next`).

- `check` suena a verificacion estatica, no a audit de consistencia de artefactos.
- `archive` suena a operacion interna, no a cierre de un change.

Renombrar a audit/close (aliases mantienen compatibilidad) mejora legibilidad sin cambiar comportamiento.

**Punto clave:** este cambio es lo suficientemente pequeño que no necesita ejecucion SDD completa. Se puede aplicar directamente con un bounded `sdd-apply`.

---

## // 002. ARCHIVOS A TOCAR

| Archivo | Cambio |
|---------|--------|
| `ein-pi/agent/assets/orchestrator.md` | Agregar `/ein:sdd-audit` y `/ein:sdd-close` como aliases de `/ein:sdd-check` y `/ein:sdd-archive` |
| `ein-pi/agent/AGENTS.md` | Actualizar tabla de comandos publicos para reflejar los nuevos canonicos |
| `docs/sdd-roadmap/README.md` (este repo) | Ya refleja los canonicos |

No se tocan agentes (`sdd-*.md`), no se tocan chains, no se toca el runtime deployado en `~/.pi/agent`.

---

## // 003. TAREAS EXACTAS

```
[ ] Editar orchestrator.md: agregar seccion "Public command aliases" con:
    /ein:sdd-audit  → alias canonico de /ein:sdd-check
    /ein:sdd-close  → alias canonico de /ein:sdd-archive
[ ] Actualizar AGENTS.md: tabla de comandos publicos con ambos nombres
[ ] Verificar que /ein:sdd-check y /ein:sdd-archive siguen funcionando como aliases
```

---

## // 004. TESTS

- Leer orchestrator.md y confirmar que los aliases están documentados.
- Leer AGENTS.md y confirmar que la tabla incluye `/ein:sdd-audit` y `/ein:sdd-close`.
- No hay tests automatizados para documentacion de comandos.

---

## // 005. RIESGOS

- **Riesgo bajo.** Es solo documentacion y aliases. No cambia logica de ningun agente.
- **Compatibilidad:** los aliases legacy siguen funcionando. El cambio es aditivo puro.

---

## // 006. NOMBRE DE COMMIT

```
docs: add /ein:sdd-audit and /ein:sdd-close as canonical aliases
```

---

## // 007. NOTA

Este plan no requiere ejecucion SDD completa. Es un cambio de documentacion + alias que puede ejecutarse con un unico `sdd-apply` cerrado (archivo + cambio exacto + tests).