## // 000. RESUMEN
Endurecida la disciplina del harness Ein mediante un allowlist de git explícitamente permitido, precedencia de decisiones del guard (deny → confirm → allow), reporte centralizado de working-tree, y exclusión de artefactos OpenSpec del presupuesto de revisión. Ocho grupos de TDD estricto: 1046 tests verdes, cero fallos.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/guardrails.ts`: nueva función pura `commandIsExplicitlyAllowed()` con tablas de flags bloqueados (branch/commit/add) y split de segmentos por operador.
- `ein-pi/agent/lib/git-baseline.ts`: nuevo renderizador `renderWorkingTreeLine()` — único canal de reporte dirty/clean tree.
- `cc-ein/sdd-cli/cli.ts`: extracción de `resolveGuardDecision()` con precedencia fija deny→confirm→allow; `buildStatusOutput()` con bootstrap best-effort de git init.
- `cc-ein/settings.json`: allowlist de lectura (`git status:*`, `git diff:*`, `git log:*`); escritura (branch/commit/add) delegada a hook.
- `ein-pi/agent/lib/review-forecast.ts`: pathspec `":(exclude)openspec/**"` en PRODUCTION_EXCLUDES.
- `cc-ein/CLAUDE.md`: bloque delimitado documentando política de allowlist sin reclamar mecanismo sobre Edit/Write/delegación.

## // 002. CÓMO FUNCIONA POR DENTRO
**Flujo del guard**: el CLI recibe el comando Bash vía hook PreToolUse. `resolveGuardDecision()` evalúa en orden: (1) DENIED_BASH_PATTERNS → deny; (2) CONFIRM_BASH_PATTERNS → ask; (3) `commandIsExplicitlyAllowed()` evalúa segmento a segmento separados por `&&`, `||`, `;`, `|`, newline — solo git status/diff/log con cualquier flag, o branch/commit/add sin flags bloqueados. Los metacaracteres de sustitución y redirección descalifican el comando entero. Si nada coincide, no emite decisión (degrada abierto). El estado SDD se lee después y enriquece `reason`, nunca crea una decisión nueva.

**Working-tree**: `statusCmd()` llama a `buildStatusOutput()`, que (a) intenta `bootstrapRepoIfNeeded()` si no-repo + existe openspec/changes/ + sin CC_EIN_NO_GIT_INIT ni CI; (b) lee `readGitBaseline()` y añade `renderWorkingTreeLine()`, que emite null si no-repo, línea sobria si limpio, y bloque UNCOMMITTED con remedio si sucio.

**Review budget**: `reviewForecast()` llama a `diffShortstat()` con PRODUCTION_EXCLUDES, que ahora contiene el pathspec; git diff filtra openspec/ automáticamente.

## // 003. DECISIONES
- **Precedencia deny > confirm > allow**: allow-first haría que la seguridad total dependiera de que todo allow fuera perfecto. Con allow al final, no puede ensombrecer a los otros dos. `git add . && git push` debe pedir confirmación, no auto-aprobarse.
- **Segment-based, no substring**: el split por operador evita que `git status && rm -rf` se auto-apruebe por el `status`.
- **Flag inspection explícita**: el lookahead para `-D` es frágil y no ve `-rd` agrupado. Listas explícitas + escaneo letra a letra de los cortos agrupados.
- **Branch/commit/add FUERA de settings.json**: los matchers por prefijo no pueden excluir flags. Permanecen hook-only.
- **SDD state advisory, no decisión**: no bloquea bash por falta de cambio activo. El estado se reporta en `reason`.
- **Working-tree solo en status**: canal único; evita repetición ruidosa y descarta reportarlo desde sync (que ve `~/.claude-ein`, no el árbol del proyecto).
- **Sin consumo de grant de Pi**: el delivery-grant de Pi no aplica en cc-ein. Consumirlo sería un side-channel cross-harness silencioso.

## // 004. VERIFICACIÓN
**Suite completa**: `bun test` → 1046 pass / 0 fail, 3325 expect(), 88 ficheros. Typecheck del installer: PASS.

**9 escenarios delta** (todos trazados en spec.md):
1. guard-allowlist-flag-inspection: `-D`, `-d`, `--delete`, `-M`, `-e` bloqueados; flags seguros pasan.
2. guard-allowlist-whole-command: `git status && git diff` permite; `git status && rm -rf /` no se auto-aprueba.
3. guard-decision-precedence: deny gana en caso mixto; `git add . && git push` → ask.
4. guard-envelope-degrades-open: JSON inválido → sin salida, exit 0.
5. guard-sdd-state-is-advisory: con o sin cambio activo → MISMA decisión; el nombre solo aparece en `reason`.
6. guard-ignores-cross-harness-delivery-grants: un grant de Pi no abre allow.
7. openspec-artifacts-excluded-from-review-budget: el pathspec filtra; 3 líneas prod + openspec = producción: 3.
8. repository-bootstrap-is-best-effort: init condicionado, fallo reportado sin excepción.
9. working-tree-signal-single-channel: `renderWorkingTreeLine` aparece exactamente una vez; textos distintos para sucio y limpio.

**Bloqueante corregido**: la prosa de `cc-ein/CLAUDE.md` omitía `branch -D` y equiparaba falsamente `branch -D` (CONFIRM) con `reset --hard` (DENIED). Corregida sin tocar los patterns, que son preexistentes de Pi.

## // 005. PENDIENTE / RIESGOS
- **Techo técnico**: el hook `PreToolUse` con matcher Bash gatea shell. NO fuerza delegación (`Task` es invisible para él) ni intercepta `Edit`/`Write`. Entrar en el flujo SDD y no editar inline siguen dependiendo del cumplimiento del modelo.
- **Andamiaje no previsto**: el grupo 003 envolvió el dispatch del CLI en `if (import.meta.main)` para evitar que un test ejecutara el switch con el argv del runner. El binario real se comporta igual.
- **Grupo 006 sin test**: verificación de la idempotencia de `sync.ts` por construcción (`hooks` se reasigna entero, no se acumula).
- **Divergencia resuelta**: el usuario pidió inicialmente confirmación para `reset --hard`, pero el código lo deniega (política preexistente de Pi; `git diff` confirma que este change no tocó las listas). Presentada la divergencia, el usuario decidió **mantener el deny**: destruye trabajo sin recuperación y la política llevaba tiempo en uso. No se requiere acción.
