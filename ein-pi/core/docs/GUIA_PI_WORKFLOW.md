# Guía Ein (cómo trabajar)

Ein es un workbench de IA sobre Pi Coding Agent. Combina orquestación, un flujo SDD en 5 fases, integración con Linear y GitHub, y un sistema de skills en 3 capas.

## Cómo arrancar

```bash
pi
```

Si Pi no está en el PATH de esta terminal:

```bash
export PATH="$HOME/.bun/bin:$PATH"
pi
```

Verás el banner EIN (concrete + I amarilla) con tu nombre: **SAMUHLO · PI WORKBENCH**.

## Cómo decide Ein qué hacer

Le hablas en lenguaje natural y el prompt padre decide la ruta:

- **Trabajo simple** → lo hace directo.
- **Trabajo enfocado** → delega a un subagente visible (`ein-linear`, `ein-git`, una fase SDD).
- **Trabajo complejo** → ejecuta la chain `ein-sdd` (scope → map → design → tasks → apply → verify → close).

Tu mensaje original se conserva siempre.

## Flujos típicos (hablando natural)

```text
Nueva tarea: <descripción>. Móntala en Linear y prepara SDD
continúa con SDD
aplica el primer batch
verifica
sincroniza Linear
```

## Flujo SDD

Flujo único `ein-sdd`: **scope → map → design → tasks → apply → verify → close**.

- `design` reúne propuesta + spec técnica + tareas en un solo `design.md`.
- `apply` no ocurre solo: necesita un scope aprobado.
- En modo **team** el preflight de Linear corre antes de SDD (salvo "no linear"); en modo **solo** (por defecto) no hay Linear — el board es `openspec/changes/` + git + EIN.md. Cambia con `/ein:mode`.

Para preparar SDD en un proyecto: `/ein:ai:install-sdd`. El preflight: `/ein:ai:sdd-preflight`.

> El flujo se lanza por lenguaje natural o por la chain. No hay `/ein:sdd:new`.

## Modelos

| Quién | Modelo (preset full) |
| --- | --- |
| Orquestador (sesión principal) | `gpt-5.5` |
| `sdd-design` | `gpt-5.5` |
| Resto de agentes | `MiniMax-M2.7` |

- `/ein:models:full` → reparto de arriba.
- `/ein:models:lite` → todo a `MiniMax-M2.7` (cuando gpt-5.5 se queda sin cupo).

## Idioma

Dos ejes con `/ein:lang`: **conversación/UI** (locale global de `rpiv-i18n`) y **artefactos** (PR/commits/Linear, por proyecto en `.pi/ein/lang.json`, hereda el de conversación). Hoy `es`/`en`. Permite hablar en castellano y generar PRs/issues en inglés. La persona controla el tono, no el idioma.

1. **Locales** (`skills/local/`): tus reglas propias. Se sincronizan desde tu repo GitHub.
2. **Bajadas** (`skills/downloaded/`): set curado de fuentes fiables (onmax, antfu, greensock, vercel, yusukebe, midudev).
3. **Context7**: lo demás (drizzle, zod, tailwind, postgres...) se trae fresco en el momento.

Mantenimiento:

```text
/ein:skills                     → estado
/ein:skills update              → actualiza locales + bajadas
/ein:skills clean --yes         → borra lo que sobra (fuera de stack)
/ein:skills:advisor <tarea>     → qué skills usar + digest con Context7
```

La inyección de skills es automática: antes de cada delegación a un subagente, Ein resuelve las skills relevantes e inyecta sus rutas `SKILL.md` (y la guía de Context7 para techs sin skill) en el system prompt del subagente.

El perfil vive en `~/.pi/agent/skills/stack-profile.json`.

## Subagentes y chain

| Agente | Para qué |
| --- | --- |
| `ein-linear` | Preflight, CRUD Linear, sync |
| `ein-git` | Delivery GitHub, PR, review |
| `sdd-scope` | Definir alcance y presupuesto del cambio SDD |
| `sdd-map` | Mapear código y riesgos |
| `sdd-design` | Propuesta + spec + tareas |
| `sdd-apply` | Implementar con TDD |
| `sdd-verify` | Verificar evidencia y calidad |

Chain única: `ein-sdd`. Los builtins de pi-subagents (scout/worker/reviewer/oracle/context-builder) están desactivados.

> Para lanzar la chain por tool, `chain` es un **array de pasos** (objetos), nunca un string. El atajo manual fiable es `/run-chain ein-sdd -- <tarea>`.

## Secretos

Las claves viven en `~/.config/opencode-secrets/` y nunca se commitean:

- `minimax-api-key`, `linear-api-key`, `context7-api-key`.

`CONTEXT7_API_KEY` se exporta desde tu shell rc (no va en `mcp.json`).

## Memoria

Engram corre como MCP (`~/.pi/agent/mcp.json`) sobre la DB `~/.engram-pi`. Context7 corre via `bunx @upstash/context7-mcp`. Ambos son lazy: arrancan solo cuando el modelo llama una tool.

## Diagnóstico

```text
/ein:status          → vista compacta
/ein:doctor          → diagnóstico explicado
/ein:doctor-output   → smoke test técnico (8 grupos de checks)
```

## Instalar / actualizar (terminal)

```bash
ein install   # instalar o reparar
ein update    # actualizar (con backup)
ein doctor    # revisar
```
