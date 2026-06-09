# Ein: guia de comandos

Author: samuhlo

## Lectura rapida

Ein usa `brand.json` solo para definir el prefijo de comandos.

Configuracion actual:

```json
{
  "agentName": "Ein",
  "commandPrefix": "ein",
  "author": "samuhlo"
}
```

El prefijo canonico actual es:

```text
/ein:*
```

No hay alias publicos con prefijo personal. Si necesitas cambiar comandos slash, cambia solo `commandPrefix` en `~/.pi/agent/brand.json`.
`agentName` queda fijo en `Ein` y `author` queda fijo en `samuhlo`.

## Arquitectura de agentes: /ein:* es control manual

Ein utiliza **pi-subagents visibles** para las capacidades principales: Linear, GitHub, design y SDD. Los agentes viven en `~/.pi/agent/agents/*.md`; las chains viven en `~/.pi/agent/chains/*.chain.md`.

Los comandos `/ein:*` existen como **control manual y fallback**. La ruta feliz es hablar con Ein en lenguaje natural: el padre conserva tu texto, decide la ruta y delega de forma visible con `subagent` cuando hace falta. Las chains quedan para SDD/GitHub explicitos o flujos repetibles.

### Agentes Ein visibles

| Agente | Archivo | Proposito |
| --- | --- | --- |
| `ein-linear` | `agents/ein-linear.md` | Linear preflight, issues, proyectos, sync y comentarios humanos |
| `ein-github` | `agents/ein-github.md` | GitHub delivery, PRs, reviews y sync opcional |
| `sdd-*` | `agents/sdd-*.md` | Fases SDD (`init`, `explore`, `design`, `apply`, `verify`) invocadas por la chain |

### Chain Ein visible

| Chain | Uso |
| --- | --- |
| `ein-sdd` | Flujo SDD unico: init → explore → design → apply → verify |

Tu mensaje original se preserva. Las reglas de routing viven en el system prompt, no como reemplazo de tu texto.

### Troubleshooting de regresion

**Sintoma:** ves en el chat un bloque de texto que comienza con `Actua como orquestador...`, `HARD REQUIREMENT`, o un `/run-chain` que no escribiste.

**Significado:** el mensaje del usuario fue reemplazado por un prompt interno de orchestration. Esto es una **regression**.

**Comportamiento esperado:** texto original del usuario + respuesta del padre o llamadas visibles a agentes nativos de Pi en la conversacion.

## Uso recomendado: habla con Ein

Ein entiende lenguaje natural. No necesitas aprender comandos slash.
Estos son los flujos canonicos:

**Nueva tarea:** `Nueva tarea: ... montala en Linear y prepara SDD`
- Ein crea/reusa issue en Linear y se detiene en checkpoint. SDD se prepara cuando dices `continua con SDD`.

**Continuar con SDD:** `continua con SDD`
- Ein usa el flujo `ein-sdd` y espera confirmacion antes de aplicar.

**Aplicar:** `aplica el primer batch`
- Ein aplica el siguiente batch pendiente del SDD activo.

**Verificar:** `verifica`
- Ein corre checks reales y muestra evidencia.

**Sincronizar:** `sincroniza Linear`
- Ein actualiza progreso en Linear con comments y estado.

Las tablas de comandos de abajo son controles avanzados de emergencia o uso manual.
Solo recurres a ellas cuando el flujo natural no cubre el caso.

## Core

| Comando | Que hace | Que no hace |
| --- | --- | --- |
| `/ein:status` | Muestra estado basico del workbench con salida `/// 000` | No ejecuta diagnostico profundo |
| `/ein:help` | Lista comandos principales | No modifica configuracion |
| `/ein:help full` | Muestra guia completa por grupos | No ejecuta checks |
| `/ein:persona` | Muestra o cambia persona activa | Sin argumento solo muestra estado |
| `/ein:models` | Lista modelos configurados | No escribe archivos |
| `/ein:models:save` | Guarda snapshot de modelos | No cambia `settings.json` |
| `/ein:orchestrate <tarea>` | Fuerza planificador de orquestacion | No salta gates humanos |
| `/ein:skills` | Estado del stack fijo: core/opcionales/fuera de stack + hash checks | No desactiva `/skill:*` nativo |
| `/ein:skills update` | Instala faltantes core y actualiza skills core cuando cambia hash | No usa `pi skill add <alias>` |
| `/ein:skills add <skill>` | Instala una skill puntual desde catalogo (ej. `zod`) | No instala si no existe mapping en `stack-profile.json` |
| `/ein:skills clean [--yes]` | Lista o archiva skills fuera de stack en `downloaded/` | No borra directo; archiva en `skills/archived/` |
| `/ein:skills:advisor <tarea>` | Resolucion y digest de skills para una tarea concreta | No sustituye el comando de mantenimiento |

## Linear

| Comando | Que hace |
| --- | --- |
| `/ein:linear:new <request>` | Crea o reutiliza proyecto/issue con preflight |
| `/ein:linear:project-bootstrap <proyecto> | <preset>` | Crea/reusa proyecto, milestones e issues base |
| `/ein:linear:milestones <proyecto>` | Lista milestones de un proyecto |
| `/ein:linear:start <issue>` | Arranca trabajo desde una issue Linear |
| `/ein:linear:sync <issue>` | Sincroniza progreso con Linear |
| `/ein:linear:verify <issue>` | Verifica y comenta resultado en Linear |
| `/ein:linear:close <issue>` | Cierra trabajo verificado en Linear |
| `/ein:linear:help` | Muestra ayuda Linear |

Reglas Linear:

- Usa `Samuhlodev` como team por defecto.
- Reutiliza proyectos/issues antes de crear duplicados.
- Verifica metadata tras crear o actualizar.
- No empieza implementacion despues de planificar sin checkpoint humano.
- `/ein:linear:start` delega a `ein-linear`.

## SDD

| Comando | Subagente/Chain | Que hace |
| --- | --- | --- |
| `/ein:sdd:init` | `sdd-init` | Inicializa o revisa contexto SDD minimo (`openspec/config.yaml`) |
| `/ein:sdd-preflight` | directo | Define modo de ejecucion y store de artefactos por sesion |
| `/ein:sdd:new <cambio>` | `ein-sdd` | Ejecuta el flujo: explore + design (propuesta+spec+tareas) |
| `/ein:sdd:apply <scope>` | `sdd-apply` | Aplica batch aprobado con evidencia (strict TDD si aplica) |
| `/ein:sdd:verify <scope>` | `sdd-verify` | Verifica checks reales y evidencia TDD sin inventar |
| `/ein:sdd:continue` | directo | Continua el flujo con checkpoint |
| `/ein:sdd-status` | directo | Muestra estado del cambio SDD activo |

Ein usa OpenSpec como store file-backed: `openspec/config.yaml` y `openspec/changes/`. La interfaz publica canonica es `/ein:sdd:*`.

## GitHub

| Comando | Que hace | Hard stop |
| --- | --- | --- |
| `/ein:github:branch <topic>` | Prepara rama | No commit/push/PR |
| `/ein:github:commit <topic>` | Crea commit local | No push/PR |
| `/ein:github:pr <topic>` | Crea/edita PR | No merge |
| `/ein:github:review <pr>` | Revisa diff/PR | Findings primero |
| `/ein:github:sync <ref>` | Sincroniza GitHub/Linear | No merge |
| `/ein:github:coderabbit <pr>` | Triagia CodeRabbit | Solo fixa si se pide |

Regla principal: delivery no se encadena. Branch, commit, push, PR y merge necesitan intencion explicita.

## Memoria

| Comando | Que hace |
| --- | --- |
| `/ein:memory` | Muestra modo de memoria, Engram y snapshot local |
| `/ein:memory-save <nota>` | Guarda nota manual en Engram |
| `/ein:resume` | Reanuda usando snapshot local + Engram segun modo |

Variable de modo:

```bash
EIN_MEMORY_MODE=local+engram
```

Valores:

- `local+engram`: default recomendado.
- `engram-only`: no crea `.piagents/session.md`.
- `local-only`: no llama a Engram.

## Doctor, backup y diagnostico

| Comando | Que hace |
| --- | --- |
| `/ein:doctor` | Diagnostico general del workbench |
| `/ein:doctor-output` | Smoke checks estaticos de Ein: core, comandos, SDD, skills, guardrails, integraciones y Linear |
| `/ein:backup` | Snapshot manual de configuracion Pi |

## Skills y diseno

| Comando | Que hace |
| --- | --- |
| `/ein:skills` | Estado y mantenimiento del stack fijo |
| `/ein:skills update` | Sync por hash: instala faltantes y actualiza cambios |
| `/ein:skills add <skill>` | Instala skill puntual por catalogo |
| `/ein:skills clean [--yes]` | Plan o apply de archivado en `archived/` |
| `/ein:skills:advisor <tarea>` | Resolve + digest para soporte de ejecucion |
| `/ein:orchestrate <tarea>` | Fuerza planificador de orquestacion |

Pi mantiene `/skill:*` activo por configuracion (`enableSkillCommands: true`). Ein no lo reemplaza: lo usa como capacidad directa. Para soporte de tarea usa `/ein:skills:advisor` (tools `ein_skill_resolve` + `ein_skill_digest`), y para mantenimiento usa `/ein:skills`.

Archivos de estado de skills:

- `~/.pi/agent/skills/stack-profile.json` (perfil fijo, brand-agnostic)
- `~/.pi/agent/skills/skills-lock.json` (hash/source por skill instalada)
- `~/.pi/agent/skills/archived/` (archivo reversible, no borrado)

## Variables utiles

| Variable | Uso |
| --- | --- |
| `EIN_MEMORY_MODE` | Controla memoria local/Engram |
| `EIN_ALLOW_CONFIG_WRITE` | Autoriza escritura excepcional de config protegida |
| `LINEAR_API_KEY` | Token Linear |
| `LINEAR_TOKEN` | Token Linear alternativo |

## Runbooks

### Crear trabajo Linear

```text
/ein:linear:new Crear pantalla de estadisticas del proyecto X
```

### Bootstrap de proyecto

```text
/ein:linear:project-bootstrap Portfolio | front-design
```

### Trabajo SDD

```text
/ein:sdd:new <cambio>
/ein:sdd:apply <batch>
/ein:sdd:verify <scope>
```

### Entrega GitHub

```text
/ein:github:branch SAM-123
/ein:github:commit SAM-123
/ein:github:pr SAM-123
```

### Reanudar contexto

```text
/ein:resume
```

### Diagnostico

```text
/ein:doctor
/ein:doctor-output
```

## Errores comunes

### Doctor-output marca FAIL

Ejecuta:

```text
/ein:doctor-output
```

Si falla, revisa la seccion concreta del reporte. `FAIL` bloquea uso de flujos de entrega o mutacion; `WARN` indica una mejora recomendada pero el sistema sigue usable.

### Aparece `.piagents/session.md`

Es normal con `EIN_MEMORY_MODE=local+engram`. La carpeta se excluye localmente via `.git/info/exclude`.

### El agente quiere hacer commit y push juntos

Debe separarlo. Si no lo hace, revisa `sanitizeSubagentOutput(...)` y los hard gates.
## Persona y estilo de salida

| Comando | Que hace |
| --- | --- |
| `/ein:persona` | Muestra persona activa |
| `/ein:persona samuhlo` | Activa modo personal docente |
| `/ein:persona neutral` | Activa modo texto plano directo |

Modos:

- `samuhlo`: explicacion docente fuerte, estructura y profundidad.
- `neutral`: salida plana, sin plantilla `// 000`, sin sobreexplicacion.
