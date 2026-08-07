# Tasks — docs-content-reference

status: ready
blocked_by: none

---

## // 001. Corrección del contrato de verificación (§D3)

**Nota normativa (APLICA A TODOS LOS CHECKS):**
Este artefacto hereda el contrato de SLICE 1 exacto. El design de SLICE 2 (§D) define 23 criterios comprobables; en conjunto con la especificación de map §G (orden de escritura) y design §B (reglas nuevas RM-1…RM-3, OV-1…OV-3, HN-1…HN-2, GI-3′), todas las comprobaciones son mecánicas (find/grep/test) sin interpretación editorial.

**Criterios que presuponen pureza (reformulados para apply):**
- **D1 (criterios 1–4):** Estructura ficheros + frontmatter (tested con find/grep/test).
- **D2 (criterios 5–12):** Secciones, pureza, no-versiones, enlaces resuelven (tested con grep).
- **D3 (criterios 13–15):** Runtime Matrix: seis ### exactos, fuentes, exclusiones (grep).
- **D4 (criterios 16–19):** Solapamientos OV-1/OV-2 y honestidad HN-1/HN-2 (grep multiarquivo).
- **D5 (criterios 20–23):** gap-inventory.md: estructura, claves, vocabulario, defectos (find/grep).

Bajo strict_tdd: true sin runner, estos 23 criterios reemplazan RED/GREEN. Ejecutados tras cada lote como gate mecánico sustitutivo.

---

## // 002. Fundación: Runtime Overview (Lote 1/8)

**Dependencias:** Ninguna (base de la cadena de runtimes).
**Archivos:** 1 — `docs-site/src/content/docs/03-runtimes/runtime-overview.md`
**Gate:** D1 (1–4), D2 (5–9, 11, 12 parcial)

- [x] 1.1 Crear `docs-site/src/content/docs/03-runtimes/runtime-overview.md` en esqueleto
  - skills: `cognitive-doc-design`, `file-naming`, SDD artifact contract, C1–C3 (fuentes canónicas, secciones, cadena lectura)
  - why: Introducción comparativa de Pi y Claude Code. Define capacidades comprobables, mecanismos de aislamiento, estado de runtimes. Base para pi-coding-agent y claude-code (Lote 2).
  - learn: Runtime-overview no es marketing; solo capacidades con fuentes. README.md:11 es autoridad de "dos adaptadores". Diferenciación: instalación, aislamiento, estado beta.
  - architecture: Página fundacional (lectura 1 en cadena §C3). Sus cuatro `###` (Qué es cada runtime · Instalación y selección · Mecanismos de aislamiento · Estado) se heredan directamente del map §B.
  - avoid: Confundir overview (intro) con específicas (pi-coding-agent, claude-code detallan). Aquí solo lo compartido.
  - verify: Tras escribir, antes de Lote 2: `test -f docs-site/src/content/docs/03-runtimes/runtime-overview.md && grep -q 'verified_rev: "2f67c73"' docs-site/src/content/docs/03-runtimes/runtime-overview.md && echo "OK"` + D1 checks (frontmatter, 4 claves, 7 `##`).

- [x] 1.2 Gate D1 (criterios 1–4) + D2 (criterios 5–9, 11, 12 parcial) tras Lote 1
  - skills: shell script ad hoc, find/grep/test
  - why: Validar estructura, frontmatter, secciones exactas, `verified_rev`, rutas de sources.
  - learn: Gate es determinístico; pasa o falla sin ambigüedad.
  - architecture: Base para Lote 2; si falla, no continuar.
  - avoid: Proceder sin gate.
  - verify: Ejecutar comandos D1 + D2 concretos en apply-progress.md.

---

## // 003. Runtimes específicos: Pi y Claude (Lote 2/8)

**Dependencias:** Lote 1 (runtime-overview define patrones que aquí se usan).
**Archivos:** 2 — `docs-site/src/content/docs/03-runtimes/pi-coding-agent.md`, `docs-site/src/content/docs/03-runtimes/claude-code.md`
**Gate:** D1 (1–4), D2 (5–9, 11, 12 parcial), D2 (criterio 6: 39 `###` en total)

- [x] 2.1 Crear `docs-site/src/content/docs/03-runtimes/pi-coding-agent.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes pi-ein/README.md, installer/src/core/paths.ts)
  - why: Documenta uso, configuración aislada, migración legacy, simetría con Claude. Fuentes: pi-ein/README.md (documentación oficial del adaptador).
  - learn: PI_CODING_AGENT_DIR es variable de usuario; AGENT_DIR es interna (filesystem.md explica). Migración es upgrade de legacy a aislado.
  - architecture: Lectura 2 en cadena §C3. Requiere runtime-overview (patrones compartidos). Enenlaza a claude-code en Siguiente paso.
  - avoid: Confundir UI (menú interactivo, está en overview) con técnica (installation paths, aquí). No citar `workbench` (fase futura, §HN-1).
  - verify: `grep -q "PI_CODING_AGENT_DIR" docs-site/src/content/docs/03-runtimes/pi-coding-agent.md` (concepto variable); `test -f docs-site/src/content/docs/03-runtimes/pi-coding-agent.md`.

- [x] 2.2 Crear `docs-site/src/content/docs/03-runtimes/claude-code.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes cc-ein/README.md)
  - why: Documenta lanzamiento, aislamiento (CLAUDE_CONFIG_DIR), compilación sync.ts, gaps honestos (RM-2: no MCP). Fuentes: cc-ein/README.md.
  - learn: CLAUDE_CONFIG_DIR aislamiento análogo a Pi. Sync es mini-compilador (herança adaptación). Gaps (skills proactivas, acceptance) están documentados en cc-ein/README.md:36-40; no presentar como equivalentes (RM-3).
  - architecture: Lectura 3 en cadena §C3. Requiere runtime-overview. Enlaza a runtime-matrix en Siguiente paso.
  - avoid: Afirmar simetría en MCP/skills sin fuentes que respalden ambas columnas (RM-3). Citar cc-ein/README.md para gaps.
  - verify: `grep -q "CLAUDE_CONFIG_DIR" docs-site/src/content/docs/03-runtimes/claude-code.md` (concepto aislamiento); `grep -q "gap" docs-site/src/content/docs/03-runtimes/claude-code.md` (honestidad).

- [x] 2.3 Gate D1 (1–4) + D2 (5–9, 11–12, criterio 6 parcial) tras Lote 2
  - skills: shell script ad hoc
  - why: Validar ambos ficheros cumplen estructura, frontmatter exacto, secciones correctas, enlaces Siguiente paso.
  - learn: Gates acumulativos; Lote 1 + Lote 2 suman 3 páginas de runtime (runtime-overview, pi-coding-agent, claude-code).
  - architecture: Si pasa, Lote 3 (runtime-matrix) seguro.
  - avoid: Permitir Lote 3 sin que Lote 2 pase.
  - verify: Comandos D1 + D2 concretos.

---

## // 004. Matriz de paridad: Runtime Matrix (Lote 3/8)

**Dependencias:** Lote 2 (runtime-matrix usa patterns/autoridades de 03-runtimes/).
**Archivos:** 1 — `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`
**Gate:** D1 (1–4), D2 (5–9, 11–12), D3 (13–15)

- [x] 3.1 Crear `docs-site/src/content/docs/03-runtimes/runtime-matrix.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, RM-1 (roster cerrado de 6 filas), RM-2 (exclusiones MCP), RM-3 (paridad verificada)
  - why: Tabla 2×6 comparando instalación, launcher, aislamiento, SDD, migración. Fila MCP MUST NOT existir; exclusión declarada con [BETA-EXCLUDED] en falta: de § En una frase (RM-2). Cada fila tiene evidencia en spec/código (RM-1).
  - learn: Criterio RM-3: no afirmar equivalencia sin fuentes que respalden ambas columnas. Mitigación D3 criterio 15: búsqueda grep de términos vetados (MCP, Context7, Codegraph, Hypa, rendimiento, acceptance) solo permite resultado en línea falta: con [BETA-EXCLUDED].
  - architecture: Lectura 4 en cadena §C3. Depende runtimes 1–3 para contexto. Su estructura de ### es fija (RM-1): Instalación interactiva, Instalación no interactiva, Launcher y aislamiento, Despliegue del cerebro, Ciclo SDD, Migración legacy.
  - avoid: Rellenar celdas por simetría visual (riesgo #1 en design). Cada fila tiene evidencia explícita (RM-1). MCP en ningún lado excepto línea falta: con tag.
  - verify: **Criterio 13 (RM-1):** `grep '^### ' docs-site/src/content/docs/03-runtimes/runtime-matrix.md | wc -l | grep -q "^6$"` (exactamente 6) y nombres exactos de RM-1. **Criterio 14 (RM-1):** cada bloque PENDIENTE-D cita fuente (test -e sobre rutas). **Criterio 15 (RM-2):** `grep -in 'mcp\|context7\|engram\|linear\|codegraph\|hypa\|rendimiento' docs-site/src/content/docs/03-runtimes/runtime-matrix.md | grep -v 'falta:.*BETA-EXCLUDED'` → vacío.

- [x] 3.2 Gate D1 (1–4) + D2 (5–9, 11–12) + D3 (13–15) tras Lote 3
  - skills: shell script ad hoc, grep avanzado
  - why: Validar runtime-matrix tiene estructura exacta, 6 ### con nombres precisos, fuentes resuelven, exclusiones cumplen.
  - learn: D3 es el gate más específico a este cambio; refuerza honestidad de paridad.
  - architecture: Si pasa, seguro para Lote 4.
  - avoid: Proceder sin validar exclusiones MCP.
  - verify: Comandos D3 concretos.

---

## // 005. Reference Foundation: CLI y Filesystem (Lote 4/8)

**Dependencias:** Ninguna (reference foundation, independiente de runtimes en apply).
**Archivos:** 2 — `docs-site/src/content/docs/04-reference/cli.md`, `docs-site/src/content/docs/04-reference/filesystem.md`
**Gate:** D1 (1–4), D2 (5–9, 11–12), D4 (16 parcial: OV-1)

- [x] 4.1 Crear `docs-site/src/content/docs/04-reference/cli.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/cli/*.ts), OV-1 (autoridad de flags, NO constantes de ruta)
  - why: Referencia CLI: comandos (install, update, doctor, restore, uninstall, menu), flags (--yes, --dry-run, --runtime, --no-*). Autoridad: installer/src/cli/*.ts. NO documenta constantes de directorio (eso es filesystem.md).
  - learn: Separación de responsabilidades OV-1: cli documenta verbos, filesystem documenta destinos. Un literal de flag aparece SOLO aquí (no en filesystem).
  - architecture: Lectura 5 en cadena §C3. Depende de reference foundation (no de runtimes). Requiere que optional-tooling (Lote 5) remita a cli para flags.
  - avoid: Enumerar AGENT_DIR, SECRETS_DIR, etc. (eso es filesystem.md). Remitir con enlace relativo cuando necesite hablar de destinos.
  - verify: **Criterio 16 (OV-1):** `grep -n 'AGENT_DIR\|SECRETS_DIR\|ENGRAM_DIR\|LOCAL_SKILLS_DIR\|DOWNLOADED_SKILLS_DIR\|BACKUP_DIR\|BUN_BIN_DIR\|LOCAL_BIN_DIR\|MISE_SHIM_DIR' docs-site/src/content/docs/04-reference/cli.md` → vacío. `grep -n '\-\-yes\|\-\-dry-run\|\-\-runtime\|\-\-no-' docs-site/src/content/docs/04-reference/filesystem.md` → vacío.

- [x] 4.2 Crear `docs-site/src/content/docs/04-reference/filesystem.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/core/paths.ts), OV-1 (autoridad de constantes, NO flags)
  - why: Estructura directorios: constantes exportadas (AGENT_DIR, SECRETS_DIR, ENGRAM_DIR, LOCAL_SKILLS_DIR, DOWNLOADED_SKILLS_DIR, BACKUP_DIR, BUN_BIN_DIR, LOCAL_BIN_DIR, MISE_SHIM_DIR), resolución aislado vs legacy. Autoridad: installer/src/core/paths.ts. NO documenta flags.
  - learn: Complemento de cli.md; cada documento su foco. Cuando prosa de cli mencione "dónde acaban las cosas", remite a filesystem.md.
  - architecture: Lectura 6 en cadena §C3. Requerida por troubleshooting (Lote 6). Es foundation para debug.
  - avoid: Documentar flags. Remitir a cli.md con enlace relativo.
  - verify: **Criterio 16 (OV-1):** constantes solo aquí, flags solo en cli.md.

- [x] 4.3 Gate D1 (1–4) + D2 (5–9, 11–12) + D4 (16 parcial: OV-1) tras Lote 4
  - skills: shell script ad hoc, grep multiarquivo
  - why: Validar separación OV-1 es rigurosa: constantes/flags no se mezclan.
  - learn: Gates D4 empieza con Lote 4; refuerza honestidad.
  - architecture: Si pasa, Lote 5 puede escribir optional-tooling (que remite a cli).
  - avoid: Proceder sin validar OV-1.
  - verify: Comandos OV-1 concretos.

---

## // 006. Reference Details: Herramientas opcionales y Doctor (Lote 5/8)

**Dependencias:** Lote 4 (cli.md es autoridad de flags; filesystem.md de rutas).
**Archivos:** 2 — `docs-site/src/content/docs/04-reference/optional-tooling.md`, `docs-site/src/content/docs/05-debug/doctor.md`
**Gate:** D1 (1–4), D2 (5–9, 11–12), D4 (16: OV-1 para optional-tooling, 17 parcial: doctor solo)

- [x] 5.1 Crear `docs-site/src/content/docs/04-reference/optional-tooling.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/core/{engram,deps,secrets,launcher}.ts, cc-ein/README.md), OV-1 (remite a cli para flags de exclusión)
  - why: Integraciones opcionales: Engram (presupuesto de memoria), Linear (board), Context7 (documentación), Codegraph (búsqueda), Hypa (exploración). Cada una: qué es, dónde vive su clave/directorio, qué pasa si falta. Remite a cli.md para sintaxis de flags (`--no-engram`, etc.), NO repite literales.
  - learn: Complemento de reference foundation. Describe integración + dónde consultar cómo usarla (remisión a cli).
  - architecture: Lectura 7 en cadena §C3. Depende Lote 4 (cli para remisión).
  - avoid: Duplicar literales de flag de cli.md. Remitir con enlace relativo a `cli.md`.
  - verify: **Criterio 16 (OV-1):** flags no aparecen aquí (solo referencias), constantes solo en filesystem.

- [x] 5.2 Crear `docs-site/src/content/docs/05-debug/doctor.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/cli/doctor.ts, installer/src/core/verify.ts), OV-2 (autoridad de niveles OK/WARN/FAIL)
  - why: Referencia de herramienta doctor: qué grupos y checks ejecuta, semántica de tres niveles (OK, WARN, FAIL), cómo leer decisión final. Autoridad: installer/src/cli/doctor.ts, verify.ts.
  - learn: Doctor es referencia técnica. Troubleshooting (Lote 6) derivará a aquí para interpretación; no duplica niveles ni checks.
  - architecture: Lectura 8 en cadena §C3. Fundación para troubleshooting (Lote 6). OV-2 dicta: literales WARN/FAIL solo aquí.
  - avoid: Documentar sintaxis de flags (eso es cli.md). Aquí: qué comprueba, qué significan niveles, cómo decidir.
  - verify: **Criterio 17 (OV-2):** `grep -n 'WARN\|FAIL' docs-site/src/content/docs/05-debug/doctor.md | head -3` debe encontrar (legitimado); `grep -n 'WARN\|FAIL' docs-site/src/content/docs/05-debug/troubleshooting.md` → vacío.

- [x] 5.3 Gate D1 (1–4) + D2 (5–9, 11–12) + D4 (16: OV-1, 17 parcial) tras Lote 5
  - skills: shell script ad hoc
  - why: Validar optional-tooling remite a cli; doctor tiene niveles, troubleshooting no.
  - learn: Solapamientos D4 se validan de forma incremental.
  - architecture: Si pasa, Lote 6 (troubleshooting) puede escribir sin riesgo de duplicar niveles.
  - avoid: Proceder sin validar OV-2.
  - verify: Comandos OV-2 concretos.

---

## // 007. Debug Aplicado: Troubleshooting y Uninstall (Lote 6/8)

**Dependencias:** Lote 5 (doctor.md es referencia para troubleshooting), Lote 4 (filesystem.md para uninstall-recovery).
**Archivos:** 2 — `docs-site/src/content/docs/05-debug/troubleshooting.md`, `docs-site/src/content/docs/05-debug/uninstall-recovery.md`
**Gate:** D1 (1–4), D2 (5–9, 11–12), D4 (17: OV-2 completo, 18: HN-1)

- [x] 6.1 Crear `docs-site/src/content/docs/05-debug/troubleshooting.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/core/verify.ts, docs/roadmap-beta.md), OV-2 (enlaza a doctor.md, NO reexplica niveles)
  - why: Guía síntoma → causa → acción. Categorías de fallos (plataforma, dependencias, paths, markers, despliegues). Segundo `###` remite a doctor.md; no reenumera checks.
  - learn: Complemento de doctor. Doctor = referencia; troubleshooting = catálogo de síntomas. Estructuralmente distintos (doctor enumerativo, troubleshooting narrativo), pero lógicamente vinculados (OV-2).
  - architecture: Lectura 9 en cadena §C3. Requiere doctor (referencia de niveles) + filesystem (para nombrar constantes en contexto de errors). Enlaza a uninstall-recovery en Siguiente paso.
  - avoid: Reexplicar OK/WARN/FAIL (eso es doctor.md). Enlazar y remitir.
  - verify: **Criterio 17 (OV-2):** `grep 'doctor.md' docs-site/src/content/docs/05-debug/troubleshooting.md` debe encontrar enlace relativo (linked version exists).

- [x] 6.2 Crear `docs-site/src/content/docs/05-debug/uninstall-recovery.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (fuentes installer/src/cli/{uninstall,restore}.ts, installer/src/core/backup.ts, pi-ein/README.md)
  - why: Desinstalación: qué elimina (selectively), qué conserva (auth, secrets, sesiones). Backup y restore: snapshots, KEEP_COUNT=5, restauración. Reversión de migración Pi (mv ~/.pi-ein/agent ~ ~/.pi/agent). Flujo reversible.
  - learn: Backup es operación de seguridad; restore es recuperación. Reversión de migración es escalada (rollback Pi upgrade).
  - architecture: Lectura 10 en cadena §C3. Requiere filesystem (rutas de constantes en contexto de backup). Cierra cadena en texto plano (no enlaza a known-limitations; ver §C3).
  - avoid: No documentar cómo instalar nuevamente (eso es getting-started, SLICE 1). Aquí: solo desinstalar y recuperar.
  - verify: `grep -q 'uninstall\|backup\|restore' docs-site/src/content/docs/05-debug/uninstall-recovery.md` (conceptos clave).

- [x] 6.3 Gate D1 (1–4) + D2 (5–9, 11–12) + D4 (17: OV-2 completo, 18: HN-1) tras Lote 6
  - skills: shell script ad hoc
  - why: Validar troubleshooting enlaza doctor, ambas evitan replicar niveles, ninguna menciona workbench/estado compartido (HN-1).
  - learn: HN-1 es honestidad: no afirmar funcionalidad futura (fase pendiente).
  - architecture: Si pasa, lotes temáticos (runtimes 1–3, reference 4–6) están validados.
  - avoid: Proceder sin validar HN-1.
  - verify: Comandos OV-2 + HN-1 concretos.

---

## // 008. Página bloqueada: Known Limitations (Lote 7/8)

**Dependencias:** Ninguna en apply (espera desbloqueo por merge externo).
**Archivos:** 1 — `docs-site/src/content/docs/05-debug/known-limitations.md`
**Gate:** D1 (1–4), D2 (5–9, 11–12), D4 (19: HN-2 completo), D5 (20: ubicación correcta)
**Estado:** pending (esperando merge)

- [x] 7.1 Crear `docs-site/src/content/docs/05-debug/known-limitations.md` en esqueleto bloqueado
  - skills: `cognitive-doc-design`, SDD artifact contract, HN-2 (esqueleto incompleto declarado), GI-4 (fuente = rama sin mergear)
  - why: Esqueleto deliberadamente vacío + declaración de bloqueo. Su fuente AuthoritARIVE es rama `feat/shared-project-state-contract` (sin mergear). Estructura: `sources: ["docs/roadmap-beta.md"]` (única), un solo `### Dependencia bloqueante`, `falta:` con `[BETA-EXCLUDED]`, `Siguiente paso` en texto plano describiendo desbloqueo (HN-2).
  - learn: No todas las páginas tienen prosa en A. HN-2 establece bloqueo explícito como patrón honesto.
  - architecture: Lectura 11 en cadena §C3 (pero NO enlazada desde uninstall-recovery; fuera de cadena §C3). Estado: bloqueado-por-merge en gap-inventory (GI-4).
  - avoid: Leer o citar rama `feat/shared-project-state-contract` en ningún fichero (scope §2). Nombrar solo en `desbloqueante:` de gap-inventory.
  - verify: **Criterio 19 (HN-2):** `grep -q 'sources: \["docs/roadmap-beta.md"\]' docs-site/src/content/docs/05-debug/known-limitations.md` (única fuente); `grep '^### ' docs-site/src/content/docs/05-debug/known-limitations.md | wc -l | grep -q "^1$"` (un solo ###); `grep -q 'BETA-EXCLUDED' docs-site/src/content/docs/05-debug/known-limitations.md` (tag presente); `grep '^## Siguiente paso' docs-site/src/content/docs/05-debug/known-limitations.md -A3 | grep -v '^##' | grep -v '^\[' | grep -q .` (texto plano, no enlace).

- [x] 7.2 Gate D1 (1–4) + D2 (5–9, 11–12) + D4 (19: HN-2) + D5 (20) tras Lote 7
  - skills: shell script ad hoc
  - why: Validar esqueleto de bloqueo cumple exactamente HN-2.
  - learn: Cambio bloqueado no es error; es honestidad. Gate lo valida como esqueleto correcto, no como página completa.
  - architecture: Lote 7 pasa si HN-2 cumple. No impide cierre de apply; sus 11 páginas están escritas.
  - avoid: Confundir "estado bloqueado" (página entregada como esqueleto incompleto) con "aplicación incompleta".
  - verify: Comandos HN-2 + ubicación concretos.

---

## // 009. Inventario final: Gap Inventory (Lote 8/8)

**Dependencias:** Todos los lotes 1–7 (gap-inventory consolida decisiones sobre 11 páginas + estado).
**Archivos:** 1 — `openspec/changes/docs-content-reference/gap-inventory.md`
**Gate:** D5 (20–23): estructura, vocabulario, defectos, no-modificación SLICE 1

- [x] 8.1 Crear `openspec/changes/docs-content-reference/gap-inventory.md` con decisiones GI-2′/GI-3′/GI-4′
  - skills: SDD artifact contract (GI-1′…GI-4′), decision inventory, C4 (vocabulario extendido)
  - why: Consolidar seis decisiones de hueco (heredadas de SLICE 1: First Run, Deterministic Boundaries, Real Workflow Example; nuevas en SLICE 2: Runtime Matrix, Known Limitations, MCP Parity). Cada decisión: área, cambio_propietario, decision, fuentes_candidatas, falta, estado. Estado usa vocabulario §C4 (esqueleto-en-A / cerrado-en-cambio-anterior / bloqueado-por-merge / bloqueado-por-evidencia) + claves condicionales (cerrado_en: / desbloqueante: / evidencia_faltante:).
  - learn: Huecos son decisiones documentadas, no sorpresas. Vocabulario de §C4 refuerza que diferentes bloqueos (merge vs evidencia) tienen raíces distintas.
  - architecture: Artefacto interno (openspec/changes/, no público). Referencia para B y D (fases posteriores). Contrato: GI-2′ fija exactamente seis huecos (confirmados en design §C4), GI-3′ fija seis claves en orden (área, cambio_propietario, decision, fuentes_candidatas, falta, estado), GI-4′ añade claves condicionales.
  - avoid: Listar huecos no explícitos de design §C4. Modificar gap-inventory de SLICE 1 (es evidencia archivada).
  - verify: **Criterio 21 (GI-2′/GI-3′):** `grep '^### ' openspec/changes/docs-content-reference/gap-inventory.md | wc -l | grep -q "^6$"` (exactamente 6 huecos); cada uno tiene 6 claves en orden.

- [x] 8.2 Crear tabla defectos GI-5′ con exactamente cuatro filas: D1, D4, D5, D6
  - skills: SDD artifact contract (GI-5′/GI-6′), defect tracking
  - why: Anotar cuatro defectos de fuente hallados en map (design §C5): D1 (README versión 0.40.0 vs 0.42.0, fuera alcance), D4 (README omite --runtime flag, fuera alcance), D5 (map.md atribución incorrecta de desbloqueante, CORREGIDO aquí en §B.HN-2), D6 (cc-ein/README.md MCP verificado solo manualmente, fuera alcance). Cada fila: id, fichero:linea, defecto, evidencia, propietario, accion.
  - learn: Honestidad: defectos en fuentes ajenas no se corrigen aquí (out of scope). D5 es corrección de map, no de fuente externa.
  - architecture: Trazabilidad interna. Propietario "fuera de alcance" = cambio de mantenimiento posterior. D5 propietario es este cambio (corrección hecha en diseño, reflejada en tareas).
  - avoid: Tentar a "corregir" D1, D4, D6 (violaría restricciones §Restricciones). Solo anotar.
  - verify: **Criterio 23 (GI-5′):** exactamente 4 filas con columnas id, fichero:linea, defecto, evidencia, propietario, accion; declaración de no-corrección presente.

- [x] 8.3 Validar que vocabulario §C4 está usado correctamente en cada hueco
  - skills: SDD artifact contract (C4: vocabulario), design compliance
  - why: Cada hueco tiene `estado:` del vocabulario de §C4:
    - First Run, Deterministic Boundaries, Real Workflow Example: `cerrado-en-cambio-anterior` + clave `cerrado_en: docs-content-inventory`
    - Runtime Matrix: `esqueleto-en-A` (sin clave condicional)
    - Known Limitations: `bloqueado-por-merge` + clave `desbloqueante: merge de feat/shared-project-state-contract en main`
    - MCP Parity: `bloqueado-por-evidencia` + clave `evidencia_faltante: openspec/changes/archive/core-parity/verify-report.md:163`
  - learn: Cada valor de `estado:` tiene significado diferente (cierre vs bloqueo por merge vs bloqueo por evidencia), y cada uno exige clave condicional específica (design §C4).
  - architecture: Validación de contrato de gap-inventory.
  - avoid: Usar vocabulario deprecado de SLICE 1 (simple `bloqueado`). Usar valores de §C4.
  - verify: **Criterio 21 (GI-3′):** grep estado: en cada ### y validar valor ∈ {esqueleto-en-A, cerrado-en-cambio-anterior, bloqueado-por-merge, bloqueado-por-evidencia} + presencia de clave condicional requerida.

- [x] 8.4 Validar que declaración GI-6′ aparece: "no se corrigen aquí" y "SLICE 1 intacto"
  - skills: SDD artifact contract (GI-6′), message authoring
  - why: GI-6′ requiere declaración explícita de que defectos con propietario "fuera de alcance" no se corrigen, y que gap-inventory de SLICE 1 no se modifica (es evidencia archivada).
  - learn: Documentación de límites de alcance.
  - architecture: Texto normativo en gap-inventory.
  - avoid: Omitir declaración.
  - verify: `grep -q "no se corrigen\|no corregir\|fuera de alcance\|SLICE 1.*intacto" openspec/changes/docs-content-reference/gap-inventory.md && echo "GI-6′ presente"`.

- [x] 8.5 Gate D5 (20–23) tras Lote 8
  - skills: shell script ad hoc, verificación de artefactos
  - why: Último gate. Validar gap-inventory existe en ruta correcta (openspec/changes/docs-content-reference/, no bajo docs-site/), tiene estructura GI-2′…GI-6′, vocabulario §C4 usado correctamente, 4 defectos exactos, no hay modificaciones en gap-inventory de SLICE 1.
  - learn: Gate D5 cierra apply. Pasa ← todas las 11 páginas + gap-inventory cumplen contrato.
  - architecture: Si D5 pasa, apply está listo para verify.
  - avoid: Permitir que sdd-verify arranque sin D5 pasado.
  - verify: Comandos D5 (20–23) concretos.

---

## // 010. Validación transversal y cierre

**Dependencias:** Todos los lotes 1–8 completados.
**Archivos:** 0 (validación solo, no escritura)
**Gate:** D2 (criterios 11–12), D4 (criterio 18: HN-1 completo)

- [x] 9.1 Validar cadena de `## Siguiente paso` (§C3, criterio 12)
  - skills: shell script ad hoc, path resolution
  - why: Cadena de lectura (§C3) es: runtime-overview → pi-coding-agent → claude-code → runtime-matrix → cli → filesystem → optional-tooling → doctor → troubleshooting → uninstall-recovery → (texto plano). Known-limitations NO está enlazada (fuera de cadena, intencionalmente). Cada Siguiente paso enlaza a `.md` existente o cierra en texto plano.
  - learn: Cadena es contrato de lectura. Lector novato sigue y debe llegar sin 404.
  - architecture: Validación transversal (no afecta contenido, solo links entre páginas).
  - avoid: Enlaces rotos. Links a páginas que no existen en este cambio sin texto plano previo.
  - verify: `for file in docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{troubleshooting,doctor,uninstall-recovery}.md; do grep "^## Siguiente paso" "$file" -A1 | grep -E "^\[.*\]\(" | grep -oE "\./[^)]*\.md" | while read link; do if ! test -f "$(dirname "$file")/$link"; then echo "ROTO: $file → $link"; fi; done; done` → vacío. `grep "^## Siguiente paso" docs-site/src/content/docs/05-debug/uninstall-recovery.md -A2 | tail -1 | grep -v "^\[" | grep -q .` (texto plano, no enlace).

- [x] 9.2 Validar honestidad HN-1 completa: no menciona workbench/estado compartido/adaptadores sesión
  - skills: shell script ad hoc, grep multiarquivo
  - why: HN-1 (design §B) exige que ninguna de las 11 páginas mencione launcher workbench, estado compartido de proyecto, adaptadores de sesión (todas features futuras, rama sin mergear).
  - learn: Honestidad: no prometer funcionalidad que no está verificada.
  - architecture: Validación de límites de alcance.
  - avoid: Mencionar workbench en ningún lado (excepto gap-inventory mencionando desbloqueante).
  - verify: **Criterio 18 (HN-1):** `grep -rin 'workbench\|estado compartido\|adaptador.* de sesi' docs-site/src/content/docs/03-runtimes/*.md docs-site/src/content/docs/04-reference/*.md docs-site/src/content/docs/05-debug/{troubleshooting,doctor,optional-tooling,uninstall-recovery,known-limitations}.md 2>/dev/null` → vacío (ninguna coincidencia).

- [x] 9.3 Resumen de gates D1–D5 y 23 criterios
  - skills: verification report synthesis
  - why: Consolidar evidencia de que 11 páginas + gap-inventory cumplen contrato de design §D (23 criterios). Registrar en apply-progress.md cada lote: qué se escribió, qué checks pasaron.
  - learn: Verification es determinístico (contrato se cumple o no), no editorial.
  - architecture: Registro final (no escritura, solo evidencia).
  - avoid: Omitir checks fallidos.
  - verify: Tabla resumen en apply-progress.md con todos los criterios pasados.

---

## Orden de ejecución recomendado

1. **Lote 1** (runtime-overview) + gate D1–D2
2. **Lote 2** (pi-coding-agent, claude-code) + gate D1–D2–D3
3. **Lote 3** (runtime-matrix) + gate D1–D2–D3–D15
4. **Lote 4** (cli, filesystem) + gate D1–D2–D4 (OV-1)
5. **Lote 5** (optional-tooling, doctor) + gate D1–D2–D4 (OV-2)
6. **Lote 6** (troubleshooting, uninstall-recovery) + gate D1–D2–D4 (OV-2, HN-1)
7. **Lote 7** (known-limitations) + gate D1–D2–D4–D5 (HN-2)
8. **Lote 8** (gap-inventory) + gate D5 (completo)
9. **Validación transversal** (cadena CT-7, HN-1 final, resumen de criterios)

**Presupuesto:** 60000 tokens, 45 reads, 300000 ms disponibles. Cambio es aditivo (12 ficheros nuevos: 11 páginas + gap-inventory); rollback es `git rm -r` de ambos.

---

## Notas de arquitectura

- **strict_tdd: true sin test runner:** Apply registra checks D1–D5 como gate mecánico sustitutivo (RED al inicio = ficheros no existen, GREEN tras cada lote = criterios pasan). No hay ciclos TDD; son validaciones de contrato determinísticas. Registrado en apply-progress.md como `tdd: not-applicable — cambio solo de documentación, sin runner de test`.
- **Herencia de SLICE 1:** Contrato de página (CT-1…CT-9, SK-1…SK-5) es exacto. Solo lo nuevo: CT-6′ (enlaces no cruzan a SLICE 1), reglas RM/OV/HN, vocabulario §C4, defectos D1/D4/D5/D6.
- **Ruta canónica única:** Cada página nombrada una sola forma:
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
  - `openspec/changes/docs-content-reference/gap-inventory.md`
