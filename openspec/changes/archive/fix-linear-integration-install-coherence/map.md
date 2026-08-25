status: mapped
scope_status: bounded
change: fix-linear-integration-install-coherence
phase: map

## Mapa de superficies

### Produccion: installer
- `installer/src/cli/install.ts`: la pregunta usa `teamMode`, convierte a `skipLinear` y reporta `Modo Solo/Team`; es la costura de selección y resumen que debe usar `linear off/on`.
- `installer/src/core/deploy.ts`: `deployTemplate` escribe `{ mode: "solo" | "team" }` en `ein-mode.json`; debe escribir el estado global canónico consumido por `globalLinearIntegrationConfigPath`, conservando ruta y aislamiento.
- `installer/src/core/install-plan.ts`: las razones del plan interpolan `solo/team` desde `skipLinear`; confirmar si deben alinearse para no dejar vocabulario actual obsoleto en el flujo de instalación.
- `installer/src/core/verify.ts`: `checksCoherence` exige `lib/mode.ts` y texto estático `work mode`/`solo`; sustituir por checks del módulo Linear y la costura dinámica de `extensions/ein-ai.ts`, con fallo ante ausencias/lecturas inválidas.

### Produccion: runtime
- `ein-pi/agent/lib/linear-integration.ts`: autoridad existente (`off/on`, prioridad `linear`, `solo/team` heredado, inspección `missing/valid/invalid/unreadable`, `linearDirective`). No rediseñar; solo tocar si el contrato del doctor demuestra una carencia acotada.
- `ein-pi/agent/extensions/ein-ai.ts`: `buildEinPrompt` inyecta `linearDirective(linear)` dinámicamente; es la seam que deben reconocer ambos doctors y no se observa necesidad de cambiarla.
- `ein-pi/agent/extensions/ein-doctor.ts`: `doctorSmokeReport` replica checks obsoletos (`lib/mode.ts`, texto de orchestrator); debe validar módulo actual, seam dinámica y evidencia Linear fail-closed.

### Bundle y regresión staged
- `installer/scripts/bundle-template.ts`: tarball desde `ein-pi/core`/`ein-pi/agent`, con `lib`, `extensions`, assets y manifest; la regresión debe usarlo, no solo el source tree.
- `installer/scripts/build-all.ts` y `bundle-template-host.ts`: ordenan app/template; son referencias de la ruta actual, no objetivos salvo carencia demostrada.
- `tests/installed-agent-inventory.test.ts`: ya crea y extrae bundle con `bun run bundle-template.ts`; arnés principal para staged clean install.
- `tests/template-agent-inventory.test.ts`: inventario de allowlist; candidato para comprobar que Linear/doctor/ai llegan al payload y `mode.ts` no se reintroduce.

### Pruebas a extender/reutilizar
- `tests/linear-integration.test.ts`: ya cubre round-trip canónico, `solo/team`, precedencia, corrupto/desconocido, inspección y directivas. Extender únicamente para cualquier API de coherencia que exista tras diseño; conservar resolver tolerante separado de inspector fail-closed.
- `tests/install-plan.test.ts`, `tests/install-journal.test.ts`, `tests/install-completed-journal-reentry.test.ts`: cubren plan, ejecución y reentrada; reutilizar handlers para demostrar llegada a `pi.verify-doctor`, sin ampliar journal.
- `tests/installer-runtime-menu.test.ts`: solo si cambia una aserción de superficie CLI; no duplicar staged.

### Versionado
- `installer/package.json` y `installer/src/core/version.ts` están en `0.82.0-alpha.3`; deben coincidir en alpha.4.
- `CHANGELOG.md` tiene alpha.3 como entrada principal; añadir alpha.4 con la corrección de coherencia, doctors y staged install.

## Flujo que queda preparado

Selección CLI/default → persistencia global canónica → bundle actual desplegado → installer/runtime doctor validan `linear-integration.ts` y la inyección dinámica → `off/on` y heredados `solo/team` resuelven correctamente, mientras evidencia inválida/ilegible falla → fixture staged alcanza completado. Tests, typechecks, builds y publicación quedan para apply/verify/entrega; no se ejecutaron en map.

## Ledger Contract

ledger:
  reads:
    - { path: "/Users/samu/.pi-ein/agent/skills/local/ein-discipline/SKILL.md", lines: "1-101", estimated_tokens: 800 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/architecture/SKILL.md", lines: "1-110", estimated_tokens: 900 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/nuxt-ui/SKILL.md", lines: "1-70", estimated_tokens: 400 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/skill-registry/SKILL.md", lines: "1-65", estimated_tokens: 500 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/vitest/SKILL.md", lines: "1-60", estimated_tokens: 450 }
    - { path: "openspec/changes/fix-linear-integration-install-coherence/scope.md", lines: "1-120", estimated_tokens: 1800 }
    - { path: "openspec/changes/fix-linear-integration-install-coherence/specs/installer-runtime-coherence/spec.md", lines: "1-38", estimated_tokens: 450 }
    - { path: "ein-pi/agent/lib/linear-integration.ts", lines: "23-170", estimated_tokens: 750 }
    - { path: "ein-pi/agent/lib/persona.ts", lines: "66-114", estimated_tokens: 300 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: "415-425", estimated_tokens: 120 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts", lines: "200-562", estimated_tokens: 1800 }
    - { path: "installer/src/core/verify.ts", lines: "240-305", estimated_tokens: 450 }
    - { path: "installer/src/core/deploy.ts", lines: "58-150", estimated_tokens: 500 }
    - { path: "installer/src/cli/install.ts", lines: "660-695", estimated_tokens: 250 }
    - { path: "installer/src/core/install-plan.ts", lines: "130-150", estimated_tokens: 100 }
    - { path: "installer/scripts/bundle-template.ts", lines: "1-180", estimated_tokens: 900 }
    - { path: "installer/scripts/build-all.ts", lines: "1-60", estimated_tokens: 300 }
    - { path: "tests/linear-integration.test.ts", lines: "1-125", estimated_tokens: 500 }
    - { path: "tests/template-agent-inventory.test.ts", lines: "1-80", estimated_tokens: 550 }
    - { path: "tests/installed-agent-inventory.test.ts", lines: "1-85", estimated_tokens: 550 }
    - { path: "installer/package.json", lines: "1-15", estimated_tokens: 100 }
    - { path: "installer/src/core/version.ts", lines: "1-25", estimated_tokens: 150 }
    - { path: "CHANGELOG.md", lines: "1-20", estimated_tokens: 150 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 11920, reads: 23 }
  budget_exceeded: false

skill_resolution: paths-injected
