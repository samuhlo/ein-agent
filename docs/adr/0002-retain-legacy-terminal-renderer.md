# ADR 0002 — Mantener el renderer terminal actual

status: accepted
date: 2026-08-11

## Contexto

Un spike evaluó migrar la superficie terminal a OpenTUI/Solid en ocho combinaciones nativas Pi/Claude. La alternativa fue funcional, pero añadió entre 26 y 42 MB comprimidos, entre 137 y 214 MB instalados y regresiones de arranque muy superiores a los umbrales acordados.

## Decisión

Mantener el renderer existente como camino de producción. No publicar ni integrar el candidato del spike.

## Consecuencias

- Se conserva la separación controller/renderer demostrada por el spike.
- Una futura migración necesita una nueva evidencia que cumpla límites de arranque y distribución.
- Los datos completos permanecen en Git, en el workflow 31546992107 y en la PR histórica #175; no se conserva un directorio `spikes/` activo.
