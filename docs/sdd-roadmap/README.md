# // 000. SDD Roadmap — evolución nativa de Ein

Este roadmap documenta seis cambios incrementales que hacen el SDD de Ein mas legible, personal, determinista y coherente con los principios de Ein.

**Intencion general:** sin romper la maquinaria de estado actual, mejorar la superficie publica del sistema para que sea mas facil de seguir para un humano, otro agente, o una sesion nueva.

---

## // 001. INDICE DE PLANES

| # | Plan | Comando canonico | Alias legacy |
|---|------|-----------------|--------------|
| 01 | [Naming público](./01-public-naming.md) | `/ein:sdd-audit` | `/ein:sdd-check` |
| 02 | [Separar design y tasks](./02-split-design-tasks.md) | `sdd-tasks.md` separado | `design.md` (unificado) |
| 03 | [Continuidad visible](./03-continuity-status-audit.md) | `/ein:sdd-status` enriquecido | ninguna |
| 04 | [Dispatcher sdd-next](./04-sdd-next-dispatcher.md) | `/ein:sdd-next` | ninguna |
| 05 | [Human phase rename](./05-human-phase-rename.md) | `scope → map → design → tasks → apply → verify → close` | nombres previos internos |
| 06 | [Docs, cleanup y release](./06-docs-cleanup-release.md) | limpieza de docs | ninguna |

---

## // 002. ORDEN DE EJECUCION

```
scope → map → design → tasks → apply → verify → close
```

1. **01-public-naming** — alias públicos. Pequeño, no necesita SDD completo.
2. **02-split-design-tasks** — separación diseño/tareas. Requiere cambios en router y apply.
3. **03-continuity-status-audit** — enriquecimiento de status/audit. Solo lectura/escritura leve.
4. **04-sdd-next-dispatcher** — `/ein:sdd-next`. Puede implementarse en modo conservador.
5. **05-human-phase-rename** — renombre completo de fases, agentes y artefactos humanos.
6. **06-docs-cleanup-release** — limpieza de docs, CHANGELOG, AGENTS.md. Ultima fase.

Cada plan es independiente pero se ejecutan en orden. Los planes 02, 03, 04 y 05 tienen interdependencias sutiles que se documentan en cada archivo.

---

## // 003. COMANDOS PUBLICOS OBJETIVO

| Comando | Proposito |
|---------|-----------|
| `/ein:sdd-status {change}` | Muestra fase actual + resumen de estado |
| `/ein:sdd-audit {change}` | Verifica consistencia de artefactos (canónico) |
| `/ein:sdd-close {change}` | Cierra un cambio verificado (canónico) |
| `/ein:sdd-next {change}` | Muestra siguiente paso recomendado |

**Alias no-fase conservado:** `/ein:sdd-check {change}` apunta a `/ein:sdd-audit`.

---

## // 004. FASE HUMANA CANONICA

```
scope → map → design → tasks → apply → verify → close
```

La sintaxis publica y la sintaxis del chain usan el mismo lenguaje. `summary.md` se mantiene como documento final de close.

---

## // 005. PRINCIPIOS DE DISENO

- **Legible:** un humano puede leer `sdd-status` y saber exactamente donde esta y que falta.
- **Personal:** la nomenclatura refleja como trabaja Samu, no una metodologia generica.
- **Determinista:** sin guesswork. Artefactos en disco, no en memoria.
- **Consistente:** la maquinaria de estado (`ein-sdd.chain.md`, router, guardrails, tests) comparte una sola nomenclatura.
- **Fases cortas:** un solo SDD no deberia crecer mas alla de lo que cabe en una sesion.
