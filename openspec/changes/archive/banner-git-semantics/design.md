# Diseño — semántica Git veraz en el banner

## A. Proposal

### Intent

Sustituir `○N`, `sync?` y el ambiguo `pull` por un modelo Git compacto que muestre por separado: identidad de `HEAD`, cambios locales y relación con el upstream configurado. El banner seguirá siendo no bloqueante y no mutará Git; toda cuenta de commits se basará en objetos locales y dirá expresamente que procede de la ref de seguimiento.

### Problema

Hoy `computeGitSync()` mezcla proceso, interpretación y copy en un `string`: cuenta líneas de porcelain como `○N`, asume `origin/<rama>`, consulta `ls-remote`, colapsa behind y diverged en `pull`, y convierte fallos genéricos en estados que parecen afirmar conectividad o sincronía. Además, la promesa diferida no solicita un repaint al terminar y el copy Git no está localizado.

### Scope

**Incluye**

- Modelo tipado e independiente para `HEAD`, worktree y upstream.
- Parser robusto de `git status --porcelain=v1 -z`.
- Relación equal/ahead/behind/diverged contra la ref local de seguimiento configurada.
- Comprobación remota opcional con `ls-remote`, siempre diferida, de solo lectura y fuera de render.
- Copy español/inglés y degradación semántica wide/medium/narrow.
- Runner de procesos inyectable, controlador asíncrono y tests con fakes.

**No incluye**

- `fetch`, pull, push ni ninguna mutación Git.
- Recomendaciones para resolver divergencias o UI de gestión de ramas.
- Red durante `render()` ni tests con repositorios/remotos reales.
- El banner de versión de la TUI del instalador.
- README, release, Homebrew, Engram, doctor o `git-baseline`.

### Affected areas

| Área | Cambio previsto |
|---|---|
| `ein-pi/agent/lib/banner-git.ts` | Nuevo módulo cohesivo: tipos, parsers, runner contract, probe/controlador y renderer puro. |
| `ein-pi/agent/extensions/ein-banner.ts` | Sustituir `computeGitSync()` y el probe de rama duplicado; conectar snapshot, repaint y las tres filas semánticas. |
| `tests/banner-git-semantics.test.ts` | Matriz determinista de parser, modelo, copy, anchuras y lifecycle con runner falso. |

No se justifica una abstracción Git global: `git-baseline` es síncrono y protege el preflight antes de mutaciones; este dominio es asíncrono y exclusivamente visual.

### Risks

- Una ref de seguimiento local puede estar obsoleta si no hubo fetch.
- Las categorías staged/unstaged se solapan para entradas como `MM`; sumarlas produciría un total falso.
- Porcelain `-z` exige consumir un segundo path en rename/copy; tratar cada token NUL como entrada duplicaría renames.
- Un error de transporte, autenticación o timeout no demuestra por sí solo que el equipo esté offline.
- Copy largo en español puede perder semántica si se corta por caracteres en vez de degradarse por variantes.
- Un resultado asíncrono tardío podría repintar un header invalidado si no se usa generación/dispose.

### Rollback

Revertir el work unit del banner restaura el `computeGitSync()` y la única fila `GIT`; el cambio no crea estado persistente, no modifica configuración Git y no necesita migración de datos. El nuevo módulo y su test pueden retirarse junto con ese revert sin afectar `git-baseline`, doctor o installer.

### Success criteria

- `HEAD`, estado local y upstream se pueden inspeccionar y renderizar de forma independiente.
- Ningún conteo local se presenta como commits; toda cuenta upstream usa la palabra `commit(s)` y la base de ref local cuando cabe.
- Behind y diverged nunca se convierten en `pull`, synced o ahead.
- Render no ejecuta procesos; completar o fallar un probe actualiza el snapshot cacheado y solicita repaint.
- La matriz fake cubre todos los estados y ambas lenguas sin Git real, red ni mutaciones.

## B. Spec

### Modelo de datos

```ts
type HeadState =
  | { kind: "loading" }
  | { kind: "branch"; name: string }
  | { kind: "detached"; shortOid?: string }
  | { kind: "unavailable"; reason: "not-repo" | "git-error" };

type WorktreeState =
  | { kind: "loading" }
  | { kind: "clean"; entries: 0 }
  | {
      kind: "changes";
      entries: number;       // registros porcelain lógicos únicos
      staged: number;        // X cambiado
      unstaged: number;      // Y cambiado
      untracked: number;     // XY === "??"
    }
  | { kind: "unavailable"; reason: "git-error" | "invalid-porcelain" };

type TrackingRelation =
  | { kind: "equal"; ahead: 0; behind: 0 }
  | { kind: "ahead"; ahead: number; behind: 0 }
  | { kind: "behind"; ahead: 0; behind: number }
  | { kind: "diverged"; ahead: number; behind: number };

type RemoteCheck =
  | { kind: "unchecked" }
  | { kind: "loading" }
  | { kind: "matches-tracking-ref"; checkedAt: number }
  | { kind: "server-changed-counts-unavailable"; checkedAt: number }
  | { kind: "offline"; checkedAt: number; evidence: "dns" | "network-unreachable" }
  | { kind: "error"; checkedAt: number; reason: "timeout" | "auth" | "process" };

type UpstreamState =
  | { kind: "loading" }
  | { kind: "detached" }
  | { kind: "no-upstream" }
  | {
      kind: "tracked";
      trackingRef: string;
      relation: TrackingRelation;
      basis: "local-tracking-ref";
      remote: RemoteCheck;
    }
  | {
      kind: "uncomputable";
      reason: "missing-local-object" | "invalid-counts" | "ancestry-error";
    }
  | { kind: "unavailable"; reason: "not-repo" | "git-error" };

interface GitBannerSnapshot {
  head: HeadState;
  worktree: WorktreeState;
  upstream: UpstreamState;
  generation: number;
}
```

`RemoteCheck` es evidencia de frescura, no una segunda relación que pueda sobrescribir silenciosamente `TrackingRelation`. Si el servidor anuncia otro OID, el renderer prioriza `server changed · counts unavailable` y oculta las cuentas de la ref obsoleta; no etiqueta behind/diverged ni calcula cuentas contra un objeto anunciado por red.

### Parsing de worktree

El probe MUST ejecutar `git status --porcelain=v1 -z --untracked-files=all`. El parser puro seguirá estas reglas:

| XY / forma | `entries` | staged | unstaged | untracked |
|---|---:|---:|---:|---:|
| salida vacía | 0 | 0 | 0 | 0 |
| `M  path\0` | 1 | 1 | 0 | 0 |
| ` M path\0` | 1 | 0 | 1 | 0 |
| `?? path\0` | 1 | 0 | 0 | 1 |
| `MM path\0` | 1 | 1 | 1 | 0 |
| `R  new\0old\0` | 1 | 1 | 0 | 0 |
| `RM new\0old\0` | 1 | 1 | 1 | 0 |

- Un registro lógico cuenta una sola entrada/path actual. El source adicional de rename/copy se consume, pero no incrementa `entries`.
- `X` no vacío, `?` ni `!` incrementa staged; `Y` no vacío, `?` ni `!` incrementa unstaged; `??` incrementa sólo untracked. Así una entrada `MM` aparece en staged y unstaged, pero sigue siendo una sola entrada.
- `!!` se ignora; el comando no solicita ignored entries.
- Un token incompleto, XY inválido o rename/copy sin segundo path produce `invalid-porcelain`, nunca `clean`.
- El renderer no suma staged + unstaged + untracked como “archivos”. En narrow puede usar `entries` como agregado, siempre rotulado `entradas locales` / `local entries`.

### Límites de módulo

| Componente | Responsabilidad | No puede hacer |
|---|---|---|
| `ProcessRunner` | Ejecutar `file + args[] + cwd + timeout`; devolver stdout/stderr/exit/cause tipados. | Interpretar Git o producir copy. |
| `probeGitBanner` | Orquestar comandos de solo lectura y convertir resultados mediante parsers puros. | Conocer TUI, ANSI, anchura o idioma. |
| `GitBannerController` | Mantener snapshot cacheado, generación, transición loading/result y callback de refresh. | Renderizar o ejecutar desde `getSnapshot()`. |
| `parsePorcelainV1Z` / `parseLeftRightCount` | Parseo puro y validación estricta. | Ejecutar procesos. |
| `renderGitBannerRows(snapshot, lang, width)` | Devolver filas semánticas sin ANSI ni I/O. | Consultar Git, red, reloj o estado global. |
| `ein-banner.ts` | Adaptar `execFile`, locale, filas a `LayoutBuilder` y `tui.requestRender()`. | Reimplementar parsing o relaciones. |

La implementación usará funciones/módulos, no jerarquías de clases. El runner es una capability estructural inyectada; no se añade un patrón global.

### Call flow exacto

1. `session_start` crea un `GitBannerController` con snapshot `{loading, loading, loading}`, runner `execFile` y callback de repaint; instala el header sin esperar Git.
2. Un `setTimeout(100 ms)` llama `controller.refresh(cwd)`. `render(width)` sólo lee `controller.getSnapshot()`.
3. `refresh` incrementa `generation`; cualquier resolución de una generación anterior se ignora.
4. El probe ejecuta `git rev-parse --is-inside-work-tree`. Si falla/no es repo, publica estados `unavailable` veraces y termina.
5. En paralelo ejecuta:
   - `git symbolic-ref --quiet --short HEAD` (y, si no hay rama, `git rev-parse --short HEAD` para detached);
   - `git status --porcelain=v1 -z --untracked-files=all`.
   Cada transición válida parchea el snapshot y agenda un repaint coalescido fuera de render.
6. Con una rama, lee `git config --get branch.<name>.remote` y `git config --get branch.<name>.merge`. Ausencia de cualquiera produce `no-upstream`; configuración presente pero irresoluble produce `uncomputable`.
7. Resuelve la ref con `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` y su OID local con `git rev-parse --verify @{upstream}^{commit}`.
8. Ejecuta `git rev-list --left-right --count HEAD...@{upstream}`. El primer entero es ahead y el segundo behind; `0/0`, `N/0`, `0/N` y `N/M` producen equal, ahead, behind y diverged.
9. Publica inmediatamente la relación local con `remote: loading`; el banner ya es útil sin esperar red.
10. Sólo para un remote distinto de `.` y una merge ref válida, lanza de forma asíncrona `git ls-remote --exit-code <remote> <merge-ref>`, con timeout separado. No hay fetch ni actualización de refs.
11. Si el OID anunciado coincide con el OID de la ref local, marca `matches-tracking-ref`. Si difiere, marca `server-changed-counts-unavailable`; no ejecuta ancestry contra el OID remoto y no inventa cuentas aunque el objeto casualmente exista localmente.
12. Sólo diagnósticos explícitos de DNS o `network unreachable` permiten `offline`; timeout, auth y cualquier otro fallo son `error`. Sin match remoto o salida no parseable es error/unknown, no “local-only”.
13. Cada transición cambia el snapshot cacheado y solicita un repaint si el header sigue activo. `invalidate()` marca disposed; resultados tardíos no repintan. Resize y renders repetidos reutilizan el cache y nunca relanzan probes.

### Tabla final de estados y copy

Las filas visibles son `HEAD`, `LOCAL` y `UPSTREAM`; por ello los tres conceptos nunca comparten una unidad ni dependen de una leyenda. Wide es `>=80` columnas, medium `52–79`, narrow `40–51`; `<40` conserva el modo `skip` actual y no muestra un estado truncado engañoso. `↵` indica continuación en otra fila del mismo concepto.

Cada celda contiene **español / English**.

| Concepto/estado | Wide | Medium | Narrow |
|---|---|---|---|
| branch | `rama main / branch main` | igual | igual; nombre largo con elipsis |
| detached | `HEAD separado a1b2c3d / detached HEAD a1b2c3d` | `HEAD separado / detached HEAD` | igual |
| local clean | `local limpio / local clean` | igual | `limpio / clean` bajo `LOCAL` |
| staged 2 | `preparados 2 / staged 2` | igual | igual |
| unstaged 2 | `sin preparar 2 / unstaged 2` | igual | igual |
| untracked 2 | `sin seguimiento 2 / untracked 2` | igual | igual |
| mixed, 2 entradas | `preparados 1 · sin preparar 1 · sin seguimiento 1 / staged 1 · unstaged 1 · untracked 1` | mismas categorías, con `↵` antes de cortar | `2 entradas locales / 2 local entries` |
| staged rename | `preparados 1 / staged 1` | igual | igual; old/new siguen siendo una entrada |
| equal, comprobado | `igual · ref local comprobada / equal · local ref checked` | `ref local: igual / local ref: equal` | `ref local: igual / local ref: equal` |
| equal, no comprobado/stale | `igual · ref local, puede estar obsoleta / equal · local ref may be stale` | `ref local posiblemente obsoleta / local ref may be stale` | `ref local obsoleta? / local ref may be stale` |
| ahead 2 | `ref local: delante 2 commits / local ref: ahead 2 commits` | igual | igual |
| behind 3 | `ref local: detrás 3 commits / local ref: behind 3 commits` | igual | igual |
| diverged 2/3 | `ref local divergida: delante 2 · detrás 3 commits / local ref diverged: ahead 2 · behind 3 commits` | `ref local: delante 2 · detrás 3 commits / local ref: ahead 2 · behind 3 commits` | `ref local: delante 2 commits ↵ detrás 3 commits / local ref: ahead 2 commits ↵ behind 3 commits` |
| no upstream | `sin upstream (rama local) / no upstream (local branch)` | `sin upstream / no upstream` | igual |
| detached upstream | `no aplica: HEAD separado / not applicable: detached HEAD` | igual | `HEAD separado / detached HEAD` |
| loading | `upstream cargando / upstream loading` | igual | `cargando / loading` bajo `UPSTREAM` |
| offline con relación local | `sin conexión · ref local: delante 2 commits / offline · local ref: ahead 2 commits` | igual | `sin conexión ↵ ref local: delante 2 commits / offline ↵ local ref: ahead 2 commits` |
| error | `upstream no disponible / upstream unavailable` | igual | `no disponible / unavailable` |
| unknown/uncomputable | `relación no calculable / relation uncomputable` | igual | `no calculable / uncomputable` |
| server changed | `servidor cambió · conteos no disponibles / server changed · counts unavailable` | igual | `servidor cambió · sin conteos / server changed · no counts` |

Reglas de degradación:

1. Se eliminan primero timestamp/OID y la nota de frescura ya expresada por `ref local`.
2. Toda cuenta conserva `ref local` / `local ref` y `commits` en todos los anchos; divergencia conserva además ambos lados.
3. Mixed conserva categorías mediante continuación en medium; sólo narrow usa el agregado explícito de entradas lógicas.
4. Error, server-changed y offline preceden al detalle de una relación cacheada.
5. No se usan `○N`, flechas sin texto ni abreviaturas que requieran leyenda.
6. `fit(...).slice()` no corta estas frases; el renderer elige una variante que cabe y aplica elipsis sólo al nombre de rama.

### Requisitos RFC 2119

- **R1 — Separación:** The system **MUST** model and render head identity, local worktree state, and upstream state as three independent concepts.
- **R2 — Unidades locales:** The system **MUST** parse logical porcelain v1 `-z` entries by XY column; it **MUST NOT** call local counts commits or present category sums as unique files.
- **R3 — Relación:** The system **MUST** distinguish equal, ahead, behind, diverged, no-upstream, detached, loading, offline/error, and unknown/uncomputable. Commit counts **MUST** come from `HEAD...@{upstream}` local objects.
- **R4 — Honestidad remota:** The system **MUST NOT** fetch, pull, push or mutate Git. A remote mismatch **MUST** become server-changed/counts-unavailable and **MUST NOT** be labeled diverged without computable local ancestry.
- **R5 — Lifecycle:** Probes **MUST** remain deferred and non-blocking. Render **MUST** be I/O-free; completion **MUST** update a cached snapshot and request refresh. Stale generations **MUST** be ignored.
- **R6 — Fallos:** The system **MUST NOT** translate generic failure into clean, synced, no-upstream or offline. It **MAY** say offline only with explicit network evidence.
- **R7 — Localización y anchura:** Spanish and English **MUST** express equivalent units and states. Narrow rendering **MUST** preserve labels for dirty/error/diverged states before optional detail.
- **R8 — Testabilidad:** Process execution **MUST** be injectable; parsers and renderer **SHOULD** be pure; tests **MUST NOT** use a real repository, remote or network.
- **R9 — Compatibilidad:** The existing intro registration, animation, palette and `<40` skip behavior **SHOULD** remain unchanged. The installer TUI banner **MUST** remain untouched.

### Given/When/Then scenarios

| Req. | Scenario | Given | When | Then |
|---|---|---|---|---|
| R2 | clean | porcelain vacío | se parsea | local es clean, entries 0. |
| R2 | staged | `M  a\0` | se parsea | staged 1; las otras categorías son 0. |
| R2 | unstaged | ` M a\0` | se parsea | unstaged 1; no se llama commit. |
| R2 | untracked | `?? a\0` | se parsea | untracked 1 y entries 1. |
| R2 | mixed overlap | `MM a\0?? b\0` | se parsea | entries 2, staged 1, unstaged 1, untracked 1; no se muestra total 3 archivos. |
| R2 | rename | `R  nuevo\0viejo\0` | se parsea | staged 1 y entries 1; el source no duplica el conteo. |
| R3 | equal | rev-list devuelve `0 0` | se clasifica | upstream es equal respecto de la ref local. |
| R3 | ahead | rev-list devuelve `2 0` | se clasifica | muestra ahead/delante 2 commits. |
| R3 | behind | rev-list devuelve `0 3` | se clasifica | muestra behind/detrás 3 commits, nunca pull. |
| R3 | diverged | rev-list devuelve `2 3` | se clasifica | muestra ambos conteos y la palabra commits. |
| R3 | local-only | la rama no tiene config remote/merge | termina el probe local | muestra no upstream/local branch, no synced. |
| R1,R3 | detached | symbolic-ref no da rama y HEAD resuelve | se modela | HEAD es detached y upstream not applicable. |
| R5 | loading | la promesa fake está pendiente | se renderiza | upstream loading aparece y render no espera. |
| R6 | offline/error | el runner aporta evidencia DNS o un timeout genérico | termina `ls-remote` | DNS permite offline; timeout muestra unavailable/error, no offline. |
| R4 | stale tracking ref | relación local equal y remote check está unchecked | se renderiza wide | dice local ref may be stale, no afirma live sync. |
| R4 | server changed | `ls-remote` anuncia OID distinto | termina el check | muestra server changed/counts unavailable; no behind/diverged ni cuentas inventadas, exista o no el objeto remotamente anunciado en la base local. |
| R3,R6 | uncomputable | upstream está configurado pero falta el objeto local o rev-list falla | se clasifica | muestra relation uncomputable, no no-upstream ni synced. |
| R7 | narrow width | terminal tiene 40–51 columnas y estado mixed + diverged | se renderiza | HEAD/LOCAL/UPSTREAM siguen separados; LOCAL usa entries y UPSTREAM conserva ahead, behind y commits sin símbolos solos. |

## C. Decisions

### Decisiones y trade-offs

1. **Porcelain v1 `-z`, no conteo de líneas.** Es estable, evita ambigüedad por espacios/newlines en paths y permite consumir renames como un registro. Requiere un parser pequeño, pero elimina el error de `○N`.
2. **Tres filas semánticas, no un string decorativo.** Hace reconocibles las unidades y permite degradar cada concepto sin fusionarlos. El coste es añadir hasta dos filas al modo full y tres filas compactas al minimal; debe ajustarse el mínimo de filas para no desbordar.
3. **La relación primaria es la ref local configurada.** `rev-list --left-right --count HEAD...@{upstream}` distingue los cuatro casos sin red. El copy señala `ref local` y admite obsolescencia.
4. **`ls-remote` sólo verifica frescura.** Se mantiene diferido para detectar cambios del servidor, pero no actualiza refs ni inventa ancestry. Ante OID distinto, la única salida honesta es changed/counts unavailable.
5. **Runner `execFile` inyectado con argv.** Evita interpolar cwd/rama en shell y hace que comandos, timeouts y errores sean observables en tests.
6. **Snapshot cacheado por sesión y generaciones.** No hay polling. Una llamada diferida carga los datos; cada transición repinta, resize sólo rerenderiza el cache. Una futura llamada explícita a `refresh` reutiliza el mismo contrato y descarta resultados viejos.
7. **Copy local junto al feature.** El renderer recibe `Lang` y usa una tabla es/en pura; `gl` conserva el fallback existente a español. No se amplía el catálogo global sin una necesidad compartida.

### Performance, timeouts y fallos

- Comandos locales: timeout individual máximo de 750 ms y presupuesto lógico total de 2 s; status, head y configuración se paralelizan donde no haya dependencia.
- `ls-remote`: timeout máximo de 4 s, separado del snapshot local. Su espera nunca retrasa la primera relación visible.
- El adapter limita stdout/stderr a 1 MiB. Exceso o parseo truncado produce unavailable, nunca clean.
- Repaints se coalescen por microtask; no se crea intervalo nuevo ni polling Git.
- `invalidate` impide callbacks tardíos; los errores se convierten en estado y nunca derriban el header.
- Diagnósticos explícitos `Could not resolve host/hostname` o `Network is unreachable` son evidencia offline; cualquier texto no reconocido se trata como error. Auth no es offline.

### Alternativas rechazadas

| Alternativa | Motivo del rechazo |
|---|---|
| `○N` | No nombra unidad y puede confundirse con commits; además el conteo por líneas falla con renames. |
| `pull` vago | Es una acción y colapsa behind con diverged. |
| Fetch obligatorio | Muta refs, añade latencia/red y contradice el alcance. |
| Red síncrona | Bloquearía el arranque/render y haría frágil el banner. |
| UI sólo con símbolos (`↑`, `↓`, `!`) | No es comprensible sin leyenda y pierde semántica al estrechar. |
| Sumar staged + unstaged | `MM` quedaría contado dos veces como si fueran dos paths. |
| Asumir `origin/<rama>` | Ignora el upstream configurado y ramas con nombres/remotes distintos. |
| Reutilizar `git-baseline` | Mezcla un preflight síncrono de seguridad con un feature visual asíncrono. |
| Calcular “divergencia del servidor” con un OID anunciado | Si el objeto no existe localmente no hay ancestry; incluso si existe, mezclaría una foto de servidor con la relación canónica de tracking ref. |

### Migración y compatibilidad

No hay API pública ni datos persistidos. `gitBranch` + `gitSync: string` migran internamente a un solo `GitBannerSnapshot`; los textos antiguos cambian de forma intencionada. Se conservan registro del header, paleta, animación, resize y skip por terminal menor de 40 columnas. El umbral de filas del modo full debe crecer sólo lo necesario para las filas Git adicionales; si no cabe, se usa minimal en vez de cortar contenido.

### Work-unit boundaries y límite de review

Esto define límites arquitectónicos, no topología de PR ni checklist de ejecución:

| Slice implementable | Resultado autocontenido | Tope de líneas de producción cambiadas |
|---|---|---:|
| Dominio puro | Tipos, parser porcelain/counts, copy es/en y renderer por anchura, con sus tests fake. | 220 |
| Borde asíncrono | Runner, probe/controlador, wiring del banner y lifecycle/repaint, con tests de deferred/error. | 180 |

El total de producción tiene un límite objetivo de 400 líneas. Tests se reportan aparte. Si un slice excede su tope, `sdd-tasks/apply` debe reducir superficie antes de continuar; este diseño no decide si se entrega en uno o varios PR, porque esa decisión pertenece al Review Workload Guard.

### Arquitectura exacta de tests fake

- Un `FakeProcessRunner` indexa respuestas por `JSON.stringify([file, args])`, mantiene una cola por comando y registra invocaciones, cwd y timeout.
- `deferred<Result>()` permite dejar `ls-remote` pendiente y resolverlo manualmente; un reloj `now()` inyectado fija `checkedAt`.
- Los tests de parser pasan strings con `\0`, incluidos `MM` y rename/copy, sin tocar filesystem.
- Los tests de relación pasan stdout `0 0`, `N 0`, `0 N`, `N M` y salidas inválidas a funciones puras.
- Los tests de renderer comparan filas sin ANSI para `es` y `en` en 80, 60 y 40 columnas; verifican ausencia de `○`, `pull` y símbolos aislados.
- Los tests del controller observan: snapshot loading inicial; relación local antes de resolver red; un repaint por transición coalescida; mismatch remoto; error tipado; generación vieja ignorada; invalidate sin repaint tardío.
- Una aserción allowlist falla si el fake recibe verbos fuera de `rev-parse`, `symbolic-ref`, `status`, `config`, `rev-list` y `ls-remote`. Otra guarda el número de llamadas antes/después de `render` para demostrar cero I/O durante render.
- `ein-banner.ts` sólo necesita una prueba fina del adapter/fila; no se monta Pi/TUI ni se hace snapshot de toda la animación.

## D. Success Criteria

### Checks observables

1. La tabla de escenarios pasa en `es` y `en`, incluidos mixed/rename y todos los estados upstream.
2. Los tests prueban explícitamente `entries=2` frente a suma de categorías `3` para `MM + ??`.
3. Ahead/behind usan enteros de `rev-list`; diverged conserva ambos en 80, 60 y 40 columnas.
4. Un OID remoto distinto produce exactamente changed/counts unavailable y ninguna cuenta/divergencia nueva.
5. Un timeout no muestra offline; sólo la evidencia DNS/network-unreachable lo hace.
6. Resolver el deferred después de terminar la animación todavía solicita repaint; resolverlo después de invalidate no lo solicita.
7. El log del fake demuestra cero comandos durante render y ausencia de fetch/pull/push/commit/checkout/config mutation.
8. El banner del installer y README no aparecen en el diff.

### Verification commands para fases posteriores

No se ejecutan en DESIGN. Cuando existan implementación y tests:

```bash
bun test tests/banner-git-semantics.test.ts
bun test
```

La verificación manual, si se usa, debe alimentar snapshots fake a 80/60/40 columnas; no debe depender de un remoto real ni lanzar red.

### Handoff bloqueante a `readme-release-ia`

README permanece sin cambios hasta que `verify-report.md` de `banner-git-semantics` acepte:

- La tabla final de copy es/en y sus tres anchuras.
- La unidad local: entradas lógicas de porcelain por categoría, con solapamiento posible y rename como una entrada.
- La unidad upstream: commits contra la ref local configurada; puede estar obsoleta sin fetch.
- La semántica de server-changed: el servidor anunció otro OID, pero los conteos actuales no están disponibles; no implica diverged.
- La garantía de que el banner no hace fetch ni mutaciones y que render no hace red.
- Evidencia de los dos comandos de test y la matriz fake completa.
- La exclusión explícita del banner de versión de la TUI del installer.

`readme-release-ia` podrá documentar únicamente esos hechos verificados, no prometer frescura remota en vivo ni reutilizar `○N`/`pull`.