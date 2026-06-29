# // 000. Plan 05: Human Phase Rename

**Objetivo:** hacer que el contrato humano y técnico de SDD use una sola secuencia: `scope → map → design → tasks → apply → verify → close`.

---

## // 001. CAMBIO

- Renombrar agentes de fase a `sdd-scope`, `sdd-map` y `sdd-close`.
- Renombrar artefactos primarios a `scope.md` y `map.md`.
- Mantener `summary.md` como documento durable del cierre.
- Mantener `SDD` como nombre del sistema y namespace.

---

## // 002. DECISION

`close` es la acción de cierre; `summary.md` es el documento que queda para leer el cambio meses después. El storage interno heredado puede conservar su carpeta histórica para no romper datos ya cerrados, pero la copia pública debe decir close/closed.

---

## // 003. VERIFICACION

El rename debe quedar cubierto por router, guardrails, chain, agentes, model config, doctor/installer y tests de no-regresión de vocabulario.
