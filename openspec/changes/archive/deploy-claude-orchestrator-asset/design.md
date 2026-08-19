# Design — deploy-claude-orchestrator-asset

## A. Proposal

### Intent

Hacer que el sync checkout/runtime de Claude despliegue el asset canónico `ein-pi/agent/assets/orchestrator.md` en `${CC_EIN_HOME}/assets/orchestrator.md` sin transformar sus bytes. La prueba usará un proceso Bun nuevo y un hogar temporal para validar el recorrido real sin tocar los hogares del usuario.

### Scope

**Incluye:**

- La copia de un único fichero canónico mediante el `runSync()` existente.
- La creación de `${CC_EIN_HOME}/assets` dentro del flujo normal, respetando `--dry`.
- Cobertura aislada del sync real que compruebe fichero regular y paridad byte a byte.

**No incluye:**

- Cambios al contenido de `ein-pi/agent/assets/orchestrator.md`.
- Inventario del payload del instalador, bundling, staging de archivos empaquetados, layout de archivos, aserciones de inventario ni smoke del instalador. Todo ello se difiere explícitamente a `package-claude-orchestrator-asset`.
- Cambios en Pi, coordinador generado, agentes, skills, hooks, MCP, launchers o comportamiento ajeno al despliegue del asset.
- Edición, reset, stage o absorción de los ficheros dirty A1–A3 ni del documento de dogfooding sin seguimiento.

### Affected areas

- **Producción:** `cc-ein/sync.ts` — añadir la creación del directorio `assets` y la copia requerida del fichero canónico dentro de `runSync()`.
- **Test:** `tests/surface-wiring.test.ts` — añadir las regresiones de sync real no-dry y dry-run usando el seam aislado existente.
- **Entrada inmutable:** `ein-pi/agent/assets/orchestrator.md` — solo se lee; no se modifica.
- **Protegidos:** `installer/install.sh`, `installer/src/cli/install.ts`, `installer/src/core/settings.ts`, `tests/deploy-settings.test.ts`, `tests/install-plan.test.ts`, `tests/install-sh-checksum.test.ts` y el documento sin seguimiento `docs/plan-hallazgos-dogfooding-2026-08-19.md` (o la variante de nombre presente en el working tree).

### Risks

- `DEST` se calcula al importar `cc-ein/sync.ts`; cambiar `CC_EIN_HOME` después de importarlo produciría una prueba engañosa. La prueba debe lanzar un proceso Bun nuevo con el entorno definido desde el inicio.
- El test recorre el sync completo y, por tanto, depende de Bun y de los inputs actuales de compilación de la superficie Claude; puede ser más lento que un test unitario, pero valida el seam solicitado.
- Una guarda `--dry` mal situada podría crear el directorio o el fichero. El caso dry-run debe comprobar que el destino no aparece.
- Una copia colocada fuera del bloque requerido podría permitir un resultado exitoso incompleto. El error de copia debe alcanzar `requiredFailures` y provocar salida no cero en el entrypoint.

### Rollback

Revertir únicamente la importación/llamada de copia y la creación de `DEST/assets` en `cc-ein/sync.ts`, junto con sus tests en `tests/surface-wiring.test.ts`. Si ya se ejecutó el sync, eliminar manualmente `${CC_EIN_HOME}/assets/orchestrator.md`; ningún formato, inventario ni dato persistente requiere migración inversa.

### Success criteria

- Un sync no-dry con `HOME` y `CC_EIN_HOME` temporales termina correctamente y crea `${CC_EIN_HOME}/assets/orchestrator.md` como fichero regular.
- `readFileSync(destino)` es byte a byte idéntico a `readFileSync(fuente)`, no solo igual en texto, tamaño o hash.
- Un sync con `--dry` no crea `${CC_EIN_HOME}/assets` ni el fichero.
- Un fallo al copiar el asset forma parte del fallo requerido del sync, no de los warnings MCP opcionales.
- El asset canónico conserva 42,926 bytes y SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.
- Solo cambian los dos ficheros de producción/test declarados y este artefacto SDD; el trabajo dirty protegido permanece intacto.

## B. Spec

### Contexto de especificación

- `openspec/specs/surface-wiring/spec.md` — SHA-256 `974b48743bb60c5c7fb32600e4a71f09f744fea09fd8b8dfece3bd1f2e1fbd31`, 5,389 bytes.
- Delta del cambio: `openspec/changes/deploy-claude-orchestrator-asset/specs/surface-wiring/spec.md`.

### R1. Despliegue canónico

**Requirement:** The system MUST deploy the canonical `ein-pi/agent/assets/orchestrator.md` through the existing Claude checkout/runtime sync to `${CC_EIN_HOME}/assets/orchestrator.md` as a regular file whose bytes exactly equal the source bytes.

**Scenario:**

- **Given** un checkout que contiene el asset canónico y `HOME`/`CC_EIN_HOME` apuntando a un hogar temporal aislado,
- **When** se ejecuta el sync checkout/runtime de Claude sin `--dry`,
- **Then** `${CC_EIN_HOME}/assets/orchestrator.md` existe como fichero regular y sus bytes son idénticos a los de la fuente canónica.

### R2. Dry-run sin mutaciones

**Requirement:** The system MUST preserve the existing dry-run contract: running Claude sync with `--dry` MUST NOT create the orchestrator destination or its parent directory.

**Scenario:**

- **Given** un `CC_EIN_HOME` temporal que aún no existe,
- **When** se ejecuta el sync de Claude con `--dry`,
- **Then** no se crea `${CC_EIN_HOME}/assets` ni `${CC_EIN_HOME}/assets/orchestrator.md`.

### R3. Fallo requerido

**Requirement:** The system MUST classify inability to deploy the canonical orchestrator asset as a required sync failure and MUST NOT report the sync as successful.

**Scenario:**

- **Given** un sync no-dry donde la fuente o el destino del asset no puede copiarse,
- **When** `runSync()` intenta desplegar el asset,
- **Then** el resultado contiene un fallo requerido, `ok` es `false` y el entrypoint termina con estado no cero.

## C. Decisions

### Copia directa de fichero, sin transformación

Se usará `copyFileSync` de `node:fs` para este único fichero. Expresa el contrato de copia byte a byte mejor que el helper `write`, que opera con strings UTF-8, y evita leer, normalizar o reserializar Markdown. No se añade un helper o abstracción exportada: hay una sola copia y YAGNI favorece una operación directa.

### Ubicación y semántica de fallo

`runSync()` creará `join(DEST, "assets")` con `ensureDir` y ejecutará la copia únicamente cuando `DRY` sea falso. La operación vivirá en el bloque `try` de despliegue requerido, antes de la sección MCP opcional; cualquier excepción caerá en el manejo existente de `requiredFailures`. No se integrará el asset en la compilación del coordinador, agentes o skills porque es un artefacto canónico independiente.

### Test a través del proceso real

La cobertura se añadirá a `tests/surface-wiring.test.ts`, en un grupo enfocado de sync checkout/runtime Claude. Cada caso lanzará `cc-ein/sync.ts` en un proceso Bun nuevo con:

- `HOME=<raíz temporal>/home`;
- `CC_EIN_HOME=<raíz temporal>/home/.claude-ein`;
- cwd en la raíz del repositorio.

El proceso nuevo es obligatorio porque `DEST` se fija durante la importación. El caso no-dry comprobará estado de salida, `lstatSync(...).isFile()` y igualdad directa de los `Buffer` leídos desde fuente y destino. El caso dry-run usará otro destino ausente y comprobará que no se crea. Ambos limpiarán la raíz temporal en `finally`.

### Mecanismo strict TDD

`preflight.json` declara `tdd: strict`. En apply, RED se obtiene añadiendo primero los casos de proceso hijo: el no-dry falla porque el destino aún no existe y el dry-run fija la no-regresión. GREEN añade solo la importación y copia guardada en `cc-ein/sync.ts`. TRIANGULATE confirma fichero regular, paridad binaria y ausencia total en dry-run; REFACTOR se limita a eliminar duplicación local de fixture si aparece, sin crear una API de producción nueva.

### Límites de responsabilidad

- `cc-ein/sync.ts` posee el despliegue checkout/runtime y sus semánticas required/dry-run.
- `tests/surface-wiring.test.ts` posee la prueba del seam aislado real.
- `ein-pi/agent/assets/orchestrator.md` posee el contenido canónico y permanece inmutable.
- `package-claude-orchestrator-asset` posee inventario de payload del instalador, bundling, archive staging y smoke empaquetado.
- Los ficheros dirty A1–A3 y el documento de dogfooding pertenecen a trabajo no relacionado y no deben tocarse.

### Alternativas rechazadas

- **Usar `write(..., readFileSync(..., "utf8"))`:** rechazado porque convierte el contrato en texto y no expresa preservación binaria.
- **Probar `runSync()` en el mismo proceso:** rechazado porque `DEST` ya quedó capturado al importar el módulo.
- **Añadir un helper exportado o inyección de dependencias solo para la copia:** rechazado por complejidad innecesaria; el seam real de proceso hijo ya existe.
- **Añadir un test nuevo o usar tests del instalador:** rechazado; `tests/surface-wiring.test.ts` es el seam existente y el instalador está fuera de alcance.
- **Extender ahora inventarios, bundling, staging, archives o smoke:** rechazado por el rescope; corresponde a `package-claude-orchestrator-asset`.

## D. Success Criteria

### Comprobaciones observables

- El test enfocado demuestra ejecución exitosa del sync real en un hogar temporal, destino regular y comparación binaria fuente/destino.
- El test dry-run demuestra que ni el padre `assets` ni el fichero aparecen.
- Revisión estática confirma que la copia está dentro de la ruta requerida de `runSync()`, bajo la guarda dry-run y antes de MCP opcional.
- `ein-pi/agent/assets/orchestrator.md` mantiene el tamaño y SHA-256 registrados.
- El diff no contiene cambios de installer, packaging, staging, smoke, asset canónico ni rutas dirty protegidas.

### Verificación requerida en apply/verify

- RED/GREEN enfocado: `bun test tests/surface-wiring.test.ts`
- Regresión completa: `bun test`
- Typecheck raíz: `bun run typecheck`
- Typecheck exigido por CI: `cd installer && bun run typecheck` (solo verificación; cualquier fallo en dirty protegido no autoriza editarlo dentro de este cambio).
- Integridad canónica: `wc -c < ein-pi/agent/assets/orchestrator.md` debe devolver `42926`, y `shasum -a 256 ein-pi/agent/assets/orchestrator.md` debe devolver `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.

No se ejecutan tests, builds ni typechecks en esta fase de diseño.
