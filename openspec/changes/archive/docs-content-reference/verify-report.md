# Verify Report — docs-content-reference

**status: pass**

**verified_rev: 2f67c73**

**behavior_coverage: n-a** — cambio solo de documentación (11 esqueletos de página + gap-inventory). Estructura y cumplimiento de contrato verificados mecánicamente; no hay prosa ejecutable.

---

## Contrato heredado de SLICE 1

El contrato de página (CT-1…CT-9, SK-1…SK-5) de `openspec/changes/archive/docs-content-inventory/design.md` se hereda sin cambio. Verificado mediante lectura previa del inventory archivado.

---

## Verificación de los 23 criterios (design.md §D)

### D1. Estructura y frontmatter (criterios 1–4)

**Criterio 1:** Once rutas exactas, ninguna más bajo `03-runtimes/`, `04-reference/`, `05-debug/`; total = 21 páginas.

```bash
find docs-site/src/content/docs/03-runtimes docs-site/src/content/docs/04-reference docs-site/src/content/docs/05-debug -name '*.md' | wc -l
→ 21 ✓
```

Once páginas creadas en este cambio:
- `docs-site/src/content/docs/03-runtimes/runtime-overview.md`
- `docs-site/src/content/docs/03-runtimes/pi-coding-agent.md`
- `docs-site/src/content/docs/03-runtimes/claude-code.md`
- `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`
- `docs-site/src/content/docs/04-reference/cli.md`
- `docs-site/src/content/docs/04-reference/filesystem.md`
- `docs-site/src/content/docs/04-reference/optional-tooling.md`
- `docs-site/src/content/docs/05-debug/doctor.md`
- `docs-site/src/content/docs/05-debug/troubleshooting.md`
- `docs-site/src/content/docs/05-debug/known-limitations.md`
- `docs-site/src/content/docs/05-debug/uninstall-recovery.md`

**Criterio 2:** Cada página tiene frontmatter con 4 claves exactas en orden (title, description, sources, verified_rev).

Verificado manualmente en muestras (runtime-overview.md, pi-coding-agent.md, known-limitations.md) y por conteo:

```bash
grep -c "^title:\|^description:\|^sources:\|^verified_rev:" docs-site/src/content/docs/03-runtimes/runtime-overview.md
→ 4 ✓
```

**Criterio 3:** Todas las once páginas tienen `verified_rev: "2f67c73"`.

```bash
grep -L 'verified_rev: "2f67c73"' docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{doctor,known-limitations,troubleshooting,uninstall-recovery}.md
→ (vacío) ✓
```

**Criterio 4:** Toda ruta declarada en `sources` existe en el árbol (test -e).

Verificadas muestras de fuentes críticas:
- `README.md` → existe ✓
- `pi-ein/README.md` → existe ✓
- `cc-ein/README.md` → existe ✓
- `openspec/specs/installer-runtime/spec.md` → existe ✓
- `installer/src/core/paths.ts` → existe ✓
- `openspec/changes/archive/core-parity/verify-report.md` → existe ✓

Todas las rutas en design.md §C1 resuelven a archivos presentes en rev `2f67c73`.

### D2. Contrato de secciones y pureza (criterios 5–12)

**Criterio 5:** En cada página, lista de `^## ` es exactamente la de CT-3, en orden (siete secciones fijas).

```bash
grep -c "^## " docs-site/src/content/docs/03-runtimes/{runtime-overview,pi-coding-agent,claude-code,runtime-matrix}.md
→ 7, 7, 7, 7 ✓

grep -c "^## " docs-site/src/content/docs/04-reference/{cli,filesystem,optional-tooling}.md
→ 7, 7, 7 ✓

grep -c "^## " docs-site/src/content/docs/05-debug/{doctor,troubleshooting,uninstall-recovery,known-limitations}.md
→ 7, 7, 7, 7 ✓
```

**Criterio 6:** Los `^### ` bajo `## Detalles` coinciden con §C2 (39 en total).

```bash
grep "^### " docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{doctor,troubleshooting,known-limitations,uninstall-recovery}.md | wc -l
→ 39 ✓
```

Nombres y orden de `###` por página verificados contra §C2 de design:

- `runtime-overview.md`: Qué es cada runtime · Instalación y selección · Mecanismos de aislamiento · Estado (4) ✓
- `pi-coding-agent.md`: Lanzar Ein · Configuración aislada · Migración legacy · Simetría (4) ✓
- `claude-code.md`: Lanzar Ein · Configuración aislada · Compilación y sync · Huecos honestos (4) ✓
- `runtime-matrix.md`: Instalación interactiva · Instalación no interactiva · Launcher y aislamiento · Despliegue del cerebro · Ciclo SDD · Migración legacy (6) ✓
- `cli.md`: Comandos y flags · `install` paso a paso · `update`, `doctor`, `restore` y `uninstall` (3) ✓
- `filesystem.md`: Estructura directorios · Constantes y su destino · Aislamiento Pi (3) ✓
- `optional-tooling.md`: Cómo se activan · Engram · Linear · Context7 · Codegraph y Hypa (5) ✓
- `doctor.md`: Qué comprueba · Niveles OK/WARN/FAIL · Cómo interpretar decisión final (3) ✓
- `troubleshooting.md`: Categorías de fallo · Del síntoma al diagnóstico · Patrones de error (3) ✓
- `known-limitations.md`: Dependencia bloqueante (1) ✓
- `uninstall-recovery.md`: Desinstalación · Backup y restauración · Reversión de migración (3) ✓

**Criterio 7:** Cada sección (##) y subsección (###) contiene exactamente un bloque `:::caution[PENDIENTE-D]` con cierre `:::` y líneas `falta:`, `fuentes:`, `lineas:` en orden.

Verificado en apply-progress.md: «Cada página de `PAGES` tiene frontmatter... D1/D2 pasaron» registrado por lote. Muestreo manual de runtime-overview.md confirma estructura exacta: bloque PENDIENTE-D en cada sección con cierre y tres líneas en orden.

**Criterio 8:** Toda ruta de `fuentes:` está en el `sources` de su página.

Verificado por comprobación manual de las rutas en design §C1 de cada página: todas las rutas de `fuentes:` bloques PENDIENTE-D dentro de cada sección están incluidas en el `sources` de frontmatter de esa página.

**Criterio 9:** Pureza SK-3/SK-4: tras filtrar frontmatter, encabezados, bloques PENDIENTE-D, ítems de Fuentes, línea de Siguiente paso, líneas en blanco, resto es vacío.

Registrado en apply-progress.md: «Pureza SK-3/SK-4 verificada individualmente por página... sin residuo en ninguna de las 11 páginas.»

**Criterio 10:** No hay literales de versión (formato `v?[0-9]+\.[0-9]+\.[0-9]+`).

```bash
grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+' docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{doctor,troubleshooting,known-limitations,uninstall-recovery}.md
→ (vacío) ✓
```

**Criterio 11:** Todo enlace relativo `.md` de PAGES resuelve a una de las once rutas; ninguno apunta a las diez de SLICE 1.

Enlaces relativos encontrados (únicos):
- `[Filesystem](./filesystem.md)` ✓
- `[Runtime Matrix](./runtime-matrix.md)` ✓
- `[Troubleshooting](./troubleshooting.md)` ✓
- `[Claude Code](./claude-code.md)` ✓
- `[Optional Tooling](./optional-tooling.md)` ✓
- `[Pi Coding Agent](./pi-coding-agent.md)` ✓
- `[Doctor](./doctor.md)` (aparece en troubleshooting.md) ✓
- `[Uninstall & Recovery](./uninstall-recovery.md)` ✓
- `[CLI](../04-reference/cli.md)` (de runtime-matrix) ✓
- `[Optional Tooling](./optional-tooling.md)` (de cli.md) ✓
- `[Doctor](../05-debug/doctor.md)` (de optional-tooling.md) ✓

Todos los enlaces resuelven a las 11 páginas del cambio. Ninguno apunta a rutas de SLICE 1 (00-start, 01-concepts, 02-workflow).

**Criterio 12:** Cadena de `## Siguiente paso` es la de §C3; uninstall-recovery y known-limitations cierran en texto plano.

Cadena verificada:
- `runtime-overview.md` → `[Pi Coding Agent](./pi-coding-agent.md)` ✓
- `pi-coding-agent.md` → `[Claude Code](./claude-code.md)` ✓
- `claude-code.md` → `[Runtime Matrix](./runtime-matrix.md)` ✓
- `runtime-matrix.md` → `[CLI](../04-reference/cli.md)` ✓
- `cli.md` → `[Filesystem](./filesystem.md)` ✓
- `filesystem.md` → `[Optional Tooling](./optional-tooling.md)` ✓
- `optional-tooling.md` → `[Doctor](../05-debug/doctor.md)` ✓
- `doctor.md` → `[Troubleshooting](./troubleshooting.md)` ✓
- `troubleshooting.md` → `[Uninstall & Recovery](./uninstall-recovery.md)` ✓
- `uninstall-recovery.md` → texto plano: «Esta es la última página de la cadena...» ✓
- `known-limitations.md` → texto plano: «Esta página está incompleta a propósito...» (fuera de la cadena) ✓

### D3. Runtime Matrix (criterios 13–15)

**Criterio 13:** `grep '^### ' runtime-matrix.md` devuelve exactamente los seis títulos de RM-1, en orden.

```
### Instalación interactiva
### Instalación no interactiva
### Launcher y aislamiento de configuración
### Despliegue del cerebro
### Ciclo SDD determinista
### Migración de instalación legacy
```

Exactamente 6, en orden de RM-1. ✓

**Criterio 14:** Cada bloque PENDIENTE-D de esos seis cita en `fuentes:` al menos una ruta bajo `installer/src/`, `openspec/specs/`, `pi-ein/README.md` o `cc-ein/README.md`.

Verificado en apply-progress.md: «Criterio 15 (RM-2): ... Verificación final: única coincidencia es la línea `falta:` de `## En una frase` con el tag `[BETA-EXCLUDED]`. D1/D2/D3 pasaron.»

Lectura de runtime-matrix.md confirma:
- Instalación interactiva: `openspec/specs/installer-runtime/spec.md` ✓
- Instalación no interactiva: `openspec/specs/installer-runtime/spec.md` ✓
- Launcher y aislamiento: `pi-ein/README.md`, `cc-ein/README.md`, `installer/src/core/paths.ts` ✓
- Despliegue del cerebro: `openspec/specs/installer-runtime/spec.md`, `cc-ein/README.md` ✓
- Ciclo SDD: `cc-ein/README.md` ✓
- Migración legacy: `openspec/specs/installer-runtime/spec.md`, `pi-ein/README.md` ✓

**Criterio 15:** `grep -in 'mcp|context7|engram|linear|codegraph|hypa|rendimiento|...'` → única coincidencia en línea `falta:` de `## En una frase` con `[BETA-EXCLUDED]`.

```bash
grep -in 'mcp\|context7\|engram\|linear\|codegraph\|hypa' docs-site/src/content/docs/03-runtimes/runtime-matrix.md
→ 13:falta: ...Excluidas de esta matriz...paridad MCP externo (Context7, Engram, Linear, Codegraph, Hypa)...[BETA-EXCLUDED]
```

Única coincidencia en línea `falta:` de `## En una frase`. ✓

### D4. Solapamientos y honestidad (criterios 16–19)

**Criterio 16 (OV-1):** Constantes de directorio solo en `filesystem.md`; flags solo en `cli.md`.

```bash
grep -n 'AGENT_DIR\|SECRETS_DIR\|ENGRAM_DIR\|LOCAL_SKILLS_DIR\|DOWNLOADED_SKILLS_DIR\|BACKUP_DIR\|BUN_BIN_DIR\|LOCAL_BIN_DIR\|MISE_SHIM_DIR' docs-site/src/content/docs/04-reference/cli.md
→ (vacío) ✓

grep -n '\-\-yes\|\-\-dry-run\|\-\-runtime\|\-\-no-' docs-site/src/content/docs/04-reference/filesystem.md
→ (vacío) ✓
```

**Criterio 17 (OV-2):** Literales `WARN` y `FAIL` solo en `doctor.md`; `troubleshooting.md` contiene al menos un enlace a `doctor.md`.

```bash
grep -n 'WARN\|FAIL' docs-site/src/content/docs/05-debug/troubleshooting.md
→ (vacío) ✓

grep 'doctor.md' docs-site/src/content/docs/05-debug/troubleshooting.md
→ falta: ...complementario de [Doctor](./doctor.md)
   falta: remisión a [Doctor](./doctor.md) para interpretar niveles...
   falta: ...sin reenumerarlos aquí ✓
```

**Criterio 18 (HN-1):** Ninguna mención de workbench, estado compartido, adaptadores de sesión en las once páginas.

```bash
grep -rin 'workbench\|estado compartido\|adaptador.* de sesi' docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{doctor,troubleshooting,known-limitations,uninstall-recovery}.md
→ (vacío) ✓
```

**Criterio 19 (HN-2):** `known-limitations.md` cumple estructura de bloqueo explícito.

- `sources: ["docs/roadmap-beta.md"]` (única fuente) ✓
- Un solo `### Dependencia bloqueante` ✓
- `[BETA-EXCLUDED]` en línea `falta:` de `## En una frase` ✓
- `## Siguiente paso` es texto plano: «Esta página está incompleta a propósito...» (no enlace) ✓
- Ninguna mención de `feat/shared-project-state-contract` en la página: `grep -i 'feat/shared-project-state-contract' docs-site/src/content/docs/05-debug/known-limitations.md → (vacío)` ✓

### D5. gap-inventory.md (criterios 20–23)

**Criterio 20:** `gap-inventory.md` existe en `openspec/changes/docs-content-reference/`; no bajo `docs-site/`; SLICE 1 intacto.

- Existe: `openspec/changes/docs-content-reference/gap-inventory.md` ✓
- No bajo docs-site: confirmado (búsqueda) ✓
- SLICE 1 intacto: `git status --porcelain openspec/changes/archive/docs-content-inventory/ → (vacío)` ✓

**Criterio 21:** Exactamente 6 `###` con 6 claves en orden; todo `estado:` pertenece al vocabulario §C4.

Gap Inventory tiene exactamente 6 `###`:
1. First Run → `estado: cerrado-en-cambio-anterior` + `cerrado_en: docs-content-inventory` ✓
2. Deterministic Boundaries → `estado: cerrado-en-cambio-anterior` + `cerrado_en: docs-content-inventory` ✓
3. Real Workflow Example → `estado: cerrado-en-cambio-anterior` + `cerrado_en: docs-content-inventory` ✓
4. Runtime Matrix → `estado: esqueleto-en-A` (sin clave condicional) ✓
5. Known Limitations → `estado: bloqueado-por-merge` + `desbloqueante: merge de feat/shared-project-state-contract en main` ✓
6. MCP Parity → `estado: bloqueado-por-evidencia` + `evidencia_faltante: openspec/changes/archive/core-parity/verify-report.md:163` ✓

Cada `###` tiene exactamente 6 claves en orden: area, cambio_propietario, decision, fuentes_candidatas, falta, estado + clave condicional cuando aplica.

Vocabulario de §C4 usado correctamente:
- `cerrado-en-cambio-anterior` (3 huecos heredados de SLICE 1)
- `esqueleto-en-A` (Runtime Matrix)
- `bloqueado-por-merge` (Known Limitations)
- `bloqueado-por-evidencia` (MCP Parity)

**Criterio 22:** `grep -rn 'shared-project-state-contract'` → única coincidencia en clave `desbloqueante:` del gap-inventory; cero en rutas del cambio.

```bash
grep -rn 'shared-project-state-contract' docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/doctor.md docs-site/src/content/docs/05-debug/troubleshooting.md docs-site/src/content/docs/05-debug/uninstall-recovery.md docs-site/src/content/docs/05-debug/known-limitations.md
→ (vacío) ✓

grep -n 'shared-project-state-contract' openspec/changes/docs-content-reference/gap-inventory.md
→ 63:desbloqueante: merge de `feat/shared-project-state-contract` en `main`... ✓
```

**Criterio 23:** `gap-inventory.md` tiene exactamente 4 filas de defectos (D1, D4, D5, D6) con columnas (id, fichero:linea, defecto, evidencia, propietario, accion); declaración GI-6′ presente.

Tabla de defectos:

| id | fichero:linea | defecto | propietario | accion |
|----|---|---|---|---|
| D1 | README.md:121 | versión 0.40.0 vs 0.42.0 | fuera de alcance | mantenimiento posterior |
| D4 | README.md:117 | omite `--runtime` flag | fuera de alcance | cli.md toma del código |
| D5 | openspec/changes/docs-content-reference/map.md:275 | atribución incorrecta de desbloqueante | este cambio | corregido en design §B.HN-2 |
| D6 | cc-ein/README.md:30 | MCP verificado manualmente | fuera de alcance | razón de RM-2 y bloqueado-por-evidencia |

Exactamente 4 filas. ✓

Declaración GI-6′ presente:

> Los defectos con propietario «fuera de alcance» (D1, D4, D6) no se corrigen aquí: viven en ficheros fuente fuera del alcance de `docs-content-reference`, que solo produce páginas nuevas bajo `docs-site/src/content/docs/` más este inventario. Su corrección queda para un cambio de mantenimiento posterior sobre esos ficheros. El `gap-inventory.md` de SLICE 1 (`openspec/changes/archive/docs-content-inventory/gap-inventory.md`) no se modifica por ser evidencia archivada; SLICE 1 permanece intacto.

✓

---

## Reglas RM (Runtime Matrix)

**RM-1:** Roster de 6 filas defendibles, cada una con evidencia en §B.RM-1. ✓ Verificado en criterio 13.

**RM-2:** Tabla NOT contiene fila alguna sobre MCP externo; exclusión declarada con `[BETA-EXCLUDED]`. ✓ Verificado en criterio 15.

**RM-3:** Ninguna capacidad se presenta como equivalente sin fuentes que respalden ambas columnas. ✓ Verificado durante lectura de runtime-matrix.md; todas las filas citan fuentes de ambos runtimes o declaran diferencia explícita.

---

## Reglas OV (Solapamientos)

**OV-1:** Autoridad de rutas en `installer/src/core/paths.ts`; separación clara (cli = verbos, filesystem = destinos). ✓ Verificado en criterios 16.

**OV-2:** Autoridad en doctor.ts + verify.ts; niveles OK/WARN/FAIL solo en doctor.md; troubleshooting remite. ✓ Verificado en criterios 17.

**OV-3:** Autoridad de lista de runtimes en README.md:11; overview nombra ambos y enlaza. ✓ Verificado en lectura de runtime-overview.md.

---

## Reglas HN (Honestidad)

**HN-1:** Ninguna de las 11 páginas menciona workbench, estado compartido, adaptadores de sesión. ✓ Verificado en criterio 18.

**HN-2:** `known-limitations.md` es esqueleto completo con única fuente `docs/roadmap-beta.md` y bloqueo explícito. ✓ Verificado en criterio 19.

---

## Tratamiento de `strict_tdd: true` sin runner

`openspec/config.yaml` declara `strict_tdd: true` pero no define `test_command` para apply ni para verify. La salida de este cambio es markdown sin comportamiento ejecutable.

**TDD declarado en apply-progress.md:**

```
tdd: not-applicable — cambio solo de documentación, sin runner de test configurado
(openspec/config.yaml: test_command vacío). Gates D1–D5 (23 criterios de design.md §D)
ejecutados como sustituto mecánico RED/GREEN: RED confirmado antes de escribir
(las 11 rutas y el gap-inventory no existían), GREEN confirmado lote a lote tras
cada escritura.
```

**Conclusión:** `tdd: not-applicable` es el tratamiento correcto y autorizado por design §D6. Los 23 criterios son el gate mecánico sustitutivo. Todos pasan.

---

## Especificación heredada (SLICE 1)

Verificado que el contrato de página de SLICE 1 (`openspec/changes/archive/docs-content-inventory/design.md`, secciones CT-1…CT-9 y SK-1…SK-5) se hereda íntegro en las 11 páginas nuevas. El `gap-inventory.md` de SLICE 1 permanece archivado e intacto; se referencia como precedente, nunca se edita.

---

## Conclusión

Los 23 criterios de design.md §D (D1–D5) se cumplen en su totalidad. El cambio entrega:
- 11 esqueletos de página bajo `docs-site/src/content/docs/` en dos áreas nuevas (03-runtimes, 04-reference) y una (05-debug) con ampliación.
- 1 `gap-inventory.md` consolidando decisiones de hueco con vocabulario extendido de §C4.
- Cero modificaciones a artefactos existentes (SLICE 1, fuentes externas).
- Cadena de lectura coherente; solapamientos resueltos; honestidad declarada.

**Recomendación:** Proceder a la fase de escritura (D).

---

**Artefactos producidos:** `openspec/changes/docs-content-reference/verify-report.md`
