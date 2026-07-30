# Plan operativo de implementación de la beta pública

> **Veredicto:** el roadmap es estratégicamente sólido, pero no debe aplicarse todavía tal cual. Antes de implementar hace falta reconciliar el baseline: `main` y el trabajo OpenSpec activo ya se solapan con sus decisiones.

## // 000. LÍMITE DE AUTORIDAD

| Artefacto | Es dueño de |
|---|---|
| [`public-beta-plan.md`](./public-beta-plan.md) | Resultados, garantías y slices de producto. |
| Este plan | Orden de ejecución, gates, evidencia y unidades de PR. |

Este documento no sustituye el roadmap ni crea un meta-SDD. Cada slice sigue siendo un cambio SDD independiente. La documentación pública sólo viaja con comportamiento enviado y verificado.

## // 001. FOTO DEL BASELINE — 2026-07-29

| Hecho | Evidencia y consecuencia operativa |
|---|---|
| `zero-friction-sdd-start` está verificado | Su resumen declara `status: pass`, todas las tareas completadas y cobertura conductual `partial`. Está listo para el cierre normal; no se debe interpretar la cobertura parcial como ausencia de verificación. |
| `release-experience-roadmap` sigue en apply | Tiene 39 tareas pendientes. Es un meta-roadmap sólo de planificación y contradice reglas de esta beta: aquí no hay meta-SDD, no hay Homebrew y las docs siguen al comportamiento enviado. |
| Ya existe trabajo de release/update en `main` | Los commits `ab145b9`, `a24e26d`, `4b09233`, `8dd7df6`, `46ad273` y `2626899` cubren identidad de release o updater transaccional. Los slices 07–09 empiezan por análisis de brechas, nunca por una implementación greenfield. |
| Versiones de Bun divergentes | CI fija Bun `1.3.0`; el workflow de release del installer usa `bun-version: latest`. |
| Despacho de release ambiguo | `installer-release.yml` admite `workflow_dispatch` sin exigir una referencia/tag inequívoco. |
| Investigación y legal no materializados | No se encontró un archivo `ein-scout` ni un `THIRD_PARTY_NOTICES` del proyecto. Son resultados de baseline, no permiso para inventar artefactos fuera de sus slices. |
| Árbol de trabajo con trabajo ajeno no trackeado | Nunca limpiar, añadir, mover ni absorber ese trabajo. Cada cambio usa sólo paths confirmados de su propio `sdd-map`. |

**Regla de frescura:** antes de abrir cada slice, repetir una revalidación read-only de sus hechos materiales. Si el baseline, una dependencia o un artefacto publicado cambió, detenerse y actualizar scope/map/design/tasks antes de apply.

## // 002. WAVE 0 — RECONCILIACIÓN OBLIGATORIA

Esta wave es una decisión de planificación; no cierra ni archiva nada ahora.

1. Regenerar su resumen sólo si está obsoleto; sincronizar las specs si hay trabajo pendiente; después ejecutar el cierre/archivo determinista normal, sin `--force`.
2. No aplicar `release-experience-roadmap` como está escrito. Requiere decisión humana explícita para supersederlo o re-acotarlo.
3. Preservar sus resultados útiles, trasladándolos así:

| Resultado del roadmap activo | Destino en la beta |
|---|---|
| Semántica de update | Slices 07, 08 y 09. |
| Veracidad de README | Slice 11. |
| Claims deterministas de Engram | Slice 06 o post-beta. |
| Semántica del banner | Post-beta, salvo P0 demostrado. |
| Homebrew | Post-beta. |

**Salida de Wave 0:** una decisión humana registrada y un baseline limpio de solapamientos. Sin ella, Slice 01 queda bloqueado.

## // 003. WAVES EJECUTABLES

La ejecución normal es de escritor único y secuencial. El paralelismo es opcional, sólo con worktrees aislados y PRs independientes.

```text
Wave 0  reconciliación
  ↓
Wave 1  01 → 02 → 03                 corrección del harness
  ↓
Wave 2  04 → 05 → 06                 investigación con parent delgado
  ↓
Gate M  tres runs SDD comparables + decision record
  ↓
Wave 3  07 ──┐                       release/supply chain
        10 ──┘  (inventario legal aislado; integración espera packaging estable)
  ↓
Wave 4  08 y 09 después de 07        PRs/worktrees independientes
  ↓
Wave 5  11 después de 07–10 verificados
  ↓
Wave 6  12 → tag beta → read-back
```

## // 004. TARJETAS DE EJECUCIÓN

Las rutas son candidatas, no una lista final de archivos. Cada `sdd-map` confirma blast radius, tests y comandos.

| Slice | Resultado | Dep. | Revalidación / rutas candidatas | Verificación focal | Evidencia de salida | Cx / riesgo de review |
|---:|---|---|---|---|---|---|
| 01 | Contrato apply/runtime coherente | Wave 0 | `ein-pi/core/agents/sdd-apply.md`, `ein-pi/agent/assets/orchestrator.md`, contratos de inyección acceptance/runtime | `bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts` | contrato único y tests de override | M — deriva entre texto y runtime |
| 02 | `--force` no omite evidencia crítica | 01 | `ein-pi/agent/lib/sdd-close.ts`, `ein-pi/agent/lib/sdd-router.ts`, contrato canónico de cierre OpenSpec | `bun test tests/sdd-close.test.ts tests/sdd-router.test.ts` | bloqueos no forzables demostrados | M — regresión de cierre legacy |
| 03 | Ledger con identidad y procedencia | 02 | `ein-pi/agent/lib/sdd-router.ts`, `ein-pi/agent/extensions/ein-ai.ts`, metadatos/reporting de run | `bun test tests/sdd-real-cost-provenance.test.ts tests/sdd-cost-block-e.test.ts tests/sdd-cost-block-g.test.ts` | runs reproducibles; unavailable no es cero | L — contabilidad y compatibilidad |
| 04 | `ein-scout` read-only y fuera de SDD | 03 | nuevo `ein-pi/core/agents/ein-scout.md`; superficies autoritativas de inventario/settings/model/doctor | `bun test tests/agent-tools-contract.test.ts tests/sdd-flow-contract.test.ts`; añadir test de contrato scout si el map lo confirma | no escribe ni crea OpenSpec | M — frontera de seguridad |
| 05 | Parent enruta investigación amplia al scout | 04 | `ein-pi/agent/assets/orchestrator.md`, `ein-pi/core/skills/local/ein-discipline/SKILL.md`, contratos de routing | `bun test tests/sdd-flow-contract.test.ts tests/sdd-phase-runtime-contract.test.ts` | límites y no-redescubrimiento probados | M — cambios de flujo |
| 06 | Adaptadores Engram/Context7 acotados | 05 | `ein-pi/agent/extensions/ein-ai.ts`, límites adapter/preflight de Engram y contrato de herramienta Context7 | `bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts`; añadir contratos de adapter confirmados por map | claim sólo con receipt; unavailable válido | L — contratos externos |
| 07 | Identidad coherente de release | Gate M | `.github/workflows/ci.yml`, `.github/workflows/installer-release.yml`, `installer/package.json`, `installer/src/core/version.ts`, `installer/scripts/build-all.ts` | `bun test tests/release-asset-contract.test.ts`; `cd installer && bun run typecheck`; `bun run build:all` sólo en verify | tag, payload, binario, template y checksums alineados | L — supply chain; no asumir greenfield |
| 08 | Update/rollback transaccional seguro | 07 | `installer/src/core/transaction.ts`, `template-transaction.ts`, `deploy.ts`, `backup.ts`, CLI de updater | `bun test tests/release-update-state-primitives.test.ts tests/release-update-transaction.test.ts tests/release-update-integration.test.ts tests/installer-backup.test.ts`; `cd installer && bun run typecheck` | restauración exacta y backup utilizable | L — pérdida de estado |
| 09 | Bootstrap verifica integridad | 07 | `installer/install.sh`, código de adquisición/checksum de release y assets de workflow | `bun test tests/release-update-acquisition.test.ts tests/release-asset-contract.test.ts`; checks shell/estáticos de checksum confirmados por map | fallo cerrado antes de modificar instalación | L — seguridad de distribución |
| 10 | Redistribución con procedencia legal | Wave 3 | `ein-pi/core/skills/skills-lock.json`, `installer/scripts/bundle-template.ts`, nuevo `THIRD_PARTY_NOTICES` raíz | nuevo `tests/third-party-notices.test.ts`: `bun test tests/third-party-notices.test.ts`; smoke de bundle sólo en verify | notices y bloqueo ante licencia desconocida | M — procedencia incompleta; integración espera 07 estable |
| 11 | Documentación sólo sobre comportamiento enviado | 07–10 verificados | `README.md`, `CHANGELOG.md`, `EIN.md`, `ein-pi/core/docs/`, superficies de ayuda/doctor | `bun test tests/readme-release-ia.test.ts`; añadir contrato doctor focal, p. ej. `tests/doctor-contract.test.ts`, si el map lo confirma | matriz de claims con productores verificados | M — promesas públicas anticipadas |
| 12 | RC prueba assets publicados reales | 07–11 | `.github/workflows/installer-release.yml`, `e2e/`, assets/checksums publicados | verify/RC: matriz de assets publicados en cuatro plataformas y read-back; sin sustituto local | resultados por plataforma y read-back | L — entorno y reproducibilidad |

Los builds completos y la matriz de assets publicados pertenecen a verify/RC; apply se limita a typecheck y verificación focal cuando corresponda.

## // 005. GATE M — PROTOCOLO DE BENCHMARK

**Objetivo:** decidir con evidencia repetida si se abren slices condicionales de verify/close. No inventa umbrales de tokens.

1. Usar el mismo baseline de repositorio y la misma configuración de modelo en los tres runs.
2. Ejecutar un escenario acotado pequeño, uno mediano y uno grande; cada escenario debe definir previamente objetivo, paths permitidos, criterio de salida y artefactos esperados.
3. Para cada run, recoger: `runId`, fases, retries, input, output, cache read, cache write o `unavailable`, coste reportado por proveedor, duración, bytes de artefactos y causa de timeout/reconciliación.
4. Conservar el contexto de comparación: identidad del baseline, configuración de modelo y definición exacta de cada escenario.
5. Emitir un **decision record** con los datos, incertidumbres y conclusión. Sólo abrir los slices condicionales de verify/close cuando la evidencia se repita; si no, continuar sin optimización especulativa.

## // 006. SCOREBOARD DE READINESS

**P0** bloquea seguridad, integridad, publicación o comportamiento crítico. **P1** no bloquea la beta, pero debe tener propietario, evidencia y límite explícito.

| Slice / gate | Prioridad | Estado inicial | Evidencia actual | Bloqueador |
|---|---|---|---|---|
| Wave 0 | P0 | blocked | Dos cambios OpenSpec activos se solapan | Decisión humana de supersede/re-scope |
| 01–03 | P0 | not-started | Roadmap canónico | Wave 0 |
| 04–06 | P0 | not-started | No existe archivo `ein-scout` | Waves 1–2 y Gate M |
| Gate M | P0 | not-started | Sin benchmarks comparables | 03–06 verificados |
| 07 | P0 | needs-gap-analysis | Commits existentes; workflows divergentes | Gate M y mapa de brechas |
| 08 | P0 | needs-gap-analysis | Trabajo transaccional existente | 07 verificado |
| 09 | P0 | needs-gap-analysis | Canal y checksums existentes parcialmente | 07 verificado |
| 10 | P0 | needs-gap-analysis | No hay `THIRD_PARTY_NOTICES` | Inventario/procedencia; packaging estable para integrar |
| 11 | P0 | not-started | Roadmap fija truthfulness | 07–10 verificados |
| 12 | P0 | not-started | Sin RC de assets publicados | 07–11 verificados |

El historial de commits no marca ningún slice como completo: sólo su verify y cierre frescos pueden hacerlo.

## // 007. PROTOCOLO SDD Y PR POR SLICE

1. Revalidar baseline y dependencias; aislar trabajo ajeno no trackeado.
2. Crear el cambio del slice y completar `scope → map → design → tasks`.
3. Pasar el teaching gate antes de apply.
4. Aplicar por grupos pequeños, con tests y documentación viajando con el comportamiento.
5. Verificar con evidencia focal; reservar la verificación holística para `sdd-verify` y RC.
6. Cerrar/sincronizar el cambio sólo tras verify fresco.
7. Entregar una PR por slice; una unidad de trabajo debe poder revisarse y revertirse sin arrastrar trabajo ajeno.
8. Si la producción supera 400 líneas, aplicar el Workload Guard y obtener decisión de división antes de entregar. Tests, docs y generado se informan por separado, no ocultan producción.

## // 008. CONDICIONES DE PARADA

Detener el slice y escalar la decisión cuando ocurra cualquiera de estas condiciones:

- Solapamiento sin resolver con el roadmap OpenSpec activo.
- Baseline, dependencia o evidencia publicada obsoleta.
- Falta de checksum o de procedencia legal verificable.
- Cobertura conductual `none` en un slice crítico de seguridad.
- Más de 400 líneas de producción sin decisión explícita de dividir.
- Assets de release distintos de los inputs usados por RC.

## // 009. SIGUIENTE ACCIÓN RECOMENDADA

Reconciliar los dos cambios OpenSpec activos y, sólo después de revalidar el baseline de Slice 01, iniciar Slice 01.
