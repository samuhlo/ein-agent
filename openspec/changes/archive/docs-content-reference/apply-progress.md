status: complete

# Apply Progress — docs-content-reference

tdd: not-applicable — cambio solo de documentación, sin runner de test configurado (openspec/config.yaml: test_command vacío). Gates D1–D5 (23 criterios de design.md §D) ejecutados como sustituto mecánico RED/GREEN: RED confirmado antes de escribir (las 11 rutas y el gap-inventory no existían), GREEN confirmado lote a lote tras cada escritura.

## Lote 1 — runtime-overview.md
Creado con las 4 secciones RM heredadas de map §C2. Gate D1 (frontmatter 4 claves, `verified_rev: "2f67c73"`) y D2 (7 `##`, 4 `###`, 8 bloques PENDIENTE-D) pasaron.

## Lote 2 — pi-coding-agent.md, claude-code.md
Ambas con 4 `###` cada una (39 total acumulado en curso). Verificado `PI_CODING_AGENT_DIR` en pi-coding-agent.md y `CLAUDE_CONFIG_DIR`+"gap" en claude-code.md. D1/D2 pasaron.

## Lote 3 — runtime-matrix.md
Página más delicada. 6 `###` exactos de RM-1, en orden. Criterio 15 (RM-2): primera versión filtró 3 coincidencias de "MCP" (una en `falta:` con `[BETA-EXCLUDED]`, dos accidentales en checklist/fuentes); corregidas para eliminar las dos extra. Verificación final: única coincidencia es la línea `falta:` de `## En una frase` con el tag `[BETA-EXCLUDED]`. D1/D2/D3 pasaron.

## Lote 4 — cli.md, filesystem.md
OV-1 verificado: ninguna constante de directorio (AGENT_DIR, SECRETS_DIR, etc.) en cli.md; ningún flag (`--yes`, `--dry-run`, `--runtime`, `--no-`) en filesystem.md. D1/D2/D4(16) pasaron.

## Lote 5 — optional-tooling.md, doctor.md
optional-tooling.md remite a cli.md sin repetir flags (verificado, vacío). doctor.md contiene únicamente los literales WARN/FAIL (verificado en description y sección de niveles). D1/D2/D4(16,17) pasaron.

## Lote 6 — troubleshooting.md, uninstall-recovery.md
troubleshooting.md enlaza a doctor.md sin reexplicar niveles; primera versión tenía "WARN/FAIL" literal en el checklist (violación OV-2), corregida a "sin reexplicar sus niveles". Verificación final: `grep 'WARN\|FAIL'` en troubleshooting.md → vacío; enlace a doctor.md presente. HN-1 verificado limpio en ambas páginas. D1/D2/D4(17,18) pasaron.

## Lote 7 — known-limitations.md
Esqueleto de bloqueo según HN-2: fuente única `docs/roadmap-beta.md`, un solo `### Dependencia bloqueante`, `[BETA-EXCLUDED]` en `falta:` de `## En una frase`, `## Siguiente paso` en texto plano sin enlace, sin mencionar la rama `feat/shared-project-state-contract` (verificado `grep` vacío). D1/D2/D4(19)/D5(20) pasaron.

## Lote 8 — gap-inventory.md
Creado en `openspec/changes/docs-content-reference/gap-inventory.md` con exactamente 6 `###` de hueco (First Run, Deterministic Boundaries, Real Workflow Example: `cerrado-en-cambio-anterior` + `cerrado_en: docs-content-inventory`; Runtime Matrix: `esqueleto-en-A`; Known Limitations: `bloqueado-por-merge` + `desbloqueante:`; MCP Parity: `bloqueado-por-evidencia` + `evidencia_faltante: openspec/changes/archive/core-parity/verify-report.md:163`). Tabla de defectos con exactamente 4 filas (D1, D4, D5, D6). Declaración GI-6′ presente ("fuera de alcance", "SLICE 1... intacto"). SLICE 1 gap-inventory no tocado (verificado `git status --porcelain` sobre esa ruta → vacío). D5 (20–23) pasó.

## Validación transversal (Lote 9)
- Total de páginas bajo `docs-site/src/content/docs/`: 21 (`find ... | wc -l`).
- Cadena de `## Siguiente paso`: runtime-overview → pi-coding-agent → claude-code → runtime-matrix → cli → filesystem → optional-tooling → doctor → troubleshooting → uninstall-recovery (texto plano de cierre). known-limitations.md fuera de la cadena, verificado.
- Sin literales de versión (`grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+'`) en las 11 páginas → vacío.
- HN-1 (`workbench|estado compartido|adaptador.* de sesi`) sobre las 11 rutas → vacío.
- Pureza SK-3/SK-4 verificada individualmente por página (filtrando frontmatter, encabezados, PENDIENTE-D, ítems de Fuentes, línea de Siguiente paso): sin residuo en ninguna de las 11 páginas.

## Archivos creados (12)
- `docs-site/src/content/docs/03-runtimes/{runtime-overview,pi-coding-agent,claude-code,runtime-matrix}.md`
- `docs-site/src/content/docs/04-reference/{cli,filesystem,optional-tooling}.md`
- `docs-site/src/content/docs/05-debug/{troubleshooting,doctor,known-limitations,uninstall-recovery}.md`
- `openspec/changes/docs-content-reference/gap-inventory.md`

Cero ficheros existentes modificados (solo lectura de referencia en 01-concepts/context.md y en archivos fuente citados en `sources:`).

## Deviations
Dos correcciones menores durante el gate mecánico, ambas dentro del alcance (redacción de líneas auxiliares, no del contenido normativo): Lote 3 (checklist/fuentes de runtime-matrix.md mencionaban "MCP" fuera de la línea permitida) y Lote 6 (checklist de troubleshooting.md mencionaba literales "WARN/FAIL"). Ambas corregidas antes de cerrar el lote correspondiente; ningún criterio de design §D quedó sin pasar.

## Remaining tasks
Ninguna. Los 26 ítems de `tasks.md` están marcados `[x]`. `status: ready` de `tasks.md` no se ha tocado (solo checkboxes).
