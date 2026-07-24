## // 000. RESUMEN

Se implementaron cuatro barreras independientes de identidad de candidato verificado en `ein-git` — pre-commit, post-commit contra `HEAD^{tree}`, pre-push con SHA fijos, y pre-PR con resolución de cabeza efectiva — como capa de autoridad de contenido separada de la grant de intención existente. La slice 04 del roadmap de calidad está completada. El soporte de evidencia archivada cierra el hueco operacional entre el cierre determinístico de SDD y la entrega posterior: un cambio cerrado puede conservar evidencia de recibo completa y ser reutilizado como fuente de delivery verificable meses después, siempre que su apply, verify y summary estén vigentes y sean únicos.

## // 001. QUÉ CAMBIÓ

- Nuevo módulo `ein-pi/agent/lib/delivery-receipt.ts` (224 líneas netas tras Group 008, más adiciones posteriores): declaración discriminada de contenido (`verified-sdd` / `mechanical-unverified`), validador fresco de recibo con fingerprint estable por intento, y cuatro funciones de decisión independientes (`validatePreCommitReceiptGate`, `validatePostCommitReceiptGate`, `validatePrePushReceiptGate`, `validatePrePrReceiptGate`) deduplicadas mediante un helper tipado `requireMatchingHeads`.
- Nuevo helper `ein-pi/agent/lib/delivery-gate.ts` (373 líneas): cableado determinístico de los cuatro gates al flujo de delivery.
- `ein-pi/agent/lib/candidate-receipt.ts` (+74 líneas netas): extensión de validación fresca + seams de observación para `HEAD`, `HEAD^{tree}`, SHA de push y cabeza PR + resolución única fail-closed de ubicación de evidencia live-or-archived.
- `ein-pi/core/agents/ein-git.md` (+16/-4 líneas): contrato con las cuatro barreras numeradas, declaración obligatoria de contenido, ruta visible a `sdd-verify`, y modo mecánico explícito.
- `openspec/specs/sdd-lifecycle/spec.md` (+35/-10 líneas netas, 7 operaciones MODIFIED): delta reconciliado tras los conflictos `added-existing` de Group 007 — cinco escenarios existentes de delivery-gate más `candidate-receipt-emission-preconditions` y `candidate-receipt-delivery-limit` — sincronizados sin conflictos (`conflicts: 0`).
- `docs/quality-roadmap/04-delivery-receipt-gates.md` (+17/-17 líneas): slice marcada como `completed`.

## // 002. CÓMO FUNCIONA POR DENTRO

### Modelo dual de autorización

Cada operación de delivery requiere **dos autoridades independientes**:

1. **Grant de intención de usuario** (existente, sin cambios): TTL 10 min, scope cwd exacto, 3 usos, deniega force-push. Autoriza *la acción solicitada*.
2. **Recibo de candidato** (nuevo, slice 04): fingerprint estable del intento + identidad de bytes verificados. Autoriza *el contenido exacto entregado*.

Ninguna autoridad sustituye a la otra.

### Declaración de contenido obligatoria

`ein-git` requiere exactamente una de dos formas en cada solicitud de delivery:

```ts
// Delivery SDD verificado
{ mode: "verified-sdd", change: "<nombre>" }
// Delivery mecánico, sin verificación
{ mode: "mechanical-unverified", declaration: "no-verification-receipt-applies" }
```

`parseContentAuthorityDeclaration` falla en ausencia, ambigüedad o conflicto. No se infiere de archivos, TDD, ni ausencia de recibo.

### Las cuatro barreras independientes

| # | Barrera | Observación fresca requerida | Mutación protegida |
|---|---|---|---|
| 1 | Pre-commit | Recibo fresco + base HEAD + candidato reconstruido + índice exacto | `git commit` |
| 2 | Post-commit | `HEAD^{tree}` después de hooks; captura SHA solo si coincide | Ninguna — captura `validatedDeliveryHead` |
| 3 | Pre-push | SHA fuente seleccionado + su árbol | `git push <sha>:refs/heads/<branch>` |
| 4 | Pre-PR | Cabeza local, cabeza remota efectiva, cabeza PR existente | `gh pr create --head <branch>` / update |

Cada barrera llama `validateFreshCandidateReceipt(cwd, change, expectedFingerprint)` — el fingerprint del intento se compara contra el recibo actual en disco. Si el recibo fue reemplazado durante el intento, se rechaza con `"el recibo fue reemplazado durante este intento de entrega"`.

### Fail-closed y ruta a verify

Todo fallo de barrera retorna:

```ts
{ ok: false, reason: "...", reroute: { next: "sdd-verify", instruction: "return to sdd-verify, re-verify, emit a new receipt, and restart delivery" } }
```

No hay refresh, reemplazo, ni downgrade automático a modo mecánico.

### Control de identidad y alcance del push/PR

La barrera pre-push fija el SHA de envío como source del refspec (`git push <sha>:refs/heads/<branch>`), evitando race check/use por movimiento de rama. La barrera pre-PR resuelve cabeza local, cabeza remota efectiva y cabeza PR existente; todas deben coincidir con el SHA validado. **El control de identidad en push y PR es un backstop de cabeza local/efectiva: no garantiza la identidad exacta de la publicación remota final.** GitHub no proporciona cierre transaccional entre la inspección de cabeza remota y la mutación PR; la lectura JSON obligatoria post-mutación detecta la race que no puede bloquearse anticipadamente, pero no la impide. **El control exacto de publicación remota es intencionalmente fuera de alcance** — el sistema valida identidad en las cuatro barreras locales y después de mutación, pero no impone atomicidad ni bloqueo transaccional sobre el estado remoto.

### Resolución única fail-closed de evidencia archivada

`resolveReceiptChangeLocation(cwd, name)` busca exactamente una ubicación para la evidencia de recibo:

- **Un cambio activo único:** resuelve el directorio `openspec/changes/<name>/` directamente. `assessReceiptPrecondition` ejecuta las cinco comprobaciones existentes (nombre seguro, existe, verify en pass, no obsoleto, apply completo). Si todas pasan, retorna `null` — la emisión y validación proceden normalmente.
- **Un cambio archivado único, completo y cerrado:** resuelve `openspec/changes/archive/<name>/`. `assessReceiptPrecondition` exige `apply-progress.md` con `status: complete`, `verify-report.md` con `status: pass`, `summary.md` presente, y relaciones de temporalidad: apply ≤ verify ≤ summary (ningún paso futuro respecto al anterior). Si todo cumple, retorna `null` — la emisión y validación usan los paths del archivo archivado para verificar el manifiesto y reconstruir el árbol de candidato. El recibo emitido reside en `.git/ein/candidate-receipt.json`, sin modificar el archivo archivado.
- **Ningún directorio:** retorna `{ reason: "el cambio '<name>' no existe" }` — fail-closed con token `"no existe"`.
- **Dos ubicaciones (activo + archivado):** retorna `{ reason: "el cambio '<name>' existe tanto activo como archivado; la evidencia es ambigua" }` — fail-closed con token `"ambigua"`. No se prefiere ninguna ubicación.
- **Evidencia archivada obsoleta o fallida:** si verify no está en pass o apply es anterior a verify, retorna la razón específica (`"verify no está en pass"` / `"OBSOLETO"`).

Este mecanismo cierra el hueco operacional entre el cierre determinístico SDD y la entrega posterior: un cambio ya cerrado puede ser reutilizado como fuente de delivery verificable meses después, sin re-ejecutar apply ni re-verificar, siempre que su registro sea completo y esté actualizado.

## // 003. DECISIONES

- **4 gates separados vs. una validación tempranera:** hooks, movimiento de rama y estado PR pueden divergir después de commit; el TOCTOU requiere reread en cada frontera.
- **Recibo fresco en cada barrera vs. validación compartida:** el fingerprint del intento protege contra reemplazo durante delivery; `validateFreshCandidateReceipt` revalida en cada paso.
- **SHA-fixed en push vs. branch-name mutable:** usar `validatedDeliveryHead` (SHA) como refspec impide que el movimiento de rama cree una race check/use.
- **Pre-PR con resolución efectiva vs. solo branch-name:** `localHead` + `effectiveRemoteHead` + `existingPrHead` deben coincidir con `validatedDeliveryHead`; `undefined` en `existingPrHead` es el único caso no aplicable.
- **Mechanical-explicit vs. inferido:** la ausencia de recibo nunca implica modo mecánico; la declaración literal es obligatoria.
- **Ubicación única fail-closed para evidencia archivada:** no se permite evidencia ambigua entre dos directorios; la frescura de apply+verify+summary es requisito para archivar, no opcional.
- **Delta con 7 operaciones MODIFIED bajo un único ## MODIFIED:** Group 007 removió la sección `## ADDED` fantasma que contenía los cinco escenarios ya canónicos, luego los fusionó en el único `## MODIFIED`. Sync-report confirma `added=0 modified=7 removed=0 conflicts=0` — el delta está sincronizado y libre de conflictos.
- **Compacción del helper (430 → 397 líneas originales, crecer tras reconstrucción):** Group 008 deduplicó el loop de comparación en `requireMatchingHeads`, manteniendo las cuatro funciones independientes, los tipos de observación por barrera, la continuidad del receipt fingerprint, y la secuencia de dos pasos post-commit. El helper es puro — sin caché de resultados ni estado compartido entre barreras. La reconstrucción posterior del worktree agregó `delivery-gate.ts` (373 líneas) y creció `delivery-receipt.ts` a 224 líneas.
- **Control exacto de publicación remota fuera de alcance:** la barrera pre-PR valida cabeza local, efectiva remota y existente PR antes de mutación, y la lectura JSON post-mutación detecta la race; pero GitHub no ofrece cierre transaccional y el diseño no impone atomicidad ni bloqueo sobre el estado remoto final.

## // 004. VERIFICACIÓN

| Verificación | Resultado |
|---|---|
| Suite completa `bun test` | **913 pass / 0 fail** (80 archivos, 2475 expect, 6.14 s) |
| Suite enfocada (5 archivos: candidate-receipt, ein-git-noninteractive, git-delivery, guardrails, delivery-gate) | **150 pass / 0 fail** (359 expect, 3.70 s) |
| Typecheck installer | `tsc --noEmit` silencioso — sin diagnostics |
| `git diff --check` | limpio — sin warnings de whitespace ni marcadores de conflicto |
| Forbidden-reference audit (`gentle[- ]?(ai\|pi)`) | **0 matches** — exit code 1; audit exhaustivo sobre `.` con `rg -n -i --hidden` |
| SHA-256 spec canónica | `37fc78cb36f…` — coincide con sync-report `result_sha256: de05a369…` |
| SHA-256 delta sync-report | `21e0c04a01b…` — sincronizado, `conflicts: 0`, `state: synchronized`, `added=0 modified=7 removed=0` |
| Grupo 007 (archivado) | 5/5 pass: archivado único completo + validación; activo único conserva emisión+validación; ambos rechazan con `"ambigua"`; evidencia obsoleta/fallida rechazada |
| Archivos no tocados | `guardrails.ts`, `git-delivery.ts`, `sdd-router.ts`, `sdd-close.ts` — diff vacío |
| Regresiones grant | TTL 10 min, cwd exacto, 3 usos, legacy one-use, force-push denegado — todos pasar |
| Sticky intent | mismo objeto vivo retenido tras mensaje neutral (`expect(afterLog).toBe(asked)`) |
| Budget producción (verificación reconstruida) | **297 changed lines** (245 ins + 52 del) sobre 10 archivos tracked + **597 líneas** de helpers untracked (`delivery-receipt.ts` 224 + `delivery-gate.ts` 373) |

## // 005. PENDIENTE / RIESGOS

- **Ninguno en la slice cerrada.** Los 8 grupos están completados, verificados y archivados. No quedan tareas sin terminar.
- **Riesgo residual bajo — hooks de usuario post-commit:** un `commit-msg` o `post-commit` que muta contenido fuera del proceso de delivery es detectado por la barrera post-commit contra `HEAD^{tree}` antes de push/PR.
- **Riesgo residual bajo — referencias externas a proyectos/productos:** grep exhaustivo `gentle[- ]?(ai|pi)` confirma 0 matches en todo el árbol. Ninguna referencia a otros agentes, frameworks o servicios está presente en el código entregado.
- **Riesgo residual medio — evidencia archivada sin refresh automático:** si un cambio archivado se re-entrega meses después, los archivos del worktree deben coincidir con el manifiesto guardado en el recibo. El sistema valida que el árbol reconstruido coincida con el `treeSha` del recibo, pero no puede detectar cambios laterales en el worktree que no estén en el manifiesto. El requisito de summary.md presente mitiga parcialmente esto.
- **Riesgo residual bajo — identidad de publicación remota:** push y PR son un backstop de cabeza local/efectiva, no una garantía transaccional de identidad remota final. La lectura JSON post-mutación detecta la race pero no la previene.
