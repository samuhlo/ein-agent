# Tasks — docs-content-inventory

status: ready
blocked_by: none

---

## // 001. Corrección del contrato de verificación (§D3)

**Nota normativa (APLICA A TODOS LOS CHECKS):**
Este artefacto corrige una inconsistencia interna del design: §B (SK-2/SK-3) exige pureza de esqueleto (sin prosa), pero §D3 redactó criterios 11–14 como si hubiera prosa redactada. La reformulación que sigue es normativa para sdd-verify y remplaza esos criterios en §D3:

- **Criterio 11 (corregido):** El bloque `PENDIENTE-D` de `## En una frase` en `overview.md` nombra ambos runtimes (`pi-ein` y `cc-ein`) en su línea `falta:`.
- **Criterio 12 (corregido):** Las rutas en `sources` de `getting-started.md` NO incluyen `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md`.
- **Criterio 13 (corregido):** Ninguna página que describa la secuencia de fases SDD lista `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` como fuente de esa sección; donde aparecen las 7 fases, la autoridad es orchestrator.md o sdd-lifecycle/spec.md.
- **Criterio 14 (corregido):** Los términos `fork`/`fresh`/`max_tokens`/`max_reads` aparecen SOLO en los bloques `PENDIENTE-D` de `context.md`; la tabla modelo/herramienta/garantía/observable SOLO en `deterministic-boundaries.md`; ninguna otra página los menciona.

---

## // 002. Fundaciones conceptuales (Lote 1/6): orchestrator, sdd-openspec, context

**Dependencias:** Ninguna (base).
**Archivos:** 3 — `01-concepts/orchestrator.md`, `01-concepts/sdd-openspec.md`, `01-concepts/context.md`
**Gate:** D1 (existe × 10), D2 (frontmatter + 7 secciones), D3 párrafos 1–7

- [x] 2.1 Crear `docs-site/src/content/docs/01-concepts/orchestrator.md` en esqueleto
  - skills: `cognitive-doc-design`, `file-naming`, SDD artifact contract
  - why: Define el rol del orquestador, autoridad, delegación; es referencia transversal obligatoria para las demás páginas. Propone responsabilidades conservadas vs delegadas.
  - learn: El orquestador no es un ejecutor: es un coordinador de decisiones. No debe hacerlo todo (costo, tokens). Boundaries explícitos: modelo vs herramienta vs garantía.
  - architecture: Esta página es fundacional. No depende de ninguna otra. Será citada por workflow-overview, deterministic-boundaries, artifacts.
  - avoid: Copiar bloques de code (orchestrator.md es un documento interno). En esqueleto, nombrar conceptos, no redactar ejemplos ni narrativas.
  - verify: `grep -c "^## " docs-site/src/content/docs/01-concepts/orchestrator.md | grep -q "^7$"` (7 secciones exactas); `grep "verified_rev: \"0ae709d\"" docs-site/src/content/docs/01-concepts/orchestrator.md`.

- [x] 2.2 Crear `docs-site/src/content/docs/01-concepts/sdd-openspec.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract
  - why: Explica por qué trabajo por fases, qué es OpenSpec, artefactos principales. Sin esto, las siguientes páginas (workflow, artifacts) no tienen contexto.
  - learn: SDD es ciclo de vida: siete fases, estado en disco (no en conversación), determinismo. OpenSpec es donde vive el estado (openspec/changes/).
  - architecture: Depende de `orchestrator.md` (concepto de flujo fase-a-fase). Fundamento para `workflow-overview.md` y `artifacts.md`.
  - avoid: Confundir OpenSpec (el árbol de directorios) con SDD (el ciclo de siete fases). Ambos en la misma página pero distintos.
  - verify: `grep "^## " docs-site/src/content/docs/01-concepts/sdd-openspec.md | wc -l | grep -q "^7$"`; `test -f docs-site/src/content/docs/01-concepts/sdd-openspec.md && echo "existe"`.

- [x] 2.3 Crear `docs-site/src/content/docs/01-concepts/context.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C2 (terminología)
  - why: Contexto es el recurso más limitado en EIN. Define presupuestos (max_tokens, max_reads), ventanas (fork vs fresh), horizonte. Crítico para entender por qué el orquestador no lee todo.
  - learn: Ventana de contexto no es solo tokens; incluye lecturas discretas (`max_reads`). Fork hereda toda la conversación (~382k tokens). Fresh empieza limpio (~2000). Presupuesto es la brújula de decisiones.
  - architecture: Referencia para orchestrator (cómo encaja en decisiones). Será citada por deterministic-boundaries (límite de garantías) y workflow-overview (presupuesto por fase).
  - avoid: Confundir ventana de contexto (token limit) con horizonte de decisión (tiempo de vida de una decisión). Son conceptos distintos pero relacionados.
  - verify: `grep -q "fork" docs-site/src/content/docs/01-concepts/context.md && grep -q "fresh" docs-site/src/content/docs/01-concepts/context.md && grep -q "max_tokens" docs-site/src/content/docs/01-concepts/context.md && echo "términos OK"`; `grep "^## " docs-site/src/content/docs/01-concepts/context.md | wc -l | grep -q "^7$"`.

- [x] 2.4 Gate D1–D2–D3 tras Lote 1
  - skills: shell script ad hoc, verificación determinística
  - why: Validar que los 3 archivos existen, tienen frontmatter válido, 7 secciones exactas, fuentes resuelven.
  - learn: El gate es mecánico: `find`, `grep`, `test` sin interpretación. Pasa o falla sin ambigüedad.
  - architecture: Estos checks reemplazan RED/GREEN porque no hay test runner. Son sustitutivos.
  - avoid: Crear un script. Ejecutar los checks desde la línea de comandos, registrar salida en apply-progress.md.
  - verify: Ejecutar tras escribir cada archivo; aplicar todo el Lote 1 de una vez, luego confirmar gate.

---

## // 003. Flujo end-to-end (Lote 2/6): workflow-overview, artifacts

**Dependencias:** Lote 1 (necesita conceptos base de orchestrator y sdd-openspec).
**Archivos:** 2 — `02-workflow/workflow-overview.md`, `02-workflow/artifacts.md`
**Gate:** D1, D2, D3 (pureza, rutas de fuentes)

- [x] 3.1 Crear `docs-site/src/content/docs/02-workflow/workflow-overview.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C2 (resolución de conflictos 5 vs 7 fases)
  - why: Flujo SDD end-to-end: 7 fases, qué recibe/produce cada una, roles. Punto de unión entre conceptos (orchestrator, sdd-openspec) y detalle (artifacts). Requisito para real-workflow-example.
  - learn: Las 7 fases son: scope → map → design → tasks → apply → verify → close. Cada una recibe estado del disco, produce artefactos, no puede reinventar (scope gate).
  - architecture: Consume orchestrator.md (flujo del coordinador) y sdd-openspec.md (qué es OpenSpec). Es consumida por artifacts.md (definición de cada artefacto) y real-workflow-example.md (walkthrough). Autoridad sobre fases: orchestrator.md, NO EIN_OPERATING_SYSTEM.md.
  - avoid: Usar EIN_OPERATING_SYSTEM.md como fuente de conteo de fases (la lista 5, no 7). Citar orchestrator.md.
  - verify: `grep "7.*fases" docs-site/src/content/docs/02-workflow/workflow-overview.md` debe encontrar mención de 7 fases (en bloque PENDIENTE-D es OK). `grep -q "ein-pi/core/docs/EIN_OPERATING_SYSTEM.md" docs-site/src/content/docs/02-workflow/workflow-overview.md` puede ser verdadero (puede estar en sources), pero si menciona "5 fases" debe estar en bloque PENDIENTE-D, NO afirmación libre.

- [x] 3.2 Crear `docs-site/src/content/docs/02-workflow/artifacts.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (tabla canónica de artefactos)
  - why: Define qué es cada artefacto (scope, map, design, tasks, apply-progress, verify-report, summary), qué problema resuelve, relación. Sin esto, el lector no entiende qué verá en real-workflow-example.
  - learn: Cada artefacto es un contrato: scope fija alcance y presupuesto, map explora, design propone, tasks es checklist ejecutable, apply-progress registra TDD, verify-report valida, summary cierra. Son todos necesarios; no hay "saltos de fase".
  - architecture: Consume sdd-openspec.md (contexto de qué es OpenSpec) y orchestrator.md (por qué estado en disco). Es consumida por real-workflow-example.md (referencia a artefactos de installer-beta).
  - avoid: Inventar nuevos artefactos o saltarse fases. La estructura es fija.
  - verify: `grep "scope.md" docs-site/src/content/docs/02-workflow/artifacts.md && grep "close" docs-site/src/content/docs/02-workflow/artifacts.md && echo "artefactos OK"`; `grep "^## " docs-site/src/content/docs/02-workflow/artifacts.md | wc -l | grep -q "^7$"`.

- [x] 3.3 Gate D1–D2–D3 tras Lote 2
  - skills: shell script ad hoc
  - why: Validar que workflow-overview no usa EIN_OPERATING_SYSTEM.md como fuente de fases; artifacts tiene estructura completa; ambos heredan fuentes válidas de sus antecesoras.
  - learn: Gates acumulativos: si Lote 1 pasó, Lote 2 hereda esa validez y suma nuevos checks.
  - architecture: No resetear state; checks son incremental.
  - avoid: Ejecutar gate antes de que el lote esté escrito.
  - verify: Comando concreto tras Lote 2 escrito.

---

## // 004. Boundaries transversales (Lote 3/6): deterministic-boundaries

**Dependencias:** Lotes 1–2 (necesita contexto de orchestrator, workflow, context).
**Archivos:** 1 — `01-concepts/deterministic-boundaries.md`
**Gate:** D1, D2, D3, criterio 14 (tabla única modelo/herramienta/garantía)

- [x] 4.1 Crear `docs-site/src/content/docs/01-concepts/deterministic-boundaries.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C2 (tabla modelo vs herramienta)
  - why: Integra conceptos de orchestrator (decisión, garantía), workflow (determinismo), context (límites). Responde: ¿qué puede un modelo decidir? ¿Qué puede verificar una herramienta? ¿Qué garantiza EIN? ¿Qué solo se observa?. Crítico para gestionar promesas falsas.
  - learn: Decisión de modelo: requiere AI, probabilística. Verificación de herramienta: comando, determinística (ein_sdd_status). Garantía EIN: contrato explícito (p.ej. "siete fases", "cierre idempotente"). Observable: lo que pasó, sin garantía futura.
  - architecture: **Últ página de Fase 3 porque requiere todo lo anterior unificado.** Fundacional para workflow-overview, orchestrator, context. Será citada por todas las demás pero no cita a ninguna en sus decisiones clave (solo referencias).
  - avoid: Solapamiento con orchestrator.md (que describe flujo) o context.md (que describe budgets). Cada página su foco: orchestrator = responsabilidades, context = presupuestos, deterministic-boundaries = tipos de garantía.
  - verify: `grep -E "(modelo|herramienta|garantía|observable)" docs-site/src/content/docs/01-concepts/deterministic-boundaries.md | head -4` debe encontrar esos términos (en bloques PENDIENTE-D es OK); criterio 14: `grep "modelo" docs-site/src/content/docs/01-concepts/deterministic-boundaries.md && ! grep "modelo" docs-site/src/content/docs/00-start/overview.md && ! grep "modelo" docs-site/src/content/docs/02-workflow/workflow-overview.md && echo "modelo único en deterministic-boundaries"`.

---

## // 005. Getting Started (Lote 4/6): overview, getting-started

**Dependencias:** Lotes 1–3 (necesita que conceptos estén definidos para poder referenciarlos en "Siguiente paso").
**Archivos:** 2 — `00-start/overview.md`, `00-start/getting-started.md`
**Gate:** D1, D2, D3, criterios 11–12 (ambos runtimes en overview; sin EIN_OPERATING_SYSTEM en getting-started)

- [x] 5.1 Crear `docs-site/src/content/docs/00-start/overview.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C2 (criterio de runtimes: README.md es autoridad)
  - why: Punto de entrada. Responde: ¿Qué es EIN? ¿Para quién? ¿En qué estado? ¿Qué capacidades?. Must-have para lector nuevo. Criterio 11: nombra AMBOS runtimes (pi-ein y cc-ein) en `## En una frase`.
  - learn: EIN es harness multi-runtime, no solo Pi. Dos adaptadores soportados. Estado: beta (roadmap-beta.md es autoridad). Capacidades: fase B–E sin evidencia (roadmap-beta.md).
  - architecture: Punto de entrada de lectura (no depende de otras páginas, pero es step-0 en cadena CT-7). `## Siguiente paso` enlaza a getting-started.md.
  - avoid: Decir que EIN es solo Para Pi (es error D2 en map: EIN_OPERATING_SYSTEM.md es desactualizado). README.md línea 11 es autoridad (dos adaptadores).
  - verify: **Criterio 11:** `grep -A2 "^## En una frase" docs-site/src/content/docs/00-start/overview.md | grep -E "(pi-ein|cc-ein)" | head -1` debe encontrar ambos en la línea `falta:` del bloque PENDIENTE-D. Comando concreto: `grep -A3 "^## En una frase" docs-site/src/content/docs/00-start/overview.md | grep "pi-ein" && grep -A3 "^## En una frase" docs-site/src/content/docs/00-start/overview.md | grep "cc-ein" && echo "ambos runtimes OK"`.

- [x] 5.2 Crear `docs-site/src/content/docs/00-start/getting-started.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1–C2 (instalación: README es técnica, EIN_OPERATING_SYSTEM es UX)
  - why: Práctico: instalación, requisitos, verificación (doctor), primer arranque. No debería depender de EIN_OPERATING_SYSTEM.md como fuente (aplica solo UX en overview). Criterio 12: `sources` NO incluye `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md`.
  - learn: Instalación es bootstrap shell (README.md es autoridad técnica). Requisitos: Bun, detectar SO (EIN_DOCUMENTATION_BRIEF). Doctor verifica despliegue (installer/README.md). Experiencia de usuario (menú) va en overview.md, no aquí.
  - architecture: Lectura 2 en cadena CT-7 (tras overview). Enclaza a first-run (paso 3). Fuentes: README.md + installer/README.md + EIN_DOCUMENTATION_BRIEF (requisitos), pero NO EIN_OPERATING_SYSTEM.
  - avoid: Copiar experiencia de usuario (menú bonito) de EIN_OPERATING_SYSTEM.md. Eso es overview. Getting-started es técnico.
  - verify: **Criterio 12:** `grep "sources:" docs-site/src/content/docs/00-start/getting-started.md | grep -q "EIN_OPERATING_SYSTEM" && echo "ERROR: EIN_OPERATING_SYSTEM en sources" || echo "OK: sin EIN_OPERATING_SYSTEM"`.

- [x] 5.3 Gate D1–D2–D3 + criterios 11–12 tras Lote 4
  - skills: shell script ad hoc, grep para criterios
  - why: Validar criterios específicos de autoridad y pureza antes de pasar a ejemplos.
  - learn: Criterios comprobables por patrón (grep).
  - architecture: Gates acumulativos.
  - avoid: Proceder al Lote 5 sin pasar Lote 4 + gate.
  - verify: Ejecutar comandos concretos tras escribir ambos archivos.

---

## // 006. Ejemplos end-to-end (Lote 5/6): real-workflow-example, first-run

**Dependencias:** Lotes 1–4 (necesita todas las referencias: orchestrator, workflow-overview, artifacts, overview).
**Archivos:** 2 — `02-workflow/real-workflow-example.md`, `00-start/first-run.md`
**Gate:** D1, D2, D3, D4, criterios 13–14 (fases: siete, únicas en autoridades; no solapamientos de términos)

- [x] 6.1 Crear `docs-site/src/content/docs/02-workflow/real-workflow-example.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, C1 (referencia a installer-beta artefactos)
  - why: Walkthrough real: instalador-beta desde scope hasta close. Muestra qué ve el usuario en cada fase, qué artefactos se producen, cómo TDD cicla en apply, cómo verify valida. Enseña por ejemplo vivo, no teoría.
  - learn: Un cambio real es: petición → scope (decisión) → map (investigación) → design (propuesta) → tasks (checklist) → apply (TDD: RED/GREEN) → verify (validación) → close (resumen). Artefactos concretos hacen esto visible.
  - architecture: Lectura 9 en cadena CT-7. Requiere que workflow-overview, artifacts, orchestrator ya estén definidos (para poder enlazar). Fuentes: openspec/changes/archive/installer-beta/{scope,map,design,tasks,apply-progress,verify-report,summary}.md.
  - avoid: Inventar cambio ficticio. Usar installer-beta real (existente, verificado, con artefactos completos).
  - verify: **Criterio 13 (fases):** `grep -l "scope.*map.*design.*tasks.*apply.*verify.*close" docs-site/src/content/docs/02-workflow/real-workflow-example.md && echo "7 fases mencionadas"`. `for file in docs-site/src/content/docs/02-workflow/real-workflow-example.md docs-site/src/content/docs/02-workflow/workflow-overview.md docs-site/src/content/docs/02-workflow/artifacts.md docs-site/src/content/docs/00-start/first-run.md; do grep -q "EIN_OPERATING_SYSTEM" "$file" && echo "EIN_OS en $(basename $file) — revisar si es solo sources, no sección de fases"; done`.

- [x] 6.2 Crear `docs-site/src/content/docs/00-start/first-run.md` en esqueleto
  - skills: `cognitive-doc-design`, SDD artifact contract, new-content (no existe en repo; es creación didáctica)
  - why: Didáctico: ejemplo mínimo de cambio pequeño completo. Escenario, artefactos de installer-beta, qué aprende el usuario. Eslabón final en cadena CT-7: después de overview + getting-started, antes de conceptos profundos.
  - learn: Un "first run" no es solo "lanzar Ein" (eso es getting-started). Es hacer un cambio pequeño: cómo scope, cómo se ve en apply (TDD), cómo verify valida, cómo close archiva. Narrativa real + artefactos.
  - architecture: Lectura 3 en cadena CT-7. Requiere overview + getting-started (anteriores) y puede referenciar workflow-overview + real-workflow-example (posteriores, pero ya existen). **Nexo crítico:** si primera lectura es overview → getting-started → first-run, el usuario entiende qué hace EIN en forma práctica antes de sumergirse en conceptos.
  - avoid: Ser demasiado abstracto. Usar artefactos reales de installer-beta (scope.md, design.md, verify-report.md) como ejemplos concretos que el usuario puede ver en el repo.
  - verify: `test -f docs-site/src/content/docs/00-start/first-run.md && grep "installer-beta" docs-site/src/content/docs/00-start/first-run.md && echo "first-run con referencias a installer-beta"`. **Criterio 14 (no-solapamiento):** Verificar que términos de context.md (fork, fresh, max_tokens, max_reads) no aparecen aquí (OK si están en PENDIENTE-D o en enlace a context.md, pero NO como redacción independiente).

- [x] 6.3 Gate D1–D2–D3–D4 + criterios 13–14 tras Lote 5
  - skills: shell script ad hoc, grep multiarquivo
  - why: Último gate antes de gap-inventory. Validar que cadena CT-7 resuelve todos los enlaces `.md`, que fases/términos no están duplicados, que autoridades son consistentes.
  - learn: Gates D1–D4 son cada vez más específicos (estructura → pureza → autoridades → solapamientos).
  - architecture: Gate crítico: si pasa, Lote 6 (gap-inventory) es seguro.
  - avoid: Pasar sin validar D4.
  - verify: Ejecutar checks D1–D4 completos.

---

## // 007. Inventario de huecos y defectos (Lote 6/6): gap-inventory.md

**Dependencias:** Lotes 1–5 completos (gap-inventory reporta decisiones sobre las 10 páginas).
**Archivos:** 1 — `openspec/changes/docs-content-inventory/gap-inventory.md`
**Gate:** D4 (GI-2 a GI-6)

- [x] 7.1 Crear `openspec/changes/docs-content-inventory/gap-inventory.md` con decisiones GI-2 a GI-4
  - skills: SDD artifact contract (GI-1…GI-4), decision inventory
  - why: Consolidar las cinco decisiones de hueco en un solo lugar legible: First Run, Deterministic Boundaries, Runtime Matrix, Real Workflow Example, Known Limitations. Cada decisión fija: área, cambio propietario, decisión, fuentes, estado. Conocimiento explícito sobre qué está frenado (Known Limitations) y por qué (merge pendiente de rama).
  - learn: Los huecos de contenido son conocidos y documentados. No son sorpresas de fase D; están anticipados aquí. Known Limitations es un hueco frenado: su fuente es una rama no mergeada, así que no puede haber contenido definitivo hasta ese merge.
  - architecture: Artefacto interno (no público, vive en `openspec/changes/`, no en `docs-site/`). Readable por future phases (B, D, close). Contrato: GI-2 fija exactamente 5 huecos, GI-3 fija las 6 claves por decisión, GI-4 añade clave `desbloqueante:` solo en el hueco bloqueado.
  - avoid: Listar huecos no explícitos. Si no está en los 5 de GI-2, no va en este archivo.
  - verify: `test -f openspec/changes/docs-content-inventory/gap-inventory.md && grep "^### " openspec/changes/docs-content-inventory/gap-inventory.md | wc -l | grep -q "^5$"` (exactamente 5 huecos).

- [x] 7.2 Crear `openspec/changes/docs-content-inventory/gap-inventory.md` con tabla GI-5/GI-6 (defectos D1/D2/D3)
  - skills: SDD artifact contract (GI-5/GI-6), defect tracking
  - why: Anotar tres defectos de fuente hallados en map: D1 (README versión desactualizada), D2 (EIN_OPERATING_SYSTEM.md solo Pi), D3 (mismo fichero contradictorio: 5 vs 7 fases). Cada defecto es "fuera de alcance" de este cambio (vive en ficheros fuente, no en nuestras páginas). Decisión: se anotan, no se corrigen aquí.
  - learn: Honestidad sobre defectos externos. No limpiar la casa ajena. Los defectos están en manos de mantenimiento posterior.
  - architecture: Tabla de trazabilidad (fichero:línea, defecto, propietario, acción). Concreto, verificable, no interpretativo.
  - avoid: "Corregir" D1/D2/D3 en README.md o EIN_OPERATING_SYSTEM.md (violaría restricciones de alcance). Solo anotar.
  - verify: `grep -E "D[123]" openspec/changes/docs-content-inventory/gap-inventory.md | wc -l | grep -q "^3$"` (exactamente 3 defectos); `grep "no se corrigen" openspec/changes/docs-content-inventory/gap-inventory.md && echo "declaración GI-6 presente"`.

- [x] 7.3 Clave `desbloqueante:` para Known Limitations (GI-4)
  - skills: SDD artifact contract (GI-4), dependency tracking
  - why: Known Limitations es hueco frenado. Su fuente canónica (matriz beta de `feat/shared-project-state-contract`) está en rama no mergeada. Decisión explícita: no leer esa rama, no adelantar contenido, esperar merge en main. La clave `desbloqueante:` nombra la condición concreta.
  - learn: Algunas decisiones dependen de eventos externos (merges). Explicitarlas previene sorpresas.
  - architecture: Solo la entrada de Known Limitations tiene esta clave (GI-4). Las otras 4 no. La clave es exactamente la descripción del merge necesario.
  - avoid: Leer o citar `feat/shared-project-state-contract` en ninguna parte del artefacto o las páginas.
  - verify: `grep -A1 "Known Limitations" openspec/changes/docs-content-inventory/gap-inventory.md | grep "desbloqueante:" && echo "GI-4 presente"`.

- [x] 7.4 Gate D4 (GI-1…GI-6) tras Lote 6
  - skills: shell script ad hoc, verificación de GI contrato
  - why: Último gate. Validar que gap-inventory.md existe en ruta correcta (no bajo docs-site/), tiene estructura completa, 5 huecos + 3 defectos, Known Limitations tiene `desbloqueante:`.
  - learn: El gate D4 cierra el cambio de apply. Pasa ← todos los checks D1–D4 pasan, todas las 10 páginas + gap-inventory son esqueletos válidos.
  - architecture: Si gate D4 pasa, apply está listo para ser verificado en fase verify.
  - avoid: Permitir que sdd-verify arranque sin que D4 pase.
  - verify: Ejecutar checks GI-1 a GI-6 completos (comandos concretos en apply-progress.md).

---

## // 008. Cadena de referencias (CT-6/CT-7): validación de enlaces "Siguiente paso"

**Dependencias:** Todos los lotes (validación transversal tras completar todos).
**Archivos:** 0 (validación solo, no escritura)
**Gate:** D3, criterio 10 (enlaces resuelven); CT-6/CT-7 (orden de lectura es correcto)

- [x] 8.1 Validar cadena CT-7 de "Siguiente paso"
  - skills: shell script ad hoc, path resolution
  - why: CT-7 fija orden de lectura (overview → getting-started → first-run → orchestrator → sdd-openspec → context → deterministic-boundaries → workflow-overview → artifacts → real-workflow-example). Cada "Siguiente paso" enlaza `.md` a la siguiente página (si existe en este cambio) o nombra en texto plano si pertenece al cambio hermano o a fase futura. CT-6: todo enlace relativo `.md` MUST resolver a un fichero existente dentro de las 10 páginas.
  - learn: La cadena de lectura es un contrato. El lector novato sigue "Siguiente paso" y debe llegar a cada página sin errores 404.
  - architecture: Validación transversal (no afecta contenido individual, solo links entre páginas). Pasa si todos los enlaces resuelven.
  - avoid: Enlaces rotos o circulares. Links a páginas que no existen en este cambio sin texto plano previo.
  - verify: `for file in docs-site/src/content/docs/{00-start,01-concepts,02-workflow}/*.md; do grep "^## Siguiente paso" "$file" -A1 | grep -E "^\[.*\]\(" | grep -oE "\./[^)]*\.md" | while read link; do if ! test -f "$(dirname "$file")/$link"; then echo "ROTO: $file → $link"; fi; done; done` → debe retornar vacío (sin links rotos).

- [x] 8.2 Validar que cambios hermano / fase futura están nombrados en texto plano (no enlaces)
  - skills: shell script ad hoc
  - why: Contenido que pertenece al cambio hermano (03-runtimes, 04-reference, 05-debug) o a fase futura (generated blocks, Starlight components) debe estar nombrado pero no enlazado en A.
  - learn: Frontera A↔D es explícita. A no promete contenido que D no pueda redactar. Texto plano es honesto (no implica que existe).
  - architecture: Verificación de frontera.
  - avoid: Enlaces a `../03-runtimes/` o `#generated` que no existan.
  - verify: `grep -r "^## Siguiente paso" docs-site/src/content/docs/ -A2 | grep -E "03-runtimes|04-reference|05-debug|docs-content-reference" | head -5` debe retornar líneas de texto (no enlaces `[...](...)`).

---

## // 009. Resumen de gates (verificación transversal)

**Dependencias:** Todos los lotes completados.
**Gate:** D1–D4 completos (19 criterios de design.md §D, con reformulación de §D3 aplicada)

- [x] 9.1 Resumen de checks D1–D4 y criterios 1–19 (con reformulación 11–14)
  - skills: verification report synthesis
  - why: Consolidar evidencia de que el cambio cumple contrato. Design exige 19 criterios (D1: 4, D2: 4, D3: 4, D4: 5). Los checks se ejecutan tras cada lote; este es el resumen final.
  - learn: Verification no es juicio editorial. Es determinístico: el contrato se cumple o no.
  - architecture: Artefacto de registro (no escritura de nuevos ficheros, solo evidencia en apply-progress.md).
  - avoid: Omitir checks. Si alguno falla, apply está incompleto.
  - verify: Ver apply-progress.md tras cada lote; tabla resumen de checks + pass/fail.

---

## Orden de ejecución recomendado

1. Lote 1 (fundaciones: orchestrator, sdd-openspec, context) + gate D1–D2–D3
2. Lote 2 (flujo: workflow-overview, artifacts) + gate D1–D2–D3
3. Lote 3 (boundaries) + gate D1–D2–D3 + criterio 14
4. Lote 4 (getting-started: overview, getting-started) + gate D1–D2–D3 + criterios 11–12
5. Lote 5 (ejemplos: real-workflow-example, first-run) + gate D1–D2–D3–D4 + criterios 13–14
6. Lote 6 (gap-inventory) + gate D4 (GI-1…GI-6)
7. Validación transversal (cadena CT-7, enlaces, sintetizar apply-progress.md)

**Presupuesto:** 45000 tokens, 40 reads, 180000 ms disponibles. Este cambio es aditivo (no modifica ficheros); rollback es `git rm -r` de los 10 archivos + gap-inventory.

---

## Notas de arquitectura

- **strict_tdd: true pero sin test runner**: apply registrará checks D1–D4 como gate mecánico sustitutivo (RED al inicio, GREEN tras cada lote). No hay ciclos TDD tradicionales; son validaciones de contrato.
- **Cambio hermano (docs-content-reference, SLICE 2)** utilizará el mismo gap-inventory.md para documentar sus decisiones sobre 03-runtimes, 04-reference, 05-debug. Ambos cambios convergen en ese artefacto.
- **Defectos D1/D2/D3 no se corrigen**: Anotados en gap-inventory.md, propietario = fuera de alcance, acción = cambio de mantenimiento posterior. No modificar README.md, EIN_OPERATING_SYSTEM.md.
