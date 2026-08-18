status: partial
scope_status: bounded
change: update-astro-documentation
phase: map

# Mapa de `update-astro-documentation`

## Alcance y autoridad

El cambio queda limitado al refresh de documentación pública Astro/Starlight bajo `docs-site/`. La evidencia aceptada no selecciona ningún dominio canónico OpenSpec. No se modifican fuentes de producto ni documentación durante esta fase.

Autoridad para el contenido: `MANIFIESTO.md` fija Pi como referencia, continuidad bidireccional por disco y fail-closed; `docs/roadmap-features-ein.md` fija el estado entregado y las capacidades diferidas; `CHANGELOG.md` registra las incorporaciones de 0.71.0. `ein-pi/agent/lib/project-directives.ts` es la fuente exacta para estados de traducción; `cc-ein/commands/ein/status.md` confirma que Claude expone el estado mediante el CLI determinista.

## Páginas y pasajes a diseñar para actualización

### `docs-site/src/content/docs/02-workflow/workflow-overview.md`

- Frontmatter y título presentan el flujo como **“Las siete fases”**.
- El diagrama y las secciones `scope`, `map`, `design`, `tasks`, `apply`, `verify`, `close` describen siete fases como recorrido universal.
- Sustituir la afirmación universal por los dos carriles declarables: `standard` conserva el recorrido completo; `micro` omite únicamente `map` y `tasks`, y mantiene `scope`, `design`, `apply`, `verify`, `close`. No describir un flujo fijo ni rebajar `verify` o `close`.
- Incorporar que la postura TDD y el carril se persisten por cambio y son leídos por Pi y Claude; la decisión no se hereda entre cambios ni se adivina automáticamente.

### `docs-site/src/content/docs/02-workflow/real-workflow-example.md`

- El ejemplo cuenta el cambio archivado como una cadena completa y refuerza el encuadre de siete fases (`scope`, `map`, `design`, `apply`, `verify`), además de un hallazgo histórico sobre TDD.
- Mantener su valor histórico, pero introducir una nota de contexto para que el ejemplo no se lea como requisito universal: corresponde a un cambio estándar archivado y la postura TDD depende del cambio.
- No inventar evidencia sobre cómo se ejecutó un carril `micro` en este ejemplo.

### `docs-site/src/content/docs/04-reference/cli.md`

- La sección `Comandos del flujo SDD` (líneas 109-122) solo enumera comandos Pi y el binario `cc-ein-sdd`; no documenta la cabina Claude `/ein:status` y `/ein:settings`.
- La tabla de configuración y flags menciona TDD, CodeGraph y Engram, pero no explica el panel de cambio ni `ctrl+shift+e`.
- Añadir únicamente comandos/superficies confirmados: Claude `/ein:status`, `/ein:settings`; panel vivo de Pi que proyecta `tasks.md`, cambio activo/carril/fase/tareas y atajo `ctrl+shift+e`.
- Explicar Codegraph como bootstrap asistido cuando falta el índice, con modo `on` por defecto y sin presentar la capacidad como obligatoria. Mantener `--no-codegraph` y `--no-engram` como opt-outs.

### `docs-site/src/content/docs/03-runtimes/claude-code.md`

- El texto cubre CLI SDD, pero no documenta `/ein:status` ni `/ein:settings`, ni que Claude consume las decisiones compartidas del proyecto.
- Las secciones de huecos declaran traducción de herramientas best-effort, pero la frase “no falla ruidosamente” debe conservarse como limitación honesta y no convertirse en equivalencia.
- Añadir la frontera Pi-first: Pi es el runtime de referencia; Claude es relevo y puede continuar por estado/checkpoint en disco, en ambos sentidos, no por historiales de conversación.
- Declarar Cleaner y Architect como participación automática Pi-only, deliberadamente desactivada/ausente en Claude; el perfil del proyecto se reporta como no aplicable/unsupported, no se ejecuta en silencio.
- Mantener la cautela sobre MCP externo no ejercitado en vivo y la traducción aproximada de skills/herramientas.

### `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`

- La frase “los dos runtimes ... ejecutan el mismo ciclo SDD” (líneas 23-24) sobreafirma equivalencia completa.
- La tabla no distingue Pi como referencia, Claude como relevo, ni la frontera Cleaner/Architect.
- Reestructurar la comparación para separar capacidades compartidas comprobadas, superficies distintas y límites de paridad. Incluir continuidad Pi↔Claude por checkpoint/proyecto en disco, sin prometer sesiones equivalentes.
- Conservar explícitamente que no hay paridad 1:1 de skills/herramientas ni MCP vivo verificado; no marcar como paridad funciones diferidas por roadmap.

### `docs-site/src/content/docs/05-debug/known-limitations.md`

- La página ya conserva límites de MCP, traducción best-effort y launcher; debe ampliar la lista con carriles, persistencia y participación de Cleaner/Architect sin convertir roadmap en producto.
- Alinear la explicación de `verify: pass` con el carril elegido: prueba los criterios declarados por ese cambio, no una garantía universal.
- Documentar traducción de directivas fail-closed: estados `unreadable`, `unsupported`, `inactive` y `unhandled` permanecen visibles; no se convierten silenciosamente en defaults o aplicación exitosa.
- Añadir la opcionalidad declarada de Codegraph bootstrap y Engram compartido por cambio, preservando que el checkpoint/proyecto es el puente y que los historiales siguen privados.

## Evidencia técnica que condiciona el copy

- `ein-pi/agent/lib/project-directives.ts`: el catálogo recorre cada ajuste; lector roto produce `unreadable`; runtime sin capacidad produce `unsupported` con motivo; ausencia de traductor produce `unhandled`; traducción vacía produce `inactive`; solo `applied` inyecta una directiva. Claude marca Hypa y Cleaner/Architect como no aplicables, con motivo explícito.
- `CHANGELOG.md` 0.71.0: `micro` omite solo `map`/`tasks`; TDD y carril persisten en disco; Pi y Claude comparten `.engram-ein`; panel Pi proyecta `tasks.md` y `ctrl+shift+e`; Codegraph ofrece bootstrap cuando falta índice; Claude ofrece `/ein:status` y `/ein:settings`; Cleaner/Architect quedan Pi-only para participación automática; continuidad y estado cruzan por el proyecto.
- `MANIFIESTO.md` §§ 003, 005, 006 y 007: Pi es producto principal/referencia; Claude relevo; el puente es disco, no conversación; UI y documentación deben distinguir desconocido de verdad; no afirmar lo no comprobado.
- `docs/roadmap-features-ein.md`: Cleaner/Architect están aceptados en Pi y su paridad Claude está diferida; la continuidad provider-neutral está construida; el fast lane ya está construido; Engram compartido y Codegraph deben describirse solo con su alcance entregado.
- `cc-ein/commands/ein/status.md`: `/ein:status` presenta estado determinista, siguiente paso, reglas activas y datos sin confirmar; no autoriza inferencias adicionales.

## Verificación enfocada para fases posteriores

`docs-site/package.json` solo declara `dev`, `build` y `preview`; no hay script dedicado de test/lint/check. La verificación documental debe, como mínimo:

1. Ejecutar `cd docs-site && bun run build` para validar Astro/Starlight, schema de frontmatter y referencias que el build compruebe.
2. Hacer comprobaciones textuales acotadas sobre las seis páginas objetivo para detectar restos de “flujo fijo de siete fases”, equivalencia completa, traducción silenciosa o capacidades Claude Cleaner/Architect no soportadas.
3. Revisar frontmatter `sources`/`verified_rev` y enlaces internos únicamente en las páginas editadas; no ejecutar una auditoría general de `docs-site`.

## Riesgos de diseño

- El ejemplo histórico y otras páginas fuera de la evidencia pueden seguir usando lenguaje de siete fases; no ampliar el alcance sin una nueva decisión explícita.
- Actualizar `sources` o `verified_rev` requiere evidencia de la revisión aplicada; no inventar revisiones.
- No presentar MCP vivo, paridad 1:1, Cleaner/Architect automático en Claude ni capacidades de roadmap como disponibles.

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/update-astro-documentation/scope.md", lines: 71, estimated_tokens: 1400 }
    - { path: "docs-site/src/content/docs/04-reference/cli.md", lines: 131, estimated_tokens: 1000 }
    - { path: "docs-site/src/content/docs/02-workflow/workflow-overview.md", lines: 105, estimated_tokens: 900 }
    - { path: "docs-site/src/content/docs/02-workflow/real-workflow-example.md", lines: 120, estimated_tokens: 1500 }
    - { path: "docs-site/src/content/docs/03-runtimes/claude-code.md", lines: 90, estimated_tokens: 1000 }
    - { path: "docs-site/src/content/docs/03-runtimes/runtime-matrix.md", lines: 74, estimated_tokens: 900 }
    - { path: "docs-site/src/content/docs/05-debug/known-limitations.md", lines: 97, estimated_tokens: 1100 }
    - { path: "CHANGELOG.md", lines: 2210, estimated_tokens: 12500 }
    - { path: "MANIFIESTO.md", lines: 230, estimated_tokens: 3000 }
    - { path: "docs/roadmap-features-ein.md", lines: 500, estimated_tokens: 7000 }
    - { path: "ein-pi/agent/lib/project-directives.ts", lines: 185, estimated_tokens: 1700 }
    - { path: "cc-ein/commands/ein/status.md", lines: 16, estimated_tokens: 250 }
    - { path: "docs-site/package.json", lines: 19, estimated_tokens: 180 }
    - { path: "docs-site/src/content.config.ts", lines: 17, estimated_tokens: 220 }
    - { path: "docs-site/astro.config.mjs", lines: 25, estimated_tokens: 300 }
    - { path: "docs-site/src/content/docs/04-reference/optional-tooling.md", lines: 86, estimated_tokens: 900 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 33850, reads: 16 }
  budget_exceeded: true
  budget_source: scope.md

No se realizaron cambios de documentación ni verificaciones de build en esta fase.
