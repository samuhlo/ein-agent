status: ready
change: docs-content-reference
phase: design
verified_rev: "2f67c73"
spec_delta: none
canonical_spec_context: `openspec/specs/installer-runtime/spec.md` — 59 líneas, 5321 bytes, sha256 `959a273ec65c8df8cee613f8b45d72b3f7643541704705cb0b8c0d61c36f9ab9` (calculado por el parent: la fase de diseño no dispone de shell y lo había registrado como estimación). Es la única ruta canónica leída, mapeada explícitamente en `map.md` §A/§B; dentro del límite de 3 ficheros / 32 KiB. `scope.md` declara `spec_delta: none`.

# Design — docs-content-reference (SLICE 2 de 2)

## Contrato heredado (no se rediseña)

El contrato de página es **exactamente** el de SLICE 1, `openspec/changes/archive/docs-content-inventory/design.md`: CT-1…CT-9 (frontmatter de cuatro claves en orden, siete `##` fijos, bloque `:::caution[PENDIENTE-D]` con `falta:`/`fuentes:`/`lineas:`, prohibición de literales de versión, tag `[BETA-EXCLUDED]`) y SK-1…SK-5 (reglas de esqueleto y criterio discriminante de pureza). Nada de eso se reescribe aquí.

Tres únicas diferencias mecánicas respecto a SLICE 1:

1. `verified_rev` es `"2f67c73"` en las once páginas nuevas (SLICE 1 usó `"0ae709d"`; sus diez páginas **no se tocan**, así que el árbol queda con dos valores y toda comprobación de `verified_rev` se acota a las once rutas de este cambio).
2. **CT-6′** (endurecimiento local): todo enlace relativo `.md` escrito por este cambio MUST resolver a una de sus **once** páginas. No hay enlaces cruzados hacia SLICE 1 ni desde SLICE 1: la continuidad entre áreas se expresa en texto plano, como ya hace `docs-site/src/content/docs/02-workflow/real-workflow-example.md:110`.
3. **GI-3′**: el vocabulario de `estado:` del gap-inventory se amplía (§C4). El artefacto de SLICE 1 es evidencia archivada e inmutable: se referencia como precedente, nunca se edita.

Todo lo demás —frontmatter, secciones, marcador, pureza, versión, `[BETA-EXCLUDED]`— se hereda íntegro.

---

## A. Proposal

### Intent

Producir **once esqueletos de página** en `docs-site/src/content/docs/` (áreas `03-runtimes`, `04-reference`, `05-debug`) más `openspec/changes/docs-content-reference/gap-inventory.md`, fijando por adelantado las tres decisiones que la fase de escritura no puede tomar sola: qué filas admite la Runtime Matrix, quién manda en cada solapamiento de contenido, y cómo se declara un hueco bloqueado por una rama sin mergear.

### Scope

**Dentro:**
- Las once páginas de `scope.md` §Artefactos esperados, en estado esqueleto.
- `openspec/changes/docs-content-reference/gap-inventory.md` con seis decisiones de hueco y cuatro defectos de fuente.
- Las reglas normativas nuevas de este cambio: roster de filas de la matriz (§B.RM), autoridades de solapamiento (§B.OV), vocabulario de estado (§B.GI/§C4).

**Fuera (no-goals):**
- Prosa redactada, tablas rellenadas, ejemplos de salida de terminal → fase D.
- Instalación o configuración de Astro/Starlight → fase C.
- Cualquier modificación de las diez páginas de SLICE 1 y de su `gap-inventory.md` archivado.
- Corrección de los defectos de fuente detectados (`README.md`): se anotan, no se tocan.
- Consulta de la rama `feat/shared-project-state-contract` y de cualquier ruta suya.
- Modificación de `openspec/config.yaml`: ver §D6.

### Affected areas

| Ruta | Acción |
|------|--------|
| `docs-site/src/content/docs/03-runtimes/{runtime-overview,pi-coding-agent,claude-code,runtime-matrix}.md` | crear (esqueleto) |
| `docs-site/src/content/docs/04-reference/{cli,filesystem,optional-tooling}.md` | crear (esqueleto) |
| `docs-site/src/content/docs/05-debug/{troubleshooting,doctor,known-limitations,uninstall-recovery}.md` | crear (esqueleto) |
| `openspec/changes/docs-content-reference/gap-inventory.md` | crear |

Doce ficheros nuevos. **Cero ficheros existentes modificados.**

### Risks

1. **Runtime Matrix presentando paridad no verificada.** Es el riesgo caro: una tabla comparativa invita a rellenar celdas por simetría visual. Mitigación: el roster de filas está cerrado en §B.RM-1 y el material excluido está nombrado en §B.RM-2; ambos se comprueban con `grep`, no con criterio editorial.
2. **Duplicación entre `cli`/`filesystem` y `doctor`/`troubleshooting`.** Mitigación: §B.OV convierte cada solapamiento en una regla de exclusividad léxica comprobable (qué literal puede aparecer en qué página).
3. **Filtración de la rama bloqueada.** Mitigación: `known-limitations.md` tiene una única fuente permitida y el nombre de la rama solo puede aparecer en la clave `desbloqueante:` del gap-inventory (E21).
4. **Fuentes TypeScript citadas con líneas que envejecen.** Mitigación: `lineas:` es orientativo y `sources` apunta al fichero; la comprobación dura es `test -e` sobre la ruta, no sobre el rango.
5. **`strict_tdd: true` sin runner.** Tratamiento honesto en §D6, idéntico al de SLICE 1.

### Rollback

Todo es aditivo: `git rm` de las once páginas y del `gap-inventory.md` de este cambio restaura el árbol. Sin migraciones, dependencias ni configuración tocada.

### Success criteria

§D. Los 23 criterios son comandos, no valoraciones.

---

## B. Spec

Las reglas CT-1…CT-9 y SK-1…SK-5 de SLICE 1 aplican sin cambio. Lo siguiente es **solo lo nuevo**.

### RM — Runtime Matrix: solo filas defendibles

**RM-1.** `runtime-matrix.md` MUST tener bajo `## Detalles` exactamente estos seis `###`, en este orden, y **ninguno más**. Cada uno es una fila candidata de la tabla que la fase D redactará, y cada uno tiene evidencia de código o de spec:

| # | `###` | Evidencia (obligatoria en `fuentes:`) |
|---|-------|----------------------------------------|
| 1 | `### Instalación interactiva` | `openspec/specs/installer-runtime/spec.md` (scenario `runtime-menu-target-selection`) |
| 2 | `### Instalación no interactiva` | `openspec/specs/installer-runtime/spec.md` (scenario `noninteractive-runtime-flag-selection`) |
| 3 | `### Launcher y aislamiento de configuración` | `pi-ein/README.md`, `cc-ein/README.md`, `installer/src/core/paths.ts` |
| 4 | `### Despliegue del cerebro` | `openspec/specs/installer-runtime/spec.md` (scenarios `pi-runtime-isolated-installation`, `claude-code-runtime-installation`), `cc-ein/README.md` |
| 5 | `### Ciclo SDD determinista` | `cc-ein/README.md` |
| 6 | `### Migración de instalación legacy` | `openspec/specs/installer-runtime/spec.md` (scenario `pi-runtime-isolated-installation`), `pi-ein/README.md` |

> Given `03-runtimes/runtime-matrix.md`
> When se listan sus `###` bajo `## Detalles`
> Then son exactamente esos seis, en ese orden, y cada bloque `PENDIENTE-D` cita en `fuentes:` al menos una ruta bajo `installer/src/`, `openspec/specs/`, `pi-ein/README.md` o `cc-ein/README.md`.

**RM-2.** La tabla MUST NOT contener fila alguna sobre MCP externo (Context7, Engram, Linear, Codegraph, Hypa), rendimiento, inyección proactiva de skills ni re-ejecución de acceptance. Estas capacidades se nombran **una sola vez**, en la línea `falta:` del bloque `PENDIENTE-D` de `## En una frase`, acompañadas del tag literal `[BETA-EXCLUDED]` (CT-9), como declaración de lo que la matriz deliberadamente no compara.

Razón de la exclusión de MCP, que es la decisión delicada del cambio: `openspec/changes/archive/core-parity/verify-report.md:163` registra literalmente *«Optional external Claude MCP setup was not exercised against live services»*. `cc-ein/README.md:30` describe la integración como verificada, pero por observación manual; ninguna verificación reproducible la ejercitó. Sin evidencia reproducible no hay fila. La asimetría de skills y acceptance sí está documentada (`cc-ein/README.md:38-39`), pero pertenece a `claude-code.md` §*Huecos honestos frente a Pi*, no a una tabla de paridad.

**RM-3.** Ninguna página MUST presentar una capacidad como equivalente entre Pi y Claude Code sin que el `fuentes:` de esa misma sección cite código o spec que sostenga **ambas** columnas. Una fila puede afirmar una diferencia (p. ej. la migración legacy existe solo en Pi) si esa diferencia tiene evidencia; lo prohibido es la simetría por defecto.

> Given cualquiera de las once páginas
> When afirma que Pi y Claude Code hacen lo mismo en algo
> Then esa sección cita en `fuentes:` una ruta de `installer/src/`, `openspec/specs/` o los README de adaptador que respalda la afirmación para los dos runtimes.

**Cómo lo comprueba `sdd-verify`:** criterios E13 y E14 de §D. El roster de `###` es una lista fija comparable con `grep '^### '`; la exclusión es un `grep -in` de los términos vetados sobre `runtime-matrix.md`, cuyo único acierto admisible es la línea `falta:` que lleva `[BETA-EXCLUDED]`. Ningún criterio pide juzgar si la comparación «es justa».

### OV — Solapamientos, bajados a página

**OV-1 (`cli.md` ↔ `filesystem.md`).** Autoridad de valores de ruta: `installer/src/core/paths.ts`.

- `cli.md` documenta **verbos**: comandos (`ein`, `ein install`, `ein update`, `ein doctor`, `ein uninstall`, `ein restore`) y sus flags. MUST NOT enumerar constantes de directorio; cuando necesite hablar de dónde acaban las cosas, remite a `filesystem.md`.
- `filesystem.md` documenta **destinos**: las constantes exportadas (`AGENT_DIR`, `SECRETS_DIR`, `ENGRAM_DIR`, `LOCAL_SKILLS_DIR`, `DOWNLOADED_SKILLS_DIR`, `BACKUP_DIR`, `BUN_BIN_DIR`, `LOCAL_BIN_DIR`, `MISE_SHIM_DIR`) y la resolución aislado-vs-legacy. MUST NOT documentar flags de comando.
- Regla mecánica: los identificadores de constante aparecen **solo** en `filesystem.md`; los literales de flag (`--yes`, `--dry-run`, `--runtime`, `--no-*`) aparecen **solo** en `cli.md`.
- Corolario para `optional-tooling.md`: describe cada integración (qué es, dónde vive su clave o su directorio, qué pasa si falta) y remite a `cli.md` para la sintaxis del flag de exclusión; no repite literales de flag.

**OV-2 (`doctor.md` ↔ `troubleshooting.md`).** Autoridad: `installer/src/cli/doctor.ts` + `installer/src/core/verify.ts`.

- `doctor.md` es la **referencia de la herramienta**: qué grupos y checks ejecuta, la semántica de los tres niveles (`OK`, `WARN`, `FAIL`) y cómo se lee la línea de decisión final.
- `troubleshooting.md` es el **catálogo síntoma → causa → acción**. MUST NOT reexplicar los niveles ni reenumerar los grupos de checks; su segundo `###` remite a `doctor.md` mediante enlace relativo.
- Regla mecánica: los literales `WARN` y `FAIL` aparecen **solo** en `doctor.md`; `troubleshooting.md` contiene al menos un enlace relativo a `doctor.md`.

**OV-3 (`runtime-overview.md` ↔ páginas de runtime).** Autoridad de la lista de runtimes: `README.md:11`. El overview nombra ambos adaptadores y enlaza a `pi-coding-agent.md` y `claude-code.md`; el detalle de aislamiento, migración y compilación vive en las específicas.

### HN — Honestidad de estado (refuerzo de `scope.md` §3)

**HN-1.** Ninguna de las once páginas MUST describir como existentes el launcher de workbench, el estado compartido de proyecto ni los adaptadores de sesión. No hay excepción con `[BETA-EXCLUDED]`: en este cambio, simplemente no se mencionan. Comprobable con `grep -rin 'workbench\|estado compartido\|adaptador(es)? de sesi'` sobre las once rutas → sin coincidencias.

**HN-2.** `known-limitations.md` MUST ser un esqueleto completo según CT-1…CT-9 con una única fuente permitida, `docs/roadmap-beta.md`, y bajo `## Detalles` un solo `### Dependencia bloqueante`. La incompletitud se declara así:

- El `falta:` de `## En una frase` MUST contener el tag `[BETA-EXCLUDED]` y la frase de bloqueo: la matriz completa de limitaciones conocidas no es fuente legible hasta el merge de la rama pendiente.
- `## Siguiente paso` MUST ser **texto plano** declarando que la página está incompleta a propósito y qué la desbloquea. No cierra la cadena de lectura ni enlaza a nada.
- El bloqueo MUST NOT expresarse con una clave extra de frontmatter: CT-1 fija cuatro claves y no se altera.
- Ninguna ruta de la rama bloqueada puede aparecer en la página. El nombre de la rama aparece **solo** en el gap-inventory, en `desbloqueante:`.

> Given `05-debug/known-limitations.md`
> When un lector la abre
> Then ve un esqueleto declarado como incompleto, la condición concreta de desbloqueo, y ninguna afirmación sobre limitaciones que no estén ya publicadas en `docs/roadmap-beta.md`.

**Corrección de una atribución del map:** `map.md:275` atribuye a `docs/roadmap-beta.md:51-60` la declaración del desbloqueante. Es falso: esas líneas tratan «Las tres fugas silenciosas del sync». El desbloqueante consta en `openspec/changes/archive/docs-content-inventory/gap-inventory.md:60`. Registrado como defecto D5 (§C5) y corregido aquí: `roadmap-beta.md` es fuente de límites ya publicados, **no** del desbloqueante.

### GI — `gap-inventory.md` de este cambio

**GI-1′.** MUST existir en `openspec/changes/docs-content-reference/gap-inventory.md` y MUST NOT crearse bajo `docs-site/`. El de SLICE 1 (`openspec/changes/archive/docs-content-inventory/gap-inventory.md`) es **precedente inmutable**: se cita, no se edita.

**GI-2′.** MUST contener `## Decisiones de hueco` con **exactamente seis** `###`: los cinco heredados de SLICE 1 (`First Run`, `Deterministic Boundaries`, `Runtime Matrix`, `Real Workflow Example`, `Known Limitations`) más el nuevo `MCP Parity`.

**GI-3′.** Cada `###` MUST llevar las seis claves de GI-3 de SLICE 1, en el mismo orden (`area`, `cambio_propietario`, `decision`, `fuentes_candidatas`, `falta`, `estado`), con `estado:` tomando un valor del vocabulario de §C4 y las claves condicionales que ese valor exige.

**GI-4′.** `Known Limitations` MUST tener `estado: bloqueado-por-merge` y la clave `desbloqueante:` nombrando el merge concreto. `MCP Parity` MUST tener `estado: bloqueado-por-evidencia` y la clave `evidencia_faltante:` citando `openspec/changes/archive/core-parity/verify-report.md:163`.

**GI-5′.** MUST contener `## Defectos de fuente detectados` con el mismo formato de columnas que SLICE 1 (`id | fichero:linea | defecto | evidencia | propietario | accion`) y **exactamente cuatro** filas: D1 (heredado, sigue sin corregir), D4, D5, D6 (§C5).

**GI-6′.** MUST declarar explícitamente que los defectos con propietario «fuera de alcance» no se corrigen aquí, y que el gap-inventory de SLICE 1 no se modifica por ser evidencia archivada.

---

## C. Decisions

### C1. Fuentes canónicas por página

`sources` (frontmatter) es exactamente esta lista, en este orden, y toda ruta existe en el repo a `2f67c73`:

| Página | `sources` |
|--------|-----------|
| `03-runtimes/runtime-overview.md` | `README.md`, `pi-ein/README.md`, `cc-ein/README.md`, `openspec/specs/installer-runtime/spec.md` |
| `03-runtimes/pi-coding-agent.md` | `pi-ein/README.md`, `README.md`, `installer/src/core/paths.ts`, `installer/src/core/pi-migration.ts`, `openspec/specs/installer-runtime/spec.md` |
| `03-runtimes/claude-code.md` | `cc-ein/README.md`, `README.md`, `openspec/specs/installer-runtime/spec.md` |
| `03-runtimes/runtime-matrix.md` | `openspec/specs/installer-runtime/spec.md`, `pi-ein/README.md`, `cc-ein/README.md`, `installer/src/core/paths.ts`, `openspec/changes/archive/core-parity/verify-report.md` |
| `04-reference/cli.md` | `README.md`, `installer/src/cli/install.ts`, `installer/src/cli/menu.ts`, `installer/src/cli/update.ts`, `installer/src/cli/doctor.ts`, `installer/src/cli/restore.ts`, `installer/src/cli/uninstall.ts` |
| `04-reference/filesystem.md` | `installer/src/core/paths.ts`, `README.md`, `pi-ein/README.md` |
| `04-reference/optional-tooling.md` | `installer/src/core/deps.ts`, `installer/src/core/engram.ts`, `installer/src/core/secrets.ts`, `installer/src/core/launcher.ts`, `ein-pi/agent/mcp.json`, `cc-ein/README.md` |
| `05-debug/troubleshooting.md` | `installer/src/core/verify.ts`, `installer/src/cli/doctor.ts`, `docs/roadmap-beta.md` |
| `05-debug/doctor.md` | `installer/src/cli/doctor.ts`, `installer/src/core/verify.ts` |
| `05-debug/known-limitations.md` | `docs/roadmap-beta.md` |
| `05-debug/uninstall-recovery.md` | `installer/src/cli/uninstall.ts`, `installer/src/cli/restore.ts`, `installer/src/core/backup.ts`, `pi-ein/README.md` |

`ein-pi/agent/extensions-manifest.json` figura en `scope.md` pero el map no lo ancla a ninguna sección: **no se usa como fuente** en este cambio.

### C2. `###` por página (deriva de `map.md` §B)

CT-3 exige que los `###` bajo `## Detalles` correspondan uno a uno con las filas del map. Roster cerrado, 39 en total:

| Página | `###` (en orden) |
|--------|------------------|
| `runtime-overview.md` | Qué es cada runtime · Instalación y selección de runtime · Mecanismos de aislamiento · Estado de los runtimes |
| `pi-coding-agent.md` | Lanzar Ein en Pi · Configuración aislada · Migración desde una instalación legacy · Simetría con el adaptador de Claude |
| `claude-code.md` | Lanzar Ein en Claude Code · Configuración aislada · Compilación y sync · Huecos honestos frente a Pi |
| `runtime-matrix.md` | los seis de RM-1 |
| `cli.md` | Comandos y flags · `install` paso a paso · `update`, `doctor`, `restore` y `uninstall` |
| `filesystem.md` | Estructura de directorios · Constantes de ruta y su destino · Aislamiento de Pi: aislado frente a legacy |
| `optional-tooling.md` | Cómo se activan y se desactivan · Engram · Linear · Context7 · Codegraph y Hypa |
| `troubleshooting.md` | Categorías de fallo · Del síntoma al diagnóstico · Patrones de error frecuentes |
| `doctor.md` | Qué comprueba · Niveles OK, WARN y FAIL · Cómo interpretar la decisión final |
| `known-limitations.md` | Dependencia bloqueante |
| `uninstall-recovery.md` | Desinstalación · Backup y restauración · Reversión de la migración de Pi |

El segundo `###` de `troubleshooting.md` se llama *Del síntoma al diagnóstico* —y no *Cómo leer doctor*— precisamente por OV-2: su trabajo es derivar a `doctor.md`, no duplicarlo.

### C3. Cadena de lectura (`## Siguiente paso`)

`runtime-overview` → `pi-coding-agent` → `claude-code` → `runtime-matrix` → `cli` → `filesystem` → `optional-tooling` → `doctor` → `troubleshooting` → `uninstall-recovery` → texto plano de cierre. `known-limitations.md` queda **fuera de la cadena** (HN-2): enlazar una página deliberadamente vacía como «siguiente paso» la presentaría como contenido continuo. El orden de **escritura** sigue siendo el de `map.md` §G.

### C4. Vocabulario de `estado:` (extensión de GI-3)

SLICE 1 solo admitía `esqueleto-en-A | bloqueado`. Ese vocabulario no tenía valor correcto para «hueco que pertenece a otro cambio y ya se cerró allí», ni distinguía bloqueo por merge de bloqueo por falta de evidencia. Vocabulario completo de este cambio:

| Valor | Significado | Clave adicional obligatoria |
|-------|-------------|------------------------------|
| `esqueleto-en-A` | esqueleto entregado en el cambio propietario; prosa pendiente de la fase D | ninguna |
| `cerrado-en-cambio-anterior` | el hueco se resolvió en un cambio ya archivado; aquí solo consta como trazabilidad | `cerrado_en:` (nombre del cambio archivado) |
| `bloqueado-por-merge` | la fuente autoritativa vive en una rama sin mergear | `desbloqueante:` (merge concreto) |
| `bloqueado-por-evidencia` | la fuente existe pero ninguna verificación reproducible la ejercita | `evidencia_faltante:` (ruta:línea del registro) |

`bloqueado` a secas queda **deprecado** y no se usa en este artefacto. El valor que SLICE 1 asignó a `Known Limitations` no se corrige en su fichero: es evidencia archivada.

Asignación de los seis huecos:

| Hueco | `cambio_propietario` | `estado` |
|-------|----------------------|----------|
| First Run | docs-content-inventory | `cerrado-en-cambio-anterior` (`cerrado_en: docs-content-inventory`) |
| Deterministic Boundaries | docs-content-inventory | `cerrado-en-cambio-anterior` (`cerrado_en: docs-content-inventory`) |
| Real Workflow Example | docs-content-inventory | `cerrado-en-cambio-anterior` (`cerrado_en: docs-content-inventory`) |
| Runtime Matrix | docs-content-reference | `esqueleto-en-A` (roster de filas fijado en RM-1) |
| Known Limitations | docs-content-reference | `bloqueado-por-merge` (`desbloqueante:` merge de `feat/shared-project-state-contract` en `main`) |
| MCP Parity | docs-content-reference | `bloqueado-por-evidencia` (`evidencia_faltante:` `openspec/changes/archive/core-parity/verify-report.md:163`) |

Nota de exactitud: los huecos cerrados en SLICE 1 son **tres**, no dos — `First Run`, `Deterministic Boundaries` y `Real Workflow Example` llevan `cambio_propietario: docs-content-inventory` en el inventario archivado, y ese cambio está archivado. Los dos que quedaron abiertos para SLICE 2 son `Runtime Matrix` y `Known Limitations`.

### C5. Defectos de fuente de este cambio

| id | fichero:linea | defecto | evidencia | propietario | accion |
|----|---------------|---------|-----------|-------------|--------|
| D1 | `README.md:121` | declara `EIN v0.40.0` como última release; **sigue sin corregir** desde SLICE 1 | `installer/package.json:3` = `0.42.0` | fuera de alcance | cambio de mantenimiento posterior; ninguna página fija versión (CT-8) |
| D4 | `README.md:117` | la lista de flags del instalador omite `--runtime` | `installer/src/cli/install.ts:108-124` implementa `--runtime pi\|claude\|both`; `openspec/specs/installer-runtime/spec.md` scenario `noninteractive-runtime-flag-selection` lo exige | fuera de alcance | `cli.md` toma la lista de flags del código, no de `README.md:117` |
| D5 | `openspec/changes/docs-content-reference/map.md:275` | atribuye a `docs/roadmap-beta.md:51-60` la declaración del desbloqueante de Known Limitations | esas líneas tratan «Las tres fugas silenciosas del sync»; el desbloqueante consta en `openspec/changes/archive/docs-content-inventory/gap-inventory.md:60` | este cambio | corregido en §B.HN-2; `known-limitations.md` no cita `roadmap-beta.md` como fuente del desbloqueante |
| D6 | `cc-ein/README.md:30` | presenta la integración MCP como verificada, por observación manual | `openspec/changes/archive/core-parity/verify-report.md:163`: «Optional external Claude MCP setup was not exercised against live services» | fuera de alcance | no es corrección de fuente: es la razón de RM-2 y del estado `bloqueado-por-evidencia` de MCP Parity |

### C6. Fronteras de responsabilidad

| Responsabilidad | Propietario |
|-----------------|-------------|
| Contrato de página (CT/SK) | `docs-content-inventory/design.md` (archivado), heredado sin cambio |
| Roster de filas de la matriz, autoridades de solapamiento, vocabulario de estado | este `design.md` |
| Corte en lotes ejecutables y orden de escritura | `tasks.md`, tomando `map.md` §G |
| Escritura de los once esqueletos y del `gap-inventory.md` | fase apply |
| Comprobación mecánica | fase verify (§D) |
| Prosa final de cada `PENDIENTE-D`, incluida la tabla de la matriz | fase D, dentro del roster de RM-1 |
| Corrección de D1 y D4 en `README.md` | cambio de mantenimiento posterior |
| Redacción real de Known Limitations | cambio posterior al merge de la rama bloqueada |

### C7. Alternativas rechazadas

- **Rediseñar el contrato de página para fuentes TypeScript** (p. ej. añadir `symbol:` junto a `lineas:`). Rechazada: rompería la comparabilidad con las diez páginas de SLICE 1 y obligaría a mantener dos gramáticas; `lineas:` ya admite rangos de `.ts`.
- **Marcar el bloqueo de Known Limitations con una clave de frontmatter (`blocked: true`).** Rechazada por CT-1 (cuatro claves) y por la misma razón que SLICE 1 rechazó `status: skeleton`: el estado vive donde se ve, en el cuerpo.
- **Incluir MCP en la matriz con una celda «parcial» o «configurado, sin verificar».** Rechazada: una celda en una tabla de paridad se lee como paridad; el matiz se pierde. La ausencia de fila, más la exclusión explícita con `[BETA-EXCLUDED]`, es la única forma honesta.
- **Corregir el `gap-inventory.md` de SLICE 1 en vez de crear uno nuevo.** Rechazada: es evidencia de un cambio archivado y verificado. Un inventario propio con vocabulario extendido preserva la trazabilidad de qué se supo y cuándo.
- **Enlazar `known-limitations.md` al final de la cadena de lectura.** Rechazada: presenta una página vacía a propósito como continuación natural del recorrido.
- **Fusionar `doctor.md` en `troubleshooting.md`.** Rechazada: una es referencia de herramienta y la otra guía de síntomas; fusionarlas obliga a leer todo el catálogo para consultar un nivel.

---

## D. Success Criteria

Todos son comandos. `PAGES` = las once rutas de §A.Affected areas.

### D1. Estructura y frontmatter

1. Existen las once rutas de §A y ninguna más bajo `03-runtimes/`, `04-reference/`, `05-debug/`; el total del árbol es 21 (`find docs-site/src/content/docs -name '*.md' | wc -l` → `21`).
2. Cada página de `PAGES` tiene frontmatter con las cuatro claves de CT-1, en orden, y ninguna más.
3. `grep -L 'verified_rev: "2f67c73"' $PAGES` → vacío.
4. Toda ruta declarada en `sources` existe (`test -e`) y coincide exactamente con la tabla §C1 (contenido y orden).

### D2. Contrato de secciones y pureza

5. En cada página, la lista de `^## ` es exactamente la de CT-3, en orden.
6. Los `^### ` bajo `## Detalles` coinciden con §C2 en nombre y orden; suman 39 en el conjunto.
7. Cada sección de contenido y cada `###` contiene exactamente un `:::caution[PENDIENTE-D]` con su cierre `:::` y las líneas `falta:`, `fuentes:`, `lineas:` en ese orden.
8. Toda ruta de `fuentes:` está en el `sources` de su página.
9. Pureza SK-3/SK-4: tras filtrar frontmatter, encabezados, bloques `PENDIENTE-D`, ítems de `## Fuentes`, la línea de `## Siguiente paso` y líneas en blanco, el resto es vacío en las once páginas.
10. `grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+' $PAGES` → sin coincidencias (CT-8).
11. Todo enlace relativo `.md` de `PAGES` resuelve a una de las once rutas (CT-6′); ningún enlace apunta a las diez páginas de SLICE 1.
12. La cadena de `## Siguiente paso` es la de §C3; `uninstall-recovery.md` y `known-limitations.md` cierran en texto plano.

### D3. Runtime Matrix

13. `grep '^### ' 03-runtimes/runtime-matrix.md` devuelve exactamente los seis títulos de RM-1, en orden.
14. Cada bloque `PENDIENTE-D` de esos seis `###` cita en `fuentes:` al menos una ruta bajo `installer/src/`, `openspec/specs/`, `pi-ein/README.md` o `cc-ein/README.md`.
15. `grep -in 'mcp\|context7\|engram\|linear\|codegraph\|hypa\|rendimiento\|benchmark\|acceptance' 03-runtimes/runtime-matrix.md` → como única coincidencia, la línea `falta:` de `## En una frase`, que contiene `[BETA-EXCLUDED]`.

### D4. Solapamientos y honestidad

16. OV-1: `grep -n 'AGENT_DIR\|SECRETS_DIR\|ENGRAM_DIR\|LOCAL_SKILLS_DIR\|DOWNLOADED_SKILLS_DIR\|BACKUP_DIR\|BUN_BIN_DIR\|LOCAL_BIN_DIR\|MISE_SHIM_DIR' $PAGES` → solo `04-reference/filesystem.md`; `grep -n '\-\-yes\|\-\-dry-run\|\-\-runtime\|\-\-no-' $PAGES` → solo `04-reference/cli.md`.
17. OV-2: `grep -n 'WARN\|FAIL' $PAGES` → solo `05-debug/doctor.md`; `05-debug/troubleshooting.md` contiene al menos un enlace relativo a `doctor.md`.
18. HN-1: `grep -rin 'workbench\|estado compartido\|adaptador.* de sesi' $PAGES` → sin coincidencias.
19. HN-2: `05-debug/known-limitations.md` tiene `sources: ["docs/roadmap-beta.md"]`, un solo `###`, `[BETA-EXCLUDED]` en el `falta:` de `## En una frase`, y un `## Siguiente paso` en texto plano que nombra la condición de desbloqueo.

### D5. `gap-inventory.md`

20. Existe `openspec/changes/docs-content-reference/gap-inventory.md`; no existe ningún `gap-inventory.md` bajo `docs-site/`; `git status --porcelain openspec/changes/archive/docs-content-inventory/` → vacío (el inventario de SLICE 1 intacto).
21. `## Decisiones de hueco` tiene exactamente seis `###` (los de GI-2′), cada uno con las seis claves de GI-3′ en orden, y todo `estado:` pertenece al vocabulario de §C4 con su clave condicional presente.
22. `grep -rn 'shared-project-state-contract' openspec/changes/docs-content-reference/ $PAGES` → única coincidencia en la clave `desbloqueante:` del gap-inventory; cero rutas de esa rama en cualquier fichero del cambio.
23. `## Defectos de fuente detectados` tiene exactamente cuatro filas de datos (D1, D4, D5, D6) con las columnas de GI-5, más la frase de no-corrección de GI-6′; y `git status --porcelain` lista solo las doce rutas de §A.Affected areas.

### D6. Tratamiento de `strict_tdd` (declaración honesta)

`openspec/config.yaml` declara `strict_tdd: true`, pero no define `test_command` para apply ni para verify y el propio fichero registra que no se detectó runner fiable. La salida de este cambio es markdown sin comportamiento ejecutable.

**Conclusión explícita: `strict_tdd: true` no es satisfacible aquí.** No hay unidad ejecutable que pueda fallar primero, así que no existe ciclo RED/GREEN; simularlo sería falsificar evidencia. Tratamiento, idéntico al de SLICE 1:

1. `apply-progress.md` declara `tdd: not-applicable — cambio solo de documentación, sin runner de test configurado (openspec/config.yaml: test_command vacío)` y registra, por lote, los checks de D1–D5 ejecutados con su salida.
2. Los checks D1–D5 son el **gate mecánico sustitutivo**: se ejecutan primero sobre el árbol sin las páginas (fallan: evidencia equivalente a RED) y de nuevo tras cada lote (pasan: equivalente a GREEN). Son comandos `find`/`grep`/`test` ad hoc; **no** se crea ningún script — eso pertenece a la fase B.
3. `sdd-verify` acepta el cambio si y solo si pasan los 23 criterios de D1–D5. Ninguno depende de juicio editorial: en fase A no hay prosa que juzgar.
4. Si el gate SDD rechaza `tdd: not-applicable`, `sdd-verify` MUST devolver `blocked` nombrando esa incompatibilidad; decide el parent. Ni design, ni apply, ni verify tocan `openspec/config.yaml`.
