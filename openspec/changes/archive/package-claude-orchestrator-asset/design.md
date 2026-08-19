# Design — package-claude-orchestrator-asset

## A. Proposal

### Intent

Transportar el único asset canónico `ein-pi/agent/assets/orchestrator.md` dentro del payload de Claude, conservando exactamente sus bytes y su ruta relativa estable en inventario, staging, archivo y manifest. El empaquetado debe fallar de forma cerrada si la entrada requerida no existe, no es un fichero legible o no queda cubierta por la integridad del manifest.

### Scope

**Dentro:**

- declarar una única constante de ruta para el asset canónico y reutilizarla en el inventario de ficheros directos y en las rutas requeridas;
- copiar ese fichero al staging como `ein-pi/agent/assets/orchestrator.md`, sin decodificación ni reescritura;
- incluir el miembro en el archivo generado y una entrada `{ path, sha256 }` cuyo digest corresponda a los bytes realmente archivados;
- proporcionar un seam invocable del bundler para probar con checkout y salida temporales, manteniendo igual la entrada CLI usada por el build;
- cubrir con strict TDD inventario, ruta exacta, bytes, manifest y fallos por entrada ausente/no legible, además del ajuste mínimo de la fixture existente que enumera rutas requeridas.

**Fuera / diferido a `materialize-claude-orchestrator-asset`:**

- extracción o materialización del asset;
- hand-off al runtime o consumo del orchestrator;
- cambios de sincronización entre checkout y runtime;
- smoke compilado de BunFS;
- workflow de release o publicación.

El archivo generado `installer/src/assets/cc-ein-runtime.tar.gz` sigue siendo output desechable de verificación/build: no se convierte en fuente, no se edita manualmente y no se incorpora como cambio.

### Affected areas

**Producción a editar:**

- `installer/src/core/cc-payload-inventory.ts` — constante canónica, inventario directo y contrato de ruta requerida.
- `installer/scripts/bundle-cc-ein.ts` — seam parametrizable de bundle, validación de fichero directo y checksum de los bytes staged; la ejecución CLI conserva sus defaults actuales.

**Tests a editar o crear:**

- `tests/cc-payload-entrypoints.test.ts` — contrato de inventario y required path.
- `tests/cc-payload-bundle.test.ts` — nuevo test enfocado al pipeline real de staging/archive/manifest sobre temporales.
- `tests/installer-runtime-menu.test.ts` — únicamente añadir el asset a la fixture que enumera manualmente las rutas requeridas; sin ampliar comportamiento de extracción/materialización.

**Consumidor sin edición:**

- `installer/src/core/cc-payload.ts` seguirá aplicando `CC_EIN_PAYLOAD_REQUIRED_PATHS` y validando los digests declarados por el manifest; no se cambia su lógica de extracción/materialización.

### Risks

- Añadir un root completo de `ein-pi/agent` transportaría contenido no solicitado y aumentaría el payload.
- Hashear la fuente en vez de la copia staged podría declarar bytes distintos de los que llegan al archivo ante una carrera o copia defectuosa.
- Importar el script de bundle en tests sin separar su entrada CLI podría escribir el output real accidentalmente.
- Permitir que una entrada declarada como fichero sea un directorio podría producir un payload aparentemente válido sin el asset.

### Rollback

Revertir únicamente los dos ficheros de producción y los tres ficheros de test indicados. Eliminar outputs temporales creados por la verificación; no restaurar, regenerar ni limpiar el archive ignorado que ya exista en el worktree. El rollback no toca la fuente canónica, checkout sync ni superficies de instalación/runtime.

### Success criteria

- El inventario contiene una sola referencia estable al origen canónico y la reutiliza como fichero directo y required path.
- Un bundle sobre una fixture válida contiene exactamente `ein-pi/agent/assets/orchestrator.md`; sus bytes coinciden con la fuente y su entrada de manifest contiene el SHA-256 de esos mismos bytes.
- Entrada ausente, no regular o no legible devuelve error antes de publicar un nuevo archive válido.
- No hay cambios en extracción/materialización, hand-off, BunFS smoke, release ni `cc-ein/sync.ts`.
- Tests enfocados, suite Bun y typechecks requeridos pasan sin depender del archive generado del worktree.

### Spec context provenance

El scope/map no suministró ninguna referencia canónica bajo `openspec/specs/<domain>/spec.md`; selección canónica: **0 ficheros, 0 bytes**, por lo que no aplica registro SHA-256. La delta change-local leída como input es `openspec/changes/package-claude-orchestrator-asset/specs/claude-payload-transport/spec.md` y no se presenta como spec canónica.

La fuente canónica observada por scope es `ein-pi/agent/assets/orchestrator.md` (42.926 bytes; SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`). Ese digest es evidencia de baseline, no un valor a fijar en código: cada bundle MUST calcular el digest de los bytes actuales staged.

## B. Spec

### Requirement 1 — fuente e identidad de ruta

El sistema **MUST** tomar el orchestrator exclusivamente de `ein-pi/agent/assets/orchestrator.md`, **MUST** declararlo como fichero directo y ruta requerida mediante una única constante de inventario, y **MUST NOT** mantener una segunda copia fuente bajo `cc-ein/` o `installer/`.

**Scenario — inventario estable**

- **Given** el contrato de inventario del payload de Claude;
- **When** se consulta el fichero directo y las rutas requeridas del orchestrator;
- **Then** ambos resuelven exactamente a `ein-pi/agent/assets/orchestrator.md` y no a un alias ni a un root completo de `ein-pi/agent`.

### Requirement 2 — transporte byte a byte y manifest

El bundler **MUST** copiar los bytes sin transformación al path payload-relative `ein-pi/agent/assets/orchestrator.md`, **MUST** incluir ese miembro en el archive y **MUST** declarar en `ein-cc-payload-manifest.json` su path exacto y el SHA-256 de los bytes staged que se archivan.

**Scenario — bundle válido**

- **Given** un checkout fixture con un fichero canónico de bytes conocidos;
- **When** se genera el payload hacia una salida temporal;
- **Then** el miembro del archive conserva exactamente esos bytes y el digest del manifest coincide tanto con la fuente como con el miembro archivado.

### Requirement 3 — fallo cerrado de entrada e integridad

El bundler **MUST** terminar con error antes de producir un nuevo archive válido cuando la ruta canónica falte, no sea un fichero regular o no pueda leerse. El payload resultante **MUST** considerar esa ruta requerida y **MUST** quedar cubierto por la validación de integridad existente del manifest.

**Scenario — origen inválido**

- **Given** una fixture donde el path canónico está ausente, tiene tipo incorrecto o no es legible;
- **When** se intenta generar el payload;
- **Then** la operación falla, no deja una salida nueva utilizable y no emite un manifest que aparente cubrir el asset.

### Requirement 4 — límite transport-only

Este cambio **MUST NOT** modificar checkout sync, extracción/materialización, hand-off de runtime, smoke BunFS ni release; los archives creados por tests **MUST** vivir en temporales y tratarse como output generado.

**Scenario — aislamiento del cambio**

- **Given** el payload transportado y verificado;
- **When** se revisa el diff y los outputs de test;
- **Then** solo aparecen los ficheros de producción/test declarados, no se modifica ninguna superficie diferida y no se incorpora un archive generado.

## C. Decisions

### D1. Un fichero explícito, no un nuevo root

`CC_EIN_ORCHESTRATOR_ASSET` será la única constante con la ruta y se reutilizará en `CC_EIN_PAYLOAD_FILES` y `CC_EIN_PAYLOAD_REQUIRED_PATHS`. Esto conserva una única fuente y evita transportar todo `ein-pi/agent`. Se rechaza añadir `ein-pi/agent` a `CC_EIN_PAYLOAD_ROOTS` por ampliar alcance y payload sin necesidad.

### D2. Reutilizar el pipeline actual con un seam mínimo

`installer/scripts/bundle-cc-ein.ts` seguirá siendo dueño de staging, manifest y tar. Su operación se expondrá como función con `repoRoot` y `outputPath` inyectables; la entrada CLI solo invocará esos defaults cuando el script sea ejecutado directamente. Esto permite tests en temporales sin mutar la fuente protegida ni el output real. Se rechaza crear una nueva capa/clase de bundling: no hay una tercera variante que justifique esa abstracción.

### D3. Validar los direct files como ficheros requeridos

Los miembros de `CC_EIN_PAYLOAD_FILES` no usarán semántica recursiva permisiva: cada uno debe existir, ser fichero regular y poder copiarse/leerse. Los roots conservan su recorrido recursivo actual. Esta separación hace observable el fallo cerrado del asset sin alterar source-closure ni extracción.

### D4. El manifest describe lo archivado

El SHA-256 se calculará sobre la copia staged, después del copy y antes del tar. El test compara fuente, staged/archive member y digest. Se rechaza fijar el digest observado del orchestrator en código porque el asset canónico puede evolucionar; la integridad debe corresponder a cada bundle.

### D5. Strict TDD en el borde de transporte

El RED vive primero en `tests/cc-payload-entrypoints.test.ts` y el nuevo `tests/cc-payload-bundle.test.ts`: inventario/required path, archive member, igualdad de bytes, manifest y error de origen inválido. `tests/installer-runtime-menu.test.ts` solo mantiene compatible su fixture requerida. No se añaden assertions de materialización, runtime hand-off o BunFS smoke.

### Responsibility boundaries

- `cc-payload-inventory.ts`: identidad, inclusión y obligatoriedad del path.
- `bundle-cc-ein.ts`: lectura/copia, staging, manifest y archive; no instala ni materializa para runtime.
- `cc-payload.ts`: consumidor existente de required paths e integridad; permanece inmutable en este cambio.
- `materialize-claude-orchestrator-asset`: extracción/materialización, entrega al runtime, checkout/runtime semantics, BunFS smoke y release.
- `cc-ein/sync.ts`: checkout sync inmutable y fuera de alcance.

### Protected paths

No sobrescribir, revertir, stagear ni limpiar:

- `ein-pi/agent/assets/orchestrator.md`;
- `cc-ein/sync.ts`;
- `tests/surface-wiring.test.ts`;
- `installer/install.sh`;
- `installer/src/cli/install.ts`;
- `installer/src/core/settings.ts`;
- `docs/plan-hallazgos-dogfooding-2026-08.md`;
- el `installer/src/assets/cc-ein-runtime.tar.gz` preexistente/no trackeado.

Tampoco se editarán `installer/src/core/cc-payload.ts`, `installer/scripts/cc-payload-smoke.ts`, `installer/scripts/build-all.ts` ni workflows de `.github/`.

## D. Success Criteria

### Observable acceptance

- El asset figura una sola vez en el archive bajo el path exacto, sin variante `./` lógica, alias ni segunda copia mantenida.
- La extracción de inspección hecha por el test devuelve bytes idénticos a la fixture canónica.
- El manifest `ein-cc-payload/v1` incluye exactamente una entrada para el path y su SHA-256 coincide con el miembro archivado.
- Las fixtures de ausencia, tipo inválido y falta de lectura fallan y no dejan el output temporal como payload válido.
- La validación de required paths existente recibe la nueva ruta por inventario, sin cambio de su implementación.
- El diff queda limitado a los dos ficheros de producción y tres de test declarados, además de este `design.md`; no contiene archivos generados ni paths protegidos.

### Required verification

- Focus: `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts`
- Project gate: `bun test`
- Root typecheck: `bun run typecheck`
- Installer typecheck: `cd installer && bun run typecheck`
- Revisión manual del diff para confirmar que `installer/src/assets/cc-ein-runtime.tar.gz`, checkout sync, materialización, runtime hand-off, BunFS smoke y release permanecen fuera.
