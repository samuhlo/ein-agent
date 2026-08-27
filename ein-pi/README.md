# ein-pi — EIN sobre Pi, aislado

Hace que la edición Pi de EIN corra como **`ein-pi`** en un config aislado (`~/.pi-ein/agent`), dejando **`pi` como Pi vanilla**. Simétrico con `ein-cc` (EIN sobre Claude Code). EIN pasa de *dueño* de `~/.pi` a *invitado aislado*.

La entrada normal del producto es `ein`; `ein-pi` es el acceso directo avanzado.

## El estado simétrico

| Comando | Config | Qué es |
|---|---|---|
| `pi` | `~/.pi/agent` | Pi vanilla, sin EIN |
| `ein-pi` | `~/.pi-ein/agent` | EIN sobre Pi (aislado) |
| `claude` | `~/.claude` | Claude vanilla |
| `ein-cc` | `~/.claude-ein` | EIN sobre Claude (aislado) |

## Cómo funciona el aislamiento

Pi documenta **`PI_CODING_AGENT_DIR`** (= "Override config directory, default `~/.pi/agent`") — su equivalente a `CLAUDE_CONFIG_DIR`. Relocaliza config **+ auth + sesiones + settings** por completo (verificado: `pi list` con el override apuntando a un dir vacío no ve los paquetes de EIN). El launcher `ein-pi.fish` setea, function-scoped (no contamina tu shell):

- `PI_CODING_AGENT_DIR=~/.pi-ein/agent` → Pi carga de ahí.
- `EIN_PI_AGENT_HOME=~/.pi-ein/agent` → el código de EIN (`ein-paths`) resuelve sus rutas ahí.

## Migración (una vez)

```bash
bun ein-pi/migrate.ts --dry    # enseña qué haría
bun ein-pi/migrate.ts          # mueve ~/.pi/agent → ~/.pi-ein/agent
cp ein-pi/ein-pi.fish ~/.config/fish/functions/
```

`migrate.ts` hace un backup `.tar.gz`, mueve el dir (conserva login/sesiones/historial) y **reescribe las rutas absolutas** que el template bakea en `settings.json` (`~/.pi/agent` → `~/.pi-ein/agent`). Reversible: `mv ~/.pi-ein/agent ~/.pi/agent`.

## Estado

El installer despliega, actualiza, diagnostica y desinstala sobre el hogar
aislado `~/.pi-ein/agent`. La migración conserva login, sesiones e historial;
el runtime vanilla `pi` y su hogar `~/.pi/agent` quedan fuera del despliegue
normal de Ein.
