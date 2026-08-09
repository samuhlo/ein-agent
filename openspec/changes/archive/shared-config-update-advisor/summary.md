## // 000. RESUMEN
Se entregó un asesor compartido, determinista y de solo lectura para configuración y actualizaciones. Normaliza evidencia, conserva incertidumbre y ofrece handoffs inertes, sin trasladar ninguna acción de instalación o actualización fuera del instalador.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/shared-config-update-advisor.ts`: contrato inmutable de dos facetas, evaluación fail-closed, provenance acotada y formateo semántico.
- `ein-pi/agent/lib/mode.ts`, `model-config.ts`: inspectores aditivos de estado, precedencia, defaults, errores y evidencia legacy, sin romper lectores existentes.
- `ein-pi/agent/lib/ein-update-notice.ts`, `ein-banner.ts`: migración a evidencia status-preserving; booleano solo en el borde de compatibilidad y startup no bloqueante.
- `ein-pi/agent/lib/workbench.ts`, `ein-pi/workbench.ts`: integración de asesor/render compartido con estado de proyecto suministrado por B.
- `installer/src/core/update-advisor-read.ts`, `marker-v2.ts`, `installer/src/cli/doctor.ts`: lectura de evidencia installer-owned y presentación de handoff cerrado.
- Tests focalizados y de regresión en `tests/shared-config-update-advisor.test.ts`, mode/model, banner, workbench, release y menu.

## // 002. CÓMO FUNCIONA POR DENTRO
El evaluador puro recibe evidencia ya observada y produce facetas independientes de configuración y actualización, con status, freshness, reason, provenance y recommendation deterministas. Solo evidencia fresca, válida y coherente puede producir `current` o `update-available`; lo faltante, stale, ilegible, conflictivo, unsupported o ambiguo falla cerrado. B sigue siendo la única autoridad del snapshot de proyecto, sin cache ni reproyección.

Los consumidores (launcher/workbench, aviso Pi-Ein y doctor) renderizan el mismo resultado semántico. El handoff es únicamente `{ owner, action, actionId, performed: false }`; no contiene callback ni ejecutable. Instalación, update, repair, release y configuración mutante siguen detrás de los límites existentes del instalador. Ningún handoff se ejecuta, despacha o presenta como realizado.

## // 003. DECISIONES
- F-001: wiring del launcher hacia el factory/read path inyectable, sin lógica de updater.
- F-002: doctor compone evidencia y conserva su ownership de exit/report, sin dispatch.
- F-003: capability y owner deben ser conocidos, soportados y coherentes para handoff; IDs de acción exactos.
- F-004: se preserva incertidumbre de timeout/rechazo/malformed; el booleano queda solo como compatibilidad.
- F-005: salida sanitizada y lectura estrictamente sin writes/spawns.
- F-006: owner/capability inválidos, ilegibles, error, missing, ambiguous o unsupported no son accionables.
- F-007: owner externo es `unsupported` incluso con versión igual o nueva; solo el owner installer coherente puede producir handoff.
- Rollback: revertir wiring y adapters aditivos; no hay migración, cleanup ni estado persistido. Los writers/transacciones del instalador permanecen intactos.

## // 004. VERIFICACIÓN
- Suites focalizadas: 39 + 65 + 16 + 81 tests, 0 fallos; `cd installer && bun run typecheck` pasó.
- Suite completa: `bun test`, 1.290 tests, 0 fallos, 4.630 assertions en 97 archivos.
- Probes frescos: matriz owner/capability negativa y owner externo sin handoff; caso válido produjo solo handoff inerte.
- Privacidad/inmutabilidad: ESC/CR sanitizados, resultado congelado, marker unchanged, writes=0 y spawns=0.
- Scan de scope/ownership, assertion audit y `git diff --check` (incluyendo untracked) pasaron; sin acciones mutantes añadidas.

## // 005. PENDIENTE / RIESGOS
- Delta productivo aproximado de 970 líneas, sobre el presupuesto de review de 400; la topología de entrega queda fuera de esta fase.
- `EinUpdateAvailability` sigue en el borde de compatibilidad, no en la semántica canónica.
- El factory `productionDependencies` del workbench está cableado pero no invocado directamente por un test focalizado; el comportamiento downstream está verificado.
