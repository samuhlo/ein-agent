# Verify report — materialize-claude-orchestrator-asset

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Resultado ejecutivo

El delta pasa: la admisión fail-closed del payload, el hand-off real hasta el home aislado y el smoke BunFS compilado están cubiertos por pruebas observables, la suite completa está verde (2278/2278), ambos typechecks están limpios y el ejecutable compilado corre fuera del checkout con exit 0.

La fase apply encontró y corrigió un defecto real de distribución que ninguna prueba de Bun podía ver: el resolver del payload probaba existencia con `realpathSync`, que falla sobre rutas BunFS, de modo que el instalador compilado no podía resolver su propio payload embebido. Es exactamente el fallo que R4 existe para detectar.

Un límite queda declarado, no oculto: el binario `bun-linux-x64` compila aquí pero no se puede ejecutar en macOS; la ejecución Linux real la aporta el job de release, ya cableado y sin cambios.

## Cobertura de spec

| Requisito | Evidencia | Resultado |
|---|---|---|
| R1 — Admisión fail-closed del payload | `tests/installer-runtime-menu.test.ts`: 10 casos de rechazo (manifest ausente, malformado, incompleto, duplicado, ruta inválida, digest inválido, miembro no listado, fichero requerido que es directorio, directorio requerido que es fichero, miembro requerido ausente), cada uno comprobando que el parent de staging queda vacío | PASS |
| R2 — Materialización portable y paridad staged | `stages an explicit archive and rejects missing assets without cwd fallback` (bytes del archive preservados, copia dentro del root, cleanup idempotente) + smoke compilado desde `/tmp` con el resolver BunFS sin argumento | PASS |
| R3 — Hand-off existente hasta el home aislado | `packaged payload reaches the isolated Claude home with canonical orchestrator bytes`: bundler real → stage real → `runClaudeInstall()` con home temporal → `<home>/.claude-ein/assets/orchestrator.md` regular y byte-idéntico al miembro staged y al canónico. `a real staged payload whose sync fails installs no launcher, asset, or leftover stage` prueba el orden fail-closed con stage real | PASS |
| R4 — Prueba de distribución compilada | Smoke compilado ejecutado desde `/tmp` (exit 0) tras corregir la resolución BunFS; compilación `bun-linux-x64` verde; `tests/release-asset-contract.test.ts` mantiene el orden build → smoke → checksums y ahora exige hand-off, asset canónico y cleanup en el smoke | PASS |

El delta `specs/installer-runtime/spec.md` (escenario `claude-payload-materializes-canonical-orchestrator`) queda cubierto por las cuatro filas: rechazo de payload incompleto o con checksum inválido, extracción desde asset BunFS compilado y home instalado con `assets/orchestrator.md` byte-idéntico, sin reimplementar transporte ni sync.

## Completitud de tareas

`tasks.md` marca 10/10. La evidencia de apply contiene ciclo RED/GREEN/TRIANGULATE/REFACTOR para los cinco seams declarados. Dos matices honestos sobre el RED:

1. El seam del grupo 002 no pudo tener un RED por fallo de aserción en la suite, porque la copia del asset ya estaba cableada en `cc-ein/sync.ts` por trabajo dirty protegido. El RED se demostró con un control negativo reproducible: mismo `runClaudeInstall()` con home aislado contra un root que usa el `cc-ein/sync.ts` de `HEAD` (sin la copia) → `install.ok=true installed=false`, es decir, instalación que se declara exitosa sin entregar el asset. Esa es justo la mentira que el test nuevo impide.
2. El seam del grupo 003 tuvo dos REDs reales y consecutivos: archive generado obsoleto (`Payload cc-ein incompleto`) y resolución BunFS (`No se encontro el payload cc-ein: /$bunfs/root/...`), ambos con exit 1 antes del arreglo.

## Plan de comandos y resultados

| # | Comando normalizado | Seams cubiertos | Origen | Resultado |
|---:|---|---|---|---|
| 1 | `bun test tests/cc-payload-entrypoints.test.ts tests/release-asset-contract.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts` | Agregado focal: transporte, contrato de release, admisión, hand-off, wiring | design Verificación requerida; tasks 2.3/3.3 | PASS — 89/89 |
| 2 | `bun test` | Puerta global del proyecto | `openspec/config.yaml`; design | PASS — 2278/2278 en 172 ficheros |
| 3 | `bun run typecheck` | Typecheck de raíz (cubre `ein-pi` y `cc-ein`) | design; EIN.md | PASS |
| 4 | `cd installer && bun run typecheck` | Typecheck del instalador | design; tasks 1.4 | PASS |
| 5 | `cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke` | Portabilidad compilada del target de release | tasks 3.1–3.3; workflow | PASS — ELF x86-64 generado (119 MB) |
| 6 | `cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-darwin-arm64 --outfile <scratch>/ein-cc-payload-smoke-host` + `(cd /tmp && <scratch>/ein-cc-payload-smoke-host)` | Ejecución real del smoke fuera del checkout: BunFS, hand-off, paridad, cleanup | Sustituto ejecutable de la fila 5 en macOS | PASS — exit 0 |
| 7 | Auditoría de límites: `git diff --check`; partición de `git status`; `git check-ignore` del archive; `git diff --stat` sobre `.github/`, `cc-ein/`, `ein-pi/agent/assets/` | Rutas protegidas y output generado | design Boundaries; tasks guardrails | PASS |

No hay binario `timeout`/`gtimeout` en esta máquina; los comandos se ejecutaron directamente y todos terminaron por sí solos.

## Disposición de comprobaciones globales

- `bun test`: **ejecutado**, exigido por config y design; PASS.
- `bun run typecheck` y `cd installer && bun run typecheck`: **ejecutados**, dos puertas distintas; PASS.
- Smoke compilado: **ejecutado** en target host y **compilado** en target Linux; la ejecución Linux pertenece al job de release.
- Lint / format / coverage: **no aplican** — los comandos correspondientes están vacíos en `openspec/config.yaml`; no se inventa ninguno.
- Publicación, tags, checksums de release: **fuera de alcance** por diseño; no se ejecutó ninguno.

## Auditoría de límites

- Ficheros tocados por este cambio: `installer/src/core/cc-payload.ts`, `installer/scripts/cc-payload-smoke.ts`, `tests/installer-runtime-menu.test.ts`, `tests/release-asset-contract.test.ts` y los artefactos SDD del cambio.
- `installer/src/assets/cc-ein-runtime.tar.gz` regenerado: ignorado por `installer/.gitignore`, output desechable, nunca fuente.
- Sin hunks nuevos en `.github/workflows/installer-release.yml`, `cc-ein/sync.ts` (mantiene sus 9 inserciones previas), `ein-pi/agent/assets/orchestrator.md`, `installer/src/cli/install.ts`, `installer/src/core/cc-payload-inventory.ts`, `installer/scripts/bundle-cc-ein.ts`, `installer/install.sh` ni `installer/src/core/settings.ts`.
- El resto del árbol sucio (trabajo A1–A3 y untracked) permanece intacto: ni reset, ni reordenación, ni absorción.
- `git diff --check`: limpio.

## Desviaciones aceptadas

1. `installer/src/core/cc-payload.ts` se tocó en el grupo 003 pese a su límite de fichero. El diseño autoriza salir del seam con evidencia concreta de que no funciona, y el RED compilado la aportó. Cambio mínimo: `realpathSync` → `statSync` en la prueba de existencia, conservando mensajes y la prohibición de fallback a cwd.
2. `tests/release-asset-contract.test.ts` cambió una aserción: exigía el literal `staged?.cleanup()` en el smoke, incompatible con D3 (la limpieza la posee `runClaudeInstall()`). Se sustituyó por aserciones sobre `runClaudeInstall`, `CC_EIN_ORCHESTRATOR_ASSET` y el mensaje de cleanup, que describen un contrato más fuerte.

## Riesgos residuales

- **La regresión BunFS solo la detecta el smoke compilado.** `bun test` no compila binarios, así que un futuro `realpath` sobre el asset embebido volvería a pasar la suite y romper el instalador publicado. El guardián real es el job de release, que corre el smoke antes de checksums; el contrato de ese orden está testeado.
- **El smoke compilado pesa 119 MB** porque `install.ts` arrastra `template.tar.gz` embebido. Es coste de CI, no de distribución: el binario del smoke no se publica y el contrato de assets publicados lo verifica.
- **El test de composición ejecuta el sync real** (proceso hijo, ~3 s, `claude mcp` opcional y `bun build --compile` incluidos). Está aislado en `HOME`/`CC_EIN_HOME` temporales, pero es el test más caro de la suite y el primero que se resentirá si `sync.ts` gana trabajo pesado.
- **Riesgos de parser del bundler heredados** (traversal de imports relativos fuera de `repoRoot` e imports estáticos side-effect-only) siguen diferidos por diseño; ninguna entrada actual del payload los ejercita.
