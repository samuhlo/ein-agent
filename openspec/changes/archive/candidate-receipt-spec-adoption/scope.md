# Alcance: adopción canónica de candidate-receipt

Adoptar de forma veraz en OpenSpec el comportamiento de `candidate-receipt` ya fusionado por la PR #43 (`b11f4a3`), sin presentar este SDD como origen de la implementación. El cambio documentará el contrato vigente, lo sincronizará de forma determinista y comprobará que la especificación canónica coincide con el runtime ya presente.

## SCOPE PACKET

```yaml
scope: Adoptar de forma veraz el comportamiento ya fusionado de `candidate-receipt` en el contrato canónico de OpenSpec, dejando explícito que la PR #43 (`b11f4a3`) fue ad-hoc y que este SDD no reconstruye su historia de implementación. Mapear el comportamiento actual, crear un delta exclusivamente ADDED en `sdd-lifecycle`, sincronizarlo determinísticamente y verificar que la especificación canónica resultante coincide con la implementación presente, sin modificar runtime.
budget_allocated:
  max_tokens: 12000
  max_reads: 24
  max_runtime_ms: 600000
```

## Decisión de dominio

El comportamiento pertenece a `sdd-lifecycle`, el dominio canónico existente en `openspec/specs/sdd-lifecycle/spec.md`. El recibo enlaza una verificación SDD aprobada con los bytes exactos del candidato y sus precondiciones dependen directamente de los estados apply/verify; crear un dominio nuevo separaría artificialmente una garantía del mismo ciclo de vida.

La adopción debe usar un delta **ADDED-only** bajo:

`openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md`

No se usarán operaciones `MODIFIED` ni `REMOVED`: el contrato canónico actual no contiene escenarios de candidate receipt que deban reemplazarse o eliminarse.

## En alcance

- Mapear el comportamiento vigente desde:
  - `ein-pi/agent/lib/candidate-receipt.ts`.
  - El wiring de `ein_candidate_receipt` en `ein-pi/agent/extensions/ein-ai.ts`.
  - La evidencia enfocada de `tests/candidate-receipt.test.ts`.
- Expresar como escenarios ADDED el contrato observable ya fusionado, incluyendo como mínimo:
  - precondiciones de emisión sobre cambio seguro/existente, apply completo y verify vigente en pass;
  - manifiesto explícito y validado de rutas concretas;
  - construcción determinista de un árbol candidato sin mutar índice ni worktree reales;
  - recibo local y atómico ligado a repositorio, worktree, cambio, HEAD, árbol, rutas, informe y comandos;
  - parsing estricto y validación fail-closed ante ausencia, corrupción, versión, identidad, digest o evidencia obsoleta;
  - detección de divergencia entre los bytes actuales y el árbol candidato verificado;
  - comportamiento del tool cuando falta el manifiesto y cuando la emisión se acepta o rechaza.
- Sincronizar el delta mediante el mecanismo determinista de OpenSpec y conservar su evidencia de sync.
- Verificar que `openspec/specs/sdd-lifecycle/spec.md` representa fielmente el comportamiento ya existente.
- Mantener `strict_tdd: false`; la verificación posterior seguirá requiriendo parser/sync deterministas y comprobaciones enfocadas del comportamiento.

## Fuera de alcance

- Alterar `candidate-receipt.ts`, el wiring del tool o cualquier otro comportamiento de producción.
- Presentar la PR #43 como trabajo desarrollado mediante este SDD o reconstruir retrospectivamente fases que no ocurrieron.
- Reescribir historial git, commits, artefactos históricos o la narrativa de entrega original.
- Añadir el gate de entrega atribuido a slices posteriores o ampliar el contrato más allá del comportamiento fusionado.
- Cambios de Homebrew, release o roadmap de releases.
- Crear un dominio canónico nuevo mientras `sdd-lifecycle` siga siendo coherente.
- Ejecutar pruebas, sync o implementación durante esta fase de scope.

## Restricciones y fuentes de verdad

- La implementación fuente está fusionada en main a partir de la PR #43, merge `b11f4a3`.
- Este es un cambio de **adopción de especificación**, no una historia retrospectiva de implementación.
- El delta debe ser exclusivamente ADDED y usar el formato OpenSpec vigente.
- La aplicación esperada se limita a documentación/artefactos de especificación y sincronización determinista de OpenSpec.
- OpenSpec es el registro canónico; Engram no está disponible ni forma parte de la evidencia.
- `strict_tdd: false` no exime de aportar evidencia determinista y enfocada en verify.

## Criterios de aceptación

- [ ] El mapping contrasta runtime, wiring y tests con el contrato que se pretende adoptar.
- [ ] Los artefactos declaran expresamente que la PR #43 fue ad-hoc y que este SDD adopta su comportamiento presente sin atribuirse su desarrollo.
- [ ] El delta vive en `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md` y contiene solo escenarios ADDED.
- [ ] Los escenarios cubren emisión, identidad, manifiesto, aislamiento, persistencia, validación fail-closed, vigencia del verify y comparación del árbol candidato.
- [ ] La sincronización determinista incorpora esos escenarios en `openspec/specs/sdd-lifecycle/spec.md` sin modificar los escenarios canónicos existentes de forma retrospectiva.
- [ ] La evidencia de sync es válida, reproducible y no deja conflictos pendientes.
- [ ] La verificación confirma que la especificación canónica resultante coincide con `candidate-receipt.ts`, su wiring y las pruebas enfocadas.
- [ ] No cambia ningún archivo de runtime ni se realiza trabajo de Homebrew/release.

## Entradas obligatorias para mapping

El mapping debe mantenerse dentro del presupuesto y priorizar estas cuatro entradas explícitas:

1. `ein-pi/agent/lib/candidate-receipt.ts`
2. Sección `ein_candidate_receipt` de `ein-pi/agent/extensions/ein-ai.ts`
3. `tests/candidate-receipt.test.ts`
4. `openspec/specs/sdd-lifecycle/spec.md`

También debe identificar, sin ejecutar en map, el comando determinista de parser/sync vigente y los checks enfocados. La evidencia conocida señala Bun; `bun test tests/candidate-receipt.test.ts` es candidato obligatorio de verificación posterior, no evidencia ejecutada en scope.

## Riesgos

- Una especificación demasiado detallada podría copiar decisiones internas en vez de fijar comportamiento observable.
- Una especificación demasiado amplia podría atribuir a la PR #43 garantías de slices posteriores, especialmente gates de entrega aún fuera de este alcance.
- La sincronización podría sobrescribir escenarios canónicos existentes si el delta no respeta identidad y formato ADDED-only.
- La config global no declara todavía un comando de test/sync; map debe localizar los comandos reales antes de design/tasks.
