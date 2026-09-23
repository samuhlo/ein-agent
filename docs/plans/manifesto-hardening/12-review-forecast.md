# 12 — Medir la entrega real

Estado: diseño preparado; implementación pendiente. Hallazgo 12 de la
[auditoría](../../audits/2026-09-16-manifiesto.md). Base inspeccionada: `3b9fa42`.
Aplicar las [reglas comunes](README.md) antes de ejecutar un paquete.
Dependencias: ninguna funcional; integrar los cambios ya aceptados de la base.

## A. Proposal

El medidor debe contar el cambio que se quiere entregar, incluidos archivos
nuevos, y distinguir una medida desconocida de una entrega dentro del límite.
El padre obtiene la medida definitiva después del commit local y antes del push
o PR; la previsualización anterior no se reutiliza como autorización definitiva.

Incluye modos explícitos working-tree/committed, selección de rutas, clasificación
de tests, estado no medible, identidad del resultado y consumo Pi/Claude.
Excluye cambiar los límites 400/20.000, decidir cómo dividir una PR, alterar el
consentimiento Git, añadir una base de datos de métricas o modificar archivos del
usuario para poder medirlos. Git staging/commit siguen perteneciendo a ein-git.

Lecturas iniciales: `ein-pi/agent/lib/review-forecast.ts`,
`ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts` (ein_review_forecast),
`ein-pi/agent/lib/tool-receipts.ts` (forecastReceipt),
`runtime/agents/ein-git.md` (Post-verify PR flow/Review Workload Gate),
`tests/review-workload-guard.test.ts`, `shared/ports/sdd.ts`,
`ein-cc/sdd-cli/cli.ts`, `ein-cc/sync.ts` (RUNTIME_TOKEN_RULES).

Riesgos: contar dos veces un archivo staged+modified; interpretar rutas como
pathspecs; tratar exit 1 de git diff como fallo; medir con una base móvil; romper
renombres, binarios o nombres con espacios. Reversión: revertir los paquetes
del punto en orden inverso. No restaurar un resultado antiguo como vigente.

## B. Spec

- MUST distinguir `mode: working-tree|committed`. Con working-tree, `base` no
  elimina los cambios staged/unstaged/untracked; con committed solo se mide la
  diferencia entre commits. La salida declara siempre qué midió.
- MUST contar cada postimagen una vez, incluyendo archivos nuevos no ignorados.
  `paths`, si existe, es una lista literal de rutas relativas; no admite glob,
  escapes fuera del repositorio, `.git` ni expansión por shell. No se hacen
  `git add`, commits ni escrituras en el índice real para medir.
- MUST clasificar como tests los sufijos `.test.*`/`.spec.*` y cualquier segmento
  de directorio `tests`, `__tests__` o `e2e`, en raíz y paquetes. Conservar las
  exclusiones existentes de generados/OpenSpec; no excluir cualquier `.ts` de docs.
- MUST producir decisión `within|over|unknown`. Mantener `ok:false` y campos
  numéricos legacy para compatibilidad, pero `overBudget:null` cuando no es medible.
  Ningún consumidor interpreta cero o null como permiso de entrega.
- MUST medir respecto al merge-base de la rama base y la cabeza indicada; registrar
  los OID resueltos. No incorporar como borrados cambios exclusivos de otra rama.
- MUST emitir `snapshotRef`, ligado al modo, base efectiva y contenido medido.
  La medición committed incluye `headOid`; el paso de publicación comprueba ese
  HEAD. Un cambio de HEAD exige otra medición, sin deshacer commits automáticamente.

| Given | When | Then |
| --- | --- | --- |
| Archivo nuevo de 600 líneas | Preview working-tree | Cuenta 600 y supera 400 |
| Archivo staged y modificado después | Preview | Cuenta solo el estado final |
| HEAD sin commits de la entrega, cambios staged | Working-tree con base | Incluye esos cambios; committed no los incluye |
| Mismo fixture en tests/ y pkg/tests/ | Medir | Es test en ambos sitios |
| Base inexistente o archivo ilegible | Medir | unknown; no invitación a medir a ojo |
| Rama base avanzó con archivos ajenos | Medir PR | Usa merge-base y no cuenta esos cambios como borrados |
| Commit local hecho y forecast definitivo | HEAD cambia antes de publicar | Se vuelve a medir; no se reutiliza el dato anterior |
| Renombre puro, binario y ruta con espacios | Medir | Sin líneas inventadas ni rutas partidas |

## C. Decisions

### C1. API y compatibilidad

Añadir `ReviewRequest = { mode: 'working-tree'|'committed'; base?: string;
head?: string; paths?: readonly string[] }`. `reviewForecast(cwd, request)` es
la entrada nueva. Conservar el overload `(cwd, base?, head?)` para callers
existentes: string base sigue siendo comparación committed explícita; sin base
se usa working-tree. Migrar la herramienta a request explícito, sin cambiar
silenciosamente el significado de llamadas históricas.

Añadir `mode`, `baseOid`, `headOid?`, `snapshotRef?` y `reason?` al forecast.
`ReviewEvaluation` incluye `decision`; `overBudget` pasa a `boolean|null`.
El formatter y forecastReceipt consumen decision/ok antes que las cifras.

### C2. Una diferencia canónica para tracked y untracked

Crear `ein-pi/agent/lib/review-snapshot.ts` con
`readReviewSnapshot(cwd, request: ReviewRequest): ReviewSnapshotResult`.
Resultado: `{ok:true, mode, baseOid, headOid?, snapshotRef, patch, numstatZ, paths}`
o `{ok:false, code, reason}`; ningún camino devuelve una diferencia vacía por error.
Reunir rutas cambiadas mediante Git
con salida NUL y añadir `ls-files --others --exclude-standard -z` en working-tree.
Aplicar `paths` literalmente a ese conjunto. Resolver HEAD/base a OID antes de
leer; repositorio sin HEAD o base ilegible devuelve unavailable, nunca cero válido.

Materializar únicamente los archivos cambiados en dos directorios temporales
propios: antes desde blobs Git de la base efectiva; después desde working-tree
o blobs de head. Conservar modo Git y symlinks como enlaces, sin seguir destinos.
Ejecutar diff no-index con `--find-renames --no-ext-diff --no-textconv`, primero
numstat `-z` y después patch sin color/unified=0. Exit 0 y 1 son normales; otros
son unavailable. No ejecutar filtros ni hooks del repositorio. Limpiar el temp
en finally. Normalizar solo los prefijos temporales de las rutas.

Devolver diffs y una identidad SHA-256 de entradas ordenadas: ruta, presencia,
modo e identidad del contenido antes/después, junto al modo y OID efectivos.
Si refs o archivos cambian mientras se lee, devolver unavailable/source-changed;
no combinar medidas de estados distintos. Mantener límites de lectura/salida
explícitos y devolver unknown al excederlos. No truncar un diff y medir el trozo.
Los binarios siguen contando como archivos, sin inventar líneas de texto.

No se exige que snapshotRef de preview y de commit coincidan: filtros Git o el
propio modo pueden diferir. La única decisión de publicación es la medida
committed posterior al commit. Esto evita otra dependencia frágil del staging.

### C3. Entrega y Claude

Separar entrega local y publicación: ein-git prepara el commit local autorizado;
el padre mide ese commit; si el resultado y la decisión humana existente lo
permiten, delega push/PR con `headOid`, `baseOid` y las cifras definitivas. El
agente comprueba HEAD antes de publicar. No introducir otra confirmación si la
entrega ya estaba autorizada y sigue dentro del alcance.

La comprobación no queda solo en el prompt: crear
`ein-pi/agent/lib/review-publication-check.ts`, con
`checkReviewedPublication(cwd, {baseOid, headOid, snapshotRef})`. Resolver HEAD,
exigir igualdad con headOid, recalcular el forecast committed con los OID
inmutables y exigir la misma identidad y decision=within. Rechazar paths parciales
para publicación: la medida definitiva siempre abarca la entrega completa.
Resultado discriminado `{ok:true}` o `{ok:false,reason}`; errores Git son rechazo.
Esta primera versión no ofrece override de over: dividir y volver a medir.

Exponer el comprobador mediante el puerto SDD y el subcomando
`ein-cc-sdd review-publication-check` (JSON por stdin; exit 0 solo para ok).
Claude ejecuta ese comando; Pi usa la entrada CLI del propio módulo nuevo
(`import.meta.main`, mismo parser y función, invocado con Bun). El hook de prompt
resuelve el archivo instalado relativo a su import.meta.url y entrega a ein-git
el argv exacto, sin hardcodear el home ni depender de una instalación Claude.
Ambos lo ejecutan como condición `&&` inmediatamente antes de cada
push/creación de PR; nunca una llamada separada seguida de publicación
incondicional. Verificar resolución en el smoke instalado de cada runtime.
El check no concede autorización Git: se ejecuta después del gate de consentimiento
existente. No intercepta comandos arbitrarios ni elimina una carrera con procesos
externos entre check y publicación; no presentar esa garantía como aislamiento
transaccional. Para push, usar refspec con el headOid medido como origen. Para PR,
comprobar además que la rama remota publicada tiene ese OID antes de crearla.

Claude usa `ein-cc-sdd review-forecast` con JSON de ReviewRequest por stdin, no
la frase sin implementación «the review-size forecast». Reexportar el servicio
existente por `shared/ports/sdd.ts`, declarar el puente en `shared/README.md` y
el test de fronteras. No duplicar el algoritmo ni importar interiores de Pi
desde Claude. Retirar ese puente cuando exista un proveedor Git neutral que
mantenga las mismas garantías; no construirlo dentro de este punto.

## D. Success criteria

Todos los escenarios de B, igualdad Pi/CLI para el mismo request y prueba de
cero efectos sobre estado Git, índice y contenido del proyecto. El resultado
unknown nunca produce texto «adelante con un PR». Añadir un test de consumidor
que demuestre que el orden commit→forecast→publicación no usa el preview antiguo.
Conservar controles positivos de cambios pequeños, renombres y exclusiones.

## E. Paquetes ejecutables

Ejecutar 12.1 → 12.2 → 12.3 → 12.4 → 12.5 → 12.5b → 12.6. No publicar el punto incompleto.

### 12.1 — Snapshot de lo que se medirá

- Read: `review-forecast.ts` (gitDiff/parseNumstat/changedBytes),
  `ein-pi/agent/lib/project-state-git.ts` (identidad de archivos, solo referencia).
- Edit: crear `ein-pi/agent/lib/review-snapshot.ts`; crear
  `tests/review-snapshot.test.ts`.
- Pasos: implementar C2 con requests C1; cubrir untracked, staged+modified,
  deletions, renombres, symlinks, espacios, base divergente y lectura cambiante.
  Usar repositorios temporales en tests; comprobar índice/HEAD/status inalterados.
- Verify: `bun test tests/review-snapshot.test.ts`; `bun run typecheck`.
- Stop: una capacidad Git necesaria falta en las plataformas soportadas; devolver
  el comando y error, sin sustituirlo por una estimación del modelo.

### 12.2 — Clasificación, cifras y decisión

- Edit: `ein-pi/agent/lib/review-forecast.ts`;
  `tests/review-workload-guard.test.ts`.
- Pasos: consumir el snapshot, clasificar cada ruta una vez, sumar producción y
  tests desde el mismo diff, añadir API/overload y decision; eliminar pathspecs
  duplicados que clasifican de forma distinta. Conservar unidades de bytes/líneas.
- Verify: `bun test tests/review-workload-guard.test.ts tests/review-snapshot.test.ts`;
  `bun run typecheck`.
- Stop: un consumidor requiere un campo que desaparecería; conservar compatibilidad
  explícita en C1, sin editar consumidores fuera de los siguientes paquetes.

### 12.3 — Herramienta y recibo Pi

- Edit: `ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts`,
  `ein-pi/agent/lib/tool-receipts.ts`, `tests/tool-receipts.test.ts`,
  crear `tests/review-forecast-tool.test.ts`.
- Pasos: exponer ReviewRequest con default working-tree; devolver mode/OID/ref;
  presentar unknown antes de cifras. Invocar execute de la herramienta en tests
  sobre repos temporales: mismos resultados que el servicio y cero mutaciones.
- Verify: `bun test tests/review-forecast-tool.test.ts tests/tool-receipts.test.ts`;
  `bun run typecheck`.
- Stop: el registro de herramienta real ha cambiado desde la base y no conserva
  contexto cwd; pedir adaptación del diseño, no inventar otro registro.

### 12.4 — Servicio disponible en Claude

- Edit: `shared/ports/sdd.ts`, `shared/README.md`, `ein-cc/sdd-cli/cli.ts`,
  `ein-cc/sync.ts`; actualizar `tests/architecture-boundaries.test.ts` y crear
  `tests/claude-review-forecast.test.ts`.
- Pasos: exportar servicio por puerto declarado; añadir subcomando+help+dispatch
  con stdin JSON y exit 1 para unknown/entrada inválida (over es medición válida,
  no error del proceso). Traducir el token a ese comando real. Comparar objetos
  Pi/Claude, probar cwd correcto, CLI sin efectos y superficie generada.
- Verify: `bun test tests/claude-review-forecast.test.ts tests/architecture-boundaries.test.ts tests/core-parity-coordinator.test.ts`;
  `bun run typecheck`.
- Stop: la traducción exige regenerar artefactos adicionales no enumerados;
  devolver rutas precisas para ampliar el paquete, no editar CLAUDE.md a mano.

### 12.5 — Comprobador ejecutable antes de publicación

- Edit: crear `ein-pi/agent/lib/review-publication-check.ts`;
  `shared/ports/sdd.ts`, `shared/README.md`, `ein-cc/sdd-cli/cli.ts`;
  crear `tests/review-publication-check.test.ts`; actualizar
  `tests/architecture-boundaries.test.ts`.
- Pasos: implementar C3 y dispatch CLI con validación estricta de entrada. No
  escribir recibos ni añadir otro almacén; recalcular contra OID y contenido.
  Tests de CLI real en repo temporal: commit distinto, snapshot inventado,
  base ilegible y over salen no-cero; within y HEAD idéntico salen cero.
  Ejecutar la composición `check && publicador-falso` y comprobar cero efectos
  del publicador para todos los rechazos y exactamente uno para el control positivo.
- Verify: `bun test tests/review-publication-check.test.ts tests/architecture-boundaries.test.ts`;
  `bun run typecheck`.
- Stop: se propone otra implementación para Pi; mantener un solo parser y
  comprobador, sin reemplazar el check por una comprobación narrativa del modelo.

### 12.5b — Entrada Pi instalada

- Edit: `ein-pi/agent/lib/review-publication-check.ts`,
  `ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts`;
  crear `tests/review-publication-pi-entry.test.ts`.
- Pasos: añadir entrypoint Bun protegido por import.meta.main; reutilizar el
  parser exportado en 12.5, sin ejecutar nada al importar. Inyectar ruta absoluta
  resuelta y argv en el prompt de ein-git, usando la admisión de 05 si está integrada.
  Test con layout instalado temporal y ruta con espacios: proceso CLI real,
  JSON por stdin, exit codes idénticos a Claude, sin instalación Claude ni home real.
- Verify: `bun test tests/review-publication-pi-entry.test.ts tests/review-publication-check.test.ts`;
  `bun run typecheck`.
- Stop: el bundle transforma la entrada de modo que import.meta.main no funciona;
  aportar evidencia del smoke y ajustar este paquete antes de proseguir.

### 12.6 — Consumir la medida definitiva

- Edit: `runtime/agents/ein-git.md`, `runtime/assets/orchestrator.md`;
  actualizar `tests/review-workload-guard.test.ts` y crear
  `tests/review-forecast-delivery.test.ts`.
- Pasos: sustituir confianza en cifra previa por C3; conservar consentimiento y
  elección single/chained ya obtenidos dentro de los límites medidos. Prescribir
  composición fail-closed del comando 12.5 y refspec por OID, no solo “verifica HEAD”.
  Test de secuencia con commit temporal:
  preview 0 y commit 600 obliga decisión over; HEAD distinto invalida el resultado;
  HEAD igual y within permite continuar sin otra pregunta. No ejecutar push real.
- Verify: `bun test tests/review-forecast-delivery.test.ts tests/review-workload-guard.test.ts tests/prompt-budget.test.ts tests/core-parity-coordinator.test.ts`;
  `bun run typecheck`.
- Stop: la nueva prosa excede presupuesto; condensar duplicación dentro de estas
  secciones. No elevar el techo ni quitar una obligación de seguridad para caber.

Al cerrar, ejecutar la verificación transversal del índice. Entregar métricas
antes/después para los fixtures de B, no un número de tests como único resultado.

## Precisiones de revisión · 22 de septiembre

- Los nombres descubiertos por Git son literales: rutas como app/pages/[id].vue
  deben medirse. Los selectores no expanden patrones; su validación no prohíbe
  rutas reales por contener corchetes.
- Referencias base/head con tipos JSON incorrectos o cadenas vacías son unknown;
  no se convierten por truthiness en una comparación vacía de HEAD consigo mismo.
- Una ruta Git o salida de diff no representable en UTF-8 produce unknown; nunca
  se sustituye por otro nombre y se mide su ausencia como cero cambios.
- Captura acotada por deadline monotónico total de 15 segundos, 16 MiB por
  entrada/salida Git, 64 MiB agregados y 10.000 rutas cambiadas. Exceder un límite
  devuelve unknown explícito. La enumeración de árboles y lectura de blobs se
  agrupan para evitar varios subprocesos por archivo.
