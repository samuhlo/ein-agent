## // 000. RESUMEN
Se entregó el contrato 1A de canales `stable`/`alpha` para Ein: selección determinista, persistencia aislada, identidad inmutable y rollback local auditable. La verificación fresca confirma el flujo completo y no quedan bloqueos.

## // 001. QUÉ CAMBIÓ
- `installer/src/core/release-types.ts`: vocabulario cerrado, estados de resolución, `artifactId` canónico y validación de tags/digests.
- `installer/src/core/release-channel-preference.ts`: preferencia por instalación, escritura atómica/read-back y fail-closed.
- `release-record.ts`, `release-resolver.ts`, `acquisition.ts`: lista acotada de candidatos, adaptación compartida y elección SemVer más alta: stable solo final; alpha final o prerelease `alpha`.
- `marker-v2.ts`, `transaction.ts`: identidad verificada antes del commit y evidencia local de transición/rollback, incluida finalización de recuperación exitosa.
- `update-advisor-read.ts`, `cli/update.ts`, `cli/result.ts`: preferencia y canal efectivo visibles por separado, con versión, identidad y frescura honesta.
- Tests y fixtures en `tests/release-update-*.test.ts`, `tests/installer-runtime-menu.test.ts` y documentación de valoración; sync de `installer-release-channels` aplicado sin conflictos.

## // 002. CÓMO FUNCIONA POR DENTRO
La CLI lee primero la preferencia bajo la instalación Ein: ausencia significa `stable`; bytes inválidos o ilegibles producen `unavailable` y detienen cualquier mutación. El canal efectivo viaja por transacción, dry-run, descubrimiento acotado (`per_page=30`), adquisición y marcador.

Los candidatos se normalizan con un único validador y el resolver aplica elegibilidad y orden SemVer antes de adquirir. La adquisición puede mantener identidad pendiente; tras verificar SHA-256 deriva `<tag-normalizado>@sha256:<digest>` y el gate impide mutar marcador si falta o hay conflicto. El marcador y el journal preservan esa identidad, árbol gestionado, backup, estado y resultado de rollback. La evidencia remota y la recuperación local solo se correlacionan mediante `artifactId`; no comparten autoridad.

## // 003. DECISIONES
- Preferencia propia de la instalación, no `settings.json` del proyecto cliente, para preservar sus bytes y su canal estable.
- Fail-closed para corrupción, conflictos e incertidumbre; nunca se convierte evidencia desconocida en `current`.
- Alpha admite finales y `alpha`/`alpha.N`, pero no beta/rc/desconocidos; identidad se exige en commit, no durante selección.
- Cleaner detectó cuatro brechas: alpha no llegaba a la transacción, recuperación exitosa bloqueaba la siguiente ejecución, fetch ignoraba el máximo SemVer y parsers de tag divergían. Se remediaron con los grupos 008–015; la refactorización de complejidad 29 quedó fuera.

## // 004. VERIFICACIÓN
Strict TDD: grupos 001–015 completos con evidencia RED → GREEN → TRIANGULATE → REFACTOR. Suite completa: 2.399 tests y 9.913 assertions; focused, adquisición, integración, menú y vocabulario en verde; typechecks raíz e `installer` pasan; `git diff --check` pasa. `verify-report.md` queda en `status: pass` y `sync-report.md` sincronizado, sin conflictos.

## // 005. PENDIENTE / RIESGOS
- 1B explícitamente diferido: publicación remota, promoción/rollback remoto, firmas, trust roots y metadata inmutable del productor.
- Sin evidencia inmutable de publicación y política determinista, la expiración alpha permanece `unknown`/`unavailable`; no se infiere por reloj, instalación o descarga.
- La paginación completa del candidate-list sigue diferida; el fetch actual está acotado a 30 releases y puede no observar candidatos más antiguos.
- No se ejecutó build ni publicación; no hubo commit ni push. Ninguno adicional conocido.
