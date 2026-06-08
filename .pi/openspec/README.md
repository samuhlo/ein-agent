# Samuhlo-PI OpenSpec

Este directorio contiene los artifacts del sistema SDD.

## Estructura

```
openspec/
├── config.yaml          ← Configuración del proyecto
├── specs/               ← Specs aceptados (fuente de verdad)
│   └── {dominio}/
│       └── spec.md
└── changes/             ← Cambios activos y archivados
    ├── {change-name}/
    │   ├── proposal.md
    │   ├── spec.md
    │   ├── design.md
    │   ├── tasks.md
    │   ├── apply-progress.md
    │   ├── verify-report.md
    │   └── sync-report.md
    └── archive/
        └── YYYY-MM-DD-{change-name}/
```

## Para iniciar un cambio SDD

1. Crear carpeta: `openspec/changes/mi-cambio/`
2. Crear `proposal.md` con la propuesta
3. Seguir el flujo SDD

## Comandos

- `/samuhlo:sdd-init` - Inicializar proyecto
- `/samuhlo:status` - Ver estado del sistema

