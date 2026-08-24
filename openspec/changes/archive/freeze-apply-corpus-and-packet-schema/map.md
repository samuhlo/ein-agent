status: ready
scope_status: bounded
change: freeze-apply-corpus-and-packet-schema
phase: map
lane: standard
tdd: strict

# Map: corpus congelado y schema del Apply Packet

## Boundary

El cambio es **aditivo**. Crea módulos nuevos en `ein-pi/agent/lib/`, sus
espejos en `tests/`, y un fichero de datos con el corpus. No edita ningún módulo
existente: lo que ya funciona se consume por importación, nunca por modificación.

Concretamente, quedan como evidencia de solo lectura y **no se tocan**:
`sdd-router.ts`, `sdd-guardrails.ts`, `sdd-overlay.ts`, `sdd-preflight.ts`, los
prompts de `ein-pi/agent/assets/` y `ein-pi/core/agents/`, y todo el árbol
`installer/` (en manos del otro agente).

## Exact evidence and ownership

| Ruta / símbolo | Evidencia | Propiedad |
|---|---|---|
| `openspec-spec-contract.ts:3-56` | `OPEN_SPEC_FORMAT = "openspec-spec/v1"`, `serializeOpenSpec` canónico, `sha256`, `digestManifest`. Es el precedente exacto de lo que el packet necesita: formato versionado, serialización estable byte a byte y digest. | Solo lectura. El packet copia el **patrón**, no el fichero: `apply-packet/v1` es un formato propio. |
| `openspec-delta-write.ts:9-14,64-97` | Doctrina fail-closed ya escrita: serializa → **re-parsea con la gramática estricta** → solo entonces escribe. Un artefacto malformado se rechaza sin dejar nada en disco. | Solo lectura. El validador del packet adopta el mismo ciclo. |
| `openspec-spec-parser.ts:19-25,103,184` | `OpenSpecParseResult<T>` = unión `{ok:true,...} \| {ok:false, error}`. Tipo de retorno ya idiomático en el repo para parseo que puede fallar. | Solo lectura. El packet devuelve una unión equivalente; no lanza. |
| `sdd-guardrails.ts:149-168` | `oversizedGroupWarnings` parte `tasks.md` por `^##\s+(.+)$` en `[preámbulo, heading, cuerpo, ...]`. Es la partición en grupos ya probada. | Solo lectura, reutilizable por importación. El comentario `:154-156` documenta que dos regex derivando por separado fue un fallo real: no se crea un segundo particionador. |
| `sdd-router.ts:759-780` | `SOURCE_FILE_RE`, `isTestPath`, `isProcessOrSpecPath`, `isProductionFile`, `extractProductionFiles`. El regex acepta **basenames sueltos** (`continuity-handoff-lifecycle.ts` sin directorio), y el extractor **no lee la etiqueta**: barre todo el cuerpo del grupo. | Solo lectura. **No se modifica**: tiene 2 consumidores vivos y su cambio alteraría los avisos `oversized-group`, que están fuera de alcance. |
| `sdd-router.ts:236-242` | `resolveChangesDir` resuelve `openspec/changes/` con fallback `.sdd/changes/`. | Solo lectura, reutilizable si el borde de E/S del corpus necesita localizar cambios. |
| `openspec/changes/archive/` (56 dirs) | 51 con `tasks.md`+`design.md`+`apply-progress.md`+`verify-report.md`+`summary.md`; 4 en carril micro sin `tasks.md`; 1 (`docs-site-shell`) solo con `summary.md`. | Solo lectura y **solo lectura para siempre**: el corpus los describe, no los reescribe. |
| `ein-pi/agent/*.json`, `ein-pi/core/skills/stack-profile.json` | Precedente de dato versionado en JSON dentro del árbol de Ein. No existe hoy carpeta de evaluación. | La ubicación del corpus es decisión de `sdd-design` (decisión diferida 2). |

## Dependency and blast-radius notes

- Codegraph confirma que `SOURCE_FILE_RE`, `isProductionFile`, `isProcessOrSpecPath`
  y `extractProductionFiles` **no tienen tests que los cubran** hoy. Importarlos
  sin más haría que el packet heredara un predicado sin red. Esto no bloquea el
  mapa, pero fija una decisión real para el diseño (ver riesgo 1).
- Nada de lo nuevo entra en el camino de ejecución de ninguna fase: el router, el
  gatekeeper y el overlay no importan estos módulos. El radio de impacto en
  runtime es **cero** mientras `sdd-apply` no adopte el packet, y esa adopción
  está fuera de alcance.
- Los módulos nuevos son `[CORE]`: reciben texto y devuelven resultado. La lectura
  de disco (archivo, artefactos) vive en el borde, no dentro de la lógica, para
  que los tests no necesiten un árbol real.
- El otro agente trabaja sobre `installer/**`, `.github/workflows/`,
  `tests/release-*` y `tests/install-*`. Intersección con este cambio: ninguna.

## Apply guard

El apply escribe **solo** ficheros nuevos: los módulos de `ein-pi/agent/lib/`
que el diseño nombre, sus espejos en `tests/`, y el fichero de datos del corpus.
Cualquier edición de un módulo existente es escape de alcance y debe parar.

Prohibido explícitamente: editar `sdd-router.ts` o `sdd-guardrails.ts` para
"mejorar" el extractor de ficheros; reescribir cualquier `tasks.md` archivado
para que compile; añadir dependencias; tocar `installer/**` o los workflows;
enganchar el packet a `sdd-apply`, al router o al overlay.

## Risks

1. **Heredar un predicado sin tests.** Reutilizar `extractProductionFiles` es
   coherente con la regla de no duplicar regex, pero ese extractor barre el
   cuerpo entero y produce falsos positivos medidos (grupo que declara `none` →
   9 ficheros). Para la frontera de escritura del packet eso no vale. La salida
   probable es un parser propio **de la etiqueta** que usa los predicados
   existentes solo para clasificar la ruta ya extraída, no para encontrarla.
2. **Corpus que envejece en silencio.** Si el corpus guarda rutas o comandos que
   luego cambian en el repo, la medición futura mide otra cosa. Mitigación:
   digest del artefacto de origen por ítem, mismo mecanismo que la detección de
   packet obsoleto.
3. **Que el corpus se convierta en segunda fuente de verdad.** Se corta en el
   contrato: ninguna herramienta de fase puede leerlo. El test lo puede probar.
4. **Sobredimensionar el schema.** El packet solo necesita lo que el roadmap
   fija. Cada campo extra es papeleo que alguien tendrá que rellenar. La presión
   correcta es al revés: `stop` no existe en 0 de 51 `tasks.md` archivados, así
   que exigirlo tiene un coste real y hay que decidirlo, no asumirlo.

## Ledger Contract

ledger:
  reads:
    - { path: "docs/roadmap-features-ein.md", lines: 526, estimated_tokens: 7800 }
    - { path: "openspec/changes/archive/ (inventario de 56 cambios)", lines: 0, estimated_tokens: 900 }
    - { path: "openspec/changes/archive/*/tasks.md (recuento de grafías, 51 ficheros)", lines: 0, estimated_tokens: 1400 }
    - { path: "ein-pi/agent/lib/sdd-guardrails.ts", lines: 160, estimated_tokens: 2400 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: 90, estimated_tokens: 1500 }
    - { path: "ein-pi/agent/lib/openspec-delta-write.ts", lines: 97, estimated_tokens: 1400 }
    - { path: "ein-pi/agent/lib/openspec-spec-contract.ts", lines: 56, estimated_tokens: 600 }
    - { path: "ein-pi/agent/lib/openspec-spec-parser.ts", lines: 25, estimated_tokens: 400 }
    - { path: "openspec/changes/archive/scout-evidence-salvage-and-fanout/{scope,summary}.md", lines: 140, estimated_tokens: 2100 }
    - { path: "openspec/changes/archive/fix-cleaner-participant-slicing/{tasks,map}.md", lines: 90, estimated_tokens: 1600 }
    - { path: "codegraph explore: predicados de ruta del router y sus consumidores", lines: 0, estimated_tokens: 1100 }
    - { path: "probe ejecutada: extractProductionFiles vs ficheros declarados (8 grupos)", lines: 0, estimated_tokens: 700 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 21900, reads: 12 }
  budget_source: scope.md
  budget_exceeded: false
