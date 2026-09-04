status: complete
change: doctor-checks-pi-dependency-tree
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El instalador global de Bun fijaba `@earendil-works/pi-agent-core`, `pi-ai` y `pi-tui` a `^0.78.0`
(semántica `>=0.78.0 <0.79.0` en 0.x), imposibilitando actualización. Con el host en 0.85.0,
`pi-coding-agent@0.85.0` declaraba `^0.85.0` para esos paquetes: rango violado de inmediato.
Todo hijo de subagente moría con `MODULE_NOT_FOUND` al resolver `@earendil-works/pi-agent-core/node`.
Se entregó un módulo compartido (`pi-host-tree.ts`) que detecta offline la incoherencia del árbol
interno del host y la reporta con comando de reparación exacto, integrado en ambos doctores de Ein.

## // 001. QUÉ CAMBIÓ

- `shared/contracts/pi-host-tree.ts` — módulo nuevo: resolución de root de instalación,
  lectura de manifiestos del host y hermanos, comparador semántico de caret sobre `0.x`,
  veredicto estructurado por dependencia.
- `ein-pi/agent/lib/pi-host-tree.ts` — fachada pura (1 línea re-export), exigida por bundler.
- `installer/src/core/deps.ts` — field `tree` nuevo en `PiRuntimeInspection`, rellenado por `inspectPiRuntime`.
- `installer/src/core/verify.ts` — check nuevo en `checksRuntime` rindiendo veredicto del árbol.
- `ein-pi/agent/lib/doctor-core.ts` — grupo `piHostTree` en veredicto compartido.
- `ein-pi/agent/extensions/ein-doctor.ts` — grupo `// 013. PI HOST TREE` integrado,
  renumeración de `013→021` en grupos siguientes (MCP, SKILLS, GUARDRAILS, COHERENCIA).
- `tests/pi-host-tree.test.ts` — 18 tests TDD en rojo/verde/triangulación.

## // 002. CÓMO FUNCIONA POR DENTRO

Desde el binario `pi` ya resuelto, se determina el root de instalación (última aparición de
`node_modules` en la ruta), se lee `package.json` del host y de cada hermano `@earendil-works/*`.
Para cada dependencia declarada en el host, se evalúa si la versión instalada satisface el rango
con **semántica caret npm real**: `^0.y.z` → `>=0.y.z <0.(y+1).0` (no `<1.0.0`), la causa raíz
del bug. Rangos no soportados (`~`, `>=`, `*`, compuestos) disparan fallo declarado "rango no
comprendido". Manifiestos ilegibles o versiones con prerelease: fallo declarado, nunca verde.
El veredicto sale solo de lectura de disco (offline, fail-closed). `ein-doctor.ts` incluye el
grupo en su array `groups`, consumido por `summarizeDoctorChecks`, así que un árbol incoherente
tumba el veredicto del doctor real en sesión.

## // 003. DECISIONES

**D1 — Superficie:** ambos doctores desde una sola implementación compartida. El incidente mata
en runtime (subagentes rebotan con `MODULE_NOT_FOUND`); el doctor de runtime debe detectarlo.
El installer solo corre en instalación/actualización, pero ambos prometidos en el escenario
vecino `pi-runtime-dependencies-remain-reproducible`.

**D2 — Comparador:** propio, mínimo, solo `^x.y.z` y `x.y.z` exacto. Una dependencia de semver
entraría en el bundle del installer; un parser general en la ruta del bug exacto aumenta riesgo.
El comparador cubre casos 1-3 del incidente (ambas direcciones de `^0.78.0` vs 0.85.0, alineado
en 0.85.0). Rechazado: reutilizar `isPublishedPackageVersion` (solo forma, no rango).

**D3 — Peers:** fuera. El incidente violó ambos (`^0.78.0` vs `^0.85.0` del host, y
`pi-ai >= 0.80.0` exigido por `pi-subagents`), pero basta la dep directa para verlo en rojo.
Peers entre roots distintos es segundo problema. Anotado para seguimiento posterior.

## // 004. VERIFICACIÓN

Suite: 3119 pass / 0 fail. Typecheck raíz + installer: limpios. TDD estricto 8 seams + 2
auxiliares (instalación/paridad). RED real (18/18 fail con stub), GREEN (18 pass). Cobertura
de 5 requisitos OpenSpec (R1-R5): caso 1 (bug real), caso 2 (simétrico, separa arreglo),
caso 3 (alineado, pasa), rangos no comprendidos (fallo + mensaje), fail-closed (manifiesto
ilegible, versión indeterminable). Guardián integrado verificado: `ein-doctor.ts` línea 283
incluye grupo en array, `summarizeDoctorChecks` lo consume, incoherencia tumba doctor real.

- verify: `bun test tests/pi-host-tree.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## // 005. PENDIENTE / RIESGOS

Riesgo mitigado: comparador incorrecto (D2, seams 1-2: ambas direcciones de caret sobre 0.x
verificadas). Falsos rojos mitigados (D2, seam 5: rango no comprendido ≠ árbol roto).
Renumeración segura (grep: solo `ein-doctor.ts` líneas 281-291, cero referencias ajenas).
Seguimiento anotado: verificar `peerDependencies` (D3) una vez el comparador agregue soporte
a `>=`, es su propio cambio. Sin dependencias abiertas en este cierre.
