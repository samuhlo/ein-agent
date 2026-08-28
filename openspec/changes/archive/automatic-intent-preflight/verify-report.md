# Informe de verificación — automatic-intent-preflight

**Status: PASS**

**behavior_coverage: verified** — las pruebas focalizadas y la suite global ejercitan los recorridos normal, pequeño y bypass, persistencia/adopción, clasificación y lane, propietario Pi, comando público Claude, paridad entre runtimes, router, bootstrap y superficies Claude generadas.

## // 000. Resultado

La corrección de la tarea 6.3 está aplicada y verificada: `tests/sdd-planning-acceptance.test.ts` pasa con 12/12, incluyendo la postura TDD persistida/default y cero re-preguntas TDD/lane por cambio.

Todos los gates solicitados están verdes:

- Matriz focalizada: **171 pass, 0 fail** en 11 archivos.
- Suite configurada `bun test tests/`: **2861 pass, 0 fail** en 204 archivos.
- Suite raíz `bun test`: **2861 pass, 0 fail**.
- Typecheck raíz y del instalador: pass.
- `git diff --check`: pass.
- Paridad/generación Claude: pass.

## // 001. Plan de comandos y evidencia fresca

El plan se construyó de nuevo desde `apply-progress.md`, `tasks.md`, `design.md`, `openspec/config.yaml` y el estado actual del árbol. Los comandos largos se ejecutaron con límite de 300 segundos; como macOS no ofrece el binario `timeout`, se usó un wrapper Python que deja fluir la salida y finaliza el hijo al alcanzar el límite.

| Orden | Comando normalizado | Seams / roles / fuentes | Resultado |
|---:|---|---|---|
| 1 | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'material|canonical|key'` | 001.1: normalización y `materialKey` | 4 pass, 0 fail |
| 2 | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'classif|lane|bypass|read-only'` | 001.2: activación, clasificación, precedencia y bypass | 6 pass, 0 fail |
| 3 | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'question|third|small|restatement'` | 001.3: preguntas adaptativas y reformulación pequeña | 4 pass, 0 fail |
| 4 | `bun test tests/sdd-preflight-record.test.ts --test-name-pattern 'legacy|intent|partial|future|round-trip'` | 002.1: records legacy, versionado y round-trip | 6 pass, 0 fail |
| 5 | `bun test tests/sdd-lane.test.ts tests/sdd-preflight-record.test.ts --test-name-pattern 'declared|classified|corrupt|phase'` | 002.2: procedencia lane y listas de fases | 3 pass, 0 fail |
| 6 | `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'persist|reread|adopt|pending|lane'` | 003.1: escritor único, relectura, adopción y lane clasificado | 10 pass, 0 fail |
| 7 | `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'reuse|material|paraphrase|reopen|in-flight'` | 003.2: materialidad, patch, reapertura y deduplicación | 8 pass, 0 fail |
| 8 | `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-tdd-gate.test.ts --test-name-pattern 'normal|small|confirm|third|bypass|TDD'` | 003.3: recorridos y gate TDD sin selector paralelo | 18 pass, 0 fail |
| 9 | `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-flow-contract.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-config-bootstrap.test.ts` | 004.1: propietario Pi, hooks, handoff, router y bootstrap | 83 pass, 0 fail |
| 10 | `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` | 005.1/005.2: adapter Claude, comando público y adopción Pi↔Claude | 18 pass, 0 fail |
| 11 | `bun test tests/core-parity-coordinator.test.ts tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` | 006.1: coordinadores, output generado y paridad | 36 pass, 0 fail |
| 12 | `bun test tests/sdd-planning-acceptance.test.ts` | 006.3: RED corregido, postura persistida/default y cero re-asks | 12 pass, 0 fail |
| 13 | `bun test tests/sdd-intent-preflight.test.ts tests/sdd-preflight-record.test.ts tests/sdd-lane.test.ts tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/sdd-flow-contract.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-config-bootstrap.test.ts tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts tests/core-parity-coordinator.test.ts` | Matriz focalizada completa exigida en `tasks.md` | **171 pass, 0 fail** |
| 14 | `bun test tests/` | Checks unit/integration/e2e configurados; comando idéntico fusionado y ejecutado una vez | **2861 pass, 0 fail** |
| 15 | `bun test` | Suite global raíz explícita | **2861 pass, 0 fail** |
| 16 | `bun run typecheck` | Typecheck raíz explícito | Pass |
| 17 | `cd installer && bun run typecheck` | Typecheck instalador configurado y explícito | Pass |
| 18 | `git diff --check` | Higiene de diff | Pass, sin salida |
| 19 | `git diff --exit-code -- openspec/specs/sdd-lifecycle/spec.md` | Confirmación adicional de que la especificación canónica no fue modificada | Pass, sin salida |

### Disposición de checks globales

- `bun test tests/`: **scheduled**, cubre las tres capas configuradas porque comparten exactamente el mismo comando.
- `bun test`: **scheduled**, exigido por la tarea y por la configuración de verificación.
- `bun run typecheck`: **scheduled**, exigido explícitamente.
- `cd installer && bun run typecheck`: **scheduled**, exigido explícitamente y configurado.
- Lint, formato y coverage: **not relevant**, porque sus listas de comandos están vacías en `openspec/config.yaml`; no se inventó una orden adicional.
- Build de producción: **not relevant**, porque no está configurado ni exigido por este cambio; el diseño excluye build de la fase apply.

## // 002. Cobertura de los cinco escenarios ADDED

| Escenario | Evidencia actual | Estado |
|---|---|---|
| `intent-confirmation-persistence-routing` | `sdd-preflight-per-change.test.ts` verifica confirmación antes de escribir, persistencia mediante el dueño existente, relectura/adopción, `materialKey`, reapertura; `sdd-next-dispatcher.test.ts` verifica el handoff existente | PASS |
| `intent-explicit-bypass-risk-boundary` | Core y flujo por cambio cubren bypass seguro y mantienen normal para seguridad, datos persistentes, destrucción y riesgo desconocido | PASS |
| `intent-lane-precedence-and-classification` | Core, lane y record cubren lane declarado, clasificación, corrupción/incoherencia y fallback fail-closed | PASS |
| `intent-normal-adaptive-questions` | Core, preflight por cambio, gate TDD y paridad coordinadora cubren dos preguntas, tercera solo material y ausencia del cuestionario paralelo | PASS |
| `intent-small-restatement-continues` | Core y preflight por cambio cubren una sola línea, sin respuesta, resolución automática y continuación | PASS |

## // 003. Bootstrap canónico y contratos conservados

La selección canónica `openspec/specs/sdd-lifecycle/spec.md:117-123`, `explicit-sdd-startup-bootstraps-config-and-enters-scope`, sigue intacta y pasa mediante `sdd-config-bootstrap.test.ts` y `sdd-flow-contract.test.ts`: se crea configuración ausente, se preservan exactamente los bytes existentes y la petición entra en `sdd-scope` sin `/sdd-init`, repetición ni confirmación separada.

Los contratos regresivos focalizados permanecen verdes:

- records históricos sin bloque `intent` conservan TDD y autoría; bloques parciales, futuros o inválidos no descartan TDD;
- el lane declarado siempre tiene precedencia y el clasificado no sobrescribe declaraciones, incluso corruptas;
- la evidencia incompleta o de riesgo nunca se rebaja a `small`;
- solo el hook de entrada Pi inicia interacción; hooks secundarios adoptan o bloquean;
- el comando público `ein-cc-sdd preflight` alcanza `runClaudeIntentPreflight` antes de la compatibilidad legacy (`ein-cc/sdd-cli/cli.ts:268-286`, dispatch público en `:431-440`);
- Pi y Claude adoptan el mismo record y conservan `resolvedBy`;
- router, secuencia SDD, omisiones de lanes, gates de verify/close, delivery y bootstrap no se alteran.

## // 004. Paridad Claude generada

`tests/core-parity-coordinator.test.ts` pasa y ejecuta las comprobaciones existentes `compileClaudeSurface()` y `checkGeneratedParity()`. Valida byte de coordinador generado, procedencia, límites de adaptación, inventario de agentes, traducciones de tools, routing, detección de drift y determinismo. `ein-cc/CLAUDE.md` coincide con sus fuentes autorizadas; no se editó output generado durante verify.

## // 005. Auditoría strict-TDD

`openspec/config.yaml` mantiene `strict_tdd: true` y `preflight.json` declara `tdd: strict`, `decidedBy: pi`; la postura no se inventó desde el default.

`apply-progress.md` contiene una tabla `TDD Cycle Evidence` para cada grupo 001–006 y cada seam tiene RED, GREEN, TRIANGULATE y REFACTOR/final focused command. La evidencia cubre core, records/lane, dueño de persistencia, materialidad, interacción, hooks/router/bootstrap, Claude/paridad y coordinadores.

La corrección 6.3 está completa y auditada:

- **RED:** `bun test tests/sdd-planning-acceptance.test.ts` reprodujo los dos fallos globales legacy: 10 pass y 2 expectativas incompatibles.
- **GREEN:** la actualización de nombres, fixtures y aserciones produjo 12 pass, 0 fail en la ejecución final actual.
- **TRIANGULATE/REFACTOR:** se conservó la comprobación específica de postura `strict` persistida, default `off`, proyección legacy `ask → auto`, ausencia de selector TDD/lane y cero consultas TDD antes y después de ambos gates.

Se revalidaron los ficheros de tests declarados y las aserciones son observables: valores de postura, contadores de consultas, persistencia, bytes, procedencia, rutas, no-escritura y rechazo fail-closed. No se detectan tautologías, loops fantasma ni pruebas exclusivamente de tipos o detalles de CSS.

## // 006. Limitación de participantes y riesgos

Se conserva la limitación solicitada: el pase advisory fresco no estuvo disponible porque faltaban la identidad y salida del child de terminal. No se afirma una auditoría completa de participantes. Cleaner sí había encontrado el comando público Claude desconectado y la tarea correctiva 5.2 lo conectó con evidencia RED/GREEN focalizada.

Riesgo residual no bloqueante: no se ejecutó un proceso interactivo real contra provider/terminal; la cobertura disponible es la de contratos, adapters, persistencia y paridad deterministas. La limitación está declarada y no invalida los gates automatizados verdes.

## // 007. Estado final

- Tasks 1.1–6.3: checkboxes completos.
- Matriz focalizada, suite global, typechecks, diff y paridad: verdes.
- No se hizo commit, push, sync de specs, edición manual de generación ni cierre.

**Conclusión:** verificación actual PASS. El informe está listo para que el orquestador continúe con la siguiente fase, sin afirmar auditoría advisory completa de participantes.
