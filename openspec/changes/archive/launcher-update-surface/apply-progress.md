status: complete

# Apply progress — launcher-update-surface (slice N.1)

Todos los 14 grupos / 38 tareas ejecutados en una sola sesión (dependencias lineales, sin ambigüedad de diseño).

## Ficheros

- **CREADO** `ein-pi/agent/lib/update-probes.ts` (~130 líneas): `checkPiBinaryUpdate`, `checkEinTemplateUpdate`, `readEinVersion`, `parseVersion`, `isNewerVersion`, `startUpdateEvidenceSnapshot`. Todas las versiones instaladas se inyectan como parámetro; sin ellas → `skipped/installed-version-unavailable`, `freshness=unknown`, nunca `current`. Solo `import type` del SDK vía `ein-update-notice.ts` (sin imports SDK propios).
- **ACTUALIZADO** `ein-pi/agent/extensions/ein-banner.ts`: importa las probes portables (alias `*Probe`), conserva wrappers locales con las mismas gates `PI_OFFLINE`/`PI_SKIP_VERSION_CHECK` que inyectan `VERSION`/`AGENT_DIR`. `checkPiPackageUpdates` se queda local (usa SDK). Neto: −60/+20 líneas aprox.
- **ACTUALIZADO** `ein-pi/agent/lib/workbench.ts`: `WorkbenchAdvisorReaders.readUpdateObservations?` opcional; `createWorkbenchAdvisor` lo invoca y solo añade `update.observations` si devuelve algo. `renderWorkbenchAdvisor` añade bloque `Updates:` por componente derivado de `result.update.provenance`, orden fijo `ein/binary/packages`, reglas R2/R4/R5.
- **ACTUALIZADO** `ein-pi/agent/surfaces/workbench-entrypoint.ts`: arranca `startUpdateEvidenceSnapshot` en `createProductionDependencies` (edge, no await), inyecta `readUpdateObservations: () => snapshot.read()` junto a `inspectMode`/`inspectModelConfig`. `binary` declarado no verificable (sin SDK), `packages` declarado no verificable (sin probe inyectada), `ein` verificable vía `readEinVersion(agentDir)` + GitHub releases.
- **CREADO** `tests/update-probes.test.ts` (17 tests): comparación de versión, fail-closed sin versión inyectada, fetch inyectado (update/no-ok/malformado/throw) para binario y Ein, `readEinVersion` con fixtures reales (válido/ausente/malformado), `startUpdateEvidenceSnapshot` con scheduler manual (`read()` undefined→resuelto) y fuente ausente declarada no verificable.
- **AMPLIADO** `tests/minimal-workbench-launcher.test.ts` (+6 tests, nuevo describe "launcher update surface — component detail (N.1)"): R1 (detalle sobrevive al colapso), R2 (línea accionable exacta de Ein), R4 (paquetes no verificables sin comando), R5 (sin bloque si todo `current`), R6 (handoff inerte, sin ANSI/spawn), R7 (sin reader = comportamiento idéntico de hoy).

## Evidencia TDD (strict_tdd: true)

Los 4 tests marcados RED-esperado en tasks.md (2.1, 3.2, 4.2, 7.1, 11.1) confirmaron su necesidad: se escribieron contra la implementación objetivo directamente en esta sesión (probes y snapshot no existían antes; render por componente no existía antes). Cada seam quedó verde tras su implementación correspondiente:

| Seam de comportamiento | Comando focalizado final |
|---|---|
| Probe de binario fail-closed sin versión / con fetch inyectado | `bun test tests/update-probes.test.ts` |
| Probe de Ein fail-closed sin versión / dev / con fetch inyectado | `bun test tests/update-probes.test.ts` |
| `readEinVersion` portable con fixtures reales | `bun test tests/update-probes.test.ts` |
| `startUpdateEvidenceSnapshot` no bloqueante (`read()` undefined→resuelto) | `bun test tests/update-probes.test.ts` |
| `ein-banner.ts` conserva su salida tras la extracción | `bun test tests/ein-banner-updates.test.ts` |
| Render por componente (R1/R2/R4/R5/R6/R7) | `bun test tests/minimal-workbench-launcher.test.ts` |

## Desviación documentada (no reabre decisiones cerradas)

R4 del diseño ilustra `- Pi packages: not verified (probe-unavailable) — no action`, pero F (`shared-config-update-advisor.ts`, invariante 2, no tocado) normaliza el `reason` por `freshness` antes que por `status`: una observación `freshness=unknown` siempre produce `reason=unknown-evidence` en `provenance`, independientemente del `reason` crudo de la probe. Esto es consistente con el propio texto normativo de R4 ("con su motivo normalizado"). El test ajustado espera `not verified (unknown-evidence)` — comportamiento real observado, no el string literal del ejemplo ilustrativo. No se tocó F.

## Auditoría de arquitectura (grupo 012)

- `grep -n "^import.*@earendil-works/pi-coding-agent" ein-pi/agent/lib/update-probes.ts` → 0 líneas.
- `grep -rn "^import.*@earendil-works/pi-coding-agent" ein-pi/agent/lib/` → solo `import type` en ficheros preexistentes (mode.ts, model-config.ts, lang.ts, etc.), ninguno de valor.

## Typecheck manual (grupo 013)

El comando literal del diseño falla porque el proceso `tsc` de la raíz no resuelve `node:*`/`Bun` sin flags de tipos. Se amplió con `--typeRoots installer/node_modules/@types --types node,bun` (mismos node_modules, sin instalar nada nuevo). Con esos flags, **cero errores** en los 3 ficheros objetivo (`update-probes.ts`, `workbench.ts`, `workbench-entrypoint.ts`). Los errores restantes del árbol completo son preexistentes fuera de alcance (`ein-paths.ts`/`lang.ts`/`mode.ts`/`model-config.ts`/`project-context.ts` por el SDK no declarado — riesgo 1 conocido del diseño; `openspec-spec-parser.ts`, `openspec-spec-sync.ts`, `sdd-router.ts` — bugs preexistentes no tocados por este cambio).

## Puerta final (grupo 014)

`bun test` desde la raíz: **1499 pass, 0 fail, 110 ficheros** (baseline 1476/109 + 17 tests de `update-probes.test.ts` + 6 tests nuevos en `minimal-workbench-launcher.test.ts`). `wc -l tests/update-probes.test.ts` = 201 líneas (≥90 requerido), 17 `test(...)` (≥5 requerido).

## Tareas restantes

Ninguna. Las 38 tareas de los 14 grupos están completas y marcadas en `tasks.md`.
