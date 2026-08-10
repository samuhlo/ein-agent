## // 000. RESUMEN

Primera slice (N.1) del bloque N del roadmap. Cablea la detección de actualizaciones al launcher: observaciones crudas por componente (`ein`, `binary`, `packages`) recogidas por probes portables y entregadas por un reader inyectable. El launcher nombra componente y comando exacto cuando la evidencia es fresca y accionable, declara lo no verificable, y no espera ni ejecuta nada. N.2 (Claude Code como cuarta fuente) y N.3 (rendering completo y paridad) quedan pendientes: **los criterios de aceptación del bloque N no se cierran aquí**.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/lib/update-probes.ts` (**nuevo**, 125 líneas): `checkPiBinaryUpdate`, `checkEinTemplateUpdate`, `readEinVersion`, `parseVersion`, `isNewerVersion` y `startUpdateEvidenceSnapshot`. Los hechos locales entran **como parámetro** (`installedVersion`, `agentDir`); sin ellos la fuente queda `skipped` con razón declarada, nunca `current`.
- `ein-pi/agent/lib/workbench.ts`: `WorkbenchAdvisorReaders` gana `readUpdateObservations?`; `renderWorkbenchAdvisor` añade un bloque `Updates:` por componente derivado de `result.update.provenance`.
- `ein-pi/agent/surfaces/workbench-entrypoint.ts`: arranca el snapshot al construir dependencias, sin `await`, e inyecta el reader.
- `ein-pi/agent/extensions/ein-banner.ts`: refactor de extracción, neto negativo. `checkPiPackageUpdates` se queda aquí y se inyecta. Comportamiento observable inalterado.
- `tests/update-probes.test.ts` (**nuevo**, 201 líneas) y ampliación de `tests/minimal-workbench-launcher.test.ts`.

## // 002. CÓMO FUNCIONA POR DENTRO

El snapshot de probes arranca en el borde, al construir las dependencias de producción, y corre en paralelo mientras el usuario selecciona y confirma proyecto — dos lecturas y dos entradas de teclado. Al llegar al render, un reader **síncrono** devuelve las observaciones ya resueltas o `undefined` si aún no llegaron.

`createWorkbenchAdvisor` solo añade `update: { observations }` cuando el reader devuelve algo. Si devuelve `undefined`, la llamada al asesor queda exactamente como antes y el comportamiento previo no cambia.

El detalle por componente **no sale del veredicto colapsado** sino de `result.update.provenance`, que conserva `source`, `quality`, `reason` y `freshness` por elemento. Una línea por componente: accionable con comando exacto si su propia evidencia es `update-available` y `current`; declarada no verificable en cualquier otro caso. El handoff sigue inerte (`performed: false`).

## // 003. DECISIONES

1. **Las probes portables bajan a `lib/`; la de paquetes se queda en el borde y se inyecta.** Hecho medido: el SDK de Pi no está declarado en ningún manifiesto del repo y resuelve por la caché global de Bun. Meterlo en `lib/` trasladaría esa fragilidad al núcleo portable que el launcher carga **también bajo Claude Code**, y que los tests cargan de forma eager. Se rechazan el import dinámico y el `try/catch`: son parches a un problema de ubicación.
2. **La invariante de arquitectura, corregida.** La primera redacción del diseño afirmaba que *todas* las referencias al SDK en `lib/` son `import type`. **Es falso**: `lib/guardrails.ts:29` importa valor de `@earendil-works/pi-coding-agent` y `lib/models-panel.ts:9` de `@earendil-works/pi-tui`, ambos preexistentes. La invariante que sí se cumple y que sostiene este diseño es más estrecha: *el cierre de imports del launcher no contiene ningún import de valor del SDK*. Verificada cargando `update-probes.ts`, `workbench.ts` y `workbench-entrypoint.ts` en aislamiento. Una auditoría futura que grepee todo `lib/` fallará por deuda ajena a este cambio.
3. **El asesor de F sigue puro y síncrono.** La evidencia se recoge fuera y entra ya resuelta por un reader opcional, igual que `inspectMode` e `inspectModelConfig`. `WorkbenchDependencies.advisor` no se volvió asíncrono: no se tocó el contrato ni los tests existentes, y el patrón de readers reemplazables sigue permitiendo testear el launcher sin red.
4. **Qué se verifica en cada runtime.** `ein` es verificable desde ambos; `binary` y `packages` se declaran no verificables desde el launcher. La salida es idéntica en Pi y en Claude, así que la paridad del delta se cumple por construcción, y la diferencia real (el banner de Pi sí ve más) queda declarada, no escondida.
5. **Cero latencia añadida.** Nadie espera. Si el snapshot no resolvió, se declara `pending`. Se rechaza cachear entre invocaciones: sin marca temporal en el modelo de observación produciría evidencia obsoleta disfrazada de fresca, que es justo lo que el delta prohíbe.
6. **Rollback:** revertir los cuatro ficheros de producción. Sin migración, estado persistido ni limpieza.

## // 004. VERIFICACIÓN

- Línea base antes de N.1: `bun test` → 1476 pass, 0 fail, 109 ficheros. Después: **1499 pass, 0 fail, 110 ficheros** (+23 tests).
- Typecheck manual con `installer/node_modules/.bin/tsc --noEmit --strict` sobre los tres ficheros de producción tocados: 0 errores. Necesario porque `ein-pi/` no tiene puerta de tipos y `bun test` no comprueba tipos.
- `tests/update-probes.test.ts`: probes fail-closed, versión instalada ausente, scheduler manual, fuente ausente.
- `tests/minimal-workbench-launcher.test.ts`: detalle por componente frente a veredicto colapsado, Ein accionable con comando exacto, paquetes no verificables sin comando, ausencia de bloque cuando todo está `current`, handoff inerte, y comportamiento idéntico al actual cuando no hay reader.
- Auditoría: ningún import de valor del SDK en los ficheros de N.1; ningún spawn desde el launcher; los tests de `ein-banner` pasan sin modificarse.
- `shared-config-update-advisor.ts` no aparece en el diff.

**Desviación declarada:** R4 renderiza `not verified (unknown-evidence)` en vez del `probe-unavailable` que ilustraba el diseño, porque F normaliza el `reason` por `freshness` antes que por `status`. `verify` lo confirmó como ejemplo ilustrativo desmentido, no como contradicción del delta.

## // 005. PENDIENTE / RIESGOS

- **N.1 solo verifica Ein.** `binary` y `packages` salen como no verificables porque el launcher es un proceso aparte que no puede leer la versión instalada sin el SDK. Es honesto y declarado, pero constante. N.3 puede subir `binary` leyendo la versión del Pi aislado desde disco: el contrato de la probe ya lo admite sin cambios.
- **Deuda preexistente del repo, ajena a este cambio:** el SDK de Pi no está declarado en ningún manifiesto y resuelve por caché global; `lib/guardrails.ts` y `lib/models-panel.ts` importan valor del SDK; y `ein-pi/` no tiene puerta de tipos — no hay `tsconfig.json` en la raíz, `bun run typecheck` solo cubre `installer/`, y `bun test` no comprueba tipos. Cada uno merece trabajo propio.
- **Quedan N.2 y N.3** para cerrar los criterios de aceptación del bloque N del roadmap.
