# Ein OpenSpec

Este directorio contiene los artifacts del sistema SDD de Ein.

## Estructura

```
openspec/
├── config.yaml          ← Configuración del proyecto
└── changes/             ← Cambios activos
    └── {change-name}/
        ├── init.md
        ├── exploration.md
        ├── design.md         ← propuesta + spec + tareas
        ├── apply-progress.md
        └── verify-report.md
```

## Flujo

El flujo `ein-sdd` ejecuta: init → explore → design → apply → verify.
`design.md` reune propuesta, spec (RFC 2119 + Given/When/Then) y tareas en un solo artefacto.

## Comandos

- `/ein:sdd:init` — inicializar contexto (`config.yaml`)
- `/ein:sdd:new <cambio>` — explore + design
- `/ein:sdd:apply <cambio>` — implementar por batches
- `/ein:sdd:verify <cambio>` — verificar con evidencia
- `/ein:status` — estado del sistema
