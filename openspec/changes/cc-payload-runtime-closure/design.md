# Design — cc-payload-runtime-closure

status: complete
change: cc-payload-runtime-closure
phase: design

## A. Proposal

### Intent

Hacer que la maleta de Claude contenga exactamente el código fuente que sus cuatro entradas pueden necesitar al ejecutar: primero corrigiendo la dependencia invertida que introduce hoy la interfaz de Pi y después calculando el cierre con la gramática de TypeScript en lugar de con coincidencias de texto.

### Success criteria

- `Setting` tiene un único dueño en `project-settings.ts`; interfaz, controlador, entrypoint y tests lo importan directamente desde allí.
- La primera PR demuestra que propiedad fuente y contenido del archive son problemas distintos; la segunda retira la rama accidental y registra el número exacto eliminado.
- `bundle-ein-cc.ts` no contiene `IMPORT_RE` ni otro rastreador textual de imports.
- Imports/exports de valor, laterales, mixtos y dinámicos se incluyen; aristas puramente de tipo se excluyen.
- Una fuente con errores de parseo aborta antes de publicar un archive.
- Las cuatro entradas compilan desde el payload aislado y el smoke BunFS compilado pasa.
- Suite completa y ambos typechecks pasan.

### Rollback

Las PRs son apiladas. La primera sólo cambia propiedad de tipos y es reversible sin datos. La segunda puede volver temporalmente al cierre conservador por regex si el parser omitiera una dependencia, pero no conserva ambos algoritmos en paralelo ni un fallback silencioso.

## B. Spec

### Requirement: runtime syntax owns the payload closure

The system MUST follow relative module edges that survive TypeScript compilation and exclude edges that exist only for type checking.

Given side-effect, value, type-only, mixed, reexport and dynamic import fixtures
When the payload source closure is collected
Then every runtime edge is present, every exclusively type-only edge is absent and mixed clauses remain present

### Requirement: uncertain source cannot produce a trusted archive

The system MUST fail before archive publication when a source in the closure has parse diagnostics.

Given an entry or discovered dependency with invalid TypeScript syntax
When the bundler analyzes it
Then the error names that source and no new archive is produced

### Requirement: reduction preserves isolation

The system MUST compile and stage every canonical Claude entry without reading from the repository after the reduced archive is extracted.

Given the canonical generated archive outside the checkout
When Claude installation compiles its entries and the compiled BunFS smoke stages them
Then all required sources exist and both operations finish successfully

## C. Decisions

### 1. `Setting` belongs to the settings domain

`project-settings.ts` exports `Setting` next to `SettingDefinition`. `terminal-app.ts`, its controller, the surface entrypoint and tests import it directly. No compatibility reexport remains in the terminal module.

The name stays `Setting`: renaming a stable, clear model while moving it would expand the diff without improving ownership.

### 2. Parse, do not type-check

The bundler uses the TypeScript compiler parser (`createSourceFile`) but does not create a `Program` or resolve types. Runtime-vs-type-only is syntax carried by import/export nodes; a full typecheck would be slower and would couple packaging to unrelated project diagnostics.

The `typescript` package already exists at the exact pinned version in both root and installer development dependencies, so this adds no dependency.

### 3. Closed collector for module specifiers

A private helper returns runtime module specifiers from one parsed source:

- `ImportDeclaration`: side-effect imports count; `importClause.isTypeOnly` does not; named imports count only when a default, namespace or non-type element survives.
- `ExportDeclaration`: declaration-level `type` does not count; a named export containing only type elements does not; star, namespace or any value element counts.
- `CallExpression` whose expression is `import` and whose first argument is a string or no-substitution template literal counts.
- External specifiers are ignored by the existing relative resolver.

`ImportTypeNode` is not a call expression and therefore never enters the runtime closure. CommonJS `require()` and tsconfig aliases remain outside the current bundler contract.

### 4. Parse diagnostics are fatal

The helper inspects `SourceFile.parseDiagnostics` immediately. Any diagnostic throws an error naming the repository-relative source. The archive is written only after the complete closure succeeds, preserving fail-closed behavior.

### 5. Fixtures live outside copied roots

Bundler tests seed their graph beside `ein-pi/agent/surfaces/surface-runner.ts`, because `ein-cc/`, `runtime/` and `vendor/skills/` are copied wholesale. Testing inside one of those roots would pass even if closure analysis were broken.

### 6. Ownership correction does not claim payload reduction

La comparación directa con `origin/main` da 914 rutas antes y 914 después del movimiento de `Setting`. Otra arista de solo tipo entra desde continuidad (`terminal-continue-transport.ts` → `terminal-app-controller.ts`). La primera PR cierra la dirección arquitectónica; la poda observable pertenece al parser de la segunda. No se añade un segundo movimiento oportunista para fabricar una reducción.

### 7. Release evidence reuses existing mechanisms

The final verification generates the archive, records the manifest delta, extracts it to a temporary root, compiles the four canonical entries there and runs the existing compiled `cc-payload-smoke.ts`. No new CI gate is added unless one of those commands reveals an uncovered mechanical failure.

## D. Acceptance matrix

- Architecture RED/GREEN proves settings no longer import the terminal app and direct consumers import `Setting` from its owner.
- Manifest comparison after the ownership move records no change and names the second type-only edge; the semantic collector records the exact removed paths.
- Bundler fixtures cover side-effect import, default/value import, all-type named import, mixed import, value export, type export, export star, dynamic import and one transitive dependency.
- Invalid syntax in an entry and in a discovered dependency fails with the source path and leaves a fresh output absent.
- Focused commands: `bun test tests/architecture-boundaries.test.ts tests/terminal-app.test.ts tests/terminal-app-controller.test.ts` and `bun test tests/cc-payload-bundle.test.ts tests/cc-payload-entrypoints.test.ts`.
- Root `bun test`, `bun run typecheck`, installer typecheck, isolated four-entry compile and compiled BunFS smoke pass before close.
