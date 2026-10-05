# Estado final de Ein

Ein terminó como proyecto independiente en [`installer-v0.99.1`](https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.99.1). Este archivo sustituye el roadmap de desarrollo activo: no hay nuevas fases, integraciones o modelos comprometidos para Ein. La evolución del producto continúa en [n_ein](https://github.com/samuhlo/n_ein).

La [retrospectiva](legacy-retrospective.md) explica qué se construyó, qué se comprobó y por qué se abrió el proyecto nuevo. El comportamiento de esta versión se documenta en la [web](https://samuhlo.github.io/ein-agent/), en `openspec/specs/` y en las notas de la release. Los [ADR](adr/) y las [evaluaciones](../evals/) conservan decisiones e hipótesis históricas; sus propuestas pendientes no son compromisos de mantenimiento.

## Alcance de la última versión

- Pi sigue siendo el runtime principal; Claude Code es un relevo opcional con capacidades diferentes.
- `ein` es la aplicación y `ein-install` la entrada de instalación, diagnóstico, actualización y recuperación.
- Los cambios pequeños pueden ir directamente a apply y verify; OpenSpec registra los cambios que usan SDD.
- No hay garantía de confinamiento total de un ejecutor barato, ahorro general de coste, soporte de Windows ni ejecución local validada. La [página de límites](https://samuhlo.github.io/ein-agent/05-debug/known-limitations/) detalla la evidencia.

Las instalaciones existentes pueden conservarse o desinstalarse según la [guía de recuperación](https://samuhlo.github.io/ein-agent/05-debug/uninstall-recovery/). `n_ein` usa hogares y paquetes propios: no hay migración automática de sesiones o configuración.
