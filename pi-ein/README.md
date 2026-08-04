# pi-ein — EIN sobre Pi, aislado

Hace que la edición Pi de EIN corra como **`pi-ein`** en un config aislado (`~/.pi-ein/agent`), dejando **`pi` como Pi vanilla**. Simétrico con `cc-ein` (EIN sobre Claude Code). EIN pasa de *dueño* de `~/.pi` a *invitado aislado*.

## El estado simétrico

| Comando | Config | Qué es |
|---|---|---|
| `pi` | `~/.pi/agent` | Pi vanilla, sin EIN |
| `pi-ein` | `~/.pi-ein/agent` | EIN sobre Pi (aislado) |
| `claude` | `~/.claude` | Claude vanilla |
| `cc-ein` | `~/.claude-ein` | EIN sobre Claude (aislado) |

## Cómo funciona el aislamiento

Pi documenta **`PI_CODING_AGENT_DIR`** (= "Override config directory, default `~/.pi/agent`") — su equivalente a `CLAUDE_CONFIG_DIR`. Relocaliza config **+ auth + sesiones + settings** por completo (verificado: `pi list` con el override apuntando a un dir vacío no ve los paquetes de EIN). El launcher `pi-ein.fish` setea, function-scoped (no contamina tu shell):

- `PI_CODING_AGENT_DIR=~/.pi-ein/agent` → Pi carga de ahí.
- `EIN_PI_AGENT_HOME=~/.pi-ein/agent` → el código de EIN (`ein-paths`) resuelve sus rutas ahí.

## Migración (una vez)

```bash
bun pi-ein/migrate.ts --dry    # enseña qué haría
bun pi-ein/migrate.ts          # mueve ~/.pi/agent → ~/.pi-ein/agent
cp pi-ein/pi-ein.fish ~/.config/fish/functions/
```

`migrate.ts` hace un backup `.tar.gz`, mueve el dir (conserva login/sesiones/historial) y **reescribe las rutas absolutas** que el template bakea en `settings.json` (`~/.pi/agent` → `~/.pi-ein/agent`). Reversible: `mv ~/.pi-ein/agent ~/.pi/agent`.

## Estado

- **✅ Fase 1 — launcher + migración:** `pi-ein` aislado, funcionando (responde como Ein, conserva login/sesiones), `pi` vanilla limpio. Verificado.
- **⏳ Fase 2 — installer:** menú para instalar EIN en Pi / Claude Code / ambos; `deploy`/`updater`/`marker`/`backup` apuntando al dir aislado (`~/.pi-ein/agent`) en vez de `~/.pi/agent`.

## Nota

Phase 2 pendiente: hasta que el updater apunte al dir aislado, un `ein update` seguiría gestionando `~/.pi/agent`. La migración es estable, pero el installer/updater aún asumen la ruta vieja — es justo lo que arregla la Fase 2.
