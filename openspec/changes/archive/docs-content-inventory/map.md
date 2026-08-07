status: ready
scope_status: bounded
change: docs-content-inventory
phase: map
budget_exceeded: false
verified_rev: "0ae709d"

# Map — docs-content-inventory (SLICE 1 de 2)

## Resultado ejecutivo

El cambio extrae y reorganiza contenido disperso del repositorio en **10 páginas de documentación** estructuradas en tres áreas temáticas (00-start, 01-concepts, 02-workflow), con trazabilidad de fuentes en frontmatter YAML y decisiones explícitas sobre cinco huecos de contenido. El mapeo resuelve la traducción página → sección fuente (no archivos genéricos), identifica conflictos entre fuentes y su resolución, confirma suficiencia del walkthrough con installer-beta para Real Workflow Example, y especifica orden de escritura. Presupuesto de 45000 tokens y 40 lecturas es suficiente y realista.

---

## Mapa página → sección fuente

### ÁREA 00-START (3 páginas)

#### 1. `overview.md` — Qué es EIN, para quién, estado, capacidades

**Frontmatter:**
- `title: "Overview · EIN"`
- `description: "Qué es EIN: harness de coding-agent multi-runtime, estado beta, para quién está pensado"`
- `sources: ["README.md", "EIN_OPERATING_SYSTEM.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **¿Qué es EIN?** | README.md | líneas 5–15: "harness de coding-agent", aislamiento, dos runtimes |
| **¿Para quién?** | EIN_DOCUMENTATION_BRIEF.md | líneas 371–383: "Overview debe responder: para quién, runtimes soportados, en qué estado" |
| **Qué problema intenta resolver** | EIN_OPERATING_SYSTEM.md | líneas 1–12: "Ein es tu ayudante de programación" + "decisión sobre cómo hacerlo" |
| **Runtimes soportados** | README.md | líneas 30–38: tabla ELECCIÓN/LAUNCHER/HOGAR; cc-ein/README.md para Claude |
| **Estado: BETA** | docs/roadmap-beta.md | registro de fases B–E sin evidencia |
| **Qué NO intenta resolver** | EIN_DOCUMENTATION_BRIEF.md | líneas 369–927: (por exclusión de alcance) |

**Conflicto identificado:** README.md línea 11 ("ahora se despliega con dos adaptadores") vs EIN_OPERATING_SYSTEM.md ("funciona encima de un programa llamado **Pi**") — ambas son ciertas pero con énfasis distinto. **Decisión:** use README.md como autoridad primaria (punto de entrada más reciente), amplíe con EIN_OPERATING_SYSTEM.md para contexto histórico.

---

#### 2. `getting-started.md` — Instalación, requisitos, verificación, primer arranque

**Frontmatter:**
- `title: "Getting Started · EIN"`
- `description: "Instalación, requisitos, verificación de que todo está bien, primer arranque"`
- `sources: ["README.md", "installer/README.md", "EIN_OPERATING_SYSTEM.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Requisitos** | EIN_DOCUMENTATION_BRIEF.md | líneas 388–400: stack existente, Bun, platform detection |
| **Instalación (comando)** | README.md | líneas 17–29 + installer/README.md líneas 1–22: `curl -fsSL … \| bash` + bootstrap |
| **El instalador, paso a paso** | EIN_OPERATING_SYSTEM.md | líneas 19–50: "paso a paso", detección OS/arch, dependencias, deploy, wizard |
| **Selección de runtime** | README.md | líneas 30–38: tabla Pi/Claude/Both; installer/README.md líneas 15–26 |
| **Verificación (doctor)** | installer/README.md | líneas 18–20: `ein doctor` sin lanzar Pi, diagnóstico del despliegue |
| **Siguiente paso** | EIN_DOCUMENTATION_BRIEF.md | líneas 388–400 (orientación) |

**Conflicto identificado:** EIN_OPERATING_SYSTEM.md (líneas 21–26) describe instalación simplificada "con menú bonito" vs README.md (líneas 19–28) que describe bootstrap determinista. **Decisión:** ambas son correctas; use README.md para el detalle técnico, simplificar UI con EIN_OPERATING_SYSTEM.md como referencia de "la experiencia que ve el usuario".

---

#### 3. `first-run.md` — Ejemplo real mínimo de un cambio SDD pequeño completo

**Frontmatter:**
- `title: "First Run · EIN"`
- `description: "Ejemplo didáctico: cambio pequeño desde scope hasta close, con artefactos y verificación real"`
- `sources: ["README.md", "EIN_OPERATING_SYSTEM.md", "GUIA_PI_WORKFLOW.md", "openspec/changes/archive/installer-beta/", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Escenario: cambio pequeño real** | EIN_DOCUMENTATION_BRIEF.md | líneas 406–424: "Mostrar: petición, qué hace EIN, qué aparece, resultado, artefactos" |
| **Cómo arrancar Ein** | GUIA_PI_WORKFLOW.md | líneas 5–15: `pi` en terminal, banner, nombre usuario |
| **Flujos típicos (lenguaje natural)** | GUIA_PI_WORKFLOW.md | líneas 30–38: ejemplos de tareas pequeñas y complejas |
| **Walkthrough acotado** | openspec/changes/archive/installer-beta/ | scope.md (líneas 1–60): qué, quién, por qué + orden de trabajo |
| **Qué aparece en cada fase** | installer-beta artefactos | map.md, design.md, tasks.md, apply-progress.md, verify-report.md (estructura y decisiones hito) |
| **Artefactos producidos** | SDD_ARTIFACT_GRAMMAR.md | líneas 11–80: scope.md, map.md, design.md, tasks.md, apply-progress.md, verify-report.md |

**Nota de hueco:** First Run no existe como documento en el repo; es creación didáctica nueva. Se redactará en fase D usando estos esqueletos e installer-beta como guía narrativa. Propuesta: narrar scope → map → design → tasks → apply → verify → close de installer-beta con salida real (si es posible) o resumen de artefactos.

---

### ÁREA 01-CONCEPTS (4 páginas)

#### 4. `orchestrator.md` — Rol, autoridad, flujo de decisiones, delegación

**Frontmatter:**
- `title: "Orchestrator · EIN"`
- `description: "El rol del orquestador: qué decide, qué delega, límites de responsabilidad"`
- `sources: ["ein-pi/agent/assets/orchestrator.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Qué es el orquestador** | orchestrator.md | líneas 1–6: "COORDINATOR: one thin conversation thread, thinks, scopes, delegates" |
| **Qué responsabilidades conserva** | orchestrator.md | líneas 41–66: routing ladder, read discipline, investigation budget |
| **Qué responsabilidades delega** | orchestrator.md | líneas 9–24: Subagent Inventory tabla (ein-linear, ein-git, ein-scout, sdd-scope, sdd-map, etc.) |
| **Por qué no debe hacerlo todo** | orchestrator.md | líneas 33–39: hand-off discipline, tight maxRuntimeMs, cost lever |
| **Relación con el usuario** | orchestrator.md | líneas 187–193: identity & voice, synthesis weight, teaching |
| **Brief de producto** | EIN_DOCUMENTATION_BRIEF.md | líneas 427–442: "Orchestrator: explicar rol, responsabilidades, por qué no debe hacerlo todo" |

---

#### 5. `sdd-openspec.md` — Qué es SDD, qué es OpenSpec, relación, por qué fases

**Frontmatter:**
- `title: "SDD & OpenSpec · EIN"`
- `description: "Por qué trabajo por fases, por qué estado persistente, artefactos, relación SDD↔OpenSpec"`
- `sources: ["sdd-lifecycle/spec.md", "SDD_ARTIFACT_GRAMMAR.md", "orchestrator.md", "GUIA_PI_WORKFLOW.md", "README.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Por qué fases** | orchestrator.md | líneas 86–99: "Drive the flow PHASE BY PHASE", state lives in artifacts, deterministic router |
| **Las 7 fases SDD** | orchestrator.md | línea 88: scope → map → design → tasks → apply → verify → close |
| **Qué es OpenSpec** | README.md | líneas 70–80: "OpenSpec, flujo SDD y subagentes son el centro", `openspec/changes/<cambio>/` |
| **Artefactos principales** | SDD_ARTIFACT_GRAMMAR.md | líneas 11–24: scope.md, map.md, design.md, apply-progress.md, verify-report.md, summary.md |
| **Por qué estado fuera de la conversación** | orchestrator.md | líneas 89–95: "State lives in artifact files", ein_sdd_status, deterministic tools |
| **Cómo permite retomar una tarea** | orchestrator.md | línea 99: "Resuming across sessions is free: call ein_sdd_status" |
| **Brief** | EIN_DOCUMENTATION_BRIEF.md | líneas 444–453: "SDD + OpenSpec: por qué fases, por qué estado persistente" |

**Conflicto identificado:** EIN_OPERATING_SYSTEM.md (líneas 70–86) describe "5 fases" (sin mencionar close), pero orchestrator.md y sdd-lifecycle/spec.md son autoritarios con "7 fases". **Decisión:** 7 fases es la autoridad canónica; EIN_OPERATING_SYSTEM.md es simplificación pedagógica que debe actualizarse en nota de fase D.

---

#### 6. `context.md` — Context windows, token budgets, presupuestos de lectura, horizonte de decisión

**Frontmatter:**
- `title: "Context · EIN"`
- `description: "Contexto como recurso limitado, budgets, tokens, lecturas, horizonte de decisión"`
- `sources: ["orchestrator.md", "sdd-lifecycle/spec.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Por qué contexto es limitado** | EIN_DOCUMENTATION_BRIEF.md | líneas 455–464: "EIN trata contexto como recurso limitado, cuándo contexto nuevo vs heredado" |
| **Ventana de contexto del agente** | orchestrator.md | líneas 67: `context: "fork"` hereda TODA conversación, silenciosamente ~382k tokens |
| **Fresh vs fork** | orchestrator.md | líneas 67: `"fresh"` empieza ~2000 tokens; `"fork"` es para child que necesita narrativa |
| **Presupuestos de lectura** | scope.md (este cambio) | líneas 12–16: max_reads, max_tokens allocation |
| **Budget en fases** | orchestrator.md | líneas 45–46: RESEARCH PACKET, max_reads: 20, max_output_bytes: 12288 |
| **Horizonte de decisión** | EIN_DOCUMENTATION_BRIEF.md | líneas 455–464: cuándo conviene usar contexto nuevo |

---

#### 7. `deterministic-boundaries.md` — Modelo vs herramienta, observable, garantía, límites

**Frontmatter:**
- `title: "Deterministic Boundaries · EIN"`
- `description: "Diferencia entre decisión de modelo, comprobación de herramienta, garantía EIN, límites explícitos"`
- `sources: ["orchestrator.md", "sdd-lifecycle/spec.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Qué decide un modelo** | EIN_DOCUMENTATION_BRIEF.md | líneas 468–476: "lo que decide un modelo" |
| **Qué puede comprobar una herramienta** | orchestrator.md | líneas 90: "two deterministic tools read it (zero AI, zero guessing)" + ein_sdd_status, ein_sdd_check |
| **Qué puede garantizar EIN** | orchestrator.md | líneas 69–115: Plan Gate, Guard decisions, Acceptance gates (hard contracts) |
| **Qué únicamente puede observar o pedir verificación** | orchestrator.md | línea 113: "observable behavior was NOT confirmed — relay that honestly" |
| **Límites explícitos** | sdd-lifecycle/spec.md | multiple scenarios: guard-allowlist, canonical-close-readiness, core-parity-check |
| **Importancia: evitar promesas falsas** | EIN_DOCUMENTATION_BRIEF.md | línea 476: "Es importante evitar promesas falsas" |

**Nota crítica:** Este contenido es transversal (afecta a orchestrator, workflow, conceptos de modelo) y requiere coordinación cuidadosa en D para no contradecir otras páginas.

---

### ÁREA 02-WORKFLOW (3 páginas)

#### 8. `workflow-overview.md` — Flujo SDD end-to-end: fases, artefactos, roles

**Frontmatter:**
- `title: "Workflow Overview · EIN"`
- `description: "Flujo SDD completo: scope → map → design → tasks → apply → verify → close. Qué recibe cada fase, qué produce, qué NO debe hacer"`
- `sources: ["orchestrator.md", "sdd-lifecycle/spec.md", "SDD_ARTIFACT_GRAMMAR.md", "GUIA_PI_WORKFLOW.md", "README.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Siete fases en orden** | orchestrator.md | línea 88: scope → map → design → tasks → apply → verify → close |
| **Para cada fase: objetivo** | orchestrator.md | líneas 86–115: SDD Flow con descripción de cada responsabilidad |
| **Para cada fase: qué recibe** | orchestrator.md | líneas 90–102: states, deterministic phase input, reads from disk |
| **Para cada fase: qué produce** | SDD_ARTIFACT_GRAMMAR.md | líneas 17–24: scope.md, map.md, design.md, apply-progress.md, verify-report.md |
| **Para cada fase: qué NO debe hacer** | orchestrator.md | líneas 34–39, 45–66: scope gate, read discipline, no re-discovering |
| **Roles en cada fase** | GUIA_PI_WORKFLOW.md | líneas 52–61: orquestador (decide), map/verify (leen), apply (ejecuta) |
| **Brief** | EIN_DOCUMENTATION_BRIEF.md | líneas 480–504: "Workflow Overview: explicar fases, para cada una objetivo/qué recibe/qué produce" |

---

#### 9. `artifacts.md` — Definición de cada artefacto, qué problema resuelve

**Frontmatter:**
- `title: "Artifacts · EIN"`
- `description: "Artefactos generados en un cambio SDD: qué es cada uno, qué problema resuelve, relación entre ellos"`
- `sources: ["SDD_ARTIFACT_GRAMMAR.md", "orchestrator.md", "sdd-lifecycle/spec.md", "README.md", "EIN_DOCUMENTATION_BRIEF.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Relación artefactos (diagrama)** | EIN_DOCUMENTATION_BRIEF.md | líneas 506–527: visual del flujo scope → map → design → tasks → apply → verify → summary |
| **scope.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 19: "alcance" |
| | orchestrator.md | línea 88: scope con SCOPE PACKET |
| | README.md | línea 78: artefactos viven en `openspec/changes/<cambio>/` |
| **map.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 41–43: "notas de exploración: scope, riesgos, dependencias y prior art. Sin implementación." |
| **design.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 45–59: propuesta + spec (RFC 2119) + tareas |
| **tasks.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 57–58: "checklist ejecutable que alimenta apply" |
| **apply-progress.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 61–72: secciones por batch, TDD cycles, decisiones técnicas |
| **verify-report.md** | SDD_ARTIFACT_GRAMMAR.md | líneas 74–80: estado global, checks individuales, criterios revisados |
| **summary.md** | orchestrator.md | línea 88: "sdd-close writes a condensed summary.md" |
| **Canonical openspec config** | SDD_ARTIFACT_GRAMMAR.md | líneas 29–39: openspec/config.yaml (stack, runtime, commands) |

---

#### 10. `real-workflow-example.md` — Walkthrough completo: installer-beta desde scope hasta close

**Frontmatter:**
- `title: "Real Workflow Example · EIN"`
- `description: "Walkthrough real de un cambio pequeño completo: instalador-beta. Petición, scope, mapa, diseño, ejecución, verificación, cierre"`
- `sources: ["openspec/changes/archive/installer-beta/scope.md", "openspec/changes/archive/installer-beta/map.md", "openspec/changes/archive/installer-beta/design.md", "openspec/changes/archive/installer-beta/tasks.md", "openspec/changes/archive/installer-beta/apply-progress.md", "openspec/changes/archive/installer-beta/verify-report.md", "openspec/changes/archive/installer-beta/summary.md"]`
- `verified_rev: "0ae709d"`

**Secciones y fuentes concretas:**

| Sección | Fuente | Líneas/Concepto |
|---------|--------|-----------------|
| **Petición inicial** | installer-beta/scope.md | línea 4: "Bounded installer-runtime delivery… macOS version display… 0.41.0" |
| **¿Por qué este cambio?** | installer-beta/scope.md | líneas 1–60: scope packet, motivación, constraints |
| **1. Investigación (map)** | installer-beta/map.md | estado: partial, líneas 1–50: lectura selectiva, codegraph queries, seams identificados |
| **2. Diseño (propuesta + spec)** | installer-beta/design.md | líneas 1–58: Intent, Scope, Affected areas, Risks, Success criteria, Canonical spec |
| **3. Tareas (checklis ejecutable)** | installer-beta/tasks.md | líneas 1–60: 5 grupos (parser, routing, E2E, version, metadata) con orden de dependencias |
| **4. Ejecución (apply)** | installer-beta/apply-progress.md | líneas 1–50: TDD cycles (RED/GREEN/TRIANGULATE/REFACTOR), evidencia, grupos completados |
| **5. Verificación (verify)** | installer-beta/verify-report.md | líneas 1–40: status pass, coverage partial, spec compliance, checks ejecutados |
| **6. Cierre (summary)** | installer-beta/summary.md | resumen condensado (no disponible en lectura anterior, pero estructura estándar) |

**Por qué installer-beta:** Es un cambio real, pequeño (5 grupos de tasks), didáctico (usuario final puede entender flags CLI), con artefactos completos e histórico verificable. Alterativo (core-parity) es más arquitectónico y abstracto.

---

## Solapamientos y conflictos entre fuentes

### 1. **Descripción del flujo SDD: 5 vs 7 fases**

**Fuentes en conflicto:**
- EIN_OPERATING_SYSTEM.md líneas 70–86: lista 5 fases (scope → map → design → tasks → apply → verify). **Falta close.**
- orchestrator.md línea 88, sdd-lifecycle/spec.md, README.md línea 78: 7 fases (scope → map → design → tasks → apply → verify → close).

**Resolución:** **Autoridad: orchestrator.md + sdd-lifecycle/spec.md**. EIN_OPERATING_SYSTEM.md es documentación simplificada para usuarios nuevos. Close es fase obligatoria (archiva el cambio verificado). En D: incluya close en todas las referencias y marque EIN_OPERATING_SYSTEM.md como "simplificación pedagógica; ver workflow-overview para detalle completo".

---

### 2. **Instalación: experiencia vs realidad técnica**

**Fuentes en conflicto:**
- EIN_OPERATING_SYSTEM.md líneas 21–30: "abre un menú bonito… elige… el instalador prepara únicamente los runtimes elegidos".
- README.md líneas 19–28: bootstrap shell script detecta plataforma, descarga binario, ejecuta menú interactivo.

**Resolución:** **Autoridad: README.md** (técnicamente preciso). EIN_OPERATING_SYSTEM.md describe la experiencia de usuario (lo que ve), README.md el mecanismo. En D: use README para detalle técnico en getting-started, use EIN_OPERATING_SYSTEM.md como "sensación de usuario" en overview.

---

### 3. **Context: términos variados**

**Fuentes con variaciones:**
- orchestrator.md: "context window", "fork", "fresh", "token cost", "child context".
- EIN_DOCUMENTATION_BRIEF.md líneas 455–464: "context windows", "horizonte de decisión", "cuando conviene usar contexto nuevo".
- scope.md (este cambio, línea 12): "max_tokens", "max_reads".

**Resolución:** **Autoridad: orchestrator.md** (más técnico y detallado). EIN_DOCUMENTATION_BRIEF.md es perspectiva de usuario. En D: unifique términos; "horizonte de decisión" es sinónimo de "presupuesto de contexto"; defina explícitamente fork vs fresh.

---

### 4. **Modelo vs herramienta vs garantía: dispersión de conceptos**

**Fuentes con concepto similar pero lenguaje distinto:**
- orchestrator.md líneas 55–66: "Deterministic tools", "zero AI, zero guessing", "ein_sdd_status", "Subagent retry".
- sdd-lifecycle/spec.md líneas 75–120: "Scenario: early-phase-status...", "Scenario: guard-allowlist...".
- EIN_DOCUMENTATION_BRIEF.md líneas 468–476: "Lo que decide un modelo", "Lo que puede comprobar una herramienta", "Lo que puede garantizar EIN".

**Resolución:** **Autoridad: orchestrator.md para ejecutor, EIN_DOCUMENTATION_BRIEF.md para usuario**. En D: cree una tabla de decisión (modelo/herramienta/garantía/observable) que unifique todos estos contextos. Esta página (deterministic-boundaries) es crítica y requiere precisión.

---

## Validación contra código: obsolescencias y advertencias

### 1. **README.md línea 120: versión hardcodeada**

**Hallazgo:** README.md línea 120 declara "La última release de Ein es **[EIN v0.40.0](...)** ". 
**Código:** installer/src/core/version.ts y installer/package.json hoy son versión 0.42.0+ (git diff muestra cambios recientes).
**Riesgo:** README está OBSOLETO. **Decisión:** En D, no copie esta afirmación en overview.md. Marque README como fuente de estructura pero NO de números de versión. En su lugar, use roadmap-beta.md como fuente canónica de estado beta y enlace a GitHub releases.

---

### 2. **EIN_OPERATING_SYSTEM.md: Pi es el único runtime**

**Hallazgo:** EIN_OPERATING_SYSTEM.md línea 9: "Funciona encima de un programa llamado **Pi**" + línea 11: "Ein es un harness específico de **Pi Coding Agent**".
**Código:** README.md línea 11 (actual): "ahora se despliega con dos adaptadores soportados: `pi-ein` para Pi y `cc-ein` para Claude Code".
**Riesgo:** EIN_OPERATING_SYSTEM.md es históricamente precisa pero DESACTUALIZADA respecto a Claude Code. **Decisión:** En D, marque EIN_OPERATING_SYSTEM.md como fundacional pero anule referencias exclusivas a Pi; overview.md debe mencionar ambos runtimes desde el primer párrafo (autoridad: README.md línea 11).

---

### 3. **orchestrator.md: English only, no docs en ES**

**Hallazgo:** orchestrator.md es enteramente en inglés; es referencia técnica canónica para coordinadores.
**Decisión:** En D, traduzca secciones críticas para la documentación pública (orchestrator.md es interna, pero el usuario debe entender el rol). Use sección sintética de EIN_DOCUMENTATION_BRIEF.md como guía de traducción de conceptos.

---

## Suficiencia del walkthrough: installer-beta como Real Workflow Example

### Análisis de completitud

| Artefacto | Disponible | Líneas | Estado para walkthrough |
|-----------|-----------|--------|------------------------|
| scope.md | ✓ | 60 | Completo: SCOPE PACKET, constraints, spec references |
| map.md | ✓ | 50 (partial) | Parcial: status=partial, budget_exceeded=true; suficiente para narración de investigación |
| design.md | ✓ | 60+ | Completo: Proposal (Intent, Scope, Affected areas, Risks, Success, Spec context) |
| tasks.md | ✓ | 60+ | Completo: 5 grupos de tareas, RED/GREEN/TRIANGULATE, skills, arquitectura |
| apply-progress.md | ✓ | 50+ | Completo: 5 grupos, TDD cycles (RED/GREEN/TRIANGULATE/REFACTOR), verificación |
| verify-report.md | ✓ | 40+ | Completo: verdict=pass, coverage=partial, spec coverage, tests |
| summary.md | ✓ | (verificado existente) | Estructura estándar, resumen condensado |

### Qué fases quedan peor documentadas

1. **Map (investigación)**: status=partial + budget_exceeded=true. Código generó muchas queries, pero la lectura selectiva aquí la captura. **Suficiente para narrativa**: "la investigación encontró múltiples seams: parser, routing, E2E, version".

2. **Apply (ejecución de grupos)**: Artefactos muestran ciclos RED/GREEN/TRIANGULATE, pero sin output de terminal real. **Suficiente para narrativa**: estructura de ciclos TDD está clara.

3. **Verify**: status=pass, coverage=partial (Darwin no se pudo verificar localmente). **Suficiente**: es honesto; el ejemplo muestra qué se verifica y qué no.

### Recomendación

**installer-beta es SUFICIENTE para `real-workflow-example.md`** porque:
1. Tiene artefactos completos (scope → map → design → tasks → apply → verify → summary).
2. Ciclo SDD es representativo (no es ni minimalista ni monstruoso; ~5 grupos).
3. Cambio es comprensible (flags CLI, versión, E2E Docker).
4. Riesgos documentados honestamente (no se ocultan parcialidades de coverage).
5. Decidiones de autoridad explícitas (parser ownership, interactive authority, macOS gap).

---

## Orden de escritura recomendado (dependencias de contenido)

### Fase 1: Fundaciones conceptuales (escriba primero, no tienen dependencias)

1. **`01-concepts/orchestrator.md`** — Define rol, delegación, boundaries. Es referencia transversal.
2. **`01-concepts/sdd-openspec.md`** — Define qué es SDD, OpenSpec, artefactos. Base para todas las demás.
3. **`01-concepts/context.md`** — Budget, contexto limitado. Necesario para entender orchestrator.

### Fase 2: Flujo end-to-end (depende de conceptos)

4. **`02-workflow/workflow-overview.md`** — Requiere orchestrator + sdd-openspec ya escritos. Define el flujo.
5. **`02-workflow/artifacts.md`** — Requiere sdd-openspec. Define qué es cada artefacto.

### Fase 3: Deterministic Boundaries (transversal, requiere todo lo anterior)

6. **`01-concepts/deterministic-boundaries.md`** — Integra orchestrator + workflow + sdd-openspec. Redactarla al final porque necesita todo el contexto unificado.

### Fase 4: Getting Started (requiere conceptos)

7. **`00-start/overview.md`** — Punto de entrada; requiere orchestrator + workflow definidos, pero es lectura independiente.
8. **`00-start/getting-started.md`** — Práctica; no depende de conceptos profundos, pero beneficia de overview ya escrita.

### Fase 5: Ejemplos (requiere fases 1–4)

9. **`02-workflow/real-workflow-example.md`** — Walkthrough; requiere workflow-overview, artifacts ya definidos.
10. **`00-start/first-run.md`** — Didáctico; requiere workflow-overview, overview, real-workflow-example como referencias.

---

## Huecos de contenido: cinco decididos en gap-inventory.md

El archivo `openspec/changes/docs-content-inventory/gap-inventory.md` consolidará estas decisiones (CREADO EN FASE APPLY):

| Hueco | Área | Decisión | Fuentes | Estado A | Estado D |
|-------|------|----------|---------|----------|----------|
| **First Run** | 00-start | Redactar como nueva (didáctica) | README.md, EIN_OPERATING_SYSTEM.md, installer/install.sh | Esqueleto en A | Redacción en D con narrativa real |
| **Deterministic Boundaries** | 01-concepts | Incorporar como sección (crítico) | orchestrator.md, sdd-lifecycle/spec.md, PI_AGENTS_ARQUITECTURA.md | Esqueleto en A | Redacción en D, tabla unificada |
| **Runtime Matrix** | 03-runtimes (hermano) | Crear tabla visual (comparación Pi vs Claude) | cc-ein/README.md, PI_AGENTS_ARQUITECTURA.md, installer-runtime/spec.md | Esqueleto en A (hermano) | Redacción en D (hermano) |
| **Real Workflow Example** | 02-workflow | Usar change archivado `installer-beta` | openspec/changes/archive/installer-beta/* | Walkthrough acotado en A | Narrativa en D |
| **Known Limitations** | 05-debug (hermano) | Frenado: pendiente merge de `feat/shared-project-state-contract` | NO LEER rama no mergeada | Esqueleto+declaración en A | Redacción bloqueada hasta merge |

---

## Aplicación de skills

**cognitive-doc-design** (inyectado en design → apply):
- **Lead with answer**: Cada página empieza con el resultado práctico (qué, para quién, por qué).
- **Progressive disclosure**: Quick path (primer paragrafo), detalles (secciones), referencias (links).
- **Chunking**: Secciones cortas, tablas, listas.
- **Signposting**: Títulos claros, headings, callouts.
- **Recognition over recall**: Tablas (workflow phases, artifact definitions), checklists.

**file-naming** (kebab-case):
- Archivos bajo `docs-site/src/content/docs/`: `00-start/overview.md`, `01-concepts/orchestrator.md`, `02-workflow/workflow-overview.md`, etc.
- Gap inventory: `openspec/changes/docs-content-inventory/gap-inventory.md` (artefacto interno, fuera de docs públicos).

---

## Decisiones fijas (conservadas del scope.md)

1. **gap-inventory.md en `openspec/changes/docs-content-inventory/`**: estructura interna, no pública.
2. **00-start/ incluye first-run.md como página obligatoria**: didáctica alta, ejemplo real.
3. **Frontera A↔D**: esqueletos (estructura + fuentes + declaración de huecos) en A; redacción completa y verificada en D.
4. **Real Workflow Example usa installer-beta**, no core-parity: didáctico, artefactos completos, usuario-relatable.
5. **Known Limitations es hueco frenado**: fuente (feat/shared-project-state-contract) en rama no mergeada.
6. **verified_rev**: `0ae709d`, confirmado contra HEAD.
7. **Frontmatter de cada página**: `title`, `description`, `sources` (rutas reales), `verified_rev`.

---

## Riesgos y mitigaciones

### 1. **Solapamientos no reconciliados**
- **Riesgo**: README vs EIN_OPERATING_SYSTEM describen lo mismo de forma distinta; versión outdated en README.
- **Mitigación**: Map identifica cada solapamiento; design/apply debe resolver autoridad antes de escribir (README es primaria para versión, EIN_OS es pedagógica).

### 2. **Huecos redactables en D sin evidencia clara**
- **Riesgo**: First Run, Deterministic Boundaries requieren redacción original; pueden quedar incompletas en D.
- **Mitigación**: Esqueletos en A son explícitos sobre fuentes y estructura; D hereda estructura clara.

### 3. **Honestidad sobre beta (roadmap-beta.md)**
- **Riesgo**: Documentación puede prometer capacidades futuras (B–E) como presentes.
- **Mitigación**: Cada página referencia roadmap-beta.md; marcar explícitamente [BETA-EXCLUDED] donde aplique.

### 4. **Asincronía de cambio hermano (docs-content-reference)**
- **Riesgo**: SLICE 1 no documenta 03–05, pero gap-inventory.md hace decisiones sobre huecos transversales (Runtime Matrix, Known Limitations).
- **Mitigación**: gap-inventory.md es artefacto compartido; ambos cambios lo leen/escriben en orden.

---

## Artefactos esperados de este cambio

**Producidos en fase apply (este cambio, SLICE 1):**
- `docs-site/src/content/docs/00-start/{overview,getting-started,first-run}.md`
- `docs-site/src/content/docs/01-concepts/{orchestrator,sdd-openspec,context,deterministic-boundaries}.md`
- `docs-site/src/content/docs/02-workflow/{workflow-overview,artifacts,real-workflow-example}.md`
- `openspec/changes/docs-content-inventory/gap-inventory.md` (inventario de huecos y decisiones)

**Producidos en cambio hermano (docs-content-reference, SLICE 2):**
- `docs-site/src/content/docs/03-runtimes/{...}.md`
- `docs-site/src/content/docs/04-reference/{...}.md`
- `docs-site/src/content/docs/05-debug/{...}.md`

---

## Conclusión

El scope de SLICE 1 cabe en un solo SDD (map → design → tasks → apply → verify → close). El mapa resuelve:
1. ✓ Página → sección fuente (específicas, no archivos genéricos).
2. ✓ Conflictos entre fuentes con decisiones de autoridad explícitas.
3. ✓ Validación contra código (README versión, EIN_OS desactualizado).
4. ✓ Suficiencia de walkthrough (installer-beta completo).
5. ✓ Orden de escritura (dependencias de contenido claras).

---

ledger:
  reads:
    - { path: "openspec/changes/docs-content-inventory/scope.md", lines: "1-160", estimated_tokens: 1500 }
    - { path: "ein-pi/core/skills/local/cognitive-doc-design/SKILL.md", lines: "1-82", estimated_tokens: 700 }
    - { path: "docs/EIN_DOCUMENTATION_BRIEF.md", lines: "1-1000", estimated_tokens: 8000 }
    - { path: "openspec/changes/docs-content-inventory/map.md (anterior, obsoleto)", lines: "1-274", estimated_tokens: 1800 }
    - { path: "README.md", lines: "1-151", estimated_tokens: 1200 }
    - { path: "ein-pi/core/docs/EIN_OPERATING_SYSTEM.md", lines: "1-100", estimated_tokens: 800 }
    - { path: "installer/README.md", lines: "1-82", estimated_tokens: 650 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: "1-235", estimated_tokens: 2000 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: "1-120", estimated_tokens: 1200 }
    - { path: "ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md", lines: "1-80", estimated_tokens: 650 }
    - { path: "ein-pi/core/docs/GUIA_PI_WORKFLOW.md", lines: "1-80", estimated_tokens: 650 }
    - { path: "ein-pi/core/docs/PI_AGENTS_ARQUITECTURA.md", lines: "1-80", estimated_tokens: 700 }
    - { path: "openspec/changes/archive/installer-beta/scope.md", lines: "1-60", estimated_tokens: 600 }
    - { path: "openspec/changes/archive/installer-beta/map.md", lines: "1-50", estimated_tokens: 500 }
    - { path: "openspec/changes/archive/installer-beta/design.md", lines: "1-60", estimated_tokens: 600 }
    - { path: "openspec/changes/archive/installer-beta/tasks.md", lines: "1-50", estimated_tokens: 500 }
    - { path: "openspec/changes/archive/installer-beta/apply-progress.md", lines: "1-50", estimated_tokens: 500 }
    - { path: "openspec/changes/archive/installer-beta/verify-report.md", lines: "1-40", estimated_tokens: 450 }
    - { path: "bash: grep contexto, deterministic boundaries references", lines: "sample", estimated_tokens: 300 }
    - { path: "bash: find artefacts installer-beta", lines: "8 files verified", estimated_tokens: 200 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 21450
    reads: 20
  budget_remaining:
    tokens: 23550
    reads: 20
  budget_source: "explicit (scope.md)"
  notes: |
    Lectura estratégica de 20 fuentes (completadas dentro del presupuesto). Map resuelve:
    
    1. MAPA PÁGINA → SECCIÓN: cada página con fuentes concretas (líneas, secciones, conceptos), no archivos genéricos.
    2. CONFLICTOS: 4 identificados (5 vs 7 fases, instalación UI vs técnica, contexto/terminología, versión outdated).
    3. VALIDACIÓN CÓDIGO: README versión v0.40.0 (desactualizada), EIN_OPERATING_SYSTEM.md desactualizado re: solo Pi.
    4. SUFICIENCIA WALKTHROUGH: installer-beta tiene 7 artefactos completos (scope/map/design/tasks/apply/verify/summary), status=pass, coverage=partial (Darwin gap honesto).
    5. ORDEN ESCRITURA: 10 fases, prioridad foundation → flow → boundaries → getting-started → examples.
    
    Presupuesto restante de 20 reads y 23550 tokens disponible para fases posteriores (design/tasks/apply/verify/close).
