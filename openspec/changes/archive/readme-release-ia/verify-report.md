# Verificación — readme-release-ia

**status: pass**

**behavior_coverage: verified**

La remediación cierra el bloqueo anterior: `README.md` diferencia el bootstrap piped por plataforma y el control offline lo contrasta contra las ramas reales de `installer/install.sh`. En Linux sólo reabre la TUI si existe `/dev/tty`; en macOS indica ejecutar `ein` después de instalar. No se ejecutó el bootstrap porque esta fase prohíbe red e instalaciones.

## Evidencia de comandos

| Comando ejecutado | Resultado | Evidencia |
|---|---|---|
| `timeout 300 bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts` | PASS | 12 tests, 0 fallos, 75 aserciones, 255 ms. Incluye el contrato de TUI por plataforma y el contrato de assets. |
| `cd installer && timeout 300 bun run typecheck` | PASS | `tsc --noEmit` terminó sin diagnósticos. |
| `timeout 300 git diff --check` | PASS | Sin salida; no hay errores de whitespace en el diff rastreado. |
| `git diff --no-index --check /dev/null tests/readme-release-ia.test.ts` | PASS de whitespace | Sin diagnóstico de whitespace; el código 1 esperado corresponde a comparar un archivo nuevo con `/dev/null`. |

No se ejecutaron builds, red, instalaciones ni acciones de entrega Git.

## Trazabilidad de diseño y escenarios

| Requisito / escenario | Estado | Evidencia |
|---|---|---|
| R1–R2: entrada progresiva, único bootstrap Bash y enlace semántico | PASS | La prueba comprueba que la ruta rápida aparece antes de `// 000`, contiene el único one-liner y enlaza descriptivamente a `#instalacion-detallada`. |
| R3–R4: release, fecha, anchor, tres hechos y fuentes locales | PASS | La prueba confronta README, primera cabecera de `CHANGELOG.md`, `installer/package.json`, `INSTALLER_VERSION`, el anchor calculado y `installer-v*`. Exige exactamente tres bullets. |
| R5: guía de modelos durable | PASS | La prueba exige criterios de capacidad/riesgo/coste, `/ein:models`, `/ein:models:full`, `/ein:models:lite`, decisión humana y ausencia acotada de nombres volátiles. |
| R6: único canal confirmado y WSL como camino Linux | PASS | El README sólo presenta bootstrap; la prueba rechaza `brew install ein` y claims Homebrew para Ein. |
| R7: límites de verdad y remediación de TUI | PASS | `describe el inicio de la TUI condicionado por plataforma` verifica en `installer/install.sh` la rama Linux `elif [ "$OS" = "linux" ] && [ -e /dev/tty ]; then`, el mensaje macOS `Ejecuta ... ein ... para empezar`, y el copy exacto del README. El resumen no incorpora updater, Engram ni banner; Engram conserva sus límites y `ein update` no promete actualizar Pi. |
| R8: identidad, anchors y accesibilidad | PASS | Se mantienen badges y numeración `// 000`–`// 015`; existe anchor explícito y label descriptivo para instalación detallada. |
| R9: control offline y acotado | PASS | `tests/readme-release-ia.test.ts` sólo lee archivos locales y cubre orden, metadatos, instalación, TUI, modelos, Homebrew y tag genérico. |
| R10 y frontera de alcance: Homebrew bloqueado | PASS | `design.md` mantiene `homebrew-install-channel` bloqueado; el diff no modifica versiones, workflow, instalador, presets, dependencias ni canales. |

## Estado de tareas y calidad

- `tasks.md`: 1.1, 1.2 y 2.1–2.4 están marcadas como completadas; no hay tareas pendientes.
- `strict_tdd: false` en `openspec/config.yaml`; no aplica el gate de tabla `TDD Cycle Evidence`.
- Calidad de aserciones: adecuada. No hay tautologías ni smoke-only: el test compara fuentes independientes, cuenta invariantes y vincula el copy de plataforma con las ramas concretas del script.
- Regresiones: no detectadas en el contrato README/assets, tipado o whitespace.

## Diff, alcance y árbol

El diff rastreado modifica `README.md` (31 inserciones, 20 eliminaciones). El cambio añade sin rastrear `tests/readme-release-ia.test.ts` y los artefactos OpenSpec de este change; no hay archivos staged (`git diff --cached --name-only` no devolvió rutas).

Hay archivos no rastreados ajenos en el árbol (`EIN.md`, otros changes OpenSpec, `openspec/config.yaml` y `tests/sdd-config-bootstrap.test.ts`). No se modificaron durante esta verificación ni forman parte de esta trazabilidad.

## Riesgos residuales

1. El contrato es offline y no confirma que GitHub sirva actualmente la release o sus assets; esa comprobación está fuera de alcance y prohibida en esta fase.
2. La distinción Linux/macOS se verifica mediante el contrato textual y las ramas presentes de `installer/install.sh`, no mediante un smoke real en ambos sistemas; una prueba de integración por plataforma sería cobertura adicional, no un bloqueo del cambio documental.
3. `git diff --check` sólo cubre el diff rastreado; se verificó separadamente el whitespace del nuevo test, pero los demás artefactos OpenSpec siguen no rastreados.

skill_resolution: paths-injected
memory_persistence: no disponible; el informe queda persistido en OpenSpec.
