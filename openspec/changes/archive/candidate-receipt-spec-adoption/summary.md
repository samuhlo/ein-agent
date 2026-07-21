# Resumen de cambio — candidate-receipt-spec-adoption

## // 000. RESUMEN

Adopción canónica en `sdd-lifecycle` del contrato de `candidate-receipt` ya fusionado en la rama principal por la PR #43 (`b11f4a3`). Se documentó el comportamiento observable existente, se proyectó al spec canónico mediante sync determinista y se verificó que la especificación resultante coincide con el runtime, el wiring del tool y los tests enfocados. Ningún archivo de producción, test ni release fue modificado.

## // 001. QUÉ CAMBIÓ

- Se creó el delta OpenSpec ADDED-only en
  `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md`
  con ocho escenarios nuevos para el dominio `sdd-lifecycle`.
- `openspec/specs/sdd-lifecycle/spec.md` se proyectó mediante sync determinista;
  pasaron a estar canónicos 11 escenarios (3 preexistentes + 8 nuevos).
- Se actualizó `docs/sdd-cost-plan.md` para registrar la adopción completada
  de slice 03 y reservar slice 04 para la lane mecánica/no-SDD y el consumo
  de entrega.

## // 002. CÓMO FUNCIONA POR DENTRO

El delta añade ocho escenarios `ADDED` al dominio `sdd-lifecycle`:

| ID de escenario | Qué fija |
|---|---|
| `candidate-receipt-emission-preconditions` | Emite recibo solo con repositorio, HEAD resoluble, cambio seguro y existente, apply completo y verify fresco en pass. |
| `candidate-receipt-explicit-path-manifest` | El manifiesto de rutas es obligatorio, exacto, sin duplicados; soporta añadidos, modificados, eliminados y renombrados; rechaza vacíos, absolutas, escapes `..`, pathspecs mágicos y ficheros sin cambio. |
| `candidate-receipt-isolated-candidate-tree` | Construye el árbol candidato en un índice temporal aislado (GIT_INDEX_FILE temporal bajo git-dir) a partir de HEAD más solo el manifiesto; no muta índice ni worktree reales; limpia el temporal en éxito y en error. |
| `candidate-receipt-identity-and-atomic-publication` | El recibo v1 liga SHA-256 de repo y worktree, cambio, HEAD, rama, tree SHA, rutas ordenadas con su digest, digest del informe verify vigente, digest de comandos y fecha; se publica con reemplazo atómico bajo `<git-dir>/ein/`. |
| `candidate-receipt-fail-closed-current-evidence` | Ausencia, corrupción, versión no soportada, inconsistencia interna, identidad ajena, digest de paths o informe cambiado, o precondición stale producen rechazo fail-closed. |
| `candidate-receipt-tree-divergence` | `candidateTreeMatches` reconstruye el árbol con las rutas del recibo y compara el tree SHA; devuelve `true` solo si coinciden; cambios posteriores en los bytes declarados devuelven `false`. |
| `candidate-receipt-tool-manifest-guidance` | `ein_candidate_receipt` sin `paths` devuelve sugerencias separadas (trackeadas/untracked) sin emitir; con manifiesto delega emisión y comunica aceptación o rechazo. |
| `candidate-receipt-delivery-limit` | El recibo **no** autoriza ni bloquea commit, push, PR ni otra entrega; no habilita lane mecánica ni no-SDD; el gate de entrega queda para slice 04. |

La sincronización corre `ein_openspec_sync` (invoca `synchronizeOpenSpecFilesystem`): lee el delta en el directorio del cambio, proyecta los escenarios ADDED al spec canónico de forma idempotente y produce `sync-report.md` con el digest resultante. El reporte confirma `state: synchronized`, `conflicts: 0` y `operations: added=8 modified=0 removed=0`. El digest canónico resultante (`83ca133…`) coincide con el live SHA256 de `openspec/specs/sdd-lifecycle/spec.md`.

## // 003. DECISIONES

- **Dominio `sdd-lifecycle`**: el recibo enlaza apply, verify y bytes candidatos; un dominio nuevo habría fragmentado garantías del mismo ciclo.
- **Delta exclusivamente ADDED**: los escenarios canónicos preexistentes (`canonical-close-readiness`, `canonical-context-budget`, `legacy-sdd-fallback`) se preservan verbatim; ningún escenario se reinterpreta, modifica ni elimina.
- **Adopción, no reconstrucción**: la implementación proviene de PR #43 (`b11f4a3`); este SDD documenta el contrato observable sin atribuirse su desarrollo ni alterar su historial git.
- **Lane mecánica y gate de entrega fuera de alcance**: hasta slice 04, `candidate-receipt` es exclusivamente observacional; la adopción intentionally no habilita ni promete enforcement de entrega.

## // 004. VERIFICACIÓN

| Check | Resultado |
|---|---|
| `bun test tests/candidate-receipt.test.ts` | 42 passed / 0 failed (80 expect) |
| `bun test tests/openspec-specs.test.ts` | 20 passed / 0 failed (45 expect) |
| `sha256sum openspec/specs/sdd-lifecycle/spec.md` | `83ca133904563d34f022c03ffa22e878c6747fa2075d9a769d94d938a8bd800f` — coincide con `sync-report.md after=` |
| `git diff --stat` | solo `docs/sdd-cost-plan.md` (+2) y `openspec/specs/sdd-lifecycle/spec.md` (+56); cero cambios en runtime, wiring o tests |
| `git diff --check` | limpio; sin conflictos de espacio ni marcadores |

## // 005. PENDIENTE / RIESGOS

- **Sync idempotente**: el digest canónico es reproducible hoy; si alguien edita `openspec/specs/sdd-lifecycle/spec.md` fuera de `ein_openspec_sync`, el digest del `sync-report.md` se invalidará y requerirá otra sincronización — comportamiento esperado del contrato de sync, no una regresión de este slice.
- **Lane mecánica y consumo de entrega**: slice 03 no habilita ni promete enforcement de commit/push/PR; slice 04 (pendiente) es la responsable de esa funcionalidad.
- Ningún otro bloqueo detectado.

---

Atribución: la implementación de `candidate-receipt` proviene de la PR #43 (`b11f4a3`), fusionada ad-hoc en la rama principal antes de este SDD. Este cambio es exclusivamente de adopción de especificación canónica.
