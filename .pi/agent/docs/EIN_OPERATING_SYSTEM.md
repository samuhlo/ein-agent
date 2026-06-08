# Ein Operating System

Author: samuhlo

Manual diario para usar tu workbench Pi sin friccion.

## Arquitectura de delegacion visible

Ein usa **pi-subagents visible**. Linear, GitHub, design y las fases SDD son archivos Markdown en `~/.pi/agent/agents/*.md`; los flujos repetibles viven como chains en `~/.pi/agent/chains/*.chain.md`.

Tu mensaje original se conserva. El padre Ein decide la ruta desde el prompt padre: responde directo si es pequeno, delega con `subagent` cuando aporta foco, y usa el flujo `ein-sdd` cuando hay cambio serio. Si una peticion natural genera un payload `/run-chain`, eso es una regresion.

**Agentes Ein visibles:**

- `ein-linear` — preflight, issues, proyectos, sync y comentarios humanos en Linear.
- `ein-github` — branch, commit, PR, review y sync delivery con gates.
- `sdd-*` — fases SDD especializadas (`sdd-init`, `sdd-explore`, `sdd-design`, `sdd-apply`, `sdd-verify`) que la chain invoca.

**Chain:**

- `ein-sdd` — el flujo SDD: init → explore → design → apply → verify.

Los comandos `/ein:*` son **fallback/manual**. Si ves `Actua como orquestador... HARD REQUIREMENT...` o una chain generada desde lenguaje natural, es una **regression** — el texto del usuario deberia preservarse.

## Regla 1

Si la tarea es pequena, hazla directa.

Si la tarea es seria, usa flujo SDD.

## Cuando usar directo

- typo o copy pequeno
- ajuste visual pequeno
- pregunta tecnica puntual

## Cuando usar SDD

- feature nueva
- bug complejo
- cambios multiarchivo
- decisiones de arquitectura
- trabajo con riesgo de regresion

## Flujo recomendado

1. `/ein:sdd:init` si no hay contexto.
2. `/ein:sdd:new <cambio>` ejecuta `ein-sdd`: explore y design (propuesta + spec + tareas).
3. `/ein:sdd:apply <cambio>` en batches pequenos.
4. `/ein:sdd:verify <cambio>` para comprobar con evidencia.

## Modelos

- Normal: `minimax/MiniMax-M2.7`
- Pesado: `openai-codex/gpt-5.5`
- Orquestacion compleja: `openai-codex/gpt-5.5`

## Skills

Para tareas con contexto ambiguo:

1. `/ein:skills:advisor [tarea]`
2. resolver skills sugeridas
3. revisar digest compacto
4. ejecutar con feedback de skills

Para mantenimiento del stack fijo:

- `/ein:skills` -> estado
- `/ein:skills update` -> instala faltantes core y actualiza por hash
- `/ein:skills add zod` -> instala skill puntual
- `/ein:skills clean [--yes]` -> archiva extras en `archived/`

Los comandos nativos `/skill:*` siguen activos. Usalos cuando quieras inyectar una skill completa a mano. Para SDD, Ein prefiere pasar rutas exactas de `SKILL.md` cuando el padre ya resolvio skills. El digest queda para advisor/debug o para casos donde un resumen compacto aporte claridad.

## Linear y GitHub

- Linear = tablero de trabajo
- GitHub = entrega
- `ein-linear` = ruta diaria para start/status/sync Linear
- No mezclar reporte interno SDD con comentario humano en Linear salvo que lo pidas

## Seguridad

- No tocar secretos
- No compartir `auth.json`
- Guardrails activos
- Backup automatico en primera mutacion de config por sesion

## Diagnostico

Usa `/ein:status` para una vista rapida del sistema.

Usa `/ein:doctor-output` para smoke checks tecnicos. Si devuelve `FAIL`, revisa antes de usar flujos de entrega o mutacion. Si devuelve `OK_WITH_WARNINGS`, el sistema es usable pero hay algo que endurecer.

## Recovery

Si algo se rompe:

1. correr `/ein:doctor`
2. correr `/ein:doctor-output`
3. revisar backup en `~/.pi/agent/backups/auto/`
4. recuperar archivo desde snapshot
5. si el problema persiste, revisar logs en `~/.pi/agent/logs/tool-failures.ndjson`

## Checklist rapido antes de cerrar una tarea seria

- hay plan
- se aplico solo el scope
- hay verificacion real
- hay riesgos reportados
- el siguiente paso esta claro
