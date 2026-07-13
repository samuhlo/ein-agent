# CodeGraph — evaluación e integración en Ein (plan de trabajo)

> Doc de trabajo. Origen: propuesta de samuhlo tras encontrar
> [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph).
> Fecha: 2026-07-13. Estado del repo en ese momento: `main @ 3c53a8f` (v0.17.6).
>
> **ESTADO: FASE 0 PENDIENTE.** Nada implementado aún. Este doc es el plan
> completo + protocolo de reanudación. Actualizar la línea ESTADO al avanzar.
>
> Reglas duras de esta casa (aplican a CUALQUIER agente que retome esto):
> commits con autoría SOLO samuhlo (nunca co-author de IA) · flujo
> `feat/* → dev → main` (nunca directo a main) · release = bump en
> `installer/src/core/version.ts` + `installer/package.json` + CHANGELOG +
> tag `installer-v*` · gate pre-merge: `bun test` + `cd installer && bun run
> typecheck` + `bun run bundle-template` · comentarios según skill
> `comment-style` · no push/PR sin OK explícito del usuario.

## // 000. OBJETIVO

Evaluar CodeGraph con datos (no hype) y, si compensa, integrarlo en Ein como
capacidad **opcional y conmutable** (`auto|on|off`), calcando el patrón que ya
funcionó con Hypa. Si los datos no dan, descartar y documentar por qué.

## // 001. QUÉ ES CODEGRAPH (hechos verificados 2026-07-13)

- Grafo de conocimiento del código, **100% local y determinista**: tree-sitter
  parsea → SQLite en `.codegraph/codegraph.db` (FTS5) → watcher nativo
  re-indexa incremental (debounce 2s).
- Integración por **MCP**: expone UN tool principal, `codegraph_explore`
  (código verbatim + call paths + blast radius en una llamada). También CLI:
  `codegraph explore|query|impact|affected`.
- Instalación: `npm i -g @colbymchenry/codegraph` (o install.sh con runtime
  bundleado). Por proyecto: `codegraph init`. Upgrade: `codegraph upgrade`.
- 40+ lenguajes (Vue/TS/Python/Go/Rust/... — cubre el stack de samuhlo Y es
  políglota), framework-routing para 17+ frameworks.
- MIT · ~59k stars · creado 2026-01 (≈6 meses) · release cadence altísima
  (3 releases en 4 días a fecha de este doc) · 314 issues abiertas.
- **Telemetría default-on** (anónima, allowlist auditable, respeta
  `DO_NOT_TRACK=1` y `CODEGRAPH_TELEMETRY=0`). En Ein irá SIEMPRE apagada.

## // 002. POR QUÉ (evidencia de coste, sesiones reales del planificador)

Las fases SDD que LEEN código son el mayor centro de coste de Ein. Medido en
`planificador-didactico` (cambio `progreso-anexos-rail`, 2026-07):

| Fase | Tokens | Tool uses (mayoría grep/read) |
|---|---|---|
| sdd-map | 98–110k | 35–44 |
| sdd-design | 140k | 26–31 |
| sdd-tasks | 252k | 29–46 |

≈490k tokens/cambio solo en descubrimiento de estructura — exactamente lo que
`codegraph_explore` colapsa a 1–2 llamadas. Benchmarks del proyecto (auto-
reportados, VERIFICAR en Fase 0): -81% tool calls, -64% tokens en repos grandes.

Encaje doctrinal: determinista (AST, no LLM), local, devuelve código verbatim
(bajo riesgo de alucinación), un solo tool (barato en prompt), degradable
(sin binario → grep/read como siempre). Complementario a `EIN.md` (verdad
curada inyectada) — no lo sustituye; sustituye los 30 reads del map.

## // 003. RIESGOS / DESVENTAJAS (conocidos antes de empezar)

1. **Churn**: proyecto de 6 meses a ritmo frenético → la API/tool puede cambiar.
   Mitigación: dep opcional, Ein degrada limpio, pin de versión si hace falta.
2. **GO/NO-GO TÉCNICO**: ¿los subagentes headless de pi-subagents ven los tools
   MCP del server (lifecycle lazy)? El 90% del valor está en sdd-map/design/
   tasks, que corren como hijos. Si los hijos no heredan el tool → no-go (o
   valor solo-orquestador, mucho menor). SE PRUEBA ANTES DE ESCRIBIR CÓDIGO.
3. **Footprint**: watcher por proyecto + proceso MCP (RAM/CPU de fondo) +
   `.codegraph/` (SQLite) por repo → hay que gitignorarlo (bloque gestionado).
4. **Frescura**: en un clone recién sincronizado (3 PCs) el índice puede estar
   stale hasta re-sync. Verificar el comportamiento de re-index bajo demanda.
5. Benchmarks auto-reportados: el número que vale es el medido en NUESTROS repos.

## // 004. FASE 0 — SPIKE MEDIDO (sin tocar Ein; todo desechable)

1. **Instalar CLI** (vía npm global, ya hay mise/npm en esta máquina):
   `npm i -g @colbymchenry/codegraph` → `codegraph telemetry off` LO PRIMERO.
2. **Indexar los dos repos de prueba**:
   `cd ~/Documentos/01_Code/ein-agent && codegraph init`
   `cd ~/Documentos/01_Code/planificador-didactico && codegraph init`
   Anotar: tiempo de index, tamaño de `.codegraph/`, RAM del watcher.
3. **Medir 4–5 preguntas típicas de sdd-map**, comparando tokens de la
   respuesta de `codegraph explore/query/impact` vs. lo que costaría a mano
   (grep + reads de los ficheros implicados). Preguntas propuestas:
   - "¿quién llama a `guardarActual`?" (planificador)
   - "call path de `useRecorrido` → stores" (planificador)
   - "blast radius de `app/composables/use-cursos.ts`" (planificador)
   - "¿dónde se usa `resolveHypaEnabled`?" (ein-agent)
   - "estructura de llamadas de `runOnboarding`" (ein-agent)
4. **EL TEST CRÍTICO (go/no-go)**: montar el MCP en un pi AISLADO
   (`EIN_PI_AGENT_HOME` temporal o mcp.json de prueba), y desde una sesión pi
   delegar un subagente headless con una task que exija `codegraph_explore`.
   Verificar en el envelope/session.jsonl del hijo que el tool se invocó.
5. **Criterio de decisión**: (a) subagentes CON acceso al tool, Y
   (b) ≥50% menos tokens en las preguntas de map. Ambos sí → Fase 1.
   (a) falla → STOP y documentar aquí (valor solo-orquestador: reevaluar).
   (b) falla → STOP y documentar aquí con la tabla de medición.

## // 005. FASE 1 — INTEGRACIÓN EIN-NATIVE (si Fase 0 da)

Calcar el patrón Hypa, pieza a pieza. Plantillas con ruta exacta:

- **Toggle**: nuevo `ein-pi/agent/lib/codegraph.ts` calcado de
  `ein-pi/agent/lib/hypa.ts` — modos `auto|on|off` (default **auto**),
  config `.pi/ein/codegraph.json`, `resolveCodegraphEnabled(cwd)`:
  `on`→true · `off`→false · `auto`→ binario en PATH **y** existe
  `.codegraph/` en el proyecto. Handler `/ein:codegraph` (calcar
  `handleHypaCommand`; si falta índice y modo≠off, ofrecer `codegraph init`).
- **MCP**: entrada en `ein-pi/agent/mcp.json` junto a engram/context7:
  lifecycle `lazy`, `directTools: true` (es un solo tool — no necesita
  pi-mcp-adapter), y `environment: { CODEGRAPH_TELEMETRY: "0" }`.
  OJO: mcp.json desplegado se templa por el installer; revisar
  `installer/src/core/deploy.ts` por si templa rutas de servers.
- **Directiva condicional** (patrón `einContextDirective` de
  `ein-pi/agent/lib/project-context.ts`, inyectada en `before_agent_start` de
  `ein-pi/agent/extensions/ein-ai.ts` ~línea 385): si
  `resolveCodegraphEnabled` → inyectar al orquestador y a las fases que leen
  código (map/design/tasks): "usa `codegraph_explore` PRIMERO; grep/read solo
  para verificar o para lo que el grafo no responda; cuenta las llamadas al
  grafo en el ledger como reads". Si está off/ausente: CERO líneas de prompt.
- **Gitignore**: añadir `.codegraph/` a `ENTRIES` en
  `ein-pi/agent/lib/gitignore.ts` (+ assert en `tests/gitignore.test.ts`).
- **Banner**: celda/estado opcional en `ein-pi/agent/extensions/ein-banner.ts`
  (como HYPA: `auto·on`/`auto·off`). Valorar si cabe sin ensanchar el grid.
- **Tests**: calcar `tests/hypa.test.ts` → `tests/codegraph.test.ts`
  (round-trip config, resolve por modo, detección de índice).
- **NO tocar**: onboarding (ya pregunta 5 esenciales; codegraph en `auto` no
  necesita wizard), pi-mcp-adapter, context-mode, Hypa.

## // 006. FASE 2 — INSTALLER + RELEASE (si Fase 1 convence en vivo)

- `installer/src/core/deps.ts`: dep opcional `codegraph` calcada de
  `resolveHypa`/`installHypa` (npm global; nunca bloquea) + entrada en
  `checkDeps` (`required: false`).
- `installer/src/cli/install.ts`: prompt en wizard (default no, como gh/hypa)
  + flag `--no-codegraph`. `installer/src/main.ts`: añadir el flag al help.
- `installer/src/core/verify.ts`: `warn(hasCodegraph, "codegraph cli", …)` en
  el grupo RUNTIME.
- README: sección plataforma + tabla de deps + comando `/ein:codegraph`.
- CHANGELOG + release `installer-v0.18.0` (minor: capacidad nueva) por
  `feat/* → dev → main` + tag. Deploy local: `cp` de los ficheros tocados a
  `~/.pi/agent/` (lib/, extensions/, mcp.json).

## // 007. PROTOCOLO DE REANUDACIÓN (para un agente en frío)

1. Leer este doc entero. La línea **ESTADO** de la cabecera dice la fase.
2. Verificar el estado real (no fiarse solo del doc):
   - `command -v codegraph` → ¿CLI instalado? `codegraph telemetry status`.
   - `ls ~/Documentos/01_Code/{ein-agent,planificador-didactico}/.codegraph`
     → ¿repos indexados?
   - `ls ein-pi/agent/lib/codegraph.ts` → ¿Fase 1 empezada?
   - `grep codegraph ein-pi/agent/mcp.json installer/src/core/deps.ts` →
     ¿MCP/installer cableados?
   - `git log --oneline -10 dev` → últimos commits (buscar "codegraph").
3. Los resultados de la Fase 0 (mediciones, go/no-go) se apuntan AQUÍ, en la
   sección // 008, antes de escribir código.
4. Cualquier desviación del plan se registra en // 008 con el porqué.

## // 008. REGISTRO DE DECISIONES Y MEDICIONES (vivo)

- 2026-07-13 — Plan creado. Decisiones fijadas con samuhlo: evaluar con spike
  medido primero (lección de Hypa); integración conmutable tipo Hypa
  (`auto|on|off`); telemetría siempre off; dep opcional, nunca obligatoria.
- (pendiente) — Resultados Fase 0: tabla de mediciones + resultado del test
  MCP-en-subagentes + decisión go/no-go.
