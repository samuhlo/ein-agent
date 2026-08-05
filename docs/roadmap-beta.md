# Roadmap a la beta

Estado del plan tras cerrar `harness-discipline` (2026-08-05). Dos changes
pendientes, en este orden: **`core-parity`** y luego **`installer-beta`**.

Este documento existe para que el trabajo se pueda retomar desde cualquier
runtime (Pi o Claude Code) sin depender de la conversación donde se decidió.

---

## 00. Hecho: `harness-discipline`

PR [#101](https://github.com/samuhlo/ein-agent/pull/101). Allowlist de git con
inspección de flags, precedencia `deny → confirm → allow`, aviso de working tree
+ `git init` best-effort, y `openspec/` excluido del presupuesto de revisión.
Artefactos en `openspec/changes/archive/harness-discipline/`.

**Límite conocido que no se resolvió**: el hook `PreToolUse` tiene matcher
`Bash`, así que gatea comandos de shell pero no fuerza delegación en subagentes
ni intercepta `Edit`/`Write`. Entrar en el flujo SDD sigue dependiendo del
cumplimiento del modelo, no del mecanismo.

---

## 01. `core-parity` — que Pi y Claude compartan de verdad

> **Estado del apply:** completo. Las seis tareas están marcadas y la evidencia acumulada está registrada en `openspec/changes/core-parity/apply-progress.md`. La verificación independiente y el cierre siguen pendientes de `sdd-verify`; este estado no implica cierre final.

### Estado y evidencia del apply

El apply de `core-parity` deja completadas la generación determinista del coordinador Claude, la validación fail-closed de herramientas, tokens y routing, la sincronización explícita de OpenSpec y la cobertura de regresión correspondiente. La evidencia acumulada incluye las suites enfocadas de parity y contratos existentes, además de la suite completa, todas en verde durante los grupos de implementación.

`EIN.md` se conserva byte por byte, con sus placeholders curados sin completar y en su estado sin trackear. Este grupo solo actualiza el estado y la evidencia de `core-parity` en este roadmap; `installer-beta` y las decisiones no relacionadas permanecen intactos.

### El problema

`ein-pi/core/` ya es la fuente única y `cc-ein/sync.ts` ya es el compilador que
la adapta a Claude Code. Los agentes y las skills **sí** se derivan. El cerebro
del coordinador **no**: son dos documentos escritos a mano por separado que ya
divergieron.

| | fuente | tamaño | idioma | secciones |
|---|---|---|---|---|
| Pi | `ein-pi/core/AGENTS.md` | 46 líneas | inglés | Core Rules, Linear, GitHub, Delivery Gate, Pi Notes, Output |
| Claude | `cc-ein/CLAUDE.md` | 87 líneas | español | Cómo trabajas, Reglas de núcleo, Skills, Modo, Entrega, Voz, Formato Samu, SDD, MCP, Seguridad |

`sync.ts:155-156` lee `cc-ein/CLAUDE.md` y lo copia tal cual: cero derivación.
Cambias la disciplina en Pi y en Claude no se refleja. Nadie avisa.

### Las tres fugas silenciosas del sync

1. **Traducción best-effort.** `translateTools()` (`sync.ts:39`) deja pasar tal
   cual cualquier herramienta que no conozca. `translateBody()` (`sync.ts:56-62`)
   solo sustituye cinco tokens. Añades `ein_foo` en Pi → llega literal a Claude,
   donde no existe, y nada falla.
2. **`AGENT_MODELS` hardcodeado** (`sync.ts:70-81`). Diez entradas para diez
   agentes: coincide hoy por suerte. Agente nuevo → sin routing de modelo, sin
   aviso.
3. **`CC_NOTE`** (`sync.ts:47-50`) es una lista escrita a mano de conceptos de Pi
   que en Claude son inertes. Cada concepto nuevo hay que añadirlo manualmente.

### El caso vivido

Al cerrar `harness-discipline`, `cc-ein-sdd close` se bloqueó con
`[spec-pending]`. Causa: **`cc-ein-sdd` expone `status|check|close|guard` pero no
`sync`**. La sincronización del delta al spec canónico existe en el core de Pi
(`ein-pi/agent/lib/openspec-spec-sync-fs.ts`, `synchronizeOpenSpecFilesystem`) y
se invoca desde `ein-ai.ts:111`, pero el CLI de Claude no la ofrece. Hubo que
llamarla a mano con un script puente.

**Desde Claude Code no se puede cerrar un change que lleve delta.** Ese es el
agujero de paridad más caro que se ha encontrado.

### Alcance propuesto

- `cc-ein/CLAUDE.md` pasa a ser **generado** desde una base común + un bloque de
  adaptación, igual que ya se hace con los agentes. El bloque
  `<!-- ein:harness-discipline:start/end -->` que escribió el change anterior
  está delimitado precisamente para poder generarse sin deshacer trabajo.
- Las tres fugas pasan a **fallar ruidosamente**: herramienta desconocida,
  agente sin routing, o token `ein_*` sin traducir deberían romper el sync, no
  colarse.
- `cc-ein-sdd` expone `sync` (u otra vía) para cerrar changes con delta.
- Test de paridad core↔cc. Existe `tests/i18n-parity.test.ts` como precedente de
  estilo; no hay ninguno de paridad entre runtimes.

### Fuera de alcance

Fusionar los dos cerebros en uno. Pi y Claude tienen diferencias legítimas (el
modelo de coste por subagente, el CLI `cc-ein-sdd` frente a las tools nativas de
Pi). Lo que sobra no es la diferencia: es que sea implícita.

---

## 02. `installer-beta` — lo que falta para publicar

### Deriva release ↔ main

La release `latest` es `installer-v0.40.0` (commit `6a80c8e`). Después entraron
tres fixes: banner de versión, checksum obligatorio y escritura segura de
secretos. `installer/package.json` sigue en `0.40.0` y el CHANGELOG no los
recoge.

Ojo: `install.sh` se sirve desde `raw.githubusercontent.com/.../main/`, así que
**el parser estricto de checksum ya está vivo en producción** aunque el binario
no. Comprobado que el `checksums.txt` publicado tiene el formato GNU exacto que
el parser exige, así que no rompe — pero es deriva y hay que cerrarla con una
`0.41.0`.

### El E2E nunca se ha ejecutado

Cero runs de `e2e.yml`. El propio workflow dice que se lanza "antes de publicar
una release o cuando se toca el instalador a fondo", y el instalador se ha
tocado a fondo cuatro veces. Toda la evidencia reciente viene de tests con
harness falso (`curl`, `uname`, `sha256sum` sustituidos). La ruta `curl | bash`
real contra una release real no la ha ejercitado nadie.

### El runtime Claude no se puede instalar sin TTY

`runInstall(args, target = "pi")` (`installer/src/cli/install.ts:415`): en no
interactivo siempre es Pi. `parseInstallFlags` no acepta `--runtime`; la única
forma de elegir Claude o `both` es el menú interactivo (`cc-ein/menu.ts:41`). Y
`e2e/docker-test.sh` corre `ein install --yes`, así que **prueba solo Pi**.

Consecuencia: el titular de 0.40.0 es "multi-runtime Pi + Claude", el hotfix de
BunFS existía para arreglar el payload de `cc-ein`, y esa ruta no la valida nada
más que un smoke de materialización en el release workflow. En macOS, además,
`install.sh` no reabre `/dev/tty`, así que tras `curl | bash` hay que lanzar
`ein` a mano para llegar al menú — el único sitio desde donde se instala Claude.

### Orden de trabajo

1. Añadir `--runtime pi|claude|both` a `parseInstallFlags`. Desbloquea la
   instalación no interactiva de Claude **y** su cobertura E2E.
2. Extender `e2e/docker-test.sh` al ciclo Claude y **ejecutar el workflow `e2e`
   una vez de verdad**.
3. Arreglar cómo se muestra la versión en el instalador en macOS.
4. Bump a `0.41.0`, sección de CHANGELOG con los tres fixes, y release.

Los pasos 1-3 van antes del 4: publicar sin haber ejercitado nunca la
instalación real es el riesgo que una beta destapa en público.

---

## 03. Decisiones ya tomadas (no reabrir)

- **Orden**: `harness-discipline` → `core-parity` → `installer-beta`. La beta
  sale al final, con el cerebro unificado y el flujo endurecido.
- **Allowlist de git**: solo allowlist, sin conmutador de "modo auto". Un
  interruptor global de bypass es justo lo que la precedencia `deny → confirm`
  existe para evitar.
- **`reset --hard` se queda denegado.** Se pidió inicialmente que pidiera
  confirmación, pero destruye trabajo sin recuperación y la política llevaba
  tiempo en uso. Es preexistente de Pi (`guardrails.ts:36`), no la introdujo
  `harness-discipline`.
- **`settings.json` recibe solo `status`/`diff`/`log`.** `add`, `commit` y
  `branch` se gestionan en el hook porque los matchers por prefijo no saben
  excluir `-D`.

## 04. Pendiente sin decidir

- `EIN.md` está sin trackear y sus secciones curadas siguen en `_(pendiente)_`.
  Falta decidir si entra al repo.
