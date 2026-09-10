# Claude SDD CLI

`ein-cc-sdd` es la superficie determinista SDD de Claude. Se instala en `~/.claude-ein/bin/`; el launcher de Claude añade ese directorio al PATH. Ejecuta los comandos desde la raíz del proyecto.

```bash
ein-cc-sdd status
ein-cc-sdd check nombre-del-cambio
ein-cc-sdd settings
```

`status` y `check` leen el estado y los contratos; no sustituyen los tests ni la revisión de comportamiento. `settings` muestra los ajustes compartidos del proyecto. `close` archiva un cambio solo si cumple las condiciones del cierre.

Las fases y hooks también usan `lane`, `preflight`, `delta`, `summary`, `task-progress`, `sync` y `guard`. Sus argumentos y entradas estructuradas están definidos en [cli.ts](cli.ts). `guard` consume el JSON del hook de Bash por stdin; no es un comando de diagnóstico general. `sync` sincroniza specs OpenSpec; no reconstruye el adaptador Claude.

## Desarrollo y frontera

Desde la raíz del repositorio, `bun ein-cc/sync.ts` reconstruye y despliega el adaptador y su CLI. Editar el TypeScript no cambia el binario ya instalado.

- `cli.ts` coordina subcomandos y adapta argv, stdin/stdout y códigos de salida.
- `presentation.ts` transforma resultados SDD en texto, sin tocar el proceso.
- `sync-command.ts` ejecuta la sincronización y devuelve un resultado cerrado, sin decidir cómo se emite ni terminar el proceso.

El motor de dominio entra por `shared/ports/sdd.ts`; el progreso de tareas y la escritura del resumen también consumen módulos de `shared/sdd/`. La clausura de imports del payload incluye estos módulos automáticamente desde `cli.ts`.
