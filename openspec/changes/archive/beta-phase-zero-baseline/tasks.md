---
change: beta-phase-zero-baseline
phase: tasks
created: 2026-08-28T00:00:00Z
status: ready
blocked_by: none
---

# Tasks — beta phase zero baseline

status: ready
blocked_by: none

## // 001. Neutralidad de proveedor/modelo

- [x] 1.1 RED: el tar generado no contiene `defaultProvider`, `defaultModel` ni `enabledModels`.
- [x] 1.2 RED: el handler interactivo de secrets pide solo Context7 y, cuando procede, Linear.
- [x] 1.3 GREEN: limpiar la plantilla y retirar el prompt implícito de MiniMax conservando elecciones explícitas del usuario.

## // 002. Recomendaciones solo de esfuerzo

- [x] 2.1 RED: exigir recomendaciones sin tier/modelo/proveedor y una matriz de distancia grande.
- [x] 2.2 GREEN: centralizar el umbral y usarlo en las dos alertas del panel.
- [x] 2.3 REFACTOR: retirar copy y tipos barato/capaz de la superficie tocada.

## // 003. Guardián de límites

- [x] 3.1 Inventariar con AST todos los literales actuales hacia `ein-pi/agent`.
- [x] 3.2 Fijar un baseline exacto que falle ante deuda nueva o deuda eliminada sin actualizar el contrato.

## // 004. Verificación

- [x] 4.1 Ejecutar pruebas focales de fase 0.
- [x] 4.2 Ejecutar `bun test`, typecheck raíz e installer.
- [x] 4.3 Construir el bundle host e inspeccionar el diff final.
- verify: `bun test && bun run typecheck && cd installer && bun run typecheck`
