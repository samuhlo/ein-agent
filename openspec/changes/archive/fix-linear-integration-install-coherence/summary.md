## // 000. RESUMEN
Se corrigió la incoherencia de instalación introducida en alpha.3: el installer y ambos doctors usan ahora el contrato Linear canónico `off`/`on`, con compatibilidad heredada y fallo cerrado. La preparación local de `0.82.0-alpha.4` quedó verificada; su entrega remota sigue pendiente fuera de SDD.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/linear-integration.ts`: autoridad global por `agentDir`/hogar aislado, precedencia canónica, traducción `solo/team` y diagnóstico `missing/valid/invalid/unreadable`.
- `installer/src/cli/install.ts`, `installer/src/core/install-plan.ts`, `installer/src/core/deploy.ts`: selección, plan, resumen y persistencia alineados con Linear `off/on`; el booleano heredado queda interno.
- `installer/src/core/verify.ts` y `ein-pi/agent/extensions/ein-doctor.ts`: checks del módulo Linear y de la inyección dinámica real, sin `lib/mode.ts` ni wording retirado.
- `tests/linear-integration.test.ts`, `tests/installed-agent-inventory.test.ts`, `tests/template-agent-inventory.test.ts`, `tests/install-plan.test.ts`, `tests/installer-runtime-menu.test.ts`: regresiones de contrato, bundle staged, doctors y flujo limpio.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`: punteros coherentes en `0.82.0-alpha.4`.

## // 002. CÓMO FUNCIONA POR DENTRO
La CLI produce una selección `LinearIntegration`; deploy la traduce una sola vez al detalle interno del plan y escribe `{ "linear": "off" | "on" }` en el `agentDir` efectivo. `linear-integration.ts` resuelve ese estado con prioridad `linear`, conserva `solo → off`/`team → on` sin mutar evidencia heredada y separa el fallback operativo de la inspección fail-closed. Los doctors inspeccionan el mismo estado y validan `linear-integration.ts → readLinearIntegration → buildEinPrompt → linearDirective`; el test staged genera el bundle real, lo despliega y ejecuta ambos doctors.

## // 003. DECISIONES
- Mantener `linear-integration.ts` como única autoridad semántica, evitando parsers o módulos de modo duplicados.
- Mantener independientes las presentaciones de ambos doctors y compartir solo el contrato observable, sin refactor transversal.
- Probar la regresión mediante archive, extracción, deploy, persistencia y doctor reales; no mediante inspección aislada del árbol fuente.
- Preparar alpha.4 sin publicar localmente: GitHub Actions será la única ruta de artefactos.

## // 004. VERIFICACIÓN
- Strict-TDD activo (`openspec/config.yaml` y `preflight.json`): apply registra RED/GREEN/TRIANGULATE/REFACTOR para los ocho seams; todas las pruebas enfocadas quedaron verdes.
- Suite enfocada: 107 tests; suite completa `bun test`: 2.589 tests; `bun run typecheck` raíz y `cd installer && bun run typecheck`: PASS.
- Se verificaron `off/on`, heredados, evidencia inválida/ilegible, seams ausentes, bundle staged y paridad de ambos doctors.
- Punteros alpha.4 y contrato de release: PASS. Cleaner advisory no estuvo disponible por límites de tamaño/rechazo de alcance; es no-gating.

## // 005. PENDIENTE / RIESGOS
- Pendiente fuera de SDD: merge en `main`, tag anotado `installer-v0.82.0-alpha.4`, workflow remoto y verificación de binarios, checksums e install script.
- No se ejecutaron commit, tag, push, publicación ni build de release local. Ningún bloqueo de verificación.
