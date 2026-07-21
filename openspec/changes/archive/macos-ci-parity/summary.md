## // 000. RESUMEN
Extensión de la puerta de calidad principal a una matriz de dos runners (ubuntu-latest + macos-latest) con Bun pinado a la versión exacta `1.3.0` en una única declaración de nivel workflow, compartida por ambos. Se documentó la política de Bun en README.md y se dejó el E2E Docker como flujo manual ubuntu-latest, sin cambios.

## // 001. QUÉ CAMBIÓ

- **`.github/workflows/ci.yml`** — Se agregó `strategy.matrix.os: [ubuntu-latest, macos-latest]` y `env.BUN_VERSION: "1.3.0"` consumido por la única acción `oven-sh/setup-bun@v2`. La secuencia de pasos (checkout → setup-bun → bun install --frozen-lockfile → bun run bundle-template → bun test → bun run typecheck) se mantiene compartida e idéntica para ambos runners; no hay condición `if:` en ningún paso.
- **`README.md`** — Se añadió un bloque de política que identifica `.github/workflows/ci.yml` como fuente de la versión Bun (`1.3.0`), exige validar ambas entradas de la matriz al actualizarla y excluye expresamente la publicación, Docker E2E y soporte Windows.
- **`docs/quality-roadmap/01-macos-ci-parity.md`** — Nuevo; registra el estado `implemented-pending-verification` y mantiene sin marcar la checklist de evidencia CI hasta que el primer `macos-latest` real complete en GitHub Actions.
- **`.github/workflows/e2e.yml`** — Sin cambios (byte-identical, 0 bytes de diff). Se preservó `workflow_dispatch`, `runs-on: ubuntu-latest` y la invocación de `./e2e/docker-test.sh`.

## // 002. CÓMO FUNCIONA POR DENTRO

El workflow `.github/workflows/ci.yml` define `env.BUN_VERSION: "1.3.0"` una sola vez en la raíz del workflow. La única acción `oven-sh/setup-bun@v2` consume esa variable (`bun-version: ${{ env.BUN_VERSION }}`), con lo cual ambos runners de la matriz resuelven exactamente la misma versión. La matriz produce dos jobs independientes, cada uno con `runs-on: ${{ matrix.os }}`, ejecutando la secuencia compartida de seis pasos en el mismo orden y con los mismos directorios de trabajo (`installer/` para install/bundle/typecheck, raíz para `bun test`). No hay condición `if:` que debilite o omita un paso en macOS.

La documentación de README.md explicita que la fuente de verdad de la versión Bun es la variable `BUN_VERSION` del workflow, que al actualizarse requiere pasar ambas entradas de la matriz en CI para considerarse válida, y que la política se limita a la puerta de calidad principal (excluye E2E y release).

## // 003. DECISIONES

| Decisión | Razón |
|---|---|
| Pin exacto `1.3.0` en lugar de familia `1.3.x` o `latest` | Evita drift irrecuperable; es el mínimo reproducible que satisface el requisito de proyecto `>= 1.3` y `@types/bun ^1.3.0`. |
| Una declaración `env.BUN_VERSION` compartida, no dos valores por SO | Garantiza que ambos runners usen la misma versión y que cualquier actualización sea un único cambio revisable. |
| Matriz con un único bloque `steps`, sin duplicar jobs | Mantiene la paridad estructural: cualquier modificación a la secuencia se aplica a ambos SO sin posibilidad de divergencia accidental. |
| `e2e.yml` fuera del pin y de la matriz | El E2E Docker es manual y Ubuntu-only por diseño; modificar su Bun selector habría ampliado el alcance más allá de la puerta de calidad. |
| E2E y release workflows no tocados | Consistent con el alcance; la política de Bun se documenta como "calidad main gate only". |

**Alternativas descartadas:** `latest` (no reproducible), familia `1.3.x` (patch drift), valores separados por SO (riesgo de divergencia), archivo de versión-repo-wide (sobreingeniería para un solo workflow), uso de `package.json` como autoridad de Bun (no lo era previamente).

## // 004. VERIFICACIÓN

**Verificador:** `sdd-verify` · 2026-07-21 · `behavior_coverage: partial`

| Verificación local (Linux) | Resultado |
|---|---|
| `cd installer && bun install --frozen-lockfile` | ✅ exit 0 — 9 installs / 10 paquetes, sin cambios contra bun.lock |
| `cd installer && bun run bundle-template` | ✅ exit 0 — template.tar.gz generado (0.84 MB) |
| `bun test` | ✅ exit 0 — 655 pass / 0 fail / 1948 expect() calls en 73 archivos, 4.19 s |
| `cd installer && bun run typecheck` | ✅ exit 0 — `tsc --noEmit` limpio |

| Inspección estática | Resultado |
|---|---|
| Matriz `ubuntu-latest` + `macos-latest` declarada | ✅ `.github/workflows/ci.yml` líneas 20-22 |
| `env.BUN_VERSION: "1.3.0"` único y consumido por el único `setup-bun` | ✅ línea 15 + línea 28 |
| Sin condición `if:` en pasos compartidos | ✅ `grep -nE '^\s*if:'` vacío |
| `e2e.yml` byte-identical, `workflow_dispatch` + `ubuntu-latest` | ✅ diff 0 bytes |
| README.md no reclama Windows ni publicación | ✅ |
| Lockfile / package.json / tsconfig.json sin cambios | ✅ `git diff HEAD` vacío |

**Restricción conocida — comportamiento macOS no observado:** La matriz está correctamente declarada y es estructuralmente equivalente en ambos SO, pero la ejecución real en el runner `macos-latest` de GitHub Actions no se ha observado en esta sesión. Los modos de fallo específicos de macOS (`tar` flags, case sensitivity, permisos de archivo, herramientas de shell) quedan latentes hasta el primer run real de GitHub Actions. Esta es la única razón por la que `behavior_coverage` es `partial` y no `verified`.

## // 005. PENDIENTE / RIESGOS

- **Cierre de evidencia macOS:** Requiere al menos un run de GitHub Actions donde ambas entradas de matriz (`ubuntu-latest` y `macos-latest`) completen con exit 0. Una vez disponible el URL del run, marcar la checklist en `docs/quality-roadmap/01-macos-ci-parity.md` (`Matriz declarada` / `Política Bun documentada` / `Evidencia de CI archivada`).
- **Bun `e2e.yml` sigue en `latest`:** Intencional y fuera de alcance (política documentada como "main quality gate only"). No requiere acción en este slice.
- **Árbol de trabajo sucio:** Hay cambios no relacionados en el árbol (release-experience-roadmap, zero-friction-sdd-start, etc.). El diff de `macos-ci-parity` no está staged ni commiteado; la entrega es responsabilidad del padre / `ein-git`.
- Ningún riesgo bloqueante para el cierre de este SDD.
