# Estado De Migracion Ein

## Completado

- Pi instalado con Bun: `@earendil-works/pi-coding-agent@0.75.5`.
- Rebrand completado: producto `Ein`, autor `samuhlo`, prefijo canonico `/ein:*`.
- Default model fijo en `minimax/MiniMax-M2.7`.
- Heavy/escalation model reservado para `openai-codex/gpt-5.3-codex`. **(Histórico — ahora es `gpt-5.5`)**
- Orchestrator explicito reservado para `openai-codex/gpt-5.5`.
- `minimax-cn` eliminado de `auth.json`.
- Config global creada en `~/.pi/agent`.
- `AGENTS.md` global Pi creado.
- `settings.json` apunta a skills existentes.
- `auth.json` contiene credenciales live de los providers; no debe compartirse, commitearse ni pegarse. Futura hardening: mover a env o archivo respaldado si Pi lo soporta.
- Prompt templates migrados para SDD, Linear, GitHub y design-to-code.
- Extension `samuhlo-guardrails` creada.
- `samuhlo-guardrails` endurecida: protege `auth.json`, `settings.json`, secretos locales y rutas de backup/memoria salvo override explicito.
- Extension `samuhlo-workflows` creada.
- Extension `samuhlo-engram` creada con herramientas `engram_context`, `engram_search` y `engram_save` via CLI local.
- Extension `samuhlo-orchestrator` creada con routing simple/complejo hacia agents/chains visibles.
- Extension `samuhlo-skill-registry` creada para bloque 4: inventario, resolucion, digest y feedback de skills.
- `samuhlo-orchestrator` ahora inyecta `Skill Digest` en prompt de subagentes y anade `Skill Feedback` post-ejecucion.
- Extension `samuhlo-doctor` creada: reporta estado del workbench, detecta el secreto local de Linear y verifica que las demas extensiones cargan.
- Extension `samuhlo-backup` creada: genera snapshot automatico antes de primera mutacion de `~/.pi/agent` por sesion y comando manual `/ein:backup`.
- Extension `samuhlo-context7-bridge` creada: smoke test pasa para `context7_resolve_library` y `context7_query_docs`.
- Extension `samuhlo-linear-bridge` creada: usa `LINEAR_API_KEY`, `LINEAR_TOKEN` o `/Users/samu/.config/opencode-secrets/linear-api-key`.
- Extension `samuhlo-minimax-bridge` creada: usa `/Users/samu/.config/opencode-secrets/minimax-api-key` para `web_search` y `understand_image`.
- Skills copiadas dentro de `~/.pi/agent/skills/local` y `~/.pi/agent/skills/downloaded`.
- Engram separado para Pi en `/Users/samu/.engram-pi`.
- Documentacion base creada.
- `/ein:status` usa salida sobria `/// 000` sin emojis decorativos.
- Comando redundante de estado eliminado; `/ein:status` queda como vista operativa unica.
- `/ein:help` y `/ein:help full` actualizados con comandos canonicos.
- `/ein:orchestrate`, `/ein:skills` (status/update/add/clean), `/ein:skills:advisor`, `/ein:sdd:*`, `/ein:linear:*`, `/ein:github:*` y `/ein:design:image` quedan como interfaz publica actual.
- `/skill:*` sigue activo como interfaz nativa de Pi; Ein usa digest compacto para SDD.
- `/ein:doctor-output` ampliado: core, comandos, SDD, skills, guardrails, integraciones y contratos Linear.
- Smoke test default `minimax/MiniMax-M2.7` completado: Pi respondio `READY`.
- Smoke test heavy `openai-codex/gpt-5.3-codex` completado: Pi respondio `READY`. **(Histórico)**
- Smoke test orchestrator `openai-codex/gpt-5.5` completado: Pi respondio `READY`.
- Registro de delegacion visible verificado: `subagent({ action: "list" })` confirma agentes `ein-*` y chains `ein-*` descubiertos por `pi-subagents`.
- Bloqueador de carga de extensiones resuelto: backticks de Markdown escapados dentro de la template literal de `doctorReport()` en `ein-doctor.ts`.

## Verificacion

- `bun build extensions/*.ts --external "@earendil-works/pi-coding-agent" --outdir "<tmp>"` -> Passed para las 8 extensiones.
- `ein_pi_doctor` smoke test -> Passed: reporta skills, extensiones e integraciones.
- `ein_pi_doctor_output` -> Passed: resultado global `OK`.
- `ein-skill-registry.ts` compila dentro del build general de extensiones.
- `pi --offline --print "hi"` -> Passed con extensiones habilitadas.
- `pi --offline --list-models` -> Passed; `minimax-cn` ausente.
- Auth providers activos: `openai-codex`, `minimax`.
- `ENGRAM_DATA_DIR=/Users/samu/.engram-pi engram stats` -> Passed.
- `pi --offline --no-session --no-tools -p "Responde exactamente READY"` -> Passed con MiniMax default.
- `pi --offline --provider openai-codex --model gpt-5.3-codex --no-session --no-tools -p "Responde exactamente READY"` -> Passed. **(Histórico — modelo discontinuado)**
- `pi --offline --provider openai-codex --model gpt-5.5 --no-session --no-tools -p "Responde exactamente READY"` -> Passed.
- Context7 bridge smoke test: `context7_resolve_library` y `context7_query_docs` pasan.
- Linear bridge smoke test: `linear_viewer` pasa usando el archivo secreto local.
- MiniMax bridge smoke test: `minimax_web_search` y `minimax_understand_image` pasan usando el archivo secreto sincronizado desde Pi auth.

## Pendiente

- Probar en sesion interactiva real el comportamiento del orquestador con una tarea compleja.
- Empaquetar esto como paquete Pi reutilizable si el setup se estabiliza.
- Decidir si se eliminan aliases legacy cuando la interfaz `/ein:*` este consolidada.

## Riesgos

- Los subagentes OpenCode no existen en Pi; Ein usa `pi-subagents` visibles y debe reiniciarse para descubrir cambios de agentes/chains.
- `auth.json` y los archivos bajo `/Users/samu/.config/opencode-secrets` contienen credenciales live y no deben commitearse ni pegarse en logs.
- Los aliases legacy reducen friccion, pero pueden confundir si se documentan como ruta principal.

## Rollback

Usa `opencode-trabajo` o `ocw`. OpenCode sigue intacto.
