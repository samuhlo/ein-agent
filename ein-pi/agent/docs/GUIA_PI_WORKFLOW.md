# Guia Ein

Ein es un workbench de IA construido sobre Pi Coding Agent. Combina orquestacion inteligente, un flujo SDD estructurado, integracion con Linear y GitHub, y un sistema de skills por stack.

## Como Arrancar

```bash
pi
```

Si el binario aun no esta en el PATH de la terminal actual:

```bash
export PATH="$HOME/.bun/bin:$PATH"
pi
```

## Como Funciona

El prompt padre de Ein recibe tu mensaje en lenguaje natural y decide la ruta:

- **Trabajo simple** → responde directamente.
- **Trabajo enfocado** → delega a un subagente visible (`ein-linear`, `ein-github`, fase SDD).
- **Trabajo complejo** → ejecuta la chain `ein-sdd` (init → explore → design → apply → verify).

Si quieres forzar modo directo sin pasar por el orquestador:

```text
directo: <tarea>
```

## Comandos Principales

SDD:

```text
/ein:sdd:init
/ein:sdd:new <cambio>
/ein:sdd:apply <cambio>
/ein:sdd:verify <cambio>
/ein:sdd:continue <cambio>
```

Linear:

```text
/ein:linear:new <request>
/ein:linear:start <issue-id>
/ein:linear:sync <issue-id>
/ein:linear:verify <issue-id>
/ein:linear:close <issue-id>
```

GitHub:

```text
/ein:github:branch <issue-or-topic>
/ein:github:commit <issue-or-topic>
/ein:github:pr <issue-or-topic>
/ein:github:review [pr-or-diff]
/ein:github:sync <issue-id>
```

Skills y mantenimiento:

```text
/ein:skills
/ein:skills update
/ein:skills add <skill>
/ein:skills clean
/ein:skills:advisor <tarea>
/ein:backup
/ein:doctor-output
```

Ayuda y diagnostico:

```text
/ein:help
/ein:help full
/ein:status
/ein:doctor
/ein:doctor-output
```

## Flujo SDD

Flujo unico `ein-sdd`: **init → explore → design → apply → verify**.

- `design` reune propuesta, spec tecnica y tareas en un solo artefacto `design.md`.
- `apply` no ocurre automaticamente despues de planificar; requiere scope aprobado.
- Linear preflight es obligatorio antes de SDD, salvo "no linear".

## Modelos

| Nivel | Uso | Modelo |
| --- | --- | --- |
| Base | tareas normales | `minimax/MiniMax-M2.7` |
| Heavy | review, seguridad, arquitectura | `openai-codex/gpt-5.5` |
| Orquestador | chains explicitas | `openai-codex/gpt-5.5` |

## Secretos y Auth

Las claves viven en `~/.config/opencode-secrets/` y nunca se commitean ni se pegan en logs:

- `minimax-api-key` — MiniMax
- `linear-api-key` — Linear (tambien acepta `LINEAR_API_KEY` o `LINEAR_TOKEN` en entorno)
- `context7-api-key` — Context7

## Subagentes Visibles

| Agente | Proposito |
| --- | --- |
| `ein-linear` | Preflight, CRUD Linear, sync |
| `ein-github` | Delivery GitHub, PR, review |
| `sdd-init` | Inicializar cambio SDD |
| `sdd-explore` | Explorar codebase y riesgos |
| `sdd-design` | Propuesta + spec + tareas unificados |
| `sdd-apply` | Implementar con TDD estricto |
| `sdd-verify` | Verificar evidencia y calidad |

Chain unica: `ein-sdd`.

Los builtins de pi-subagents (scout/worker/reviewer/oracle/context-builder) estan desactivados.

## Skills

El stack principal esta definido en `~/.pi/agent/skills/stack-profile.json` (ein-web-motion-stack v2: Nuxt, Vue, GSAP, Drizzle, Hono, Tailwind v4, Bun).

Skills en disco: `~/.pi/agent/skills/local/` y `~/.pi/agent/skills/downloaded/`.

La inyeccion de skills es automatica: antes de cada delegacion a un subagente, Ein resuelve las skills relevantes para la tarea e inyecta sus rutas `SKILL.md` en el system prompt del subagente.

## Memoria

Engram corre como MCP via `~/.pi/agent/mcp.json`, usando la DB `~/.engram-pi`. Context7 corre via `bunx @upstash/context7-mcp`.

Ambos son lazy: solo arrancan cuando el modelo llama una tool.

## Diagnostico

```text
/ein:status          → vista compacta del estado operativo
/ein:doctor-output   → smoke test tecnico (OK / OK_WITH_WARNINGS / FAIL)
```
