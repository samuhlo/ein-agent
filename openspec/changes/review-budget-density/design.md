# Design — review-budget-density

status: complete
change: review-budget-density
phase: design

## A. Proposal

### Intent

El forecast debe describir el volumen que una persona revisa aunque el código esté empaquetado en pocas líneas. Primero hará visible la medida sin cambiar la puerta; después una calibración reproducible activará el límite de bytes y el aviso localizado de densidad.

### Scope

Entra:

- Medir líneas cambiadas, bytes UTF-8 no blancos cambiados y ficheros distintos de producción con un único pathspec.
- Conservar la separación de tests y las exclusiones existentes, especialmente `openspec/**`.
- Mantener métricas por fichero para localizar densidad anómala.
- Calibrar presupuesto de bytes y umbral de aviso con diffs de PRs mergeadas.
- Transportar la decisión final desde la tool hasta el orquestador y `ein-git` sin una segunda medición.
- Convertir la placa universal de TypeScript en recomendación para módulos nuevos.

No entra:

- Un máximo global de longitud de línea.
- Reformatear módulos densos existentes.
- Cambiar el presupuesto de 400 renglones.
- Bloquear por número de ficheros o por densidad aislada.
- Alterar el presupuesto del prompt como iniciativa independiente.

### Affected areas

- Núcleo y presentación: `ein-pi/agent/lib/review-forecast.ts`, `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/tool-receipts.ts`.
- Contratos de actuación: `ein-pi/agent/lib/sdd-preflight.ts`, `runtime/assets/orchestrator.md`, `runtime/agents/ein-git.md`.
- Pruebas: `tests/review-workload-guard.test.ts` y tests textuales afectados por el prompt.
- Decisión y documentación: `docs/adr/0001-review-workload-guard.md`, `runtime/docs/STYLE.md`, `docs/roadmap.md`.

### Risks

- Un parser de patch que cuente cabeceras como contenido puede inflar el volumen.
- Git representa renombres, binarios, borrados y rutas con espacios de formas distintas.
- Una cifra calibrada con “cambios OpenSpec” mediría planes, no revisiones reales.
- El prompt del orquestador está pegado a su techo; la actualización debe sustituir el contrato existente sin aumentar su presupuesto.

### Rollback

Las PRs son encadenadas. Revertir la segunda devuelve la decisión a “solo líneas” conservando telemetría útil. Revertir también la primera restaura exactamente el contrato anterior. No hay migración de datos ni estado persistido.

### Success criteria

- Un diff de pocas líneas y gran contenido informa su volumen real.
- Tests, generados y OpenSpec no influyen en líneas, bytes ni ficheros de producción.
- Unicode se mide en bytes UTF-8 después de retirar espacios en blanco.
- La primera PR sigue decidiendo únicamente con 400 líneas.
- La segunda decide “supera” cuando excede líneas o bytes; densidad y ficheros nunca bloquean por sí solos.
- El orquestador y `ein-git` transportan la decisión sin recalcular el diff.
- Suite completa y los dos typechecks pasan.

## B. Spec

### Requirement: volume is measured from changed production content

The system MUST report the UTF-8 bytes of non-whitespace content in added and deleted production lines, the existing production line churn, and the number of distinct production files touched.

Given a diff with additions, deletions, Unicode content, whitespace and more than one production file
When the forecast measures the range
Then it reports line churn, non-whitespace UTF-8 byte churn and distinct file count from the same production boundary

### Requirement: existing exclusions apply to every production metric

The system MUST apply the existing production pathspec to line, byte, file and per-file density measurements.

Given identical production changes with additional test, generated and OpenSpec artifacts
When both ranges are measured
Then all production metrics are identical and the test line count remains separately reported

### Requirement: measurement failure stays fail-closed

The system MUST return `ok: false` when any required Git measurement fails and MUST NOT present partial zeroes as a valid forecast.

Given an invalid repository or base
When the forecast attempts to measure it
Then the result is unavailable rather than within budget

### Requirement: line packing cannot bypass the gate

The system MUST report a range as over budget when either production line churn exceeds the configured line budget or changed non-whitespace production bytes exceed the configured byte budget.

Given a range below 400 changed production lines but above the calibrated byte budget
When the final forecast evaluates it
Then it requests the same explicit single-PR or chained-PR decision used for excess lines

### Requirement: density remains a localized notice

The system MUST name files whose bytes-per-changed-line exceed the calibrated notice threshold and MUST NOT block solely because of that notice, an individual line length or the file count.

Given a small change containing one legitimate long expression and staying below both blocking budgets
When the final forecast renders it
Then it remains within budget and shows the affected file only as a notice

### Requirement: one decision crosses the delivery boundary

The system MUST let the deterministic forecast own the final line-or-byte decision; the orchestrator and `ein-git` MUST transport and trust that result without measuring the diff again.

Given a forecast that exceeds only the byte budget
When the parent prepares delivery
Then it asks for the existing review split decision and forwards both measures and budgets to `ein-git`

## C. Decisions

### 1. Measurement contract

`ReviewForecast.production` remains the line count for compatibility. Additive fields are:

- `productionBytes`: UTF-8 bytes after removing Unicode whitespace from added and deleted production lines.
- `productionFiles`: number of distinct production paths touched.
- `fileVolumes`: `{ path, changedLines, changedBytes, bytesPerLine }[]` for localization.

The first PR may expose these fields without a byte budget. `overBudget` remains line-only until the second PR.

### 2. Git is the parser of file identity

Use `git diff --numstat -z` with the existing pathspec for line/file identity and a zero-context production patch for changed content. NUL-separated numstat owns paths, including spaces and renames. Patch sections are consumed in Git order only to accumulate added/deleted content; headers and context never count. Binary content contributes a touched file but zero textual bytes.

Rejected: derive paths from `diff --git` or `+++` headers. Quoting and spaces make that a second, weaker filename parser.

Rejected: read whole old and new files. The budget measures review churn, not repository size.

### 3. Pure evaluation after measurement

The second PR introduces a pure evaluation step with explicit `{ lines, bytes, densityBytesPerLine }` thresholds. It returns line excess, byte excess, combined excess and localized notices. Formatting, tool details and receipts consume that result.

The file count is information only. Density is information only. The combined gate is exactly `overLines || overBytes`.

### 4. Calibration procedure

Use first-parent merge commits whose subject identifies a GitHub PR. For each, compare the merge's first parent with its second parent using the production pathspec. Record distributions for non-empty production diffs, keep explicit release/mechanical exceptions visible, and choose:

- byte budget from the 400-line budget multiplied by a robust upper-normal bytes-per-line density, rounded to a memorable value;
- notice threshold from the upper tail of per-file densities, high enough to stay exceptional rather than routine.

The ADR records sample, statistic, chosen values and removal conditions. Archived OpenSpec summaries explain outliers but do not supply the measurement.

### 5. Delivery chain

PR 1 is based on `main` and contains measurement, tests, additive presentation and planning documentation. PR 2 is based on PR 1 and contains calibration, blocking policy, acting contracts, ADR and final SDD verification/close. The final spec sync belongs to PR 2.

### 6. Style rule

The TypeScript header plate becomes an authoring recommendation for new modules. It is not a repository-wide mechanical gate because its absence has no downstream consumer.

## D. Success Criteria

- `bun test tests/review-workload-guard.test.ts` exercises bytes, Unicode, deletions, spaces, exclusions, unavailable Git and both budget dimensions.
- Contract tests prove the first slice is line-only and the final slice transports line and byte decisions.
- Calibration evidence is reproducible from merge parents already present in Git.
- `bun test` passes from the root.
- `bun run typecheck` passes from the root.
- `cd installer && bun run typecheck` passes.
- `bun ein-cc/sdd-cli/cli.ts check review-budget-density` reports no errors before close.
- `bun ein-cc/sdd-cli/cli.ts sync review-budget-density` reports `synchronized` before close.
