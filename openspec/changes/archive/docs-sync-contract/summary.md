# Summary — docs-sync-contract

status: pass
change: docs-sync-contract
behavior_coverage: verified

Fase B del plan de documentación pública de EIN. A diferencia de las dos
anteriores, que producían markdown y declararon `tdd: not-applicable`, esta
produce comportamiento ejecutable y se verificó ejecutándolo: 49 tests en verde
y el detector corrido sobre las 21 páginas reales.

## Qué se produjo

- **`ein-pi/agent/lib/docs-site-contract.ts`** — validador del contrato de
  página. `parsePage()` descompone una página en frontmatter, secciones y
  bloques pendientes; ocho funciones `lint*` comprueban una familia de reglas
  cada una (`lintFrontmatter`, `lintHeadings`, `lintPendingBlocks`,
  `lintSourcesSection`, `lintLinks`, `lintLineRules`, `lintSectionPurity`);
  `lintPage()` agrega para una página y `lintDocsTree()` para el árbol
  completo.
- **`ein-pi/agent/lib/docs-site-drift-detector.ts`** — detector de procedencia
  desfasada. `detectDrift()` compara las fuentes declaradas por cada página
  contra sus cambios en git desde el `verified_rev` de esa página;
  `collectDriftPageInputs()`, `formatDriftReport()` y `driftExitCode()`
  completan el informe, con punto de entrada ejecutable
  (`bun ein-pi/agent/lib/docs-site-drift-detector.ts`).
- **Tres suites de test**: `tests/docs-site-contract.test.ts` (37),
  `tests/docs-site-drift-detector.test.ts` (6) y
  `tests/docs-site-drift-report.test.ts` (6).
- **Job `docs-contract` en `.github/workflows/ci.yml`**, con `fetch-depth: 0`,
  el validador como paso bloqueante y el detector como paso informativo.
- **Corrección de `openspec/config.yaml`**: declaraba que no se había detectado
  runner de tests cuando el repositorio tiene 94 ficheros de test y `bun test`
  funciona. Consecuencia que trasciende este cambio: `strict_tdd: true` pasa a
  ser satisfacible para cualquier cambio con código.

## Qué resuelve

El contrato de página existía como texto dentro de un `design.md` archivado, y
se comprobaba con `grep` y `find` escritos a mano en cada fase y desechados
después. Ahora es ejecutable y reutilizable: la fase D puede validar mientras
redacta en lugar de descubrir al final que rompió una regla.

## Cómo distingue esqueleto de página redactada

Sin añadir una quinta clave al frontmatter, que CT-1 prohíbe y que el design de
la fase A rechazó explícitamente por ser estado duplicado.

La pureza se evalúa **por sección**, con el marcador `PENDIENTE-D` como
interruptor: una sección que todavía lo tiene debe seguir sin prosa; una ya
redactada queda fuera del alcance de la regla. El tipo `SectionState`
(`pending | drafted | empty | structural`) materializa esa distinción.

Eso permite que la fase D redacte de forma incremental sin que el validador se
vuelva un estorbo, que era el defecto del diseño inicial: una pureza evaluada
por página habría rechazado las 21 en cuanto empezara la redacción.

## Verificación

- **49 tests en verde** entre las tres suites.
- **Detector sobre el árbol real**: 12 clean, 9 drifted, 0 unknown, salida 2.
- **CI en verde**: run `31190266200` sobre `1c32f05`, con los tres jobs
  (`test` en ubuntu y macOS, más `docs-contract`) correctos. El paso de drift
  devolvió en CI el mismo resultado que en local; los `0 unknown` prueban que
  `fetch-depth: 0` cumple su función, porque con checkout superficial los
  `verified_rev` históricos no serían alcanzables y las 21 páginas habrían
  salido `unknown`.

## El hallazgo que justifica el cambio

El validador detectó que `04-reference/cli.md` citaba
`openspec/specs/installer-runtime/spec.md` en un bloque `PENDIENTE-D` sin
declararla en el `sources` del frontmatter, incumpliendo CT-4.

**Los dos cambios anteriores cerraron con verificación en verde sin verlo**:
`docs-content-inventory` con 19/19 criterios y `docs-content-reference` con
23/23. Sus comprobaciones eran comandos escritos a mano, y ninguna cruzaba las
rutas citadas en `fuentes:` contra las declaradas en `sources` — nadie escribe
ese grep salvo que se le ocurra pensarlo.

Corregido en el commit `06517b4`. Es evidencia del valor de este cambio y
también de un límite real de las verificaciones anteriores: un `verify` que
comprueba lo que se le ocurre comprobar ofrece una garantía distinta de uno que
ejecuta un contrato.

## Qué queda abierto

1. **Nueve páginas con procedencia desfasada.** Las de la primera mitad
   declaran `verified_rev: 0ae709d` y citan `docs/EIN_DOCUMENTATION_BRIEF.md`,
   añadido al repositorio en `7001e98`, posterior a ese rev: afirman haber
   verificado sus fuentes en un commit donde una de ellas no existía. Hallazgo
   real, no defecto del validador. No se corrige aquí: la fase D reescribirá
   esas páginas y les asignará un rev nuevo.

2. **Bloques autogenerados**, excluidos por prematuros: generarían contenido
   dentro de las páginas y hoy solo hay marcadores. Se retoman cuando la fase D
   haya producido prosa.

3. **La mitad semántica de CT-9** queda fuera de cobertura declarada: decidir si
   una capacidad tiene evidencia requiere juicio. Solo se valida la buena
   formación del tag `[BETA-EXCLUDED]`.

4. **Criterio §D.12 satisfecho fuera de su redacción original.** Pedía el job en
   verde en la PR de este cambio; la PR no se abre por decisión del usuario, que
   la reserva para después de las fases siguientes. Se resolvió con
   `workflow_dispatch` sobre la rama, declarado en el workflow. Ningún ejecutor
   de fase puede cerrar esa tarea: no lanzan workflows.

5. **Fases siguientes**: C (`docs-site-shell`, Astro Starlight), D
   (`docs-beta-content`, la prosa) y E (`readme-slim`, obligatoriamente la
   última). Documentadas en
   [`docs/handoff-docs-site.md`](../../../docs/handoff-docs-site.md).

6. **Fricciones de herramienta** encontradas durante los tres cambios de esta
   rama, registradas fuera de OpenSpec en
   [`docs/fricciones-dogfooding.md`](../../../docs/fricciones-dogfooding.md).
