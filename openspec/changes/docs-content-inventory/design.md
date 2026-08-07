status: ready
change: docs-content-inventory
phase: design
verified_rev: "0ae709d"
spec_delta: none
canonical_spec_context: none (scope.md declara `spec_delta: none` y no registra referencias canónicas; no se cargó ningún `openspec/specs/<domain>/spec.md` en esta fase)

# Design — docs-content-inventory (SLICE 1 de 2)

## A. Proposal

### Intent

Producir **10 esqueletos de página** en `docs-site/src/content/docs/` (áreas 00-start, 01-concepts, 02-workflow) más el artefacto interno `gap-inventory.md`, con un **contrato de página mecánicamente verificable** que fije frontmatter, estructura de secciones y marcado de contenido pendiente, de modo que la fase D pueda redactar sin re-decidir y la fase B pueda generar/validar bloques con un script.

### Scope

**Dentro:**
- Las 10 páginas markdown listadas en `scope.md` §Artefactos esperados, en estado *esqueleto*.
- `openspec/changes/docs-content-inventory/gap-inventory.md` con las 5 decisiones de hueco y los 3 defectos de fuente detectados.
- El contrato de página (frontmatter + secciones + marcador `PENDIENTE-D`) como especificación normativa de este cambio.

**Fuera (no-goals):**
- Prosa redactada, ejemplos narrados, traducciones de `orchestrator.md` → fase D.
- Instalación/configuración de Astro o Starlight, layout, componentes → fase C.
- Script generador de bloques automáticos y detector de drift → fase B (consume este contrato, no se escribe aquí).
- Áreas 03-runtimes / 04-reference / 05-debug → cambio hermano `docs-content-reference`.
- Corrección de los defectos hallados en ficheros fuente (`README.md`, `EIN_OPERATING_SYSTEM.md`): se anotan, no se tocan.
- Modificación de `openspec/config.yaml`: ver §D5.

### Affected areas

| Ruta | Acción |
|------|--------|
| `docs-site/src/content/docs/00-start/{overview,getting-started,first-run}.md` | crear (esqueleto) |
| `docs-site/src/content/docs/01-concepts/{orchestrator,sdd-openspec,context,deterministic-boundaries}.md` | crear (esqueleto) |
| `docs-site/src/content/docs/02-workflow/{workflow-overview,artifacts,real-workflow-example}.md` | crear (esqueleto) |
| `openspec/changes/docs-content-inventory/gap-inventory.md` | crear |

Ningún fichero existente se modifica. Ningún fichero fuera de estas rutas se escribe.

### Risks

1. **Deriva a prosa inventada en apply.** Mitigación: la regla de pureza de esqueleto (§B, SK-4) prohíbe párrafos libres; es comprobable con un comando, no con juicio.
2. **`sources` con rutas inexistentes o abreviadas.** El map cita fuentes por nombre corto (`orchestrator.md`, `EIN_OPERATING_SYSTEM.md`). Mitigación: la tabla canónica de rutas (§C1) es obligatoria y se verifica con `test -e`.
3. **Contaminación de versión o de capacidades no implementadas.** Mitigación: prohibición explícita de literales de versión y regla `[BETA-EXCLUDED]` (§B, CT-8/CT-9).
4. **`strict_tdd: true` sin runner.** No hay ciclo RED/GREEN natural. Mitigación y tratamiento honesto en §D5.

### Rollback

Todo el cambio es aditivo: `git rm -r docs-site/src/content/docs/` y `git rm openspec/changes/docs-content-inventory/gap-inventory.md` restauran el árbol. No hay migraciones, dependencias ni configuración tocada.

### Success criteria

Ver §D. Todos los criterios de aceptación son comandos, no valoraciones.

---

## B. Spec

### Contrato de frontmatter (CT)

**CT-1.** Cada página MUST empezar en la línea 1 con un bloque YAML delimitado por `---` que contenga **exactamente** cuatro claves, en este orden: `title`, `description`, `sources`, `verified_rev`. No se permiten claves adicionales (el estado de esqueleto se marca en el cuerpo, no en el frontmatter).

- `title`: string entre comillas dobles, una línea, no vacío, con sufijo ` · EIN` (p. ej. `"Overview · EIN"`).
- `description`: string entre comillas dobles, una sola frase, ≤ 160 caracteres, sin salto de línea.
- `sources`: lista YAML en línea (`["a", "b"]`) de ≥ 1 string. Cada string es una **ruta relativa a la raíz del repositorio**, en formato POSIX, que apunta a un **fichero existente** (nunca un directorio, nunca un nombre corto). Sin duplicados. Orden: el mismo que la sección `## Fuentes` del cuerpo.
- `verified_rev`: exactamente `"0ae709d"`.

> Given una página de `docs-site/src/content/docs/`
> When se parsea su frontmatter
> Then contiene las cuatro claves en orden, `verified_rev == "0ae709d"`, y cada entrada de `sources` existe como fichero en el repositorio.

**CT-2.** El cuerpo MUST empezar con un `#` H1 cuyo texto sea el `title` sin el sufijo ` · EIN`.

> Given una página con `title: "Context · EIN"`
> When se lee la primera línea tras el frontmatter
> Then es exactamente `# Context`.

**CT-3.** Cada página MUST contener este conjunto de encabezados `##`, todos presentes, en este orden exacto, sin ningún `##` adicional:

| # | Encabezado | Responde a | Contenido en esqueleto |
|---|------------|------------|------------------------|
| 1 | `## En una frase` | qué explica la página (lead with the answer) | 1 bloque `PENDIENTE-D` |
| 2 | `## Para quién y qué aprenderás` | para quién + qué se lleva el lector | 1 bloque `PENDIENTE-D` |
| 3 | `## Ruta rápida` | happy path numerado | 1 bloque `PENDIENTE-D` |
| 4 | `## Detalles` | el mapa página→sección del map | 1 `###` por fila de la tabla del map, cada uno con 1 bloque `PENDIENTE-D` |
| 5 | `## Checklist` | qué puede confirmar el lector | 1 bloque `PENDIENTE-D` |
| 6 | `## Siguiente paso` | continuación del recorrido | enlace o texto plano (ver CT-6) |
| 7 | `## Fuentes` | trazabilidad legible | lista real (ver CT-5) |

Los `###` bajo `## Detalles` MUST corresponder uno a uno con las filas de la tabla «Secciones y fuentes concretas» de esa página en `map.md`.

> Given `01-concepts/context.md`
> When se listan sus `##` en orden
> Then son los siete de la tabla, y bajo `## Detalles` hay seis `###` que reproducen las seis filas del map para esa página.

**CT-4.** El marcador de contenido pendiente MUST ser un bloque con esta forma literal, y es la ÚNICA forma admitida de contenido pendiente:

```
:::caution[PENDIENTE-D]
falta: <una línea: qué evidencia o redacción falta>
fuentes: <ruta1>, <ruta2>
lineas: <referencia de líneas o "n/a">
:::
```

- Las tres claves (`falta:`, `fuentes:`, `lineas:`) son obligatorias, en minúsculas, una por línea, en ese orden.
- Cada ruta de `fuentes:` MUST aparecer también en el `sources` del frontmatter.
- `lineas:` reproduce la referencia de líneas del map cuando existe (p. ej. `README.md:5-15`), o `n/a`.

> Given un bloque `PENDIENTE-D` en una página
> When se comparan sus rutas de `fuentes:` con el `sources` del frontmatter
> Then todas están contenidas en `sources`.

**CT-5.** `## Fuentes` MUST listar, con un ítem `-` por fuente, exactamente las mismas rutas del frontmatter `sources`, en el mismo orden, cada una seguida de ` — ` y de qué se extrae de ella. Esta sección es el único contenido factual permitido en un esqueleto porque es derivado, no redactado.

**CT-6.** `## Siguiente paso` MUST enlazar solo a páginas creadas por este cambio, con ruta relativa `.md`. Un destino que pertenezca al cambio hermano o a una fase futura se nombra en **texto plano**, nunca como enlace. Todo enlace relativo `.md` de cualquier página MUST resolver a un fichero existente.

**CT-7.** El orden de lectura (cadena de `## Siguiente paso`) es: `overview` → `getting-started` → `first-run` → `orchestrator` → `sdd-openspec` → `context` → `deterministic-boundaries` → `workflow-overview` → `artifacts` → `real-workflow-example` → (texto plano: área *Runtimes*, cambio hermano). Este orden es de **lectura**; el orden de **escritura** sigue siendo el de `map.md` §Orden de escritura.

**CT-8.** Ninguna página MUST contener un literal de versión de EIN (patrón `v?\d+\.\d+\.\d+`). Cuando haya que referirse a la release vigente, se enlaza a `https://github.com/samuhlo/ein-agent/releases/latest`.

**CT-9.** Toda mención a una capacidad sin evidencia de implementación según `docs/roadmap-beta.md` MUST llevar el tag literal `[BETA-EXCLUDED]` en la misma línea. En esqueleto, el tag va dentro de la línea `falta:` del bloque `PENDIENTE-D` correspondiente.

### Qué es un esqueleto (SK)

Un esqueleto es una página que **declara su estructura y su procedencia sin afirmar nada**. La distinción frente a una página a medio redactar es mecánica:

**SK-1.** Un esqueleto MUST cumplir CT-1…CT-9.

**SK-2.** Cada sección `##` de contenido (1, 2, 3, 5) y cada `###` bajo `## Detalles` MUST contener **exactamente un** bloque `PENDIENTE-D` y nada más.

**SK-3.** Un esqueleto MUST NOT contener prosa declarativa fuera de los bloques `PENDIENTE-D` y de la sección `## Fuentes`. Formalmente: tras eliminar frontmatter, encabezados, bloques `PENDIENTE-D`, los ítems de `## Fuentes`, la línea de `## Siguiente paso` y las líneas en blanco, **no debe quedar ninguna línea**.

**SK-4 (criterio discriminante).** Una página a medio redactar viola SK-2 o SK-3: tiene párrafos libres en una sección sin `PENDIENTE-D`, o mezcla prosa con el marcador. Un esqueleto válido tiene **cero líneas residuales**. `sdd-verify` decide por este resto, no por lectura interpretativa.

**SK-5.** Un esqueleto MUST NOT contener ejemplos de comandos, salidas de terminal, cifras ni nombres de fichero presentados como hecho, salvo los que aparezcan en `## Fuentes` o en la clave `lineas:`.

### Contrato de `gap-inventory.md` (GI)

**GI-1.** `openspec/changes/docs-content-inventory/gap-inventory.md` MUST existir y MUST NOT crearse bajo `docs-site/`.

**GI-2.** MUST contener la sección `## Decisiones de hueco` con **exactamente cinco** subsecciones `###`, una por hueco: `First Run`, `Deterministic Boundaries`, `Runtime Matrix`, `Real Workflow Example`, `Known Limitations`.

**GI-3.** Cada `###` MUST contener estas seis claves, una por línea, en este orden:

```
area: 00-start | 01-concepts | 02-workflow | 03-runtimes | 05-debug
cambio_propietario: docs-content-inventory | docs-content-reference
decision: <una línea>
fuentes_candidatas: <rutas relativas al repo separadas por coma, o "ninguna (bloqueado)">
falta: <qué evidencia falta>
estado: esqueleto-en-A | bloqueado
```

**GI-4.** La entrada con `estado: bloqueado` (Known Limitations) MUST añadir una séptima clave `desbloqueante:` que nombre la condición concreta: *merge de `feat/shared-project-state-contract` en `main`; hasta entonces su matriz beta no es fuente legible*. Su `fuentes_candidatas` MUST ser `ninguna (bloqueado)`; ninguna ruta de esa rama puede aparecer en el artefacto.

**GI-5.** MUST contener la sección `## Defectos de fuente detectados` con una tabla de **exactamente tres** filas de datos y columnas `id | fichero:linea | defecto | evidencia | propietario | accion`:

| id | fichero:linea | defecto | evidencia | propietario | accion |
|----|---------------|---------|-----------|-------------|--------|
| D1 | `README.md:121` | declara `EIN v0.40.0` como última release | `installer/package.json` = `0.42.0` | fuera de alcance | cambio de mantenimiento posterior |
| D2 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:9,11` | presenta Pi como único runtime | `README.md:11` declara `pi-ein` y `cc-ein` | fuera de alcance | cambio de mantenimiento posterior |
| D3 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:72,75` | **se contradice a sí mismo**: la línea 72 dice «5 fases», la 75 enumera siete | mismo fichero, líneas contiguas | fuera de alcance | cambio de mantenimiento posterior |

**GI-6.** `gap-inventory.md` MUST declarar explícitamente que estos tres defectos **no se corrigen en este cambio** por estar en ficheros fuente fuera de su alcance.

---

## C. Decisions

### C1. Tabla canónica de rutas de fuente (obligatoria en `sources`)

El map cita fuentes por nombre corto. La forma canónica que debe aparecer en frontmatter es:

| Nombre en el map | Ruta canónica |
|------------------|---------------|
| README.md | `README.md` |
| installer/README.md | `installer/README.md` |
| EIN_OPERATING_SYSTEM.md | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` |
| EIN_DOCUMENTATION_BRIEF.md | `docs/EIN_DOCUMENTATION_BRIEF.md` |
| roadmap-beta.md | `docs/roadmap-beta.md` |
| orchestrator.md | `ein-pi/agent/assets/orchestrator.md` |
| SDD_ARTIFACT_GRAMMAR.md | `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` |
| GUIA_PI_WORKFLOW.md | `ein-pi/core/docs/GUIA_PI_WORKFLOW.md` |
| PI_AGENTS_ARQUITECTURA.md | `ein-pi/core/docs/PI_AGENTS_ARQUITECTURA.md` |
| sdd-lifecycle/spec.md | `openspec/specs/sdd-lifecycle/spec.md` |
| installer-beta/* | los 7 ficheros concretos de `openspec/changes/archive/installer-beta/` |

Un directorio nunca es una fuente válida: `openspec/changes/archive/installer-beta/` se expande a `scope.md`, `map.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `summary.md` (los siete verificados como existentes).

### C2. Los conflictos, bajados a página

| Conflicto | Autoridad | Aplicación página a página |
|-----------|-----------|----------------------------|
| **Runtimes: solo Pi vs dos adaptadores** | `README.md:11` | `overview.md` nombra **ambos runtimes (`pi-ein` y `cc-ein`) en la sección `## En una frase`**; `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` permanece en `sources` solo para «qué problema resuelve» y experiencia de usuario, y **nunca** como fuente de la lista de runtimes. Ninguna página describe EIN como harness exclusivo de Pi. |
| **Instalación: experiencia vs mecanismo** | `README.md` + `installer/README.md` | `getting-started.md`: comandos, requisitos, selección de runtime y `ein doctor` provienen **solo** de `README.md` e `installer/README.md`; `EIN_OPERATING_SYSTEM.md` **no es fuente de comandos** en esta página. La descripción de «lo que ve el usuario» (menú, elección) vive en `overview.md`, no en `getting-started.md`. |
| **Terminología de contexto** | `ein-pi/agent/assets/orchestrator.md` | `context.md` es el **único** lugar donde se define el glosario: *ventana de contexto*, *contexto fresh* vs *contexto fork*, *presupuesto de tokens (`max_tokens`)*, *presupuesto de lecturas (`max_reads`)*. «Horizonte de decisión» (`docs/EIN_DOCUMENTATION_BRIEF.md`) se declara **una vez** como sinónimo de *presupuesto de contexto* y no se vuelve a usar como término independiente. `orchestrator.md`, `workflow-overview.md` y `deterministic-boundaries.md` enlazan a `context.md` y **no redefinen** ninguno de esos términos. |
| **Versión** | ninguna fuente | Ninguna página fija número de versión (CT-8). `overview.md` y `getting-started.md` enlazan a `https://github.com/samuhlo/ein-agent/releases/latest`. El estado del producto se expresa como **beta** citando `docs/roadmap-beta.md`, nunca como SemVer. |
| **Fases: 5 vs 7** (corrección al map) | siete fases | No es un desacuerdo entre ficheros: `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` **se contradice a sí mismo** (línea 72 «Son 5 fases», línea 75 enumera `scope → map → design → tasks → apply → verify → close`). Autoridad: **siete fases**. `sdd-openspec.md`, `workflow-overview.md`, `artifacts.md`, `first-run.md` y `real-workflow-example.md` nombran siempre las siete y **no listan `EIN_OPERATING_SYSTEM.md` en `sources` para la sección del recuento de fases**. Defecto anotado como D3 en `gap-inventory.md`. |
| **Modelo vs herramienta vs garantía** | `orchestrator.md` (mecanismo) + `docs/EIN_DOCUMENTATION_BRIEF.md` (lectura de usuario) | `deterministic-boundaries.md` es la **única** página que fija la tabla de cuatro columnas (decide el modelo / comprueba la herramienta / garantiza EIN / solo se observa). Las demás páginas enlazan a ella. |

### C3. Fronteras de responsabilidad

| Responsabilidad | Propietario |
|-----------------|-------------|
| Contrato de página (frontmatter, secciones, `PENDIENTE-D`) | este `design.md` |
| Corte en lotes ejecutables y orden de escritura | `tasks.md` (fase tasks), tomando el orden de `map.md` |
| Escritura de los 10 esqueletos y de `gap-inventory.md` | fase apply |
| Comprobación mecánica del contrato | fase verify (§D) |
| Generador de bloques automáticos y detector de drift | fase B (consume CT-1…CT-9 como formato de entrada) |
| Prosa final de cada `PENDIENTE-D` | fase D |
| Corrección de D1/D2/D3 en ficheros fuente | cambio de mantenimiento posterior, no este |

### C4. Alternativas rechazadas

- **Marcar el estado pendiente con una clave extra de frontmatter (`status: skeleton`).** Rechazada: `scope.md` §Decisión 7 fija exactamente cuatro campos, y una quinta clave se convierte en estado duplicado que la fase D tendría que recordar borrar. El marcado vive en el cuerpo, donde es visible y localmente eliminable.
- **Comentarios HTML (`<!-- TODO -->`) como marcador.** Rechazada: invisibles al renderizar, una página quedaría publicada casi vacía pareciendo terminada — justo lo contrario del requisito «que no parezca contenido real».
- **Plantilla libre por página.** Rechazada: sin conjunto fijo de `##` no hay comprobación mecánica posible ni contrato estable para la fase B.
- **Escribir prosa mínima «de relleno» en cada sección.** Rechazada: viola la restricción de honestidad de `scope.md` (ninguna afirmación sin fuente) y borra la frontera A↔D.
- **`core-parity` como walkthrough.** Ya rechazada en scope/map; se conserva `installer-beta`.

---

## D. Success Criteria

### D1. Estructura y frontmatter

1. Existen exactamente 10 ficheros bajo `docs-site/src/content/docs/`, en las rutas de §A.Affected areas, y ninguno más.
   `find docs-site/src/content/docs -name '*.md' | sort | wc -l` → `10`.
2. Cada uno tiene frontmatter con las cuatro claves en orden y ninguna más.
3. `grep -L 'verified_rev: "0ae709d"' $(find docs-site/src/content/docs -name '*.md')` → vacío.
4. Cada ruta declarada en `sources` existe: extraer las rutas entrecomilladas de la línea `sources:` y comprobar `test -e` en todas → 0 fallos.

### D2. Contrato de secciones y esqueleto

5. En cada página, la lista de `^## ` es exactamente la de CT-3, en orden.
6. Cada sección de contenido y cada `###` bajo `## Detalles` contiene exactamente un `:::caution[PENDIENTE-D]` y su cierre `:::`.
7. Cada bloque `PENDIENTE-D` tiene las líneas `falta:`, `fuentes:`, `lineas:`; toda ruta de `fuentes:` está en el `sources` del frontmatter.
8. **Pureza de esqueleto (SK-3/SK-4):** tras filtrar frontmatter, encabezados, bloques `PENDIENTE-D`, ítems de `## Fuentes`, la línea de `## Siguiente paso` y líneas en blanco, el resto es vacío en las 10 páginas.
9. `grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+' docs-site/src/content/docs` → sin coincidencias (CT-8).
10. Todo enlace relativo `.md` resuelve a uno de los 10 ficheros; `## Siguiente paso` sigue la cadena de CT-7 y la última página no enlaza a contenido inexistente.

### D3. Reglas de conflicto

11. `00-start/overview.md` menciona `pi-ein` y `cc-ein` en `## En una frase`; ninguna página afirma que EIN sea exclusivo de Pi.
12. `00-start/getting-started.md` no incluye `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` en `sources`.
13. Ninguna página que trate el recuento de fases usa `EIN_OPERATING_SYSTEM.md` como fuente de esa sección; donde aparece la secuencia SDD, aparecen las siete fases con `close`.
14. La definición de `fork`/`fresh`/`max_tokens`/`max_reads` aparece únicamente en `01-concepts/context.md`; la tabla modelo/herramienta/garantía/observable únicamente en `01-concepts/deterministic-boundaries.md`.

### D4. `gap-inventory.md`

15. Existe en `openspec/changes/docs-content-inventory/gap-inventory.md` y no existe ningún `gap-inventory.md` bajo `docs-site/`.
16. `## Decisiones de hueco` tiene exactamente cinco `###` con los cinco nombres de GI-2, y cada uno las seis claves de GI-3.
17. La entrada `Known Limitations` tiene `estado: bloqueado`, `fuentes_candidatas: ninguna (bloqueado)` y una clave `desbloqueante:` que nombra el merge de `feat/shared-project-state-contract`.
18. `grep -rn 'shared-project-state-contract' openspec/changes/docs-content-inventory/ docs-site/` solo aparece como nombre de rama en el campo `desbloqueante:`; ninguna ruta de esa rama es citada como fuente.
19. `## Defectos de fuente detectados` tiene exactamente tres filas de datos (D1, D2, D3) con las columnas de GI-5, y una frase explícita de que no se corrigen aquí.

### D5. Tratamiento de `strict_tdd` (declaración honesta)

`openspec/config.yaml` declara `strict_tdd: true`, pero `rules.apply.test_command` y `rules.verify.test_command` están vacíos y el propio fichero registra *«No reliable test runner was detected»*. La salida de este cambio es markdown sin comportamiento ejecutable.

**Conclusión explícita: `strict_tdd: true` no es satisfacible para este cambio.** No hay ciclo RED/GREEN posible porque no hay unidad ejecutable que pueda fallar primero. Fingir ciclos TDD sería falsificar evidencia.

Tratamiento propuesto (este design **no** modifica `openspec/config.yaml`):

1. `apply-progress.md` declara `tdd: not-applicable — documentation-only change, no test runner configured (openspec/config.yaml: test_command vacío)`, y en lugar de ciclos registra, por lote, los checks D1–D4 ejecutados con su salida.
2. Los checks D1–D4 hacen de **gate mecánico sustitutivo**: se ejecutan primero sobre el árbol vacío (fallan, evidencia equivalente a RED) y de nuevo tras escribir cada lote (pasan, equivalente a GREEN). Son comandos `find`/`grep`/`test` ad hoc; **no** se crea ningún script — eso pertenece a la fase B.
3. `sdd-verify` acepta el cambio si y solo si los 19 criterios de D1–D4 pasan; ningún criterio depende de juicio editorial sobre la calidad de la prosa (no hay prosa que juzgar en A).
4. Si el gate SDD rechaza `tdd: not-applicable`, `sdd-verify` MUST devolver `blocked` nombrando esa incompatibilidad y el parent decide sobre `openspec/config.yaml`. Ni design, ni apply, ni verify tocan ese fichero por su cuenta.
