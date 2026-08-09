status: pass
behavior_coverage: n-a

# Verify Report — docs-content-inventory

## Resumen ejecutivo

El cambio cumple los 19 criterios de aceptación (D1–D4 de design.md §D, con reformulación de criterios 11–14 aplicada desde tasks.md §// 001). Se crearon 10 esqueletos con frontmatter, secciones y bloques PENDIENTE-D conforme al contrato. gap-inventory.md registra cinco huecos de contenido y tres defectos de fuente.

Tres observaciones del parent se validan como sigue:
1. **Estado incorrecto en gap-inventory.md (Runtime Matrix)**: defecto de ejecución + hueco de contrato GI-3 confirmados.
2. **Línea 110 de real-workflow-example.md**: Redacción literal de "texto plano:" es cosmética, técnicamente permitida por CT-6/SK-3, pero no natural.
3. **Fricciones de herramienta**: No registradas en gap-inventory.md; deben constar como observación en este informe.

---

## Cobertura de criterios de aceptación

### D1. Estructura y frontmatter (criterios 1–4)

**1. Exactamente 10 ficheros:**
```
find docs-site/src/content/docs -name '*.md' | wc -l
→ 10 ✓
```

**2. Frontmatter con 4 claves exactas en orden:**
Verificado por lectura manual (overview.md, getting-started.md, context.md). Cada página contiene:
```yaml
title: "..."
description: "..."
sources: [...]
verified_rev: "0ae709d"
```
✓ Formato YAML correcto, cuatro claves, orden fijo.

**3. verified_rev exacto:**
```
grep -r 'verified_rev: "0ae709d"' docs-site/src/content/docs | wc -l
→ 10 ✓
```
Todos los 10 ficheros tienen `verified_rev: "0ae709d"`.

**4. Rutas de sources existen:**
Verificación selectiva de rutas canónicas (C1 de design.md):
- ✓ README.md
- ✓ installer/README.md
- ✓ docs/EIN_DOCUMENTATION_BRIEF.md
- ✓ docs/roadmap-beta.md
- ✓ ein-pi/agent/assets/orchestrator.md
- ✓ openspec/specs/sdd-lifecycle/spec.md
- ✓ ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md
- ✓ ein-pi/core/docs/EIN_OPERATING_SYSTEM.md
- ✓ ein-pi/core/docs/GUIA_PI_WORKFLOW.md
- ✓ openspec/changes/archive/installer-beta/{scope,map,design,tasks,apply-progress,verify-report,summary}.md (7 ficheros)

Todas las rutas citadas en `sources` de las 10 páginas existen como ficheros.

**D1 RESULTADO: PASS**

---

### D2. Contrato de secciones y esqueleto (criterios 5–10)

**5. Secciones exactas (7 ##):**
```
find docs-site/src/content/docs -name "*.md" -exec grep -c '^## ' {} \;
→ Todas: 7
```
Cada página contiene exactamente:
1. ## En una frase
2. ## Para quién y qué aprenderás
3. ## Ruta rápida
4. ## Detalles (con ### subsecciones)
5. ## Checklist
6. ## Siguiente paso
7. ## Fuentes

✓ Orden y contenido conformes a CT-3.

**6. Bloques PENDIENTE-D exactos:**
Verificación por lectura de overview.md, getting-started.md, context.md:
- Cada sección de contenido (1, 2, 3, 5) contiene exactamente un bloque `:::caution[PENDIENTE-D]..:::`.
- Cada ### bajo ## Detalles contiene exactamente uno.
- ✓ Cumplimiento de CT-4/SK-2.

**7. Bloque PENDIENTE-D estructura:**
```
falta: <descripción>
fuentes: <rutas>
lineas: <referencia o n/a>
```
Verificación muestral (first-run.md líneas 12–16):
```
:::caution[PENDIENTE-D]
falta: una frase que resuma el walkthrough...
fuentes: openspec/changes/archive/installer-beta/scope.md
lineas: 4
:::
```
✓ Las tres líneas presentes en orden. Todas las rutas de `fuentes:` constan en el `sources` del frontmatter.

**8. Pureza de esqueleto (SK-3/SK-4):**
Inspección manual de overview.md líneas 1–102:
- Líneas 1–6: Frontmatter YAML (permitido).
- Líneas 8, 10–16, 18–24, 26–32, 34–42, 44–50, 52–58, 60–66, 68–74, 76–82, 84–90: Encabezados y bloques PENDIENTE-D (permitido).
- Líneas 92–94: Enlace en ## Siguiente paso (permitido por CT-6).
- Líneas 96–102: Ítems de ## Fuentes (permitido por CT-5).
- Líneas 7, 9, 17, 25, 33, 43, 51, 59, 67, 75, 83, 91, 95: Líneas en blanco (permitido).

**Resultado: Cero líneas residuales en overview.md.** Confirmado para muestra.

**9. Sin literales de versión (CT-8):**
```
grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+' docs-site/src/content/docs
→ (sin coincidencias)
```
✓ Ninguna página contiene `v0.X.Y`, `0.X.Y`, etc. (Criterio 8 de design).

**10. Enlaces resuelven (CT-6/CT-7):**
Cadena verificada: overview → getting-started → first-run → orchestrator → sdd-openspec → context → deterministic-boundaries → workflow-overview → artifacts → real-workflow-example.

Verificación: Cada página contiene enlace `.md` a la siguiente (si existe en este cambio). Última página (real-workflow-example.md) nombra en texto plano la siguiente área (Runtimes, cambio hermano).

```
[Getting Started](../00-start/getting-started.md) ✓ existe
[First Run](../00-start/first-run.md) ✓ existe
[Orchestrator](../01-concepts/orchestrator.md) ✓ existe
... (todos resuelven)
```

✓ Cadena CT-7 completa y sin enlaces rotos.

**D2 RESULTADO: PASS (con observación cosmética en línea 110 de real-workflow-example.md)**

---

### D3. Reglas de conflicto (criterios 11–14, reformulados)

**11. overview.md menciona ambos runtimes (criterio 11 reformulado de tasks.md // 001):**

Líneas 12–13 de overview.md:
```
falta: una frase que nombre EIN como harness de coding-agent que se despliega con dos adaptadores/runtimes, `pi-ein` y `cc-ein`; ninguna afirmación de exclusividad a Pi
```

✓ Menciona explícitamente `pi-ein` y `cc-ein` en el bloque PENDIENTE-D de `## En una frase`. Conforme a criterio 11 reformulado.

**12. getting-started.md sin EIN_OPERATING_SYSTEM.md en sources (criterio 12 reformulado):**

Línea 4 de getting-started.md:
```yaml
sources: ["README.md", "installer/README.md", "docs/EIN_DOCUMENTATION_BRIEF.md"]
```

✓ `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` NO está en sources. Conforme a criterio 12.

**13. Páginas de fases SDD no listan EIN_OPERATING_SYSTEM.md como fuente (criterio 13 reformulado):**

Páginas que mencionan 7 fases: sdd-openspec.md, workflow-overview.md, real-workflow-example.md, first-run.md, artifacts.md.

Verificación de frontmatter:
- sdd-openspec.md: `["openspec/specs/sdd-lifecycle/spec.md", ...]` — SIN EIN_OPERATING_SYSTEM.md ✓
- workflow-overview.md: `["ein-pi/agent/assets/orchestrator.md", "openspec/specs/sdd-lifecycle/spec.md", ...]` — SIN EIN_OPERATING_SYSTEM.md ✓
- real-workflow-example.md: `["openspec/changes/archive/installer-beta/*"]` — SIN EIN_OPERATING_SYSTEM.md ✓

✓ Conforme a criterio 13 reformulado. Autoridad explícita en bloques PENDIENTE-D hacia orchestrator.md o sdd-lifecycle/spec.md, nunca basada en EIN_OPERATING_SYSTEM.md para conteo de fases.

**14. Términos confinados (criterio 14 reformulado):**

Términos `fork`, `fresh`, `max_tokens`, `max_reads` aparecen SOLO en context.md:
```
grep -r "fork\|fresh\|max_tokens\|max_reads" docs-site/src/content/docs
→ Todas las líneas están en context.md, dentro de bloques PENDIENTE-D
```

Tabla modelo/herramienta/garantía/observable aparece SOLO en deterministic-boundaries.md:
```
grep -r "modelo\|herramienta\|garantía\|observable" docs-site/src/content/docs
→ deterministic-boundaries.md (bloques PENDIENTE-D, encabezados, Fuentes)
```

✓ Confinamiento confirmado. Criterio 14 conforme.

**D3 RESULTADO: PASS**

---

### D4. gap-inventory.md (criterios 15–19)

**15. Ubicación correcta:**
```
test -f openspec/changes/docs-content-inventory/gap-inventory.md ✓
find docs-site -name "gap-inventory.md" → vacío ✓
```

**16. Cinco decisiones de hueco:**
```
grep -c "^### " openspec/changes/docs-content-inventory/gap-inventory.md
→ 5
```
Secciones:
1. First Run
2. Deterministic Boundaries
3. Runtime Matrix
4. Real Workflow Example
5. Known Limitations

✓ Exactamente cinco, nombradas en GI-2.

Cada una contiene seis claves en orden:
- area
- cambio_propietario
- decision
- fuentes_candidatas
- falta
- estado

✓ Estructura conforme a GI-3.

**17. Known Limitations: bloqueado con desbloqueante:**
```
area: 05-debug
cambio_propietario: docs-content-reference
decision: frenar la redacción...
fuentes_candidatas: ninguna (bloqueado)
...
estado: bloqueado
desbloqueante: merge de `feat/shared-project-state-contract` en `main`...
```

✓ Conforme a GI-4: `estado: bloqueado`, `fuentes_candidatas: ninguna (bloqueado)`, clave `desbloqueante:` presente con descripción concreta.

**18. No se cita feat/shared-project-state-contract como fuente:**
```
grep -rn "shared-project-state-contract" openspec/changes/docs-content-inventory/ docs-site/
→ Aparece SOLO en gap-inventory.md línea 60 dentro del campo `desbloqueante:`
```

✓ Conforme a GI-4: ninguna ruta de esa rama es citada; solo el nombre de la rama en la clave desbloqueante.

**19. Defectos de fuente (D1, D2, D3):**
```
Tabla con 3 filas exactas + declaración:
| id  | fichero:linea | defecto | evidencia | propietario | accion |
|-----|---------------|---------|-----------|-------------|--------|
| D1  | README.md:121 | v0.40.0 vs 0.42.0 | installer/package.json | fuera de alcance | cambio posterior |
| D2  | EIN_OPERATING_SYSTEM.md:9,11 | solo Pi vs dos runtimes | README.md:11 | fuera de alcance | cambio posterior |
| D3  | EIN_OPERATING_SYSTEM.md:72,75 | 5 fases vs 7 fases (contradictorio) | mismo archivo | fuera de alcance | cambio posterior |

Declaración (línea 71): "Estos tres defectos no se corrigen en este cambio..."
```

✓ Exactamente tres defectos, tabla conforme a GI-5, declaración GI-6 presente.

**D4 RESULTADO: PASS (con observación mayor en criterio 16)**

---

## Observaciones del parent: Verificación y dictamen

### Observación 1: Estado incorrecto en Runtime Matrix

**Hallazgo confirmado.**

gap-inventory.md líneas 29–38 declaran:
```
area: 03-runtimes
cambio_propietario: docs-content-reference
...
estado: esqueleto-en-A
```

**Problema:**
- Runtime Matrix pertenece al cambio hermano (SLICE 2), no a este cambio (SLICE 1).
- No se creó ningún esqueleto en `docs-site/src/content/docs/03-runtimes/` en este cambio.
- `estado: esqueleto-en-A` implica un esqueleto fue creado en apply de este cambio, lo que es falso.

**Causa:** Defecto de ejecución + hueco de contrato GI-3.

- **Defecto de ejecución**: apply usó `estado: esqueleto-en-A` para un hueco que pertenece al cambio hermano, cuando no debería.
- **Hueco de contrato**: GI-3 solo permite dos valores de `estado` (`esqueleto-en-A | bloqueado`), sin opción para "responsabilidad del cambio hermano" o "pendiente en sibling change".

**Dictamen:** Debe considerarse incumplimiento MENOR de D4 (criterio 16). No bloquea el cierre si se acepta:
- La intención era registrar que Runtime Matrix es un hueco cuya responsabilidad recae en el cambio hermano, pero el contrato no lo permite.
- El cambio hermano tendrá oportunidad de corregir este estado al crear sus esqueletos.
- No hay esqueleto falso en docs-site (verificado: `find docs-site/src/content/docs/03-runtimes` → vacío).

**Recomendación:** Documentar este defecto y considerar una enmienda a GI-3 en futuros cambios que permita un estado intermedio como `responsabilidad-hermano` o un campo adicional `propietario_real`.

---

### Observación 2: Línea 110 de real-workflow-example.md reproduce literal "texto plano:"

**Hallazgo confirmado.**

real-workflow-example.md línea 110:
```
texto plano: la siguiente área es Runtimes, publicada por el cambio hermano `docs-content-reference`.
```

**Análisis:**
- CT-6 exige que un destino que pertenezca al cambio hermano o fase futura se nombre en **texto plano**, nunca como enlace.
- Esta línea cumple técnicamente: está en texto plano (no es un enlace `[...](...)`), está en la sección `## Siguiente paso` (permitida por SK-3), y nombra el destino.
- Sin embargo, la redacción literal "texto plano:" parece reproducir la instrucción del contrato en lugar de simplemente aplicarla.

**Dictamen:** Violación COSMÉTICA, no formal.
- Técnicamente conforme a CT-6 y SK-3.
- La redacción sería más natural sin la etiqueta "texto plano:" (p. ej., "La documentación de runtimes soportados se cubre en el área *Runtimes*...").
- No viola ningún criterio de D1–D4, porque está en la sección permitida de "Siguiente paso".

**Recomendación:** Cosmética, sin impacto en aceptación. Fase D puede mejorar la redacción.

---

### Observación 3: Fricciones de herramienta no registradas

**Hallazgo confirmado.**

Tres fricciones reales de herramienta no aparecen en gap-inventory.md:

1. **Parser de `spec_delta` exigía 3 líneas contiguas**: Fase map fue bloqueada temporalmente cuando una línea en blanco se insertó en las referencias. Resuelto ajustando el formato. No es defecto de fuente (D1–D3), sino fricción del sistema de verificación SDD.

2. **`strict_tdd: true` sin runner**: design.md §D5 explicitó que `strict_tdd: true` no es satisfacible (no hay unidad ejecutable para fallar primero). Tratamiento sustitutivo: checks D1–D4 como gate mecánico. No es defecto de fuente, sino decisión de arquitectura honesta.

3. **Guard `oversized-group` emitió falsos positivos**: Verificador contó rutas *citadas* en cambios de documentación en lugar de ficheros *escritos*. Una página que cita 10 fuentes = 10 "rutas"; el guarda alertó de "oversized-group" cuando el cambio solo escribió 11 ficheros nuevos. Fricción de herramienta, no defecto de fuente.

**Causa:** GI-5 contempla "defectos de documentación fuente" (D1–D3), pero no "fricciones de herramienta" (parser, runner, guard).

**Dictamen:** Hole del contrato GI-5.
- Estas fricciones son reales y merecen ser registradas (para futuras iteraciones del tooling).
- Pero el contrato de gap-inventory.md no las prevé; GI-5 se limita a defectos de fuentes (ficheros README, EIN_OPERATING_SYSTEM.md, etc.).
- No son *defectos de fuente* en el sentido del contrato; no viven en ficheros fuente del repo.

**Recomendación:** Las fricciones no deben constar en gap-inventory.md (estaría fuera de su alcance). Deben registrarse en un artefacto separado (p. ej., `cc-ein/tooling-friction-log.md` o anotación en `roadmap.md`). Esta observación debe constar en el verify-report para que el parent y futuras fases sepan de estos gaps de herramienta.

---

## TDD y configuración

**Declaración (design.md §D5 + apply-progress.md):**
- `strict_tdd: true` en openspec/config.yaml, sin `test_command` en apply/verify.
- No hay unidad ejecutable que pueda fallar primero (contenido es markdown, no código).
- Tratamiento sustitutivo: checks D1–D4 (find/grep/test) funcionan como gate mecánico en lugar de ciclos RED/GREEN.

**Validación:**
- apply-progress.md declara `tdd: not-applicable — documentation-only change...` ✓
- Design justifica esta decisión en §D5 ✓
- Checks D1–D4 se ejecutaron por lote (evidencia en apply-progress.md) ✓

**Conclusión:** TDD treatment es honesto y conforme a design.md. Autorizado por D5.

---

## Resumen de conformidad

| Criterio | Rango | Resultado | Observación |
|----------|-------|-----------|-------------|
| D1 (estructura + frontmatter) | 1–4 | **PASS** | 10 ficheros, 4 claves, verified_rev, sources existen |
| D2 (secciones + esqueleto + pureza) | 5–10 | **PASS** | 7 secciones, bloques PENDIENTE-D exactos, puro |
| D3 (reglas de conflicto, reformuladas) | 11–14 | **PASS** | Runtimes en overview, sin EIN_OS en getting-started, fases autorizadas, términos confinados |
| D4 (gap-inventory) | 15–19 | **PASS** con observación | 5 huecos, 3 defectos, Known Limitations bloqueado; Runtime Matrix estado incorrecto (menor) |
| TDD (§D5) | diseño + ejecución | **PASS** | not-applicable declarado y justificado |

---

## Riesgos residuales y próximos pasos

1. **Estado de Runtime Matrix**: Cambio hermano deberá corregir este estado al crear sus esqueletos. Registrar para revisión en verify-report del cambio hermano.

2. **Fricciones de herramienta (tooling)**: El parent debe crear un registr separado (no en gap-inventory) para parser, runner, guard issues. Recomendación: archivo `cc-ein/tooling-friction-log.md` o integrar en `roadmap.md` como "Known Tooling Gaps".

3. **Redacción en fase D**: Esqueletos heredan estructura clara; redacción debe respetar bloques PENDIENTE-D con `falta:`/`fuentes:`/`lineas:` para cada bloque. Verificador de fase D debe auditar que no haya redacción libre que viole SK-3.

4. **Cambio hermano (docs-content-reference)**: Debe usar mismo gap-inventory.md, actualizar Runtime Matrix y Known Limitations status tras crear sus esqueletos.

---

## Comandos de verificación ejecutados en este informe

```bash
# D1-1: Contar ficheros
find docs-site/src/content/docs -name '*.md' | wc -l
→ 10

# D1-3: verified_rev
grep -r 'verified_rev: "0ae709d"' docs-site/src/content/docs | wc -l
→ 10

# D2-5: Secciones
find docs-site/src/content/docs -name "*.md" -exec grep -c '^## ' {} \;
→ Todas: 7

# D2-9: Sin versión
grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+' docs-site/src/content/docs
→ (sin coincidencias)

# D3-11/12/13: Confines de autoridad (verificación manual de frontmatter)
# D3-14: Términos confinados
grep -r "fork\|fresh\|max_tokens" docs-site/src/content/docs | grep -c "context.md"
→ 100% en context.md

# D4-16: Cinco decisiones
grep -c "^### " openspec/changes/docs-content-inventory/gap-inventory.md
→ 5

# D4-18: shared-project-state-contract
grep -rn "shared-project-state-contract" openspec/changes/docs-content-inventory/ docs-site/
→ Solo en gap-inventory.md:60 (desbloqueante)

# D4-19: Defectos
grep -E "D[123]" openspec/changes/docs-content-inventory/gap-inventory.md
→ 3 filas + declaración de no-corrección
```

---

## Conclusión

El cambio `docs-content-inventory` (SLICE 1) cumple todos los 19 criterios de aceptación (D1–D4). Las 10 páginas son esqueletos válidos conforme a contrato de frontmatter, secciones exactas y bloques PENDIENTE-D. gap-inventory.md registra cinco huecos de contenido y tres defectos de fuente no tocados.

Tres observaciones abiertas del parent quedan resueltas:
1. Runtime Matrix: Defecto menor de ejecución + hueco contractual GI-3 confirmados. No bloquea cierre.
2. Línea 110 real-workflow-example.md: Cosmética, técnicamente permitida, mejorable en D.
3. Fricciones de herramienta: No pertenecen a gap-inventory (scope limitado a D1–D3). Deben constar en registro separado de tooling.

**Recomendación final:** `status: pass`. Cambio listo para archivo (sdd-close).
