# // 000. SDD Roadmap — Ein Gentle-like Reorganization

Este roadmap documenta cinco cambios incrementales que hacen el SDD de Ein mas legible, personal, determinista y compatible con el estilo Gentle.

**Intencion general:** sin romper la maquinaria de estado actual, mejorar la superficie publica del sistema para que sea mas facil de seguir para un humano, otro agente, o una sesion nueva.

---

## // 001. INDICE DE PLANES

| # | Plan | Comando canonico | Alias legacy |
|---|------|-----------------|--------------|
| 01 | [Naming público](./01-public-naming.md) | `/ein:sdd-audit` | `/ein:sdd-check` |
| 02 | [Separar design y tasks](./02-split-design-tasks.md) | `sdd-tasks.md` separado | `design.md` (unificado) |
| 03 | [Continuidad visible](./03-continuity-status-audit.md) | `/ein:sdd-status` enriquecido | ninguna |
| 04 | [Dispatcher sdd-next](./04-sdd-next-dispatcher.md) | `/ein:sdd-next` | ninguna |
| 05 | [Docs, cleanup y release](./05-docs-cleanup-release.md) | limpieza de docs | ninguna |

---

## // 002. ORDEN DE EJECUCION

```
scope → map → design → tasks → apply → verify → close
```

1. **01-public-naming** — alias públicos. Pequeño, no necesita SDD completo.
2. **02-split-design-tasks** — separación diseño/tareas. Requiere cambios en router y apply.
3. **03-continuity-status-audit** — enriquecimiento de status/audit. Solo lectura/escritura leve.
4. **04-sdd-next-dispatcher** — `/ein:sdd-next`. Puede implementarse en modo conservador.
5. **05-docs-cleanup-release** — limpieza de docs, CHANGELOG, AGENTS.md. Ultima fase.

Cada plan es independiente pero se ejecutan en orden. Los planes 01 y 05 son seguros para ejecutar en cualquier momento. Los planes 02, 03 y 04 tienen interdependencias sutiles que se documentan en cada archivo.

---

## // 003. COMANDOS PUBLICOS OBJETIVO

| Comando | Proposito |
|---------|-----------|
| `/ein:sdd-status {change}` | Muestra fase actual + resumen de estado |
| `/ein:sdd-audit {change}` | Verifica consistencia de artefactos (canónico) |
| `/ein:sdd-close {change}` | Cierra change: archive + limpieza (canónico) |
| `/ein:sdd-next {change}` | Muestra siguiente paso recomendado |

**Alias legacy:**

| Alias | Apunta a |
|-------|----------|
| `/ein:sdd-check {change}` | `/ein:sdd-audit` |
| `/ein:sdd-archive {change}` | `/ein:sdd-close` |

---

## // 004. FASE HUMANA MAPEADA

```
scope   → init
map     → explore
design  → design (split: design.md + tasks.md)
tasks   → tasks (read tasks.md, no new planning)
apply   → apply
verify  → verify
close   → archive / sdd-close
```

La sintaxis publica usa lenguaje natural. La sintaxis interna del chain sigue siendo `init → explore → design → apply → verify → archive` para no romper la maquinaria existente.

---

## // 005. PRINCIPIOS DE DISENO

- **Legible:** un humano puede leer `sdd-status` y saber exactamente donde esta y que falta.
- **Personal:** la nomenclatura refleja como trabaja Samu, no una metodologia generica.
- **Determinista:** sin guesswork. Artefactos en disco, no en memoria.
- **No rompedor:** la maquinaria de estado existente (`ein-sdd.chain.md`, `sdd-apply`, etc.) no se modifica a menos que el plan lo requiera explicitamente.
- **Fases cortas:** un solo SDD no deberia crecer mas alla de lo que cabe en una sesion.