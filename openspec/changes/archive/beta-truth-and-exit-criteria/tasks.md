# Tasks — beta-truth-and-exit-criteria

status: ready
blocked_by: none

## // 001. Mantener la verdad canónica de beta

- [x] 1.1 Reconciliar `docs/roadmap-beta.md`: antes contiene estado 0.40.0 y afirmaciones pendientes/no ejecutadas; después identifica 0.42.0 como baseline del instalador, marca `core-parity` e `installer-beta` como fundamentos históricos con sus límites, y deja explícito que B–E no están demostrados como completos.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: Este archivo debe ser la única fuente mantenida para estado beta, sin reescribir changelog ni evidencia archivada.
  - learn: Una versión publicada del instalador no equivale a completar el launcher beta.
  - architecture: `roadmap-features-ein.md` conserva autoridad de prioridad/secuencia; `roadmap-beta.md` posee estado, evidencia y criterios actuales.
  - avoid: No convertir pases locales en pruebas de macOS nativo, workflow remoto, publicación o proveedor externo.
  - verify: `grep -nF '0.42.0' docs/roadmap-beta.md` y revisión manual de las anotaciones históricas y límites de evidencia.

- [x] 1.2 Añadir al mismo archivo la secuencia explícita A → B → C → D → E, la matriz completa requirement/posterior/discarded-for-beta y los gates BE-01–BE-06, incluyendo la separación entre E2E del instalador y futura E2E del launcher.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La aceptación futura necesita un contrato trazable y acotado que no convierta ideas del catálogo en alcance implícito.
  - learn: Las exclusiones también son requisitos de límite: dashboard, updater, mutaciones y migración de historiales quedan fuera de A–E.
  - architecture: El contrato completo vive en `docs/roadmap-beta.md`; los READMEs solo lo enlazarán para evitar fuentes duplicadas.
  - avoid: No crear implementación de launcher, contrato de estado, adapters, escenarios E2E ni delta de spec.
  - verify: `grep -nE 'BE-0[1-6]' docs/roadmap-beta.md`; revisión manual de que installer E2E nunca se presenta como launcher E2E y de que la frescura se invalida tras cambios relevantes de código.

- [x] 1.3 Corregir o etiquetar cada afirmación pública obsoleta dentro de `docs/roadmap-beta.md` (0.40.0 actual, parity/installer pendientes, runtime ausente, E2E inexistente), conservando fechas/contexto y los límites históricos de `installer-beta` y `core-parity`.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: Evita que lectores reutilicen una afirmación histórica como criterio vigente.
  - learn: La reconciliación documental conserva el contexto temporal en vez de borrar la historia.
  - architecture: La evidencia archivada y `CHANGELOG.md` permanecen inmutables; solo el registro mantenido recibe anotaciones.
  - avoid: No “sanear” archivos archivados ni afirmar runs remotos no capturados.
  - verify: Revisión semántica contra `scope.md`, `map.md` y `design.md`; confirmar que toda afirmación superseded está fechada o contextualizada.

## // 002. Actualizar la documentación pública raíz

- [x] 2.1 Ajustar `README.md`: antes mantiene referencias de release/source-of-truth 0.40.0 y wording ambiguo; después refleja el baseline actual, describe Pi y Claude aislados, y menciona `--runtime pi|claude|both` únicamente como capacidad del instalador.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: El punto de entrada público debe coincidir con la verdad mantenida sin prometer capacidades futuras.
  - learn: Las capacidades actuales deben atribuirse al propietario correcto, no al launcher futuro.
  - architecture: El README es una superficie delgada de orientación y enlaza el registro beta; no duplica la matriz ni los seis gates.
  - avoid: No anunciar el launcher como implementado ni mover instalación/actualización al launcher.
  - verify: `grep -nF '0.42.0' README.md` y `grep -nF -- '--runtime pi|claude|both' README.md`; revisión manual de ausencia de claims de launcher implementado.

## // 003. Alinear la documentación del instalador

- [x] 3.1 Actualizar `installer/README.md`: antes es Pi-only/legacy-path; después describe selección y superficies aisladas Pi + Claude, conserva instalación/actualización/release bajo propiedad del instalador y etiqueta claramente la E2E existente como installer E2E.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La guía del instalador no debe contradecir metadata actual ni servir accidentalmente como prueba del launcher beta.
  - learn: Installer E2E valida despliegue y selección de runtime; launcher E2E validará flujo de proyecto, sesiones y frescura.
  - architecture: El instalador mantiene instalación, update, release y doctor; el launcher solo tendrá acceso compacto al diagnóstico en fases posteriores.
  - avoid: No ampliar la guía a implementación de launcher, workflow dispatch, updater universal o nuevos escenarios E2E.
  - verify: `grep -nF -- '--runtime pi|claude|both' installer/README.md` y revisión manual de la etiqueta installer-vs-launcher E2E y ownership del instalador.

## // 004. Verificación del perímetro documental

- [x] 4.1 Comprobar que el cambio solo modifica `docs/roadmap-beta.md`, `README.md` e `installer/README.md`, preservando archivos dirty/untracked no relacionados y sin crear delta de spec.
  - skills: `ein-discipline`, `document-writer`
  - why: El cambio está estrictamente limitado a reconciliación documental y debe ser revisable sin collateral.
  - learn: La verificación de nombres protege tanto el alcance como el estado de trabajo previo.
  - architecture: La allowlist de tres documentos es el único perímetro de escritura; código, tests, workflows, E2E, changelog, catálogo y archivos archivados son read-only.
  - avoid: No usar comandos que limpien, restauren, stageen o normalicen el working tree.
  - verify: `git diff --check -- docs/roadmap-beta.md README.md installer/README.md` y `git diff --name-only -- docs/roadmap-beta.md README.md installer/README.md`; revisión manual de `spec_delta: none`.

- [x] 4.2 Ejecutar una revisión semántica final de claims y gates: baseline 0.42.0 separado de readiness, A–E ordenado, históricos fechados, límites de evidencia preservados, installer E2E separado de launcher E2E y stale verification invalidada tras cambio relevante de código.
  - skills: `cognitive-doc-design`, `architecture`
  - why: Los checks de texto no bastan para detectar una falsa inferencia de beta.
  - learn: Una documentación honesta expresa también incertidumbre, estado incompleto y evidencia no ejecutada.
  - architecture: El registro beta concentra el contrato; las guías públicas remiten a él y mantienen ownership explícito.
  - avoid: No aceptar coincidencias de strings como sustituto de revisión conceptual ni introducir alcance B–E.
  - verify: Revisión manual contra REQ-01–REQ-07 y criterios 1–10 de `design.md`; no ejecutar tests/build/typecheck por ser documentación-only.
