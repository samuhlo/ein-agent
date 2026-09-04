status: complete
change: count-group-files-from-edit-grants
work_groups: 1
verification_status: pass

## // 000. RESUMEN

`oversizedGroupWarnings` contaba ficheros barriendo todo el cuerpo del grupo (`read:`, prosa en `why:`/`architecture:`, etc.), cuando debe contar solo la superficie de escritura DECLARADA en etiquetas de frontera. En fixture real (`accept-scout-fanout-reports/tasks.md`), grupos con 1 `edit:` de test y contexto de 8 rutas emitían falsos positivos (5 y 8 avisos). Ahora cuenta solo etiquetas v1 del conjunto cerrado (`production files:`, etc.) + `edit:` v2, filtrada por `isProductionFile`: el mismo fixture devuelve 0 avisos.

## // 001. QUÉ CAMBIÓ

- `shared/sdd/sdd-tasks-frontier.ts` (NUEVO): función pura `extractDeclaredFrontierPaths(body)` que extrae rutas de frontera de un grupo. Reconoce etiquetas v1 del conjunto cerrado + etiquetas `edit:` de cada tarea. De un `edit:`, lee solo la PRIMERA celda (la ruta), descarta espacios/`none`/`ninguno`. Vocabulario duplicado de etiquetas (`PRODUCTION_FILES_LABELS`, `TEST_FILES_LABELS`, normalización espejo).
- `ein-pi/agent/lib/sdd-tasks-frontier.ts` (NUEVO): fachada que reexporta public exports de `shared/sdd/sdd-tasks-frontier.ts` (requerida por test `architecture-boundaries.test.ts`).
- `shared/sdd/sdd-artifact-validation.ts:121`: `oversizedGroupWarnings` reemplaza `extractProductionFiles(body)` por `extractDeclaredFrontierPaths(body).filter(isProductionFile)`.
- `tests/sdd-close.test.ts:531,544,552`: tres fixtures reescritos de prosa `File boundary:` (no reconocida) a gramática v1 (`production files:`, `test files:`), conservando aserciones.
- `tests/apply-packet.test.ts:289-295` (NUEVO): test de paridad de vocabulario. Compara `PRODUCTION_FILES_LABELS` de `shared/sdd/` con `ein-pi/`, exige igualdad.

## // 002. CÓMO FUNCIONA POR DENTRO

`oversizedGroupWarnings` itera líneas del grupo buscando (a) etiquetas v1 cuyo `normalizeFilesLabel` no sea `null` (incluidas test) y (b) cualquier etiqueta `edit:` de tarea. De `edit: \`ruta\` | operación | intención`, toma solo `stripTicks(cells[0])`, descarta si contiene espacios o es `none`/`ninguno`. Acumula del grupo COMPLETO (preámbulo + todas tareas), deduplica, filtra con `isProductionFile`, compara longitud contra `MAX_GROUP_SOURCE_FILES = 4` con `level: "warning"`, `code: "oversized-group"`.

El vocabulario (etiquetas v1) existe en dos copias: fuente para lint en `shared/sdd/`, fuente para validador de packets en `ein-pi/agent/lib/apply-packet.ts` (intacto). Un test de paridad exige igualdad entre conjuntos — si divergen, se detecta en ejecución de test, no se sufre silencio. `isProductionFile` (`shared/sdd/sdd-routing-core.ts:708`) sigue siendo la única fuente de definición de "producción": tests y rutas `openspec/` se excluyen.

## // 003. POR QUÉ / DECISIÓN

**Arquitectura: Duplicación de vocabulario controlada por test de paridad.** `shared/` no puede importar de `ein-pi/` (dirección es `ein-pi → shared`), así que reusar etiquetas por import está descartado. Moverlas a `shared/` habría requerido editar `ein-pi/agent/lib/apply-packet.ts` (validador de packets), que una frontera dura prohíbe en este cambio por otro activo en curso. Solución: módulo nuevo en `shared/` con vocabulario duplicado, atado por test que compara conjuntos. Quien cambie un conjunto tiene que cambiar el otro — el test lo obliga.

**Lectura de `edit:`: solo PRIMERA celda.** `parseV2Edit` (compilador de packets) parte por `|` y toma `cells[0]` como ruta. El extractor replica esa lectura, no el valor entero. Contar la intención repetiría el bug en pequeño: la intención del fixture cita rutas de producción que el grupo declara NO escribir. Un `edit:` malformado no aborta aquí (advisory): se intenta leer, se descarta si no es forma de ruta. El compilador de packets falla cerrado ante mal-formado.

**Asimetría reconocida en el compilador.** `apply-packet-compile.ts:1-14` ya registra por escrito: "la frontera de escritura sale de la ETIQUETA, nunca del cuerpo". Este lint estaba del lado malo — barría cuerpo entero. Consecuencia: guardián que grita en falso entrena a ignorarlo, y eso es lo que pasó: avisos reales se saltaron por hábito. El cambio cierra la brecha.

**Grupos sin frontera declarada enmudecen (D5).** Un grupo cuya frontera use etiqueta fuera del conjunto cerrado contará 0. Se acepta: es postura del compilador ante etiqueta desconocida (`unknown-grammar`, no adivina). Adivinar es exactamente el bug que cierra este cambio. Se rechaza aviso nuevo `undeclared-group-frontier`: dispararía en casi todos `tasks.md` heredados, cambiaría ruido por ruido.

**Grupos con solo tests no avisan (D4).** `isProductionFile` excluye tests; cobertura lo afirma. El umbral se calibró sobre producción; cambiar eso ampliaría alcance a recalibración de guardián. Consecuencia honesta: grupos del fixture (1 `edit:` test cada uno) pasan a 0 por dos razones correctas e independientes: declaran 1 ruta y esa ruta es test.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `bun test tests/sdd-close.test.ts`

Todos 9 criterios de éxito del design verificados en vivo:
- Fixture real (`accept-scout-fanout-reports/tasks.md`): 0 avisos (antes 5 y 8). Verificado en test criterio 1.
- >4 rutas v1 (`production files:`): 1 warning exacto. Verificado en test criterio 2.
- >4 `edit:` v2: 1 warning exacto. Verificado en test criterio 2.
- De `edit: \`app/a.ts\` | modify | cita \`app/b.ts\`, \`app/c.ts\`` → 1 ruta contada (0 avisos). Criterio 3.
- 4 ficheros → 0 avisos; 5 → 1 warning `"5 ficheros de producción"`. Criterio 4.
- Tres fixtures reescritos conservan aserciones. Criterio 5.
- Paridad vocabulario: conjuntos idénticos. Criterio 6.
- Paridad shared/pi: `sdd-artifact-validation-parity.test.ts` verde, identidad referencial. Criterio 7.
- Consumidores no afectados: `sdd-plan-preview.test.ts` sin cambios, 5 tests pasan. Criterio 8.
- `git status`: intactos `openspec/config.yaml`, `ein-pi/agent/lib/apply-packet.ts`, todos `tasks.md` existentes. Criterio 9.

Resultado: 3119 pass, 0 fail. Typecheck limpio en raíz e installer.

## // 005. RIESGOS

- **`ein-cc-sdd check` sobre copia instalada.** Sin `ein-install` el binario no refleja el fix. Evidencia determinista en repo es `bun test` + fixture real leído del árbol, no el check sobre binario compilado.
- **Consolidación de vocabulario es follow-up.** Duplicación controlada es temporal. Cuando validador de packets cierre: mover etiquetas a `shared/`, reexportar desde `ein-pi/`, eliminar duplicación.
- Ningún riesgo funcional: fronteras duras respetadas, consumidores no afectados, `spec_delta: none` honesto (ningún requisito en openspec/specs define conteo; aviso es advisory, no bloquea fases, umbral/nivel idénticos).
