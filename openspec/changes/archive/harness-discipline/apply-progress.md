# Apply progress — harness-discipline

status: complete
<!-- 8 grupos completos -->

## Grupo 001 — `commandIsExplicitlyAllowed()` (guardrails.ts)

Implementada la función pura `commandIsExplicitlyAllowed(command: string): boolean` en
`ein-pi/agent/lib/guardrails.ts`, consumida solo por `cc-ein` (Pi runtime intacto: no
se tocó `confirmCommand()`, `DENIED_BASH_PATTERNS` ni `CONFIRM_BASH_PATTERNS`).

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | Añadido bloque `describe("commandIsExplicitlyAllowed", ...)` en `tests/guardrails.test.ts` (10 tests, casos de allowlist, flags, segmentos, metacaracteres) | `bun test tests/guardrails.test.ts` → 29 pass / 10 fail (`commandIsExplicitlyAllowed is not a function`) |
| GREEN | Implementada la función + tablas de flags bloqueados (branch/commit/add), escaneo letra-a-letra de cortos agrupados, split de segmentos por operador, rechazo por metacaracteres | `bun test tests/guardrails.test.ts` → 39 pass / 0 fail |
| TRIANGULATE | +2 tests: mensajes de commit citados/con `=`, matriz "todos seguros vs. uno inseguro" en segmentos múltiples | `bun test tests/guardrails.test.ts` → 41 pass / 0 fail, 150 expect() calls |
| REFACTOR | No requerido: la estructura (tablas + helpers `shortFlagBundleHasBlockedLetter`/`longFlagIsBlocked`/`segmentIsExplicitlyAllowed`) ya salió limpia del GREEN; sin duplicación que resolver | — |

### Casos límite cubiertos

- `git branch` permitido; `-D`/`-d`/`--delete` no, incluyendo flags intercalados
  (`git branch --color -D nombre`) y cortos agrupados (`-rd`, `-r -d`) detectados
  letra a letra, no por literal.
- `git add . && git push`: el segmento `push` no se auto-aprueba por el segmento `add`
  — cada segmento se evalúa de forma independiente (`segmentIsExplicitlyAllowed`).
- Sustitución de comandos (`` ` ``, `$(`) y redirección (`<`, `>`, `>>`) descalifican
  el comando entero vía `UNSAFE_METACHAR_PATTERN`.
- Solo lectura (`status`, `diff`, `log`) permitido con cualquier flag.
- `add`/`commit`/`branch` permitidos solo sin flags bloqueados; `commit` exige además
  fuente de mensaje no interactiva (si no, se asume que abriría un editor y colgaría
  el tool call headless).
- Split de segmentos por `&&`, `||`, `;`, `|`, newline; comando vacío/blank → `false`.

### Verificación real

`bun test tests/guardrails.test.ts tests/git-baseline.test.ts` → **56 pass / 0 fail**,
181 `expect()` calls (`tests/guardrails.test.ts`: 41 pass, 150 expects). Sin
regresiones en los tests preexistentes de guardrails (grant de entrega, denegación,
confirmación) ni en `git-baseline.test.ts`.

### Fuera de alcance de este grupo (dejado para 003+)

- Precedencia deny → confirm → allow (grupo 003, `guardCmd()` en `cli.ts`) — esta
  función solo responde "¿está explícitamente permitido?", no decide.
- `renderWorkingTreeLine()`, `statusCmd()`, `review-forecast.ts`, `sync.ts`,
  `settings.json`, `CLAUDE.md` — grupos 002–008, no tocados por instrucción explícita
  de alcance.

## Grupo 002 — `renderWorkingTreeLine()` (git-baseline.ts)

Implementada la función pura `renderWorkingTreeLine(b: GitBaseline): string | null` en
`ein-pi/agent/lib/git-baseline.ts`. Es el ÚNICO canal para el reporte de working-tree
(diseño: `sync.ts` descartado porque despliega a `~/.claude-ein` y nunca ve el árbol del
proyecto). Consume `GitBaseline` ya clasificado por `readGitBaseline()`; no vuelve a
tocar git ni el filesystem. `renderGitBaselineLine()` (preflight de Pi) queda intacto.
El cableado a `statusCmd()` es del grupo 004, no se hizo aquí.

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | Añadido `describe("renderWorkingTreeLine", ...)` en `tests/git-baseline.test.ts` (no-repo→null, limpio, sucio con warning, inequívoco vs. limpio) | `bun test tests/git-baseline.test.ts` → error de import, `renderWorkingTreeLine` no exportada |
| GREEN | Implementada la función: null si `!isRepo`, línea sobria si `!dirty`, bloque multilínea `UNCOMMITTED` + remedio (stash/commit) si `dirty` | `bun test tests/git-baseline.test.ts` → 19 pass / 0 fail |
| TRIANGULATE | +1 test: salida multilínea con `\n` puro (sin `\r`), portable Windows/POSIX | `bun test tests/git-baseline.test.ts` → 20 pass / 0 fail |
| REFACTOR | No requerido: función de 6 líneas, sin duplicación con `renderGitBaselineLine` | — |

### Casos cubiertos

- No-repo → `null` (no reporta un árbol que no existe).
- Repo limpio → línea sobria "clean (no uncommitted changes)", sin la palabra `UNCOMMITTED`.
- Repo sucio → bloque VISIBLE con `UNCOMMITTED` + guía de remedio (`stash` y `commit`
  ambos presentes en el texto).
- Sucio vs. limpio producen textos distintos (inequívoco).
- Salida multilínea usa `\n` puro, sin CRLF.

### Verificación real

`bun test tests/git-baseline.test.ts tests/guardrails.test.ts` → **61 pass / 0 fail**,
192 `expect()` calls. Sin regresiones sobre el grupo 001 (`guardrails.test.ts`) ni sobre
el resto de `git-baseline.test.ts` (parseRecentReset, renderGitBaselineLine,
readGitBaseline, integración preflight).

### Fuera de alcance de este grupo (dejado para 003+)

- Cableado al comando `status` de `cc-ein-sdd` (grupo 004) — esta función solo formatea,
  no se consume todavía desde ningún CLI.
- `guardrails.ts`, `cli.ts`, `settings.json`, `review-forecast.ts`, `sync.ts`,
  `CLAUDE.md` — no tocados, por instrucción explícita de alcance.

## Grupo 005 — Exclusión de `openspec/**` del presupuesto de revisión

Añadida la entrada `":(exclude)openspec/**"` a `PRODUCTION_EXCLUDES` en
`ein-pi/agent/lib/review-forecast.ts` (final del array, sin variante por plataforma:
`shell:false` ya garantiza que git parsea el pathspec directamente).

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | Nuevo test en `tests/review-workload-guard.test.ts`: repo temporal con 3 líneas de producción + `openspec/config.yaml` + `openspec/changes/x/design.md` anidado, asertando `production: 3` | `bun test tests/review-workload-guard.test.ts` → 8 pass / 1 fail (`production` recibido `7`, confirma que hoy `openspec/` sí cuenta) |
| GREEN | Añadida la línea `":(exclude)openspec/**"` al array | `bun test tests/review-workload-guard.test.ts` → 9 pass / 0 fail |
| TRIANGULATE | Corridos también `tests/guardrails.test.ts` y `tests/git-baseline.test.ts` en el mismo run para confirmar cero regresión cruzada | `bun test tests/guardrails.test.ts tests/git-baseline.test.ts tests/review-workload-guard.test.ts` → 70 pass / 0 fail, 217 expect() calls |
| REFACTOR | No requerido: cambio de una línea, sin duplicación ni estructura que limpiar | — |

Fuera de alcance: `guardrails.ts` y `git-baseline.ts` no se tocaron (grupos 001-002 cerrados).

## Grupo 006 — Verificación del hook de sync (sin código nuevo)

Tarea de verificación, no de implementación. Inspeccionado `cc-ein/sync.ts:159-172`:
`settingsObj.hooks` se REASIGNA por completo en cada `runSync()` (no se hace append a un
array existente), por lo que la inyección es idempotente por construcción — correr sync
dos veces produce el mismo objeto `hooks`, nunca entradas duplicadas. El matcher es
`"Bash"` únicamente, y `guardBin` usa ruta absoluta (`join(DEST, "bin", "cc-ein-sdd")`),
coherente con el diseño (línea 142) que exige ruta absoluta para no depender de `PATH`.
No existe test dedicado a `sync.ts` en `tests/` (confirmado por grep); ninguno de los
tests existentes (`guardrails.test.ts`, `sdd-guardrails.test.ts`) cubre este fichero. El
design no pedía código nuevo aquí, solo confirmación — no se escribió test nuevo ni se
tocó `sync.ts`.

## Grupo 003 — Precedencia de decisión del guard (`cli.ts:resolveGuardDecision`/`guardCmd`)

Extraída una función pura `resolveGuardDecision(rawInput, cwd)` de `guardCmd()` en
`cc-ein/sdd-cli/cli.ts`, con precedencia FIJA `deny → confirm → allow → none` (consume
`evaluateDeniedCommand`/`commandRequiresConfirmation`/`commandIsExplicitlyAllowed` de
`guardrails.ts`, sin tocarlo). El estado SDD (`resolveSddStatus`) se lee DESPUÉS de la
decisión y solo enriquece `reason` (nota `[sdd: <change> · fase <phase>]` o `[sdd: sin
cambio activo]`) — nunca crea una cuarta decisión. `guardCmd()` no importa
`consumeDelegatedDelivery`: un grant de Pi dejado en disco no puede colar un `allow`
(decisión 1D). JSON malformado / comando ausente → `null` → sin salida (`guardCmd` no
escribe nada, Claude Code sigue su flujo normal) — degrada abierto, sin log.

Cambio de andamiaje necesario para testear: el dispatch final de `cli.ts` (el
`switch(cmd)` que antes corría en cada import) quedó tras `if (import.meta.main)`, porque
sin el guard, importar el módulo desde el test ejecutaba el CLI real con el argv del test
runner y mataba el proceso. Verificado que el binario real sigue funcionando igual vía
stdin (`bun cc-ein/sdd-cli/cli.ts guard` y `status` probados manualmente, salida
idéntica al comportamiento previo).

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | Creado `tests/harness-discipline.test.ts` (16 tests: precedencia, degradación abierta, advisory SDD, no-consumo de grant) contra `resolveGuardDecision` aún no exportada | import fallaría (`resolveGuardDecision` no existe) |
| GREEN | Implementada `resolveGuardDecision` + `sddAdvisoryNote` + `import.meta.main` guard en `cli.ts`, exportada | `bun test tests/harness-discipline.test.ts` → 16 pass / 0 fail, 21 expect() calls |
| TRIANGULATE | Casos ya incluidos en el RED: matriz mixta (deny+allow, confirm+allow, confirm+deny, all-allow), envelope con solo `{decision, reason}`, advisory en deny/ask además de allow | mismos 16 pass cubren la matriz sin test adicional |
| REFACTOR | No requerido: la extracción de `resolveGuardDecision` ya separó decisión pura de I/O; sin duplicación que resolver | — |

## Grupo 007 — `cc-ein/settings.json`: allowlist de subcomandos de git de solo lectura

Añadido `permissions.allow: ["Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)"]`
a `cc-ein/settings.json`. `deny` (5 entradas: force-push variantes, `rm -rf /`,
`rm -rf ~`) sin tocar. `branch`/`commit`/`add` deliberadamente FUERA de
`settings.json` (decisión cerrada del design): los matchers por prefijo no pueden
excluir `-D`/`--amend`, así que quedan solo bajo `commandIsExplicitlyAllowed()`
(grupo 001), que sí inspecciona flags. Verificado `cc-ein/sync.ts:161-171`: solo
reasigna `settingsObj.hooks`, nunca toca `settingsObj.permissions` — las entradas
`allow` sobreviven a `runSync()` sin riesgo de ser pisadas.

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | Nuevo `describe("cc-ein/settings.json permissions", ...)` en `tests/harness-discipline.test.ts` (3 tests: allow exacto, allow sin branch/commit/add, deny sin cambios) leído contra el fichero previo (sin `allow`) | `bun test tests/harness-discipline.test.ts` → fail (`allow` era `undefined`) |
| GREEN | Añadido el array `allow` a `cc-ein/settings.json` | `bun test tests/harness-discipline.test.ts` → 28 pass / 0 fail |
| TRIANGULATE | Test de exclusión explícita (`not.toContain` branch/commit/add) ya incluido en el RED, cubre el caso negativo sin test adicional | mismos 28 pass |
| REFACTOR | No requerido: fichero de config de 3 líneas nuevas | — |

## Grupo 008 — Bloque de política de allowlist en `cc-ein/CLAUDE.md`

Añadido bloque `<!-- ein:harness-discipline:start -->` ... `<!-- ein:harness-discipline:end -->`
antes de `## Seguridad`, documentando qué gatea el hook (`Bash` matcher: subcomandos
de git allow/confirm/deny) sin reclamar mecanismo sobre `Edit`/`Write` ni sobre
delegación en subagentes — honesto sobre el techo técnico. Bloque delimitado y
mínimo para que `core-parity` (change futuro) pueda regenerarlo sin deshacer esta
decisión; resto del documento intacto.

Grupo de prosa, sin test (según instrucción). Verificación: inspección manual de
los marcadores y contenido.

### Verificación real (8 grupos)

`bun test` (suite completa, 88 ficheros) → **1046 pass / 0 fail**, 3325
`expect()` calls, 8.92s. Sin regresiones tras cerrar los 8 grupos.

### Casos por escenario del delta

- `guard-decision-precedence`: deny gana sobre allow (`rm -rf /`), confirm gana sobre
  allow (`git push`), `git add . && git push` NO se auto-aprueba (confirm gana en
  segmentos mixtos), `git push && rm -rf /` → deny (deny gana también sobre confirm).
- `guard-envelope-degrades-open`: JSON inválido, `tool_input.command` ausente, comando
  vacío → los tres devuelven `null` (sin decisión, sin excepción); envelope resuelto
  contiene solo `{decision, reason}`.
- `guard-sdd-state-is-advisory`: sin cambio activo y con cambio activo en fase `tasks`
  producen la MISMA decisión (`allow` para `git status`); el nombre/fase del change
  aparece solo en `reason`, verificado también para deny y confirm.
- `guard-ignores-cross-harness-delivery-grants`: `grantDelegatedDelivery(cwd)` (grant real
  de Pi) seguido de `git push` sigue devolviendo `ask`, no `allow` — `guardCmd` no importa
  `consumeDelegatedDelivery`.

### Verificación real

`bun test tests/guardrails.test.ts tests/git-baseline.test.ts tests/review-workload-guard.test.ts tests/harness-discipline.test.ts`
→ **86 pass / 0 fail, 238 expect() calls**. Sin regresión en los grupos 001/002/005
(stderr ruidoso de `git diff --no-index` en fixtures preexistentes, no relacionado con
este cambio). Probado manualmente el binario real: `guard` sobre `git status` y `git push`,
y `status` sobre el propio repo — salida idéntica a la esperada, `import.meta.main` no
alteró el comportamiento en ejecución directa.

Fuera de alcance (según instrucción): `guardrails.ts`, `git-baseline.ts`, `settings.json`
(grupo 007), `CLAUDE.md` (grupo 008), `review-forecast.ts`, `sync.ts` no se tocaron. El
bootstrap de repo y el reporte de working tree (grupo 004) no se implementaron aquí.

## Grupo 004 — Status: bootstrap del repo y canal de working tree (`cli.ts:statusCmd`)

Extraída `buildStatusOutput(cwd, change?)`, función pura que envuelve la generación de
texto de `statusCmd()` (mismo patrón que `resolveGuardDecision` del grupo 003: separa
lógica testeable de I/O). Añade dos cosas: (a) `bootstrapRepoIfNeeded(cwd)` — si `cwd`
no es repo git (`readGitBaseline(cwd).isRepo`), existe `openspec/changes/` y ni
`CC_EIN_NO_GIT_INIT` ni `CI` están puestas, corre `git init` best-effort (timeout 5s,
stdio ignorado); cualquier error se captura y se devuelve como string, nunca se propaga;
(b) tras el bootstrap, lee `readGitBaseline(cwd)` de nuevo y añade
`renderWorkingTreeLine(baseline)` (grupo 002, consumida sin modificar) al final del
texto — si el repo no llegó a existir (init falló o se saltó), añade `repo: none (git
init failed — <razón>)` en su lugar. `statusCmd()` queda como wrapper de una línea:
`console.log(buildStatusOutput(cwd, change))`. No se tocó `resolveGuardDecision` ni la
precedencia del guard; `guardrails.ts`, `git-baseline.ts`, `review-forecast.ts` y
`sync.ts` no se tocaron.

### TDD Cycle Evidence

| Fase | Acción | Resultado |
| --- | --- | --- |
| RED | 12 tests nuevos en `tests/harness-discipline.test.ts` (bootstrap: init condicionado, no-init sin artefactos, idempotencia, `CC_EIN_NO_GIT_INIT`, `CI`, fallo de init con `cwd` en modo `0o500`; working-tree: sucio, limpio, línea única) contra `buildStatusOutput` aún no exportada | import fallaría (símbolo inexistente) |
| GREEN | Implementados `bootstrapRepoIfNeeded` + `buildStatusOutput` + `statusCmd` reducido, exportado `buildStatusOutput` | `bun test tests/harness-discipline.test.ts` → 25 pass / 0 fail, 33 expect() calls (primer intento del caso de fallo de init con `PATH=""` no forzaba el error en este runtime; se cambió a `chmodSync(cwd, 0o500)` — destino no escribible — que sí reproduce el fallo de forma determinista) |
| TRIANGULATE | Casos ya cubiertos en el RED: no-repo+sin artefactos → no init; ya-repo → nunca reinicializa (compara contenido de `.git/` antes/después); `CI=1` y `CC_EIN_NO_GIT_INIT=1` por separado; init fallido no lanza excepción y reporta `repo: none` | mismos 25 pass, sin test adicional |
| REFACTOR | No requerido: el seam de bootstrap es una función de una responsabilidad, el seam de salida es una llamada a `renderWorkingTreeLine`; sin duplicación | — |

### Casos por escenario del delta

- `repository-bootstrap-is-best-effort`: init solo cuando no-repo + `openspec/changes/`
  presente; `CI`/`CC_EIN_NO_GIT_INIT` lo suprimen; repo ya existente nunca se
  reinicializa; fallo de init (destino no escribible) se captura y reporta como texto,
  sin excepción propagada.
- `working-tree-signal-single-channel`: la línea de `renderWorkingTreeLine` aparece
  exactamente una vez en la salida de `status` (verificado contando ocurrencias de
  `"Working tree:"` en el texto); sucio → línea con instrucción de stash/commit; limpio →
  línea sobria sin mención de `UNCOMMITTED`.

### Verificación real

`bun test tests/harness-discipline.test.ts tests/guardrails.test.ts tests/git-baseline.test.ts tests/review-workload-guard.test.ts`
→ **95 pass / 0 fail, 250 expect() calls**. Sin regresión en grupos 001/002/003/005
(mismo ruido preexistente de `git diff --no-index` en stderr de un fixture ajeno). Binario
real probado manualmente: `bun cc-ein/sdd-cli/cli.ts status` sobre el propio repo produce
la línea `Working tree: UNCOMMITTED changes present.` una sola vez, al final de la salida.

Fuera de alcance (según instrucción): `guardrails.ts`, `git-baseline.ts`,
`review-forecast.ts`, `sync.ts`, `settings.json` (grupo 007), `CLAUDE.md` (grupo 008) no
se tocaron; `resolveGuardDecision` y su precedencia quedaron intactos.

## Pendiente

Grupos 007, 008 sin empezar.
