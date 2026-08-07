status: ready
change: docs-sync-contract
phase: scope
verified_rev: "0ae709d"
spec_delta: none
canonical_spec_context: none (cambio determinista sin referencias canónicas)

# Scope — docs-sync-contract (FASE B: Validador + Detector de Drift)

## A. Executive summary

Escribir TypeScript con tests para implementar un validador del contrato de página (CT-1…CT-9, SK-1…SK-5) del design.md anterior, un detector de drift de fuentes versionadas, e integración en CI. **Tres piezas ejecutables, strict TDD aplicable de verdad con `bun test`.**

---

## B. Scope statement

**Piezas a entregar:**

### B1. Validador del contrato de página

Un módulo `docs-site-contract.ts` que verifique mecánicamente sobre las 21 páginas bajo `docs-site/src/content/docs/`:

- **CT-1** (frontmatter): exactamente 4 claves (title, description, sources, verified_rev), ninguna más; order fijo; verified_rev == "0ae709d"; cada ruta de sources existe como fichero.
- **CT-2** (H1): primer encabezado es exactamente `# <title sin ` · EIN`>`.
- **CT-3** (secciones): conjunto fijo de 7 encabezados `##` (En una frase, Para quién y qué aprenderás, Ruta rápida, Detalles, Checklist, Siguiente paso, Fuentes) en ese orden exacto, sin duplicados ni adicionales; bajo Detalles, número de `###` coincide con filas de la tabla del map.
- **CT-4** (PENDIENTE-D): formato literal `:::caution[PENDIENTE-D]` con las tres claves (falta:, fuentes:, lineas:) en minúsculas y ese orden; toda ruta de `fuentes:` aparece en `sources` del frontmatter.
- **CT-5** (Fuentes): lista exacta de las rutas del frontmatter, misma cantidad y orden, seguidas de ` — ` y descripción.
- **CT-6** (Siguiente paso): enlace `.md` resuelve a fichero existente; si el destino pertenece a cambio hermano o fase futura, va en texto plano, no como enlace.
- **CT-7** (cadena de lectura): verificar que el orden de `## Siguiente paso` sigue la cadena esperada (overview → getting-started → first-run → orchestrator → sdd-openspec → context → deterministic-boundaries → workflow-overview → artifacts → real-workflow-example → texto plano para área Runtimes).
- **CT-8** (versión): ningún literal `v?\d+\.\d+\.\d+` en la página.
- **CT-9** ([BETA-EXCLUDED]): toda mención a capacidad no evidenciada en roadmap-beta.md lleva tag literal `[BETA-EXCLUDED]` en la misma línea.
- **SK-1…SK-5** (esqueleto): pureza de esqueleto — tras eliminar frontmatter, encabezados, bloques PENDIENTE-D, ítems de Fuentes, línea de Siguiente paso y líneas en blanco, no debe quedar ninguna línea residual (SK-3/SK-4).

Producto: `ein-pi/agent/lib/docs-site-contract.ts` con funciones puras exportadas:
- `validatePageContract(filePath: string): ValidationResult` — lee una página y valida todos los criterios CT-1…CT-9.
- `validateSkeletonPurity(filePath: string): PurityResult` — verifica SK-1…SK-5 (pureza).
- `validateAllPages(docsDir: string): DetailedReport` — ejecuta ambas sobre todas las páginas.

Las funciones retornan objetos estructurados {valid: boolean, errors: ErrorEntry[], warnings?: WarningEntry[]} para que se puedan inspeccionar desde tests, CLI scripts o CI.

### B2. Detector de drift

Otro módulo `docs-site-drift-detector.ts` que compara las fuentes versionadas:

- Cada página declara `verified_rev` (en la fase A, todas son "0ae709d").
- El detector interroga a git: `git diff <verified_rev>..HEAD -- <cada fuente>`.
- Para cada página, si alguna de sus `sources` ha cambiado desde `verified_rev`, marca esa página como "drift detected", lista qué fuentes cambiaron y con cuántas líneas de delta.
- **No reescribe la página**: solo señala qué revisar.

Producto: `ein-pi/agent/lib/docs-site-drift-detector.ts` con:
- `detectDrift(docsDir: string, repoRoot: string): DriftReport` — retorna {pages_with_drift: [{path, sources_changed, line_delta}], safe_pages: []}.
- El reporte es legible para CI (puede decidir si avisar o bloquear).

### B3. Integración en CI

Añadir un job en `.github/workflows/ci.yml`:

```yaml
  docs-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - name: Validate docs-site page contract
        run: bun test tests/docs-site-contract.test.ts --reporter=verbose
```

**Decisión:** el validador de contrato bloquea CI (`if: failure() ⇒ workflow fails`); el detector de drift avisa pero no bloquea (`always-run, print warning`).

**Justificación:** una fuente que cambia no implica que la página esté mal redactada (la redacción llega en fase D); un contrato violado sí es un defecto de la fase A que hay que reparar inmediatamente.

### B4. Exclusión explícita: bloques autogenerados

El plan original incluía "generador de bloques automáticos" (ej: `## Código de ejemplo` → traer un bloque de `sources` y renderizarlo). **Se pospone a un cambio posterior** porque:

- Hoy no hay prosa, solo marcadores `PENDIENTE-D` sin contenido real.
- Generar bloques sin contenido que generar es especular.
- La fase D produce prosa; después de que exista prosa, definir identificadores de bloque y un generador tiene sentido.
- **Declaración explícita en design.md de la siguiente fase:** "Este cambio (B) define CT-1…CT-9 que valida estructura; bloques autogenerados quedan pospuestos a cambio-drift-2, cuando haya prosa."

---

## C. Decisiones de arquitectura

### C1. Ubicación del código

**Decisión:** `ein-pi/agent/lib/docs-site-contract.ts` y `ein-pi/agent/lib/docs-site-drift-detector.ts`.

**Razón:**
- Precedente: `ein-pi/agent/lib/sdd-guardrails.ts` es un validador de artefactos SDD, ubicación homóloga.
- El código no es específico de docs-site (podría validar otros contratos), así que vive en la librería del agente, no en `docs-site/`.
- Tests en `tests/docs-site-contract.test.ts` y `tests/docs-site-drift-detector.test.ts`, siguiendo convención del repo.

### C2. Cómo se invoca

**Decisión:** a través de tests corridos por `bun test`.

**Razón:**
- Aprovecha el runner ya configurado (`bun test v1.3.14`, 22 tests pasando).
- CI corre `bun test` → automáticamente ejecuta estos tests y falla si hay defectos.
- No requiere script adicional en `package.json` ni binario separado.
- El validador se exporta como funciones puras reutilizables, así que también se puede invocar desde `cc-ein-sdd verify` en fases posteriores si es necesario.

### C3. Invocación desde verify

En la fase `sdd-verify`, `verify-progress.md` ejecutará el test suite sobre la página:
```bash
bun test tests/docs-site-contract.test.ts
```

El test falla si alguna página viola CT-1…CT-9 o SK-1…SK-5, desbloqueando la fase.

---

## D. Contexto técnico

### D1. Stack confirmado

- **Language:** TypeScript (`.ts` files en `ein-pi/agent/lib/`).
- **Test runner:** bun test (v1.3.14, running on root `bun test` command).
- **Test framework:** built-in Bun (no external framework like Jest required).
- **CI:** GitHub Actions, `.github/workflows/ci.yml`, Ubuntu + macOS.

### D2. Cambios en openspec/config.yaml

**Corrección realizada en este scope:**

La sección `testing` y los `rules.apply/verify.test_command` estaban vacíos. Actualización:

```yaml
strict_tdd: true
context: |
  … Test runner: bun test (v1.3.14) — 22/22 tests pass in smoke run …
rules:
  apply:
    test_command: "bun test"
  verify:
    test_command: "bun test"
testing:
  runner:
    command: "bun test"
    framework: "bun test"
  commands:
    unit: ["bun test tests/"]
    integration: ["bun test tests/"]
```

**Impacto:**
- A partir de este change, `strict_tdd: true` es satisfacible para cambios con código.
- Todas las fases posteriores que toquen tests pueden contar con `bun test` disponible.

### D3. Sincronización con fase A

Las 21 páginas generadas por la fase anterior (docs-content-inventory y docs-content-reference) están en estado esqueleto. Este validador debe **pasar sobre ellas tal como están**. Si falla, el defecto está en el validador o es un hallazgo real de la fase A; no se modifican las páginas.

---

## E. Artifacts expected

- `ein-pi/agent/lib/docs-site-contract.ts` — módulo validador de contrato.
- `ein-pi/agent/lib/docs-site-drift-detector.ts` — módulo detector de drift.
- `tests/docs-site-contract.test.ts` — test suite completa para validador (19 criterios = 19 test cases mínimo).
- `tests/docs-site-drift-detector.test.ts` — test suite para detector.
- `.github/workflows/ci.yml` — job `docs-contract` añadido.
- `openspec/config.yaml` — **actualizado** con runner `bun test`.

**Out of scope:**
- Modificación de las 21 páginas bajo `docs-site/src/content/docs/`.
- Modificación de artefactos archivados en `openspec/changes/archive/`.
- Bloques autogenerados (pospuesto).

---

## F. Spec delta declaration

```
## Spec delta declaration
spec_delta: none
spec_delta_reason: Añade validación y detección de drift sobre un contrato de documentación ya existente; no altera el comportamiento observable de EIN ni introduce funcionalidad nueva.
```

---

## SCOPE PACKET (para cadena de fases)

```
scope: Escribe TypeScript+tests para validador del contrato de página (CT-1…CT-9, SK-1…SK-5), detector de drift de fuentes versionadas, e integración en CI. Strict TDD aplicable con bun test. Corrige openspec/config.yaml para reflejar runner real.

budget_allocated:
  max_tokens: 90000
  max_reads: 50
  max_runtime_ms: 600000
```
